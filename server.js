'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const compression = require('compression');

const db = require('./src/db');
const auth = require('./src/auth');
const { seed } = require('./src/seed');
const { SITE, SUBJECTS, LEAD_STATUSES, subjectBySlug } = require('./src/catalog');
const layout = require('./src/views/layout');
const views = require('./src/views/pages');
const cab = require('./src/views/cabinet');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const IS_PROD = process.env.NODE_ENV === 'production';
// Ключ IndexNow публичный по своей природе: файл с ним лежит в корне сайта.
const INDEXNOW_KEY = process.env.INDEXNOW_KEY || '5f3b9c1e8a2d47f6b0c4e9a7d2f1b6c3';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

/* ---------- базовые middleware ---------- */

// Один канонический адрес: без www, без завершающего слеша, https.
app.use((req, res, next) => {
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (IS_PROD && host === `www.${SITE.host}`) return res.redirect(301, SITE.url + req.originalUrl);
  if (req.path.length > 1 && req.path.endsWith('/')) {
    const q = req.originalUrl.slice(req.path.length);
    return res.redirect(301, req.path.replace(/\/+$/, '') + q);
  }
  next();
});

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  next();
});

app.use(compression());

app.use(
  express.static(PUBLIC, {
    index: false,
    setHeaders(res, file) {
      if (/\.(woff2|png|jpg|webp|svg|ico)$/.test(file)) res.set('Cache-Control', 'public, max-age=2592000, immutable');
      else if (/\.(css|js)$/.test(file)) res.set('Cache-Control', 'public, max-age=604800');
    },
  })
);

app.use(express.urlencoded({ extended: false, limit: '64kb' }));

// Текущий пользователь кабинета.
app.use((req, res, next) => {
  const uid = auth.sessionUserId(req);
  const u = uid ? db.get('users', uid) : null;
  req.user = u ? { ...u, csrf: auth.csrfToken(u.id) } : null;
  next();
});

/* ---------- данные ---------- */

const published = () =>
  db
    .filter('specialists', (s) => s.status === 'published')
    .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || (b.reviewsCount || 0) - (a.reviewsCount || 0));

function counts(list) {
  const bySubject = {};
  for (const s of list) for (const x of s.subjects || []) bySubject[x] = (bySubject[x] || 0) + 1;
  return {
    repetitor: list.filter((s) => s.kind === 'repetitor').length,
    trener: list.filter((s) => s.kind === 'trener').length,
    bySubject,
  };
}

const BOT_RE = /bot|crawl|spider|slurp|yandex|google|bing|preview|facebookexternalhit|telegram|whatsapp|vkshare|curl|wget|python|headless/i;
const viewsBuffer = new Map();
function countView(req, slug) {
  if (BOT_RE.test(req.headers['user-agent'] || '')) return;
  if (req.user && req.user.specialistId === slug) return;
  const day = new Date().toISOString().slice(0, 10);
  const key = `${slug}:${day}`;
  viewsBuffer.set(key, (viewsBuffer.get(key) || 0) + 1);
}
async function flushViews() {
  const entries = [...viewsBuffer.entries()];
  viewsBuffer.clear();
  for (const [key, n] of entries) {
    const [slug, date] = key.split(':');
    const prev = db.get('views', key);
    await db.put('views', key, { specialistId: slug, date, count: (prev ? prev.count : 0) + n });
  }
}
setInterval(flushViews, 30_000).unref();

/* ---------- публичные страницы ---------- */

app.get('/', (req, res) => {
  const list = published();
  res.send(views.home({ specialists: list, user: req.user, counts: counts(list) }));
});

app.get('/repetitory', (req, res) => res.send(views.repetitory({ specialists: published(), user: req.user })));
app.get('/trenery', (req, res) => res.send(views.trenery({ specialists: published(), user: req.user })));
app.get('/zanyatiya', (req, res) => res.send(views.zanyatiya({ specialists: published(), user: req.user })));

app.get('/zanyatiya/:slug', (req, res, next) => {
  const subject = subjectBySlug(req.params.slug);
  if (!subject) return next();
  res.send(views.subjectPage({ subject, specialists: published(), user: req.user }));
});

