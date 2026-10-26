'use strict';
/*
 * Медиатека: фото, загруженные через кабинет. Картинки уже уменьшены и
 * пережаты в браузере (WebP/JPEG), сервер только хранит и отдаёт их.
 * Хранилище — таблица media в PostgreSQL или папка data/media локально.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_BYTES = 4 * 1024 * 1024;
const MIME = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

let pool = null;
const dir = process.env.MEDIA_DIR || path.join(__dirname, '..', 'data', 'media');
const meta = new Map(); // id -> { id, mime, width, height, alt, bytes, createdAt }

async function init() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    const url = process.env.DATABASE_URL;
    pool = new Pool({ connectionString: url, max: 3, ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY,
        mime TEXT NOT NULL,
        data BYTEA NOT NULL,
        width INT,
        height INT,
        alt TEXT,
        owner TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    const { rows } = await pool.query('SELECT id, mime, width, height, alt, owner, octet_length(data) AS bytes, created_at FROM media');
    for (const r of rows) meta.set(r.id, { id: r.id, mime: r.mime, width: r.width, height: r.height, alt: r.alt || '', owner: r.owner, bytes: Number(r.bytes), createdAt: r.created_at.toISOString() });
  } else {
    fs.mkdirSync(dir, { recursive: true });
    try {
      for (const m of JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'))) meta.set(m.id, m);
    } catch {}
  }
}

const saveIndex = () => fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify([...meta.values()]));

// id: латиница, цифры, дефис; вариант «-sm» — уменьшенная копия того же фото.
const validId = (id) => /^[a-z0-9][a-z0-9-]{2,60}$/.test(id);
const newId = () => `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;

async function put({ id, mime, data, width, height, alt, owner }) {
  if (!MIME[mime]) throw new Error('Поддерживаются WebP, JPEG и PNG');
  if (!data || !data.length || data.length > MAX_BYTES) throw new Error('Файл пустой или больше 4 МБ');
  if (!validId(id)) throw new Error('Некорректный идентификатор');
  const m = { id, mime, width: width || null, height: height || null, alt: String(alt || '').slice(0, 200), owner: owner || null, bytes: data.length, createdAt: new Date().toISOString() };
  if (pool) {
    await pool.query(
      `INSERT INTO media (id, mime, data, width, height, alt, owner) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET mime=EXCLUDED.mime, data=EXCLUDED.data, width=EXCLUDED.width, height=EXCLUDED.height, alt=EXCLUDED.alt`,
      [id, mime, data, m.width, m.height, m.alt, m.owner]
    );
  } else {
    fs.writeFileSync(path.join(dir, id), data);
  }
  meta.set(id, m);
  if (!pool) saveIndex();
  return m;
}

async function get(id) {
  const m = meta.get(id);
  if (!m) return null;
  if (pool) {
    const { rows } = await pool.query('SELECT data FROM media WHERE id = $1', [id]);
    return rows[0] ? { ...m, data: rows[0].data } : null;
  }
  try {
    return { ...m, data: fs.readFileSync(path.join(dir, id)) };
  } catch {
    return null;
  }
}

async function remove(id) {
  meta.delete(id);
  if (pool) await pool.query('DELETE FROM media WHERE id = $1', [id]);
  else {
    try {
      fs.unlinkSync(path.join(dir, id));
    } catch {}
    saveIndex();
  }
}

const list = () => [...meta.values()].filter((m) => !m.id.endsWith('-sm')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
const info = (id) => meta.get(id) || null;
const url = (id) => `/m/${id}.${MIME[(meta.get(id) || {}).mime] || 'webp'}`;

// Маленький кэш в памяти для частых картинок (главная, анкеты).
const cache = new Map();
const CACHE_LIMIT = 24 * 1024 * 1024;
let cacheBytes = 0;
async function getCached(id) {
  if (cache.has(id)) return cache.get(id);
  const m = await get(id);
  if (m && cacheBytes + m.bytes < CACHE_LIMIT) {
    cache.set(id, m);
    cacheBytes += m.bytes;
  }
  return m;
}
function invalidate(id) {
  const m = cache.get(id);
  if (m) {
    cacheBytes -= m.bytes;
    cache.delete(id);
  }
}

module.exports = { init, put, get, getCached, invalidate, remove, list, info, url, newId, validId, MIME, MAX_BYTES };
