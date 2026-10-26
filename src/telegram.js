'use strict';
/*
 * Все запросы к Telegram Bot API — только через этот модуль.
 *
 * С сервера в России api.telegram.org напрямую не открывается, поэтому запросы
 * идут через HTTP-прокси TG_PROXY_URL (как в HelpMame). Для https это туннель
 * CONNECT: прокси видит только адрес api.telegram.org:443, токен и текст идут
 * внутри TLS. Без TG_PROXY_URL — напрямую (локальная разработка).
 */
const { ProxyAgent, fetch: undiciFetch, FormData } = require('undici');

const API = 'https://api.telegram.org';
let agent = null;

function dispatcher() {
  const url = process.env.TG_PROXY_URL || '';
  if (!url) return undefined;
  if (!agent || agent.url !== url) agent = { url, d: new ProxyAgent(url) };
  return agent.d;
}

class TgError extends Error {
  constructor(method, data, status) {
    super(`Telegram ${method}: ${(data && data.description) || `HTTP ${status}`}`);
    this.code = data && data.error_code;
    this.parameters = (data && data.parameters) || {};
  }
}

const token = () => process.env.TELEGRAM_BOT_TOKEN || '';

async function request(method, body, headers, timeoutMs) {
  if (!token()) throw new Error(`Telegram ${method}: не задан TELEGRAM_BOT_TOKEN`);
  let res;
  try {
    res = await undiciFetch(`${API}/bot${token()}/${method}`, {
      method: 'POST',
      headers,
      body,
      dispatcher: dispatcher(),
      signal: AbortSignal.timeout(timeoutMs || 15000),
    });
  } catch (e) {
    const c = e.cause || {};
    throw new Error(`Telegram недоступен${process.env.TG_PROXY_URL ? ' через прокси' : ''}: ${[c.code, c.message || e.message].filter(Boolean).join(' ')}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new TgError(method, data, res.status);
  return data.result;
}

/** Вызов метода с JSON-телом. */
function call(method, params = {}, timeoutMs) {
  return request(method, JSON.stringify(params), { 'content-type': 'application/json' }, timeoutMs);
}

/**
 * Вызов с файлом: files — { имя_поля: { data: Buffer, name, type } }.
 * Остальные параметры — строками (объекты — JSON).
 */
function upload(method, params, files, timeoutMs = 60000) {
  const form = new FormData();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    form.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  for (const [k, f] of Object.entries(files)) form.append(k, new Blob([f.data], { type: f.type || 'application/octet-stream' }), f.name || k);
  return request(method, form, undefined, timeoutMs);
}

module.exports = { call, upload, TgError, enabled: () => Boolean(token()) };
