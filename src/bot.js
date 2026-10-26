'use strict';
/*
 * Бот Shatova Pro: личка клиентов и ответы тренера из тем группы поддержки.
 *
 * Личка: /start — приветствие с картинкой и кнопками; «Бесплатная
 * консультация» — цель кнопками и номер телефона кнопкой «Отправить номер»;
 * /start l<код> — привязка заявки с сайта, чтобы ответы приходили в Telegram;
 * любое другое сообщение — копией в тему клиента, дальше отвечает
 * AI-ассистент, пока не напишет тренер.
 *
 * Тема в группе: ответ тренера копируется клиенту в личку. /ai — вернуть
 * AI-ассистента, /close — завершить разговор.
 */
const fs = require('fs');
const path = require('path');
const db = require('./db');
const tg = require('./telegram');
const ai = require('./ai');
const media = require('./media');
const support = require('./support');
const { SITE, GOALS, goalById } = require('./catalog');
const { nameDative } = require('./views/ui');

const LIMIT_PER_MINUTE = 10;
const IMG = path.join(__dirname, '..', 'public', 'img');
const WELCOME_VERSION = 1;
const AVATAR_VERSION = 2;
const GROUP_PHOTO_VERSION = 1;

const appUrl = (p) => `${SITE.url}${p}`;
const ownerName = () => ((db.get('specialists', SITE.owner) || {}).name || 'Евгения Шатова').split(' ')[0];
// «у Евгении» — родительный падеж совпадает с дательным
const ownerGen = () => nameDative(ownerName());

function welcomeText() {
  return [
    `Привет! Это бот Евгении Шатовой — онлайн-тренера и тренера по позированию. IFBB Pro Bikini, участница Olympia 2025.`,
    '',
    'Здесь можно:',
    '— записаться на бесплатную консультацию;',
    '— спросить про онлайн-ведение, позирование и подготовку к соревнованиям;',
    '— узнать о программах тренировок и питания.',
    '',
    ai.enabled()
      ? `Напишите вопрос прямо сюда: сразу ответит AI-ассистент, а ${ownerName()} подключится и ответит в этом же чате.`
      : `Напишите вопрос прямо сюда — ${ownerName()} ответит в этом же чате.`,
  ].join('\n');
}

function welcomeKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📝 Бесплатная консультация', callback_data: 'consult' }],
      [
        { text: '🔥 Онлайн-ведение', web_app: { url: appUrl('/programmy/onlayn-vedenie') } },
        { text: '💃 Позирование', web_app: { url: appUrl('/programmy/pozirovanie') } },
      ],
      [
        { text: '🏆 Подготовка к старту', web_app: { url: appUrl('/programmy/podgotovka-k-sorevnovaniyam') } },
        { text: '📚 Программы', web_app: { url: appUrl('/programmy') } },
      ],
      [{ text: '🌐 Сайт Shatova Pro', web_app: { url: appUrl('/') } }],
    ],
  };
}

/* ---------- картинка приветствия ---------- */

let composing = null;

/** Фон + фото со сцены из медиатеки + плашка IFBB PRO. Собирается один раз, потом — file_id. */
async function composeWelcome() {
  const sharp = require('sharp');
  const owner = db.get('specialists', SITE.owner) || {};
  const src = String(owner.heroPhoto || owner.photo || '');
  const id = (src.match(/^\/m\/([a-z0-9-]+)\./) || [])[1];
  const bg = path.join(IMG, 'bot-welcome-bg.png');
  const fg = path.join(IMG, 'bot-welcome-fg.png');
  const layers = [];
  const photo = id ? await media.get(id) : null;
  if (photo) {
    const slot = await sharp(photo.data).resize(400, 660, { fit: 'cover', position: 'attention' }).toBuffer();
    layers.push({ input: slot, left: 772, top: 60 });
  }
  layers.push({ input: fg, left: 0, top: 0 });
  return { key: `${id || 'none'}|${WELCOME_VERSION}`, data: await sharp(bg).composite(layers).jpeg({ quality: 86, mozjpeg: true }).toBuffer() };
}

