'use strict';
/*
 * Хранилище документов. Все коллекции небольшие, поэтому держим их в памяти
 * и пишем изменения насквозь: в PostgreSQL (если задан DATABASE_URL)
 * или в JSON-файл (локальная разработка).
 */
const fs = require('fs');
const path = require('path');
const { env } = require('./env');

class MemoryIndex {
  constructor() {
    this.cols = new Map();
  }
  col(name) {
    if (!this.cols.has(name)) this.cols.set(name, new Map());
    return this.cols.get(name);
  }
}

class FileBackend {
  constructor(file) {
    this.file = file;
  }
  async load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return Object.entries(raw).flatMap(([col, docs]) =>
        Object.entries(docs).map(([id, data]) => ({ col, id, data }))
      );
    } catch {
      return [];
    }
  }
  async write(index) {
    const out = {};
    for (const [col, docs] of index.cols) out[col] = Object.fromEntries(docs);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(out, null, 1));
    fs.renameSync(tmp, this.file);
  }
  async put(index) {
    await this.write(index);
  }
  async del(index) {
    await this.write(index);
  }
}

class PgBackend {
  constructor(url) {
    const { Pool } = require('pg');
    const needsSsl = /sslmode=require/.test(url);
    this.pool = new Pool({
      connectionString: url,
      max: 5,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    });
  }
  async load() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS docs (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (collection, id)
      )`);
    const { rows } = await this.pool.query('SELECT collection, id, data FROM docs');
    return rows.map((r) => ({ col: r.collection, id: r.id, data: r.data }));
  }
  async put(_index, col, id, data) {
    await this.pool.query(
      `INSERT INTO docs (collection, id, data, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [col, id, data]
    );
  }
  async del(_index, col, id) {
    await this.pool.query('DELETE FROM docs WHERE collection = $1 AND id = $2', [col, id]);
  }
}

class Store {
  constructor() {
    this.index = new MemoryIndex();
    const url = process.env.DATABASE_URL;
    this.kind = url ? 'postgres' : 'file';
    this.backend = url
      ? new PgBackend(url)
      : new FileBackend(env('DATA_FILE', path.join(__dirname, '..', 'data', 'db.json')));
    this.queue = Promise.resolve();
  }

  async init() {
    const docs = await this.backend.load();
    for (const { col, id, data } of docs) this.index.col(col).set(id, data);
  }

  // Записи выполняются последовательно, чтобы файл/БД не получали гонок.
  _enqueue(fn) {
    this.queue = this.queue.then(() => fn()).catch((err) => {
      console.error('[db] write failed:', err.message);
    });
    return this.queue;
  }

  all(col) {
    return [...this.index.col(col).values()];
  }
  get(col, id) {
    return this.index.col(col).get(id) || null;
  }
  find(col, pred) {
    return this.all(col).find(pred) || null;
  }
  filter(col, pred) {
    return this.all(col).filter(pred);
  }
  put(col, id, data) {
    const doc = { ...data, id };
    this.index.col(col).set(id, doc);
    return this._enqueue(() => this.backend.put(this.index, col, id, doc)).then(() => doc);
  }
  del(col, id) {
    this.index.col(col).delete(id);
    return this._enqueue(() => this.backend.del(this.index, col, id));
  }
}

module.exports = new Store();
