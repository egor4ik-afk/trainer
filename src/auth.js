'use strict';
const crypto = require('crypto');

const COOKIE = 'tm_sess';
const SESSION_DAYS = 30;
let secret = process.env.SESSION_SECRET || null;

function setSecret(s) {
  secret = s;
}

function scrypt(password, salt) {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key)))
  );
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(password), salt);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, saltB64, keyB64] = stored.split('$');
  const key = await scrypt(String(password), Buffer.from(saltB64, 'base64'));
  const expected = Buffer.from(keyB64, 'base64');
  return expected.length === key.length && crypto.timingSafeEqual(expected, key);
}

const sign = (value) => crypto.createHmac('sha256', secret).update(value).digest('base64url');

function issue(res, userId) {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: Date.now() + SESSION_DAYS * 864e5 })).toString('base64url');
  res.cookie(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 864e5,
    path: '/',
  });
}

function clear(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function sessionUserId(req) {
  const raw = readCookie(req, COOKIE);
  if (!raw || !secret) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return null;
  const good = sign(payload);
  if (good.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.e > Date.now() ? data.u : null;
  } catch {
    return null;
  }
}

const csrfToken = (userId) => sign(`csrf:${userId}`);
function checkCsrf(req, userId) {
  const t = String((req.body && req.body._csrf) || '');
  const good = csrfToken(userId);
  return t.length === good.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(good));
}

// Простой ограничитель частоты по IP: окно и лимит на действие.
const buckets = new Map();
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 60_000).unref();

module.exports = { setSecret, hashPassword, verifyPassword, issue, clear, readCookie, sessionUserId, csrfToken, checkCsrf, rateLimit };