app.get(['/repetitory/:slug', '/trenery/:slug'], (req, res, next) => {
  const s = db.get('specialists', req.params.slug);
  if (!s) return next();
  const section = req.path.startsWith('/trenery') ? 'trener' : 'repetitor';
  if (s.kind !== section) return res.redirect(301, views.profilePath(s));
  const canPreview = req.user && (req.user.role === 'admin' || req.user.specialistId === s.slug);
  if (s.status !== 'published' && !canPreview) return next();
  if (s.status === 'published') countView(req, s.slug);
  res.send(views.profile({ s, user: req.user, sent: req.query.sent === '1', preview: s.status !== 'published' }));
});

app.get('/politika', (req, res) => res.send(views.privacy({ user: req.user })));

/* ---------- заявки ---------- */

async function notifyTelegram(lead, s) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = (s && s.telegramChatId) || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  const subj = subjectBySlug(lead.subject);
  const text = [
    `Новая заявка на ${SITE.host}`,
    `Специалист: ${s ? s.name : lead.specialistId}`,
    `Имя: ${lead.name}`,
    `Контакт: ${lead.contact}`,
    subj ? `Цель: ${subj.title}` : '',
    lead.grade ? `Класс: ${lead.grade}` : '',
    lead.format ? `Формат: ${lead.format}` : '',
    lead.message ? `Комментарий: ${lead.message}` : '',
    `Кабинет: ${SITE.url}/kabinet/zayavki`,
  ]
    .filter(Boolean)
    .join('\n');
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error('[telegram] notify failed:', err.message);
  }
}

app.post('/zayavka', async (req, res, next) => {
  const b = req.body || {};
  const s = db.get('specialists', String(b.specialist || ''));
  if (!s || s.status !== 'published') return next();
  if (b.website) return res.redirect(303, `${views.profilePath(s)}?sent=1#zapis`); // ловушка для ботов

  const form = {
    name: String(b.name || '').trim().slice(0, 80),
    contact: String(b.contact || '').trim().slice(0, 80),
    subject: String(b.subject || '').slice(0, 40),
    grade: String(b.grade || '').trim().slice(0, 40),
    format: ['онлайн', 'очно', 'не важно'].includes(b.format) ? b.format : 'не важно',
    message: String(b.message || '').trim().slice(0, 1000),
    consent: b.consent === '1',
  };
  let error = null;
  if (!form.name) error = 'Укажите, как к вам обращаться.';
  else if (form.contact.replace(/\D/g, '').length < 10 && !/^@?[a-z0-9_]{4,}$/i.test(form.contact)) error = 'Укажите телефон (10–11 цифр) или ник в Telegram.';
  else if (!form.consent) error = 'Нужно согласие на обработку персональных данных.';
  else if (!auth.rateLimit(`lead:${req.ip}`, 5, 60 * 60 * 1000)) error = 'Слишком много заявок с вашего адреса. Попробуйте через час.';
  if (error) return res.status(400).send(views.profile({ s, user: req.user, error, form }));

  const id = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const lead = { ...form, specialistId: s.slug, status: 'new', createdAt: new Date().toISOString(), source: req.get('referer') || '' };
  delete lead.consent;
  lead.consentAt = lead.createdAt;
  await db.put('leads', id, lead);
  notifyTelegram(lead, s);
  res.redirect(303, `${views.profilePath(s)}?sent=1#zapis`);
});

/* ---------- кабинет ---------- */