async function sendWelcome(chatId) {
  const caption = welcomeText();
  const reply_markup = welcomeKeyboard();
  const m = support.meta();
  const owner = db.get('specialists', SITE.owner) || {};
  const wantKey = `${((owner.heroPhoto || owner.photo || '').match(/^\/m\/([a-z0-9-]+)\./) || [])[1] || 'none'}|${WELCOME_VERSION}`;
  try {
    if (m.welcome && m.welcome.key === wantKey && m.welcome.fileId) {
      await tg.call('sendPhoto', { chat_id: chatId, photo: m.welcome.fileId, caption, reply_markup });
    } else {
      composing = composing || composeWelcome().finally(() => (composing = null));
      const img = await composing;
      const sent = await tg.upload('sendPhoto', { chat_id: chatId, caption, reply_markup }, { photo: { data: img.data, name: 'welcome.jpg', type: 'image/jpeg' } });
      const sizes = sent.photo || [];
      if (sizes.length) await support.setMeta({ welcome: { key: img.key, fileId: sizes[sizes.length - 1].file_id } });
    }
  } catch (e) {
    console.error('[bot] приветствие с картинкой не ушло:', e.message);
    await tg.call('sendMessage', { chat_id: chatId, text: caption, reply_markup }).catch(() => {});
  }
}

/* ---------- запись на консультацию ---------- */

function goalKeyboard() {
  return {
    inline_keyboard: [...GOALS.map((g) => [{ text: g.title, callback_data: `goal:${g.id}` }]), [{ text: 'Другое — напишу сообщением', callback_data: 'goal:other' }]],
  };
}

const PHONE_KEYBOARD = {
  keyboard: [[{ text: '📱 Отправить номер', request_contact: true }], [{ text: 'Лучше переписываться здесь' }]],
  resize_keyboard: true,
  one_time_keyboard: true,
  input_field_placeholder: 'Или напишите вопрос',
};

async function askGoal(chatId) {
  await tg.call('sendMessage', { chat_id: chatId, text: 'С какой целью хотите заниматься?', reply_markup: goalKeyboard() });
}

/** Заявка из бота — в кабинет (раздел «Заявки») и в тему. */
async function saveLead(t, patch) {
  const id = t.leadId || `tg-${t.id}-${Date.now().toString(36)}`;
  const cur = db.get('leads', id);
  const lead = {
    type: 'consult',
    specialistId: SITE.owner,
    name: t.name || (t.tgUsername ? `@${t.tgUsername}` : 'Клиент из Telegram'),
    contact: t.phone || (t.tgUsername ? `@${t.tgUsername}` : 'Telegram, без ника'),
    message: 'Заявка из Telegram-бота',
    status: 'new',
    createdAt: new Date().toISOString(),
    source: 'telegram',
    ...(cur || {}),
    ...patch,
  };
  await db.put('leads', id, lead);
  if (!t.leadId) await support.save(t, { leadId: id });
}

async function chooseGoal(q, goalId) {
  const u = q.from;
  let t = await support.threadForTgUser(u);
  const goal = goalById(goalId);
  const kind = goal ? goal.id : 'chat';
  t = await support.save(t, { goal: goalId, flow: 'phone', kind: t.topicId ? t.kind : kind });
  const text = `📝 Заявка на бесплатную консультацию (бот)\nЦель: ${goal ? goal.title : 'другое — расскажет сама'}`;
  t = await support.post(t, text, kind);
  t = await support.remember(t, 'c', `Заявка: бесплатная консультация. Цель — ${goal ? goal.title.toLowerCase() : 'другое'}.`);
  await saveLead(t, { goal: goal ? goal.id : 'other' });
  if (q.message) {
    await tg.call('editMessageText', { chat_id: q.message.chat.id, message_id: q.message.message_id, text: `Цель: ${goal ? goal.title : 'другое'} ✅` }).catch(() => {});
  }
  await tg.call('sendMessage', {
    chat_id: u.id,
    text: `Отлично! Оставьте номер — ${ownerName()} свяжется и предложит удобный формат. Или напишите сюда пару слов о себе: опыт тренировок, ограничения по здоровью, к какому сроку цель.`,
    reply_markup: PHONE_KEYBOARD,
  });
}

