'use strict';
/*
 * Переписка с клиентами — одна тема в группе поддержки на человека
 * (как в HelpMame).
 *
 * Группа с включёнными темами — TELEGRAM_SUPPORT_CHAT_ID, бот в ней админ с
 * правом «Управление темами». На каждого клиента бот заводит тему со значком
 * по цели: туда попадают заявки с сайта, предзаписи, заказы, сообщения из
 * лички бота и ответы AI-ассистента. Тренер пишет в тему — ответ уходит
 * клиенту в личку бота (если клиент там есть).
 *
 * Разговоры хранятся в коллекции threads: контакт, Telegram, номер темы,
 * последние сообщения для AI-ассистента.
 */
const crypto = require('crypto');
const db = require('./db');
const tg = require('./telegram');
const { phoneKey } = require('./views/ui');

const HISTORY = 30;

/* ---------- настройки ---------- */

const meta = () => db.get('meta', 'telegram') || {};
const setMeta = (patch) => db.put('meta', 'telegram', { ...meta(), ...patch });

function chatId() {
  const env = process.env.TELEGRAM_SUPPORT_CHAT_ID || '';
  const m = meta();
  // Группа стала супергруппой (включили темы) — Telegram сменил её id; запомнили новый
  return m.chatFrom === env && m.chatId ? m.chatId : env;
}

function config() {
  return {
    token: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    chatId: chatId(),
    secret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
    ready: Boolean(process.env.TELEGRAM_BOT_TOKEN && chatId()),
  };
}

/** Вызов в группе поддержки; если группа переехала в супергруппу — запоминаем новый id и повторяем. */
async function group(method, params = {}) {
  try {
    return await tg.call(method, { chat_id: chatId(), ...params });
  } catch (e) {
    const to = e.parameters && e.parameters.migrate_to_chat_id;
    if (!to) throw e;
    await setMeta({ chatFrom: process.env.TELEGRAM_SUPPORT_CHAT_ID || '', chatId: String(to) });
    console.log(`[support] группа стала супергруппой, новый id ${to}`);
    return tg.call(method, { chat_id: String(to), ...params });
  }
}

/* ---------- значки тем ---------- */

// Значки — из набора Telegram для тем (getForumTopicIconStickers), цвет — запасной вариант.
const KINDS = {
  body: { emoji: '🔥', color: 0xfb6f5f, label: 'Похудеть и подтянуть тело' },
  mass: { emoji: '🔥', color: 0xfb6f5f, label: 'Набрать мышечную массу' },
  postpartum: { emoji: '🤰', color: 0xff93b2, label: 'Восстановление после родов' },
  stage: { emoji: '🏆', color: 0xffd67e, label: 'Выход на сцену' },
  posing: { emoji: '💃', color: 0xcb86db, label: 'Позирование' },
  order: { emoji: '💰', color: 0x8eee98, label: 'Заказ программы' },
  waitlist: { emoji: '📆', color: 0x6fb9f0, label: 'Предзапись' },
  chat: { emoji: '💬', color: 0x6fb9f0, label: 'Вопрос в боте' },
};

let icons = null;
async function iconFor(kind) {
  const k = KINDS[kind] || KINDS.chat;
  if (!icons) {
    const list = await tg.call('getForumTopicIconStickers').catch(() => []);
    icons = new Map(list.map((s) => [String(s.emoji || '').replace(/️/g, ''), s.custom_emoji_id]));
  }
  return { color: k.color, emojiId: icons.get(k.emoji.replace(/️/g, '')) || null };
}

/* ---------- разговоры ---------- */

function contactKey(contact) {
  const c = String(contact || '').trim();
  const p = phoneKey(c);
  if (p && /^[\d\s()+-]+$/.test(c)) return p;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return c.toLowerCase();
  const h = c.replace(/^https:\/\/t\.me\//, '').replace(/^@/, '');
  if (/^[a-z0-9_]{4,}$/i.test(h)) return '@' + h.toLowerCase();
  return null;
}

const byTopic = (topicId) => db.find('threads', (t) => t.topicId === topicId) || null;
const byTgUser = (id) =>
  db.filter('threads', (t) => String(t.tgUserId) === String(id)).sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''))[0] || null;