function requireUser(req, res, next) {
  if (!req.user) return res.redirect(303, `/kabinet?next=${encodeURIComponent(req.originalUrl)}`);
  next();
}
function requireCsrf(req, res, next) {
  if (!auth.checkCsrf(req, req.user.id)) return res.status(403).send('Форма устарела. Обновите страницу и попробуйте ещё раз.');
  next();
}
const ownSpecialist = (user, id) => {
  if (user.role === 'admin') return db.get('specialists', id || '') || null;
  return user.specialistId ? db.get('specialists', user.specialistId) : null;
};
const userLeads = (user) =>
  db
    .filter('leads', (l) => user.role === 'admin' || l.specialistId === user.specialistId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

const safeNext = (n) => (typeof n === 'string' && /^\/kabinet(\/[\w-]*)*(\?[\w=&-]*)?$/.test(n) ? n : '/kabinet/zayavki');

app.get('/kabinet', (req, res) => {
  if (req.user) return res.redirect(303, '/kabinet/zayavki');
  res.send(cab.login({ next: req.query.next }));
});

app.post('/kabinet/vhod', async (req, res) => {
  const login = String(req.body.login || '').trim().toLowerCase();
  const next = safeNext(req.body.next);
  if (!auth.rateLimit(`login:${req.ip}`, 10, 15 * 60 * 1000)) {
    return res.status(429).send(cab.login({ error: 'Слишком много попыток. Подождите 15 минут.', login, next }));
  }
  const u = db.get('users', login);
  if (!u || !(await auth.verifyPassword(req.body.password || '', u.passwordHash))) {
    return res.status(401).send(cab.login({ error: 'Неверный логин или пароль.', login, next }));
  }
  auth.issue(res, u.id);
  res.redirect(303, next);
});

app.post('/kabinet/vyhod', requireUser, requireCsrf, (req, res) => {
  auth.clear(res);
  res.redirect(303, '/');
});

app.get('/kabinet/registraciya', (req, res) => {
  if (req.user) return res.redirect(303, '/kabinet/anketa');
  res.send(cab.register({ form: { kind: req.query.kind === 'trener' ? 'trener' : 'repetitor' } }));
});

const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const slugify = (s) =>
  String(s)
    .toLowerCase()
    .split('')
    .map((c) => (TRANSLIT[c] !== undefined ? TRANSLIT[c] : c))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'specialist';

app.post('/kabinet/registraciya', async (req, res) => {
  const b = req.body || {};
  const form = {
    kind: b.kind === 'trener' ? 'trener' : 'repetitor',
    name: String(b.name || '').trim().slice(0, 80),
    role: String(b.role || '').trim().slice(0, 80),
    login: String(b.login || '').trim().toLowerCase(),
  };
  let error = null;
  if (!auth.rateLimit(`reg:${req.ip}`, 5, 60 * 60 * 1000)) error = 'Слишком много попыток. Попробуйте через час.';
  else if (form.name.length < 2) error = 'Укажите имя и фамилию.';
  else if (form.role.length < 3) error = 'Укажите предмет или направление.';
  else if (!/^[a-z0-9._-]{3,40}$/.test(form.login)) error = 'Логин: от 3 до 40 символов — латиница, цифры, точка, дефис.';
  else if (db.get('users', form.login)) error = 'Такой логин уже занят.';
  else if (String(b.password || '').length < 8) error = 'Пароль — не короче 8 символов.';
  else if (b.consent !== '1') error = 'Нужно согласие с политикой конфиденциальности.';
  if (error) return res.status(400).send(cab.register({ error, form }));

  let slug = slugify(form.name);
  for (let i = 2; db.get('specialists', slug); i++) slug = `${slugify(form.name)}-${i}`;
  const now = new Date().toISOString();
  await db.put('specialists', slug, {
    slug,
    kind: form.kind,
    status: 'review',
    name: form.name,
    role: form.role,
    headline: '',
    about: '',
    subjects: [],
    services: [],
    formats: { online: true, atHome: [], travel: [] },
    reviews: [],
    reviewsCount: 0,
    rating: 0,
    createdAt: now,
    updatedAt: now,
  });
  await db.put('users', form.login, {
    login: form.login,
    name: form.name,
    role: 'specialist',
    specialistId: slug,
    passwordHash: await auth.hashPassword(b.password),
    createdAt: now,
  });
  auth.issue(res, form.login);
  res.redirect(303, '/kabinet/anketa?flash=created');
});

const FLASH = {
  created: 'Анкета создана. Заполните её — после проверки она появится на сайте.',
  saved: 'Анкета сохранена.',
  password: 'Пароль изменён.',
  lead: 'Статус заявки обновлён.',
  moderated: 'Статус анкеты обновлён.',
};

app.get('/kabinet/zayavki', requireUser, (req, res) => {
  const filter = LEAD_STATUSES[req.query.status] ? req.query.status : null;
  const specialistsById = Object.fromEntries(db.all('specialists').map((s) => [s.slug, s]));
  res.send(cab.leads({ user: req.user, leads: userLeads(req.user), filter, specialistsById, flash: FLASH[req.query.flash] }));
});

app.post('/kabinet/zayavki/:id', requireUser, requireCsrf, async (req, res) => {
  const l = db.get('leads', req.params.id);
  const status = req.body.status;
  if (l && LEAD_STATUSES[status] && (req.user.role === 'admin' || l.specialistId === req.user.specialistId)) {
    await db.put('leads', l.id, { ...l, status, updatedAt: new Date().toISOString() });
  }
  res.redirect(303, '/kabinet/zayavki?flash=lead');
});

const splitLines = (v) =>
  String(v || '')
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 30);
const titled = (v) =>
  splitLines(v).map((line) => {
    const [title, years] = line.split('|').map((x) => x.trim());
    return { title: title.slice(0, 300), years: (years || '').slice(0, 40) };
  });
