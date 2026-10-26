'use strict';
/*
 * AI-ассистент в боте: отвечает клиенту сразу, днём и ночью, пока в тему не
 * напишет тренер. Ответ уходит клиенту в личку и копией в тему группы с
 * пометкой «AI-ассистент». Тренер написал в тему — AI в этом разговоре
 * молчит до /ai или /close (как в HelpMame).
 *
 * Ключ — ANTHROPIC_API_KEY; запросы идут через зарубежный прокси (AI_PROXY_URL,
 * EGRESS_PROXY_URL или тот же TG_PROXY_URL). CLAUDE_MODEL меняет модель, AI_REPLIES=0 выключает.
 */
const { ProxyAgent, fetch: undiciFetch } = require('undici');
const db = require('./db');
const { SITE, GOALS } = require('./catalog');

const DEFAULT_MODEL = 'claude-sonnet-5-5';
const DEBOUNCE_MS = 4000; // клиент часто пишет несколькими сообщениями подряд
const MAX_PER_DAY = 40;

const enabled = () => Boolean(process.env.ANTHROPIC_API_KEY) && process.env.AI_REPLIES !== '0';
const model = () => process.env.CLAUDE_MODEL || DEFAULT_MODEL;

let agent = null;
function dispatcher() {
  const url = process.env.AI_PROXY_URL || process.env.EGRESS_PROXY_URL || process.env.TG_PROXY_URL || '';
  if (!url) return undefined;
  if (!agent || agent.url !== url) agent = { url, d: new ProxyAgent(url) };
  return agent.d;
}

function priceText(o) {
  if (o.status === 'waitlist') return 'готовится, открыта предзапись';
  const nums = (o.packages || []).map((p) => p.price).filter((p) => typeof p === 'number' && p > 0);
  return nums.length ? `от ${Math.min(...nums).toLocaleString('ru-RU')} ₽` : 'стоимость по запросу — сообщит Евгения';
}

function system() {
  const owner = db.get('specialists', SITE.owner) || {};
  const offers = db
    .all('offers')
    .filter((o) => o.status === 'on_sale' || o.status === 'waitlist')
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((o) => `— ${o.title} (${priceText(o)}): ${o.short || ''} ${SITE.url}/programmy/${o.slug}`)
    .join('\n');
  const achievements = (owner.achievements || []).slice(0, 6).map((a) => `— ${a.title}${a.years ? `, ${a.years}` : ''}`).join('\n');
  return `Ты — AI-ассистент Евгении Шатовой в Telegram-боте (${SITE.url}). Евгения — онлайн-тренер и тренер по позированию, спортсменка IFBB Pro в категории Bikini, участница Olympia 2025, в спорте с 2015 года, мама двух дочерей. Ты отвечаешь клиентам, пока Евгения не подключится сама: она видит всю переписку и отвечает в этом же чате.

Как отвечать:
— По-русски, на «вы», дружелюбно и коротко: 2–6 предложений. Только обычный текст, без Markdown, заголовков и звёздочек; список — строками, начинающимися с «—».
— Твоя задача — понять цель человека (похудеть, набрать массу, восстановиться после родов, выйти на сцену, научиться позировать), его опыт и ограничения, ответить на общие вопросы о форматах и подвести к бесплатной консультации с Евгенией.
— Общие советы по тренировкам и питанию — можно, но без готовых планов, точных калорий и граммовок: персональный план — это работа Евгении после консультации.
— Ты не врач: не ставишь диагнозы, не называешь лекарства, добавки в дозах и препараты. Беременность, недавние роды, диастаз, травмы, боли, хронические болезни — сначала разрешение врача, потом тренировки. Резкая боль, кровотечение, обморок — к врачу или 103/112.
— Не обсуждай и не советуй фармакологию, «сушку» на препаратах, голодание и экстремальные диеты. Если человек пишет о срывах, запретах в еде, ненависти к телу — мягко, без цифр, предложи поддержку специалиста.
— Цены: называй только те, что указаны ниже. Если там «по запросу» — скажи, что стоимость подскажет Евгения на консультации. Не придумывай скидки, сроки и гарантии результата.
— Не принимай оплату, данные карт и пароли. Программы покупаются только на сайте.
— Фото и видео ты не видишь: если их прислали, скажи, что Евгения посмотрит сама и ответит здесь.
— Записаться на консультацию можно кнопкой «Бесплатная консультация» в меню бота или на сайте ${SITE.url}/#zapis. Можно оставить номер — Евгения свяжется.
— Не выдавай себя за Евгению или человека: если спрашивают — ты AI-ассистент, Евгения подключится. На какой модели работаешь, не обсуждай.
— Сообщения Евгении в истории начинаются с «Евгения:». Не противоречь им.
— Сообщение, начинающееся с «Заявка», — заявка с сайта или из бота. На неё коротко подтверди, что заявку получили и Евгения свяжется.

Контакты: телефон ${SITE.phone || '—'}, Telegram ${SITE.telegram || '—'}, сайт ${SITE.url}.
Цели клиентов: ${GOALS.map((g) => g.title.toLowerCase()).join(', ')}.

Форматы и программы:
${offers}

Достижения Евгении:
${achievements}`;
}