const byKey = (key) => (key ? db.find('threads', (t) => (t.keys || []).includes(key)) || null : null);
const byToken = (token) => db.find('threads', (t) => t.linkToken === token) || null;

async function save(t, patch = {}) {
  return db.put('threads', t.id, { ...t, ...patch, lastAt: new Date().toISOString() });
}

async function createThread(data) {
  const seq = (meta().seq || 0) + 1;
  await setMeta({ seq });
  const now = new Date().toISOString();
  return db.put('threads', `t${seq}`, {
    num: seq,
    keys: [],
    history: [],
    status: 'open',
    aiPaused: false,
    linkToken: crypto.randomBytes(9).toString('hex'),
    createdAt: now,
    lastAt: now,
    ...data,
  });
}

/** Разговор клиента из Telegram — один на человека. */
async function threadForTgUser(u) {
  let t = byTgUser(u.id);
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || null;
  const keys = u.username ? ['@' + u.username.toLowerCase()] : [];
  if (!t && keys.length) t = byKey(keys[0]);
  if (!t) return createThread({ name, tgUserId: u.id, tgChatId: u.id, tgUsername: u.username || null, keys, source: 'bot' });
  const patch = {};
  if (!t.tgUserId) Object.assign(patch, { tgUserId: u.id, tgChatId: u.id });
  if (u.username && t.tgUsername !== u.username) patch.tgUsername = u.username;
  if (!t.name && name) patch.name = name;
  for (const k of keys) if (!(t.keys || []).includes(k)) patch.keys = [...(t.keys || []), k];
  return Object.keys(patch).length ? save(t, patch) : t;
}

/** Разговор по контакту с сайта: телефон, почта или ник в Telegram. */
async function threadForContact({ name, contact, phone, email }) {
  const keys = [contactKey(contact), contactKey(phone), contactKey(email)].filter(Boolean);
  let t = null;
  for (const k of keys) if ((t = byKey(k))) break;
  if (!t) return createThread({ name: name || null, contact: contact || phone || email || null, keys, source: 'site' });
  const patch = {};
  const merged = [...new Set([...(t.keys || []), ...keys])];
  if (merged.length !== (t.keys || []).length) patch.keys = merged;
  if (!t.name && name) patch.name = name;
  if (!t.contact && (contact || phone)) patch.contact = contact || phone;
  return Object.keys(patch).length ? save(t, patch) : t;
}

function topicTitle(t) {
  const who = t.name || (t.tgUsername ? `@${t.tgUsername}` : 'Клиент');
  const contact = t.phone || t.contact || (t.tgUsername ? `@${t.tgUsername}` : '');
  return [`#${t.num}`, who, contact && contact !== who ? contact : null].filter(Boolean).join(' · ').slice(0, 120);
}

function card(t) {
  return [
    `Новый клиент #${t.num}`,
    t.name ? `Имя: ${t.name}` : null,
    t.phone || t.contact ? `Контакт: ${t.phone || t.contact}` : null,
    t.tgChatId ? `Telegram: ${t.tgUsername ? '@' + t.tgUsername : 'есть'} — ответы из этой темы уходят клиенту в бота` : 'Telegram: пока нет — ответить можно по контакту выше',
    '',
    'Пишите ответ прямо в эту тему — бот перешлёт его клиенту (текст, фото, видео, голосовые).',
    require('./ai').enabled() ? '🤖 AI-ассистент отвечает сам, пока вы не напишете в тему. /ai — вернуть AI.' : null,
    '/close — завершить разговор.',
  ]
    .filter((l) => l !== null)
    .join('\n');
}