const list = (v) =>
  String(v || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 20);

app.get('/kabinet/anketa', requireUser, (req, res) => {
  const s = ownSpecialist(req.user, req.query.id || req.user.specialistId);
  const all = req.user.role === 'admin' ? db.all('specialists') : [];
  res.send(cab.anketa({ user: req.user, s, all, flash: FLASH[req.query.flash] }));
});

app.post('/kabinet/anketa', requireUser, requireCsrf, async (req, res) => {
  const b = req.body;
  const s = ownSpecialist(req.user, b.id);
  if (!s) return res.redirect(303, '/kabinet/anketa');

  // Направление услуги сохраняем по названию; новым — подбираем по словам.
  const prevSubj = Object.fromEntries((s.services || []).map((x) => [x.title, x.subject]));
  const prevExtra = new Set((s.services || []).filter((x) => x.extra).map((x) => x.title));
  const subjects = [].concat(b.subjects || []).filter((x) => subjectBySlug(x));
  const services = splitLines(b.services).map((line) => {
    const [title, p] = line.split('|').map((x) => x.trim());
    const guess = /егэ/i.test(title) ? 'ege-geografiya' : /огэ|гиа/i.test(title) ? 'oge-geografiya' : subjects[0] || null;
    const extra = prevExtra.has(title) || /^провер/i.test(title);
    return { title: title.slice(0, 120), price: Math.max(0, parseInt(String(p || '').replace(/\D/g, ''), 10) || 0), unit: '60 мин', subject: prevSubj[title] || guess, ...(extra ? { extra: true } : {}) };
  });
  const photo = String(b.photo || '').trim();
  const updated = {
    ...s,
    name: String(b.name || s.name).trim().slice(0, 80),
    role: String(b.role || s.role).trim().slice(0, 80),
    grades: String(b.grades || '').trim().slice(0, 60),
    headline: String(b.headline || '').trim().slice(0, 300),
    about: String(b.about || '').trim().slice(0, 3000),
    subjects: s.kind === 'repetitor' ? subjects : s.subjects || [],
    results: splitLines(b.results),
    method: splitLines(b.method),
    services,
    education: titled(b.education).map((x, i) => ({ ...x, verified: !!(s.education && s.education[i] && s.education[i].title === x.title && s.education[i].verified) })),
    experience: titled(b.experience).map((x, i) => ({ ...x, verified: !!(s.experience && s.experience[i] && s.experience[i].title === x.title && s.experience[i].verified) })),
    achievements: titled(b.achievements).map((x, i) => ({ ...x, verified: !!(s.achievements && s.achievements[i] && s.achievements[i].title === x.title && s.achievements[i].verified) })),
    formats: { online: b.online === '1', groups: b.groups === '1', trial: b.trial === '1', atHome: list(b.atHome), travel: list(b.travel) },
    profiUrl: /^https:\/\/(www\.)?profi\.ru\//.test(b.profiUrl || '') ? b.profiUrl.trim() : '',
    updatedAt: new Date().toISOString(),
  };
  if (photo !== (s.photo || '')) {
    // Своя ссылка на фото заменяет загруженные варианты.
    updated.photo = /^(https:\/\/|\/img\/)/.test(photo) ? photo.slice(0, 300) : '';
    delete updated.photoWebp;
    delete updated.photoSquare;
    delete updated.photoSquareWebp;
  }
  await db.put('specialists', s.slug, updated);
  res.redirect(303, `/kabinet/anketa?flash=saved${req.user.role === 'admin' ? `&id=${encodeURIComponent(s.slug)}` : ''}`);
});