async function gotPhone(m) {
  const u = m.from;
  if (!m.contact || (m.contact.user_id && m.contact.user_id !== u.id)) {
    await tg.call('sendMessage', { chat_id: u.id, text: 'Пришлите, пожалуйста, свой номер кнопкой «📱 Отправить номер».' }).catch(() => {});
    return;
  }
  const raw = String(m.contact.phone_number || '').replace(/[^\d+]/g, '');
  const phone = raw.startsWith('+') ? raw : `+${raw}`;
  let t = await support.threadForTgUser(u);
  const keys = [...new Set([...(t.keys || []), support.contactKey(phone)].filter(Boolean))];
  t = await support.save(t, { phone, keys, flow: null });
  t = await support.post(t, `📱 Телефон: ${phone}`);
  await support.refreshTitle(t);
  await saveLead(t, { contact: phone });
  await tg.call('sendMessage', {
    chat_id: u.id,
    text: `Спасибо! ${ownerName()} свяжется с вами в ближайшее время. А пока можно задать вопрос прямо здесь.`,
    reply_markup: { remove_keyboard: true },
  });
}

/* ---------- личка ---------- */

const textOf = (m) => String(m.text || m.caption || '').trim();

function mediaLabel(m) {
  if (m.photo) return '📷 Фото';
  if (m.video || m.video_note || m.animation) return '🎬 Видео';
  if (m.voice || m.audio) return '🎙 Голосовое';
  if (m.document) return '📎 Файл';
  if (m.sticker) return 'Стикер';
  return '';
}

async function linkSiteThread(u, token) {
  const site = support.byToken(token);
  if (!site) return false;
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || null;
  const keys = [...new Set([...(site.keys || []), ...(u.username ? ['@' + u.username.toLowerCase()] : [])])];
  // Если человек уже писал боту отдельно — дальше переписка идёт в теме заявки
  const own = support.byTgUser(u.id);
  if (own && own.id !== site.id) await support.save(own, { tgUserId: null, tgChatId: null, mergedInto: site.id });
  let t = await support.save(site, { tgUserId: u.id, tgChatId: u.id, tgUsername: u.username || null, keys, name: site.name || name });
  t = await support.post(t, `🔗 Клиент подключил Telegram${u.username ? ` (@${u.username})` : ''} — ответы из этой темы теперь уходят ему в бота.`);
  await tg.call('sendMessage', { chat_id: u.id, text: `Готово! Заявка у ${ownerGen()}, ответ придёт сюда.` });
  return t;
}

async function handlePrivate(m) {
  const u = m.from;
  if (!u || u.is_bot) return;
  const text = textOf(m);

  const start = text.match(/^\/start(?:@\w+)?(?:\s+(\S+))?$/i);
  if (start) {
    const payload = start[1] || '';
    if (/^l[a-f0-9]{18}$/.test(payload) && (await linkSiteThread(u, payload.slice(1)))) return;
    await sendWelcome(u.id);
    if (payload === 'consult') await askGoal(u.id);
    return;
  }
  if (/^\/(help|menu)(@\w+)?$/i.test(text)) return sendWelcome(u.id);
  if (/^\/consult(@\w+)?$/i.test(text)) return askGoal(u.id);
  if (m.contact) return gotPhone(m);

  if (!support.config().ready) {
    await tg.call('sendMessage', { chat_id: u.id, text: `Сейчас бот не принимает сообщения. Напишите ${ownerName()} в Telegram ${SITE.telegram ? '@' + SITE.telegram.split('/').pop() : ''} или позвоните ${SITE.phone || ''}.` }).catch(() => {});
    return;
  }

  let t = await support.threadForTgUser(u);
  if (text === 'Лучше переписываться здесь') {
    t = await support.save(t, { flow: null });
    await support.post(t, '💬 Клиенту удобнее переписываться в Telegram');
    await tg.call('sendMessage', { chat_id: u.id, text: `Хорошо! ${ownerName()} напишет вам здесь. Можете сразу рассказать о себе и цели.`, reply_markup: { remove_keyboard: true } });
    return;
  }
  if (!text && !mediaLabel(m)) return; // служебные события

  // Защита от флуда
  const minuteAgo = Date.now() - 60000;
  if ((t.history || []).filter((h) => h.s === 'c' && Date.parse(h.at) > minuteAgo).length >= LIMIT_PER_MINUTE) return;

  const first = !t.topicId;
  try {
    t = await support.copyToTopic(t, u.id, m.message_id, t.kind || 'chat');
  } catch (e) {
    await tg.call('sendMessage', { chat_id: u.id, text: `Не получилось передать сообщение. Попробуйте ещё раз или позвоните ${SITE.phone || ''}.` }).catch(() => {});
    throw e;
  }
  t = await support.remember(t, 'c', [mediaLabel(m) && `[${mediaLabel(m)}]`, text].filter(Boolean).join(' '));
  if (ai.enabled() && !t.aiPaused) ai.schedule(t.id);
  else if (first) await tg.call('sendMessage', { chat_id: u.id, text: `Спасибо, сообщение у ${ownerGen()}. Ответ придёт сюда.` }).catch(() => {});
}