/** Тема в группе — при первой заявке или сообщении. Закрытую — открываем снова. */
async function ensureTopic(t, kind) {
  if (t.topicId) {
    if (t.status === 'closed') {
      await group('reopenForumTopic', { message_thread_id: t.topicId }).catch(() => {});
      t = await save(t, { status: 'open' });
    }
    return t;
  }
  const icon = await iconFor(kind || t.kind || 'chat');
  const params = { name: topicTitle(t), icon_color: icon.color };
  let topic;
  try {
    topic = await group('createForumTopic', { ...params, ...(icon.emojiId ? { icon_custom_emoji_id: icon.emojiId } : {}) });
  } catch (e) {
    if (!icon.emojiId) throw e;
    topic = await group('createForumTopic', params);
  }
  t = await save(t, { topicId: topic.message_thread_id, kind: kind || t.kind || 'chat', status: 'open' });
  await group('sendMessage', { message_thread_id: t.topicId, text: card(t), disable_web_page_preview: true }).catch(() => {});
  return t;
}

/** Переименовать тему, когда узнали имя или телефон. */
async function refreshTitle(t) {
  if (!t.topicId) return;
  await group('editForumTopic', { message_thread_id: t.topicId, name: topicTitle(t) }).catch(() => {});
}

const topicGone = (e) => /thread not found|TOPIC_DELETED|TOPIC_ID_INVALID/i.test(e.message);

/** Сообщение в тему клиента; если тему удалили — заводим новую. */
async function post(t, text, kind, extra = {}) {
  t = await ensureTopic(t, kind);
  try {
    await group('sendMessage', { message_thread_id: t.topicId, text, disable_web_page_preview: true, ...extra });
  } catch (e) {
    if (!topicGone(e)) throw e;
    t = await ensureTopic(await save(t, { topicId: null }), kind);
    await group('sendMessage', { message_thread_id: t.topicId, text, disable_web_page_preview: true, ...extra });
  }
  return t;
}

/** Копия сообщения клиента в его тему. */
async function copyToTopic(t, fromChatId, messageId, kind) {
  t = await ensureTopic(t, kind);
  try {
    await group('copyMessage', { message_thread_id: t.topicId, from_chat_id: fromChatId, message_id: messageId });
  } catch (e) {
    if (!topicGone(e)) throw e;
    t = await ensureTopic(await save(t, { topicId: null }), kind);
    await group('copyMessage', { message_thread_id: t.topicId, from_chat_id: fromChatId, message_id: messageId });
  }
  return t;
}

/** Запомнить реплику для AI-ассистента: s — c (клиент), staff, ai. */
async function remember(t, s, text) {
  const history = [...(t.history || []), { s, t: String(text || '').slice(0, 2000), at: new Date().toISOString() }].slice(-HISTORY);
  return save(t, { history });
}

// Отправки в одну тему — по очереди, чтобы карточка шла раньше заявки и темы не дублировались.
const queues = new Map();
function enqueue(id, fn) {
  const next = (queues.get(id) || Promise.resolve()).then(fn).catch((e) => console.error('[support] не ушло в Telegram:', e.message));
  queues.set(id, next);
  next.then(() => queues.get(id) === next && queues.delete(id));
  return next;
}

/**
 * Заявка с сайта — в тему клиента. Разговор возвращается сразу (для ссылки
 * «получать ответ в Telegram»), в группу заявка уходит в фоне: посетитель не
 * ждёт Telegram, а заявка в любом случае уже в кабинете.
 */
async function siteEvent({ kind, name, contact, phone, email, lines }) {
  if (!config().ready) return null;
  const t = await threadForContact({ name, contact, phone, email });
  const text = lines.filter(Boolean).join('\n');
  enqueue(t.id, async () => {
    let fresh = db.get('threads', t.id);
    fresh = await post(fresh, text, kind);
    fresh = await remember(fresh, 'c', text);
    if (fresh.tgChatId) require('./ai').schedule(fresh.id);
  });
  return t;
}

module.exports = {
  KINDS,
  config,
  meta,
  setMeta,
  group,
  contactKey,
  byTopic,
  byToken,
  byTgUser,
  save,
  threadForTgUser,
  threadForContact,
  ensureTopic,
  refreshTitle,
  post,
  copyToTopic,
  remember,
  siteEvent,
  enqueue,
  topicGone,
};