app.get('/kabinet/statistika', requireUser, async (req, res) => {
  await flushViews();
  const s = ownSpecialist(req.user, req.query.id || req.user.specialistId);
  const ids = req.user.role === 'admin' && !s ? db.all('specialists').map((x) => x.slug) : s ? [s.slug] : [];
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    days.push({ date, count: ids.reduce((a, id) => a + ((db.get('views', `${id}:${date}`) || {}).count || 0), 0) });
  }
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const leads = userLeads(req.user).filter((l) => l.createdAt >= since && (!s || l.specialistId === s.slug));
  res.send(cab.stats({ user: req.user, days, leads, s }));
});

app.get('/kabinet/nastroyki', requireUser, (req, res) => res.send(cab.settings({ user: req.user, flash: FLASH[req.query.flash] })));

app.post('/kabinet/nastroyki', requireUser, requireCsrf, async (req, res) => {
  const u = db.get('users', req.user.id);
  const { current, password, password2 } = req.body;
  let error = null;
  if (!(await auth.verifyPassword(current || '', u.passwordHash))) error = 'Текущий пароль указан неверно.';
  else if (String(password || '').length < 8) error = 'Новый пароль — не короче 8 символов.';
  else if (password !== password2) error = 'Пароли не совпадают.';
  if (error) return res.status(400).send(cab.settings({ user: req.user, error }));
  await db.put('users', u.id, { ...u, passwordHash: await auth.hashPassword(password), passwordChangedAt: new Date().toISOString() });
  res.redirect(303, '/kabinet/nastroyki?flash=password');
});

app.get('/kabinet/moderaciya', requireUser, (req, res, next) => {
  if (req.user.role !== 'admin') return next();
  const specialists = db.all('specialists').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.send(cab.moderation({ user: req.user, specialists, leadsCount: db.all('leads').length, flash: FLASH[req.query.flash] }));
});

app.post('/kabinet/moderaciya/:slug', requireUser, requireCsrf, async (req, res, next) => {
  if (req.user.role !== 'admin') return next();
  const s = db.get('specialists', req.params.slug);
  if (s && ['published', 'hidden', 'review'].includes(req.body.status)) {
    await db.put('specialists', s.slug, { ...s, status: req.body.status, updatedAt: new Date().toISOString() });
    if (req.body.status === 'published') pingIndexNow([SITE.url + views.profilePath(s)]);
  }
  res.redirect(303, '/kabinet/moderaciya?flash=moderated');
});

/* ---------- SEO: robots, sitemap, IndexNow ---------- */

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /kabinet',
      'Disallow: /zayavka',
      'Disallow: /*?sent=',
      'Disallow: /*?preview=',
      '',
      'User-agent: Yandex',
      'Allow: /',
      'Disallow: /kabinet',
      'Disallow: /zayavka',
      'Clean-param: sent&preview /',
      'Clean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&yclid&gclid /',
      '',
      `Sitemap: ${SITE.url}/sitemap.xml`,
      '',
    ].join('\n')
  );
});