/* ---------- кнопки ---------- */

async function handleCallback(q) {
  const answer = (text = '', alert = false) => tg.call('answerCallbackQuery', { callback_query_id: q.id, text, show_alert: alert }).catch(() => {});
  const data = q.data || '';
  if (data === 'consult') {
    await answer();
    return askGoal(q.from.id);
  }
  if (data.startsWith('goal:')) {
    if (!support.config().ready) return answer('Сейчас запись недоступна — напишите в Telegram или позвоните', true);
    await answer('Записали');
    return chooseGoal(q, data.slice(5));
  }
  return answer();
}

/* ---------- тема в группе ---------- */

const CLOSED = 'Разговор завершён. Если появятся вопросы — просто напишите снова.';

async function handleStaff(m) {
  let t = support.byTopic(m.message_thread_id);
  if (!t) return;
  const text = textOf(m);

  if (/^\/close(@\w+)?$/i.test(text)) {
    await support.save(t, { status: 'closed', aiPaused: false, flow: null });
    if (t.tgChatId) await tg.call('sendMessage', { chat_id: t.tgChatId, text: CLOSED }).catch(() => {});
    await support.group('closeForumTopic', { message_thread_id: t.topicId }).catch(() => {});
    return;
  }
  if (/^\/ai(@\w+)?$/i.test(text)) {
    await support.save(t, { aiPaused: false });
    await support.post(t, ai.enabled() ? '🤖 AI-ассистент снова отвечает в этом разговоре.' : '🤖 AI-ассистент выключен: не задан ключ ANTHROPIC_API_KEY.');
    return;
  }
  if (!text && !mediaLabel(m)) return;

  if (!t.aiPaused) t = await support.save(t, { aiPaused: true });
  if (!t.tgChatId) {
    await support.post(t, `⚠️ Клиента нет в Telegram-боте — ответ не доставлен. Свяжитесь по контакту: ${t.phone || t.contact || '—'}`);
    return;
  }
  try {
    await tg.call('copyMessage', { chat_id: t.tgChatId, from_chat_id: m.chat.id, message_id: m.message_id });
    await support.remember(t, 'staff', [mediaLabel(m) && `[${mediaLabel(m)}]`, text].filter(Boolean).join(' '));
  } catch (e) {
    await support.post(t, `⚠️ Не доставлено в Telegram: ${e.message}`).catch(() => {});
  }
}

/* ---------- вебхук ---------- */

async function handleUpdate(update) {
  if (update.callback_query) return handleCallback(update.callback_query);
  // Бота добавили в группу или выдали права — сразу проверяем группу поддержки
  const mcm = update.my_chat_member;
  if (mcm && mcm.chat && mcm.chat.type !== 'private') {
    console.log(`[bot] в «${mcm.chat.title}» (${mcm.chat.id}) бот теперь ${mcm.new_chat_member && mcm.new_chat_member.status}`);
    return checkGroup().catch((e) => console.error('[bot] группа:', e.message));
  }
  const m = update.message;
  if (!m || !m.chat) return;
  if (m.chat.type === 'private') return handlePrivate(m);
  const cfg = support.config();
  if (!cfg.ready || String(m.chat.id) !== String(cfg.chatId) || !m.message_thread_id || !m.is_topic_message) return;
  if ((m.from && m.from.is_bot) || m.forum_topic_created || m.forum_topic_closed || m.forum_topic_reopened || m.forum_topic_edited) return;
  return handleStaff(m);
}

/* ---------- настройка бота при запуске ---------- */