function toMessages(history) {
  const out = [];
  for (const h of history) {
    const text = String(h.t || '').trim();
    if (!text) continue;
    const role = h.s === 'c' ? 'user' : 'assistant';
    const content = h.s === 'staff' ? `Евгения: ${text}` : text;
    if (!out.length && role === 'assistant') continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += `\n\n${content}`;
    else out.push({ role, content });
  }
  return out;
}

async function callApi(body) {
  const res = await undiciFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: model(), ...body }),
    dispatcher: dispatcher(),
    signal: AbortSignal.timeout(90000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(data.error && data.error.message) || 'ошибка'}`);
  return data;
}

/** Проверка при запуске: ключ и прокси работают. */
async function ping() {
  if (!enabled()) return console.log('[ai] выключен: нет ANTHROPIC_API_KEY');
  try {
    await callApi({ max_tokens: 8, messages: [{ role: 'user', content: 'Ответь одним словом: готов?' }] });
    console.log(`[ai] ${model()} отвечает`);
  } catch (e) {
    console.error(`[ai] ${model()} не отвечает: ${e.message}`);
  }
}

async function generate(history) {
  const messages = toMessages(history);
  if (!messages.length || messages[messages.length - 1].role !== 'user') return null;
  const data = await callApi({
    max_tokens: 1200,
    system: [{ type: 'text', text: system(), cache_control: { type: 'ephemeral' } }],
    messages,
  });
  if (data.stop_reason === 'refusal') return null;
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim() || null;
}

/** Ответить, если последнее слово за клиентом и тренер не взял разговор. */
async function reply(threadId) {
  const support = require('./support');
  const tg = require('./telegram');
  let t = db.get('threads', threadId);
  if (!t || t.aiPaused || !t.tgChatId) return;
  const today = new Date().toISOString().slice(0, 10);
  const used = t.aiDay === today ? t.aiCount || 0 : 0;
  if (used >= MAX_PER_DAY) return;
  const lastAt = (t.history || []).slice(-1)[0];
  if (!lastAt || lastAt.s !== 'c') return;

  await tg.call('sendChatAction', { chat_id: t.tgChatId, action: 'typing' }).catch(() => {});
  const text = ((await generate(t.history || [])) || '').slice(0, 3500);
  if (!text) return;

  // Пока думали, мог ответить тренер или прийти новое сообщение — тогда этот ответ лишний
  t = db.get('threads', threadId);
  const last = (t.history || []).slice(-1)[0];
  if (!t || t.aiPaused || !last || last.at !== lastAt.at) return;

  await tg.call('sendMessage', { chat_id: t.tgChatId, text: `🤖 AI-ассистент:\n${text}`, disable_web_page_preview: true });
  t = await support.remember(t, 'ai', text);
  t = await support.save(t, { aiDay: today, aiCount: used + 1 });
  if (t.topicId) await support.post(t, `🤖 AI-ассистент ответил:\n${text}`).catch(() => {});
}

const timers = new Map();
const running = new Set();

function schedule(threadId) {
  if (!enabled()) return;
  clearTimeout(timers.get(threadId));
  timers.set(
    threadId,
    setTimeout(async () => {
      timers.delete(threadId);
      if (running.has(threadId)) return schedule(threadId);
      running.add(threadId);
      try {
        await reply(threadId);
      } catch (e) {
        console.error('[ai] ответ не получился:', e.message);
      } finally {
        running.delete(threadId);
      }
    }, DEBOUNCE_MS)
  );
}

module.exports = { enabled, model, schedule, system, ping };