function sitemapUrls() {
  const list = published();
  const c = counts(list);
  const latest = (arr) => arr.map((s) => s.updatedAt || s.createdAt).sort().pop() || new Date().toISOString();
  const urls = [
    { loc: '/', lastmod: latest(list), priority: '1.0', changefreq: 'weekly' },
    c.repetitor && { loc: '/repetitory', lastmod: latest(list.filter((s) => s.kind === 'repetitor')), priority: '0.9', changefreq: 'weekly' },
    c.trener && { loc: '/trenery', lastmod: latest(list.filter((s) => s.kind === 'trener')), priority: '0.9', changefreq: 'weekly' },
    { loc: '/zanyatiya', lastmod: latest(list), priority: '0.8', changefreq: 'weekly' },
    ...SUBJECTS.filter((x) => c.bySubject[x.slug]).map((x) => ({ loc: `/zanyatiya/${x.slug}`, lastmod: latest(list.filter((s) => (s.subjects || []).includes(x.slug))), priority: '0.8', changefreq: 'weekly' })),
    ...list.map((s) => ({ loc: views.profilePath(s), lastmod: s.updatedAt || s.createdAt, priority: '0.9', changefreq: 'weekly', image: s.photo })),
    { loc: '/politika', lastmod: '2026-10-24T00:00:00.000Z', priority: '0.2', changefreq: 'yearly' },
  ].filter(Boolean);
  return urls;
}

app.get('/sitemap.xml', (req, res) => {
  const x = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const body = sitemapUrls()
    .map(
      (u) => `  <url>
    <loc>${x(SITE.url + u.loc)}</loc>
    <lastmod>${x(String(u.lastmod).slice(0, 10))}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${u.image ? `\n    <image:image><image:loc>${x(layout.abs(u.image))}</image:loc></image:image>` : ''}
  </url>`
    )
    .join('\n');
  res
    .type('application/xml')
    .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${body}\n</urlset>\n`);
});

app.get(`/${INDEXNOW_KEY}.txt`, (req, res) => res.type('text/plain').send(INDEXNOW_KEY));

async function pingIndexNow(urls) {
  if (!IS_PROD || process.env.INDEXNOW_DISABLED === '1') return;
  try {
    const r = await fetch('https://yandex.com/indexnow', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: SITE.host, key: INDEXNOW_KEY, keyLocation: `${SITE.url}/${INDEXNOW_KEY}.txt`, urlList: urls }),
      signal: AbortSignal.timeout(10000),
    });
    console.log(`[indexnow] ${urls.length} url(s) → ${r.status}`);
  } catch (err) {
    console.error('[indexnow] failed:', err.message);
  }
}

// Сообщаем Яндексу об изменениях один раз после запуска новой версии.
async function announceOnStart() {
  const version = layout.ASSET_VERSION;
  const last = db.get('meta', 'indexnow');
  if (last && last.version === version) return;
  await pingIndexNow(sitemapUrls().map((u) => SITE.url + u.loc));
  await db.put('meta', 'indexnow', { version, at: new Date().toISOString() });
}

app.get('/healthz', (req, res) => res.json({ ok: true, store: db.kind }));

/* ---------- 404 и ошибки ---------- */

app.use((req, res) => res.status(404).send(views.notFound({ user: req.user })));

app.use((err, req, res, _next) => {
  console.error('[error]', req.method, req.originalUrl, err);
  res.status(500).send('Что-то пошло не так. Обновите страницу через минуту.');
});

/* ---------- запуск ---------- */

function assetHash() {
  const h = crypto.createHash('sha1');
  for (const f of ['css/site.css', 'js/site.js']) {
    try {
      h.update(fs.readFileSync(path.join(PUBLIC, f)));
    } catch {}
  }
  h.update(fs.readFileSync(__filename));
  return h.digest('hex').slice(0, 10);
}

async function main() {
  await db.init();
  let meta = db.get('meta', 'secret');
  if (!process.env.SESSION_SECRET) {
    if (!meta) meta = await db.put('meta', 'secret', { value: crypto.randomBytes(32).toString('hex') });
    auth.setSecret(meta.value);
  }
  await seed();
  const v = assetHash();
  layout.setAssetVersion(v);
  layout.ASSET_VERSION = v;
  app.listen(PORT, () => {
    console.log(`trainer.moscow on :${PORT} (store: ${db.kind})`);
    setTimeout(() => announceOnStart().catch(() => {}), 15_000);
  });
}

process.on('SIGTERM', async () => {
  await flushViews().catch(() => {});
  process.exit(0);
});

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