async function setup() {
  if (!tg.enabled()) return;
  const m = support.meta();
  const me = await tg.call('getMe');
  await support.setMeta({ username: me.username });

  await tg.call('setMyCommands', {
    commands: [
      { command: 'start', description: 'Главное меню' },
      { command: 'consult', description: 'Записаться на бесплатную консультацию' },
    ],
    scope: { type: 'all_private_chats' },
  });
  await tg.call('setMyShortDescription', { short_description: 'Евгения Шатова — онлайн-тренер, IFBB Pro Bikini. Запись на консультацию и вопросы.' }).catch(() => {});
  await tg.call('setMyDescription', {
    description:
      'Бот Евгении Шатовой — онлайн-тренера и тренера по позированию, IFBB Pro Bikini, участницы Olympia 2025.\n\nЗапишитесь на бесплатную консультацию, спросите про онлайн-ведение, позирование и подготовку к соревнованиям — Евгения ответит здесь же.',
  }).catch(() => {});
  await tg.call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Сайт', web_app: { url: appUrl('/') } } }).catch(() => {});

  if (m.avatar !== AVATAR_VERSION) {
    try {
      const data = fs.readFileSync(path.join(IMG, 'bot-avatar.jpg'));
      await tg.upload('setMyProfilePhoto', { photo: { type: 'static', photo: 'attach://avatar' } }, { avatar: { data, name: 'avatar.jpg', type: 'image/jpeg' } });
      await support.setMeta({ avatar: AVATAR_VERSION });
      console.log('[bot] аватар обновлён');
    } catch (e) {
      console.error('[bot] аватар не обновлён:', e.message);
    }
  }

  await checkGroup();
  await ai.ping();
}

/** Группа поддержки: доступна ли, включены ли темы, есть ли у бота права. Один раз — приветствие в группе. */
async function checkGroup() {
  const me = await tg.call('getMe');
  const cfg = support.config();
  if (!cfg.chatId) return console.log(`[bot] @${me.username}: не задан TELEGRAM_SUPPORT_CHAT_ID`);
  let chat;
  try {
    chat = await support.group('getChat');
  } catch (e) {
    return console.error(`[bot] группа поддержки недоступна: ${e.message}. Добавьте @${me.username} в группу админом.`);
  }
  const member = await support.group('getChatMember', { user_id: me.id }).catch(() => null);
  const canTopics = member && (member.status === 'creator' || (member.status === 'administrator' && member.can_manage_topics));
  console.log(`[bot] @${me.username} → «${chat.title}» (${chat.id}): темы ${chat.is_forum ? 'включены' : 'ВЫКЛЮЧЕНЫ'}, бот ${member ? member.status : '?'}${canTopics ? ', может управлять темами' : ' — нужно право «Управление темами»'}; AI ${ai.enabled() ? ai.model() : 'выключен'}`);
  await setGroupPhoto(member);
  await tg.call('setMyCommands', {
    commands: [
      { command: 'close', description: 'Завершить разговор с клиентом' },
      { command: 'ai', description: 'Снова включить AI-ассистента в теме' },
    ],
    scope: { type: 'chat', chat_id: support.config().chatId },
  }).catch(() => {});
  if (support.meta().hello !== String(chat.id) && chat.is_forum && canTopics) {
    await support
      .group('sendMessage', {
        text: `✅ Бот подключён к сайту ${SITE.host}.\n\nКаждый клиент — отдельная тема со значком по цели: 🔥 тело, 🤰 после родов, 🏆 сцена, 💃 позирование, 💰 заказ, 📆 предзапись, 💬 вопрос.\nПишите ответ прямо в тему — он уйдёт клиенту в Telegram. /close — завершить разговор${ai.enabled() ? ', /ai — вернуть AI-ассистента' : ''}.`,
      })
      .then(() => support.setMeta({ hello: String(chat.id) }))
      .catch(() => {});
  }
}

/** Фото группы поддержки — красный знак Shatova Pro, чтобы группа не путалась с ботом в списке чатов. Один раз на версию. */
async function setGroupPhoto(member) {
  if (support.meta().groupPhoto === GROUP_PHOTO_VERSION) return;
  const canInfo = member && (member.status === 'creator' || (member.status === 'administrator' && member.can_change_info));
  if (!canInfo) return console.log('[bot] фото группы не поставлено: у бота нет права «Изменение профиля группы»');
  try {
    const data = fs.readFileSync(path.join(IMG, 'support-group.jpg'));
    await tg.upload('setChatPhoto', { chat_id: support.config().chatId }, { photo: { data, name: 'group.jpg', type: 'image/jpeg' } });
    await support.setMeta({ groupPhoto: GROUP_PHOTO_VERSION });
    console.log('[bot] фото группы обновлено');
  } catch (e) {
    console.error('[bot] фото группы не обновлено:', e.message);
  }
}

module.exports = { handleUpdate, setup, checkGroup, sendWelcome, composeWelcome };
