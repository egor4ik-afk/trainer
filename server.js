'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const compression = require('compression');

const db = require('./src/db');
const auth = require('./src/auth');
const media = require('./src/media');
const payments = require('./src/payments');
const { seed } = require('./src/seed');
const { SITE, DIRECTIONS, LEAD_STATUSES, ORDER_STATUSES, GOALS, subjectBySlug, directionBySlug, goalById } = require('./src/catalog');
const layout = require('./src/views/layout');
const ui = require('./src/views/ui');
const views = require('./src/views/pages');
const { home } = require('./src/views/home');
const shop = require('./src/views/offers');
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
    ...(IS_PROD ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
  });
  next();
});

app.use(compression());

app.use(
  express.static(PUBLIC, {
    index: false,
    setHeaders(res, file) {
      if (/\.(woff2|png|jpg|webp|svg|ico)$/.test(file)) res.set('Cache-Control', 'public, max-age=2592000, immutable');
      else if (/\.(css|js)$/.test(file)) res.set('Cache-Control', 'public, max-age=31536000, immutable');
      else if (/\.(webmanifest|txt|html)$/.test(file)) res.set('Cache-Control', 'public, max-age=86400');
    },
  })
);

// Старые адреса: репетиторов больше нет — ведём на близкие разделы.
app.get(['/repetitory', '/repetitory/*'], (req, res) => res.redirect(301, '/trenery'));
app.get(['/zanyatiya/geografiya', '/zanyatiya/oge-geografiya', '/zanyatiya/ege-geografiya'], (req, res) => res.redirect(301, '/programmy'));

// Фото из медиатеки.
app.get('/m/:file', async (req, res, next) => {
  const m = req.params.file.match(/^([a-z0-9-]+)\.(webp|jpg|png)$/);
  if (!m) return next();
  try {
    const item = await media.getCached(m[1]);
    if (!item) return next();
    res.set({ 'Content-Type': item.mime, 'Cache-Control': 'public, max-age=31536000, immutable' });
    res.send(item.data);
  } catch (err) {
    next(err);
  }
});

// Уведомления ЮKassa приходят в JSON; остальные формы — urlencoded.
app.post('/api/yookassa', express.json({ limit: '64kb' }), (req, res, next) => yookassaWebhook(req, res).catch(next));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

// Текущий пользователь кабинета.
app.use((req, res, next) => {
  const uid = auth.sessionUserId(req);
  const u = uid ? db.get('users', uid) : null;
  req.user = u ? { ...u, csrf: auth.csrfToken(u.id) } : null;
  next();
});

/* ---------- данные ---------- */

const owner = () => db.get('specialists', SITE.owner);
const trainers = () =>
  db
    .filter('specialists', (s) => s.status === 'published')
    .sort((a, b) => (b.headCoach ? 1 : 0) - (a.headCoach ? 1 : 0) || (b.reviewsCount || 0) - (a.reviewsCount || 0));
const visibleOffers = () =>
  db.filter('offers', (o) => o.status === 'on_sale' || o.status === 'waitlist').sort((a, b) => (a.order || 0) - (b.order || 0) || a.title.localeCompare(b.title));
const bySlug = (list) => Object.fromEntries(list.map((x) => [x.slug, x]));

// Доступ к формату или программе: админ и тренер формата — всегда; ученик — по оплаченному заказу.
function accessOf(user, slug) {
  if (!user) return null;
  const o = db.get('offers', slug);
  if (!o) return null;
  if (user.role === 'admin' || (user.specialistId && o.trainer === user.specialistId)) return { offer: o, until: null };
  const now = new Date().toISOString();
  const paid = db
    .filter('orders', (x) => x.userId === user.id && x.offer === slug && x.status === 'paid' && (!x.accessUntil || x.accessUntil > now))
    .sort((a, b) => String(b.accessUntil || '9').localeCompare(String(a.accessUntil || '9')));
  return paid.length ? { offer: o, until: paid[0].accessUntil || null } : null;
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
  const o = owner();
  if (o) countView(req, o.slug);
  res.send(home({ owner: o, specialists: trainers(), offers: visibleOffers(), user: req.user, sent: req.query.sent === '1' }));
});

app.get('/programmy', (req, res) => res.send(shop.catalog({ offers: visibleOffers(), user: req.user, trainersBySlug: bySlug(trainers()) })));

app.get('/programmy/:slug', (req, res, next) => {
  const o = db.get('offers', req.params.slug);
  const canPreview = req.user && req.user.role === 'admin';
  if (!o || ((o.status === 'draft' || o.status === 'hidden') && !canPreview)) return next();
  const goal = goalById(req.query.cel);
  res.send(
    shop.offerPage({
      o,
      trainer: db.get('specialists', o.trainer),
      user: req.user,
      sent: req.query.sent === '1',
      waitSent: req.query.wait === '1',
      form: goal ? { goal: goal.id } : {},
      hasAccess: Boolean(req.user && req.user.role === 'client' && accessOf(req.user, o.slug)),
    })
  );
});

app.get('/trenery', (req, res) => res.send(views.trenery({ specialists: trainers(), offers: visibleOffers(), user: req.user })));

app.get('/trenery/:slug', (req, res, next) => {
  const s = db.get('specialists', req.params.slug);
  if (!s || s.kind !== 'trener') return next();
  const canPreview = req.user && (req.user.role === 'admin' || req.user.specialistId === s.slug);
  if (s.status !== 'published' && !canPreview) return next();
  if (s.status === 'published') countView(req, s.slug);
  res.send(views.profile({ s, offers: visibleOffers(), user: req.user, sent: req.query.sent === '1', preview: s.status !== 'published' }));
});

app.get('/zanyatiya', (req, res) => res.send(views.zanyatiya({ specialists: trainers(), offers: visibleOffers(), user: req.user })));
app.get('/zanyatiya/:slug', (req, res, next) => {
  const d = directionBySlug(req.params.slug);
  if (!d) return next();
  res.send(views.directionPage({ d, specialists: trainers(), offers: visibleOffers(), user: req.user }));
});

app.get('/politika', (req, res) => res.send(views.privacy({ user: req.user })));
app.get('/oferta', (req, res) => res.send(views.oferta({ user: req.user })));

/* ---------- уведомления ---------- */

async function notifyTelegram(lines, s) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = (s && s.telegramChatId) || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: lines.filter(Boolean).join('\n'), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error('[telegram] notify failed:', err.message);
  }
}

const newId = () => `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
const validContact = (c) => c.replace(/\D/g, '').length >= 10 || /^@?[a-z0-9_]{4,}$/i.test(c) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);

/* ---------- заявки ---------- */

app.post('/zayavka', async (req, res, next) => {
  const b = req.body || {};
  const s = db.get('specialists', String(b.specialist || '')) || owner();
  if (!s || s.status !== 'published') return next();
  const offer = b.offer ? db.get('offers', String(b.offer)) : null;
  const from = ['home', 'offer', 'profile'].includes(b.from) ? b.from : 'profile';
  const back = from === 'home' ? '/' : from === 'offer' && offer ? ui.offerPath(offer) : ui.profilePath(s);
  if (b.website) return res.redirect(303, `${back}?sent=1#zapis`); // ловушка для ботов

  const form = {
    name: String(b.name || '').trim().slice(0, 80),
    contact: String(b.contact || '').trim().slice(0, 80),
    goal: goalById(b.goal) ? b.goal : b.goal === 'other' ? 'other' : '',
    message: String(b.message || '').trim().slice(0, 1000),
    consent: b.consent === '1',
  };
  let error = null;
  if (!form.name) error = 'Укажите, как к вам обращаться.';
  else if (!validContact(form.contact)) error = 'Укажите телефон (10–11 цифр) или ник в Telegram.';
  else if (!form.consent) error = 'Нужно согласие на обработку персональных данных.';
  else if (!auth.rateLimit(`lead:${req.ip}`, 6, 60 * 60 * 1000)) error = 'Слишком много заявок с вашего адреса. Попробуйте через час.';
  if (error) {
    res.status(400);
    if (from === 'home') return res.send(home({ owner: owner(), specialists: trainers(), offers: visibleOffers(), user: req.user, error, form }));
    if (from === 'offer' && offer) return res.send(shop.offerPage({ o: offer, trainer: s, user: req.user, error, form }));
    return res.send(views.profile({ s, offers: visibleOffers(), user: req.user, error, form }));
  }

  const lead = {
    ...form,
    type: 'consult',
    specialistId: s.slug,
    offer: offer ? offer.slug : null,
    offerTitle: offer ? offer.title : null,
    status: 'new',
    createdAt: new Date().toISOString(),
    source: req.get('referer') || '',
  };
  delete lead.consent;
  lead.consentAt = lead.createdAt;
  await db.put('leads', newId(), lead);
  const goal = goalById(form.goal);
  notifyTelegram([`Новая заявка на ${SITE.host}`, `Тренер: ${s.name}`, `Имя: ${lead.name}`, `Контакт: ${lead.contact}`, offer && `Формат: ${offer.title}`, goal && `Цель: ${goal.title}`, lead.message && `Комментарий: ${lead.message}`, `Кабинет: ${SITE.url}/kabinet/zayavki`], s);
  res.redirect(303, `${back}?sent=1#zapis`);
});

// Предзапись на программу, которая ещё готовится.
app.post('/predzapis', async (req, res, next) => {
  const b = req.body || {};
  const o = db.get('offers', String(b.offer || ''));
  if (!o || o.status !== 'waitlist') return next();
  if (b.website) return res.redirect(303, `${ui.offerPath(o)}?wait=1#ceny`);
  const contact = String(b.contact || '').trim().slice(0, 80);
  let error = null;
  if (!validContact(contact)) error = 'Укажите почту, телефон или ник в Telegram.';
  else if (b.consent !== '1') error = 'Нужно согласие на обработку персональных данных.';
  else if (!auth.rateLimit(`wait:${req.ip}`, 10, 60 * 60 * 1000)) error = 'Слишком много заявок. Попробуйте через час.';
  if (error) return res.status(400).send(shop.offerPage({ o, trainer: db.get('specialists', o.trainer), user: req.user, waitError: error, waitForm: { contact } }));
  const now = new Date().toISOString();
  await db.put('leads', newId(), { type: 'waitlist', name: 'Предзапись', contact, offer: o.slug, offerTitle: o.title, specialistId: o.trainer, status: 'new', createdAt: now, consentAt: now });
  notifyTelegram([`Предзапись на «${o.title}»`, `Контакт: ${contact}`]);
  res.redirect(303, `${ui.offerPath(o)}?wait=1#ceny`);
});

/* ---------- заказы и оплата ---------- */

function findPackage(slug, pkgId) {
  const o = db.get('offers', slug);
  if (!o || o.status !== 'on_sale') return {};
  const pkg = (o.packages || []).find((p) => p.id === pkgId && typeof p.price === 'number' && p.price > 0);
  return pkg ? { o, pkg } : {};
}

app.get('/zakaz/:slug/:pkg', (req, res, next) => {
  const { o, pkg } = findPackage(req.params.slug, req.params.pkg);
  if (!o) return next();
  res.send(shop.checkout({ o, pkg, user: req.user, paymentsOn: payments.enabled() }));
});

app.post('/zakaz/:slug/:pkg', async (req, res, next) => {
  try {
    const { o, pkg } = findPackage(req.params.slug, req.params.pkg);
    if (!o) return next();
    const b = req.body || {};
    if (b.website) return res.redirect(303, ui.offerPath(o));
    const isClient = req.user && req.user.role === 'client';
    const form = {
      name: String(b.name || '').trim().slice(0, 80),
      phone: String(b.phone || '').trim().slice(0, 80),
      email: (isClient ? req.user.login : String(b.email || '')).trim().toLowerCase().slice(0, 120),
    };
    const fail = (error) => res.status(400).send(shop.checkout({ o, pkg, user: req.user, error, form, paymentsOn: payments.enabled() }));
    if (!form.name) return fail('Укажите имя.');
    if (!validContact(form.phone)) return fail('Укажите телефон или ник в Telegram.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return fail('Укажите почту — на неё придёт чек, и это ваш логин в кабинете.');
    if (b.consent !== '1') return fail('Нужно принять условия оферты.');
    if (!auth.rateLimit(`order:${req.ip}`, 10, 60 * 60 * 1000)) return fail('Слишком много заказов. Попробуйте через час.');

    // Учётная запись ученика: логин — почта.
    let user = req.user && req.user.role === 'client' ? db.get('users', req.user.id) : null;
    if (!user) {
      const existing = db.get('users', form.email);
      if (existing) {
        if (req.user && req.user.id === existing.id) user = existing;
        else return fail('Эта почта уже зарегистрирована — войдите в кабинет, и заказ оформится на вас.');
      } else {
        if (String(b.password || '').length < 8) return fail('Придумайте пароль не короче 8 символов.');
        user = await db.put('users', form.email, { login: form.email, name: form.name, phone: form.phone, role: 'client', passwordHash: await auth.hashPassword(b.password), createdAt: new Date().toISOString() });
      }
    }

    const order = {
      offer: o.slug,
      offerTitle: o.title,
      package: pkg.id,
      packageTitle: pkg.title,
      accessDays: pkg.accessDays || null,
      amount: pkg.price,
      customer: form,
      userId: user.id,
      trainer: o.trainer,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    const id = crypto.randomBytes(8).toString('hex');
    await db.put('orders', id, order);
    auth.issue(res, user.id);
    notifyTelegram([`Новый заказ на ${SITE.host}`, `${o.title} — ${pkg.title}`, `Сумма: ${layout.price(pkg.price)}`, `Покупатель: ${form.name}, ${form.email}, ${form.phone}`, `Кабинет: ${SITE.url}/kabinet/zakazy`]);

    if (payments.enabled()) {
      const p = await payments.createPayment({ order: { ...order, id }, description: `${o.title} — ${pkg.title}`, returnUrl: `${SITE.url}/zakaz/status/${id}` });
      const url = p.confirmation && p.confirmation.confirmation_url;
      await db.put('orders', id, { ...order, paymentId: p.id, paymentUrl: url || null });
      if (url) return res.redirect(303, url);
    }
    res.redirect(303, `/zakaz/status/${id}`);
  } catch (err) {
    next(err);
  }
});

async function markPaid(id, paymentId) {
  const order = db.get('orders', id);
  if (!order || order.status === 'paid') return order;
  const paidAt = new Date().toISOString();
  const accessUntil = order.accessDays ? new Date(Date.now() + order.accessDays * 864e5).toISOString() : null;
  const updated = await db.put('orders', id, { ...order, status: 'paid', paidAt, accessUntil, ...(paymentId ? { paymentId } : {}) });
  notifyTelegram([`Оплачен заказ на ${SITE.host}`, `${order.offerTitle} — ${order.packageTitle}`, `Сумма: ${layout.price(order.amount)}`, `Покупатель: ${order.customer.name}, ${order.customer.email}, ${order.customer.phone}`]);
  return updated;
}

// Сверяем статус с ЮKassa (по возврату покупателя и по уведомлению).
async function syncPayment(order) {
  if (!payments.enabled() || !order.paymentId || order.status !== 'pending') return order;
  try {
    const p = await payments.getPayment(order.paymentId);
    if (p.status === 'succeeded' && p.metadata && p.metadata.orderId === order.id) return markPaid(order.id, p.id);
    if (p.status === 'canceled') return db.put('orders', order.id, { ...order, status: 'canceled', canceledAt: new Date().toISOString() });
  } catch (err) {
    console.error('[yookassa] sync failed:', err.message);
  }
  return order;
}

app.get('/zakaz/status/:id', async (req, res, next) => {
  try {
    let order = db.get('orders', req.params.id);
    if (!order) return next();
    order = await syncPayment(order);
    res.send(shop.orderStatus({ order, o: db.get('offers', order.offer), user: req.user, paymentsOn: payments.enabled() }));
  } catch (err) {
    next(err);
  }
});

// Уведомление ЮKassa. Телу не доверяем: статус всегда перепроверяем запросом к API.
async function yookassaWebhook(req, res) {
  const obj = (req.body && req.body.object) || {};
  const orderId = obj.metadata && obj.metadata.orderId;
  const order = orderId ? db.get('orders', String(orderId)) : null;
  if (order && order.paymentId === obj.id) await syncPayment(order);
  res.json({ ok: true });
}

/* ---------- кабинет ---------- */

function requireUser(req, res, next) {
  if (!req.user) return res.redirect(303, `/kabinet?next=${encodeURIComponent(req.originalUrl)}`);
  next();
}
const requireStaff = (req, res, next) => (req.user && req.user.role !== 'client' ? next() : res.redirect(303, '/kabinet'));
const requireAdmin = (req, res, next) => (req.user && req.user.role === 'admin' ? next() : res.status(404).send(views.notFound({ user: req.user })));
function requireCsrf(req, res, next) {
  const token = (req.body && req.body._csrf) || req.get('x-csrf-token');
  if (!auth.checkCsrf({ body: { _csrf: token } }, req.user.id)) return res.status(403).send('Форма устарела. Обновите страницу и попробуйте ещё раз.');
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

const homeOf = (user) => (user.role === 'client' ? '/kabinet/moi' : '/kabinet/zayavki');
const safeNext = (n) => (typeof n === 'string' && /^\/(kabinet|zakaz|programmy)(\/[\w-]*)*(\?[\w=&-]*)?$/.test(n) ? n : null);

app.get('/kabinet', (req, res) => {
  if (req.user) return res.redirect(303, homeOf(req.user));
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
    return res.status(401).send(cab.login({ error: 'Неверная почта (логин) или пароль.', login, next }));
  }
  auth.issue(res, u.id);
  res.redirect(303, next || homeOf(u));
});

app.post('/kabinet/vyhod', requireUser, requireCsrf, (req, res) => {
  auth.clear(res);
  res.redirect(303, '/');
});

app.get('/kabinet/registraciya', (req, res) => {
  if (req.user) return res.redirect(303, homeOf(req.user));
  res.send(cab.register({ form: {} }));
});

const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const slugify = (s, fallback = 'item') =>
  String(s)
    .toLowerCase()
    .split('')
    .map((c) => (TRANSLIT[c] !== undefined ? TRANSLIT[c] : c))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || fallback;

app.post('/kabinet/registraciya', async (req, res) => {
  const b = req.body || {};
  const form = {
    kind: 'trener',
    name: String(b.name || '').trim().slice(0, 80),
    role: String(b.role || '').trim().slice(0, 80),
    login: String(b.login || '').trim().toLowerCase(),
  };
  let error = null;
  if (!auth.rateLimit(`reg:${req.ip}`, 5, 60 * 60 * 1000)) error = 'Слишком много попыток. Попробуйте через час.';
  else if (form.name.length < 2) error = 'Укажите имя и фамилию.';
  else if (form.role.length < 3) error = 'Укажите специализацию.';
  else if (!/^[a-z0-9._-]{3,40}$/.test(form.login)) error = 'Логин: от 3 до 40 символов — латиница, цифры, точка, дефис.';
  else if (db.get('users', form.login)) error = 'Такой логин уже занят.';
  else if (String(b.password || '').length < 8) error = 'Пароль — не короче 8 символов.';
  else if (b.consent !== '1') error = 'Нужно согласие с политикой конфиденциальности.';
  if (error) return res.status(400).send(cab.register({ error, form }));

  let slug = slugify(form.name, 'trener');
  for (let i = 2; db.get('specialists', slug); i++) slug = `${slugify(form.name, 'trener')}-${i}`;
  const now = new Date().toISOString();
  await db.put('specialists', slug, {
    slug,
    kind: 'trener',
    status: 'review',
    name: form.name,
    role: form.role,
    headline: '',
    about: '',
    subjects: [],
    services: [],
    formats: { online: true, atHome: [], travel: [], offline: [] },
    reviews: [],
    reviewsCount: 0,
    rating: 0,
    createdAt: now,
    updatedAt: now,
  });
  await db.put('users', form.login, { login: form.login, name: form.name, role: 'specialist', specialistId: slug, passwordHash: await auth.hashPassword(b.password), createdAt: now });
  auth.issue(res, form.login);
  res.redirect(303, '/kabinet/anketa?flash=created');
});

const FLASH = {
  created: 'Анкета создана. Заполните её — после проверки она появится на сайте.',
  saved: 'Сохранено.',
  password: 'Пароль изменён.',
  lead: 'Статус заявки обновлён.',
  moderated: 'Статус анкеты обновлён.',
  order: 'Заказ обновлён.',
  deleted: 'Удалено.',
};

/* — ученик — */

app.get('/kabinet/moi', requireUser, (req, res) => {
  const myOrders = db.filter('orders', (o) => o.userId === req.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const slugs = [...new Set(myOrders.filter((o) => o.status === 'paid').map((o) => o.offer))];
  const items = slugs.map((slug) => accessOf(req.user, slug)).filter(Boolean);
  res.send(cab.myPrograms({ user: req.user, items, orders: myOrders }));
});

app.get('/kabinet/programma/:slug', requireUser, (req, res) => {
  const acc = accessOf(req.user, req.params.slug);
  if (!acc) return res.redirect(303, `/programmy/${encodeURIComponent(req.params.slug)}`);
  res.send(cab.programView({ user: req.user, offer: acc.offer, lessonId: String(req.query.urok || '') }));
});

/* — тренер и админ — */

app.get('/kabinet/zayavki', requireUser, requireStaff, (req, res) => {
  const filter = LEAD_STATUSES[req.query.status] ? req.query.status : null;
  const specialistsById = bySlug(db.all('specialists'));
  res.send(cab.leads({ user: req.user, leads: userLeads(req.user), filter, specialistsById, flash: FLASH[req.query.flash] }));
});

app.post('/kabinet/zayavki/:id', requireUser, requireStaff, requireCsrf, async (req, res) => {
  const l = db.get('leads', req.params.id);
  const status = req.body.status;
  if (l && LEAD_STATUSES[status] && (req.user.role === 'admin' || l.specialistId === req.user.specialistId)) {
    await db.put('leads', l.id, { ...l, status, updatedAt: new Date().toISOString() });
  }
  res.redirect(303, '/kabinet/zayavki?flash=lead');
});

const splitLines = (v, max = 60) =>
  String(v || '')
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, max);
const titled = (v) =>
  splitLines(v).map((line) => {
    const [title, years] = line.split('|').map((x) => x.trim());
    return { title: title.slice(0, 300), years: (years || '').slice(0, 40) };
  });
const csv = (v) =>
  String(v || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 20);

// Фото из медиатеки: подставляем размеры, чтобы страница не «прыгала» при загрузке.
function photoFields(url) {
  const m = String(url || '').match(/^\/m\/([a-z0-9-]+)\.(webp|jpg|png)$/);
  const info = m ? media.info(m[1]) : null;
  if (info) return { photo: url, photoWidth: info.width, photoHeight: info.height };
  return /^\/img\//.test(url) ? { photo: url } : { photo: '' };
}

app.get('/kabinet/anketa', requireUser, requireStaff, (req, res) => {
  const s = ownSpecialist(req.user, req.query.id || req.user.specialistId);
  const all = req.user.role === 'admin' ? db.all('specialists') : [];
  res.send(cab.anketa({ user: req.user, s, all, flash: FLASH[req.query.flash] }));
});

app.post('/kabinet/anketa', requireUser, requireStaff, requireCsrf, async (req, res) => {
  const b = req.body;
  const s = ownSpecialist(req.user, b.id);
  if (!s) return res.redirect(303, '/kabinet/anketa');

  const prev = Object.fromEntries((s.services || []).map((x) => [x.title, x]));
  const subjects = [].concat(b.subjects || []).filter((x) => subjectBySlug(x));
  const services = splitLines(b.services, 30).map((line) => {
    const [title, p, unit] = line.split('|').map((x) => x.trim());
    const old = prev[title] || {};
    return {
      title: title.slice(0, 120),
      price: Math.max(0, parseInt(String(p || '').replace(/\D/g, ''), 10) || 0),
      unit: (unit || old.unit || '60 мин').slice(0, 30),
      subject: old.subject && subjects.includes(old.subject) ? old.subject : subjects[0] || null,
      ...(old.note ? { note: old.note } : {}),
      ...(old.extra ? { extra: true } : {}),
    };
  });
  const reviews = splitLines(b.reviews, 40).map((line) => {
    const [author, service, ...text] = line.split('|').map((x) => x.trim());
    return { author: (author || 'Ученик').slice(0, 60), service: (service || '').slice(0, 80), text: text.join(' | ').slice(0, 2000) };
  });
  const telegram = String(b.telegram || '').trim();
  const instagram = String(b.instagram || '').trim();
  const photo = String(b.photo || '').trim();
  const updated = {
    ...s,
    name: String(b.name || s.name).trim().slice(0, 80),
    role: String(b.role || s.role).trim().slice(0, 80),
    headline: String(b.headline || '').trim().slice(0, 300),
    about: String(b.about || '').trim().slice(0, 3000),
    subjects,
    focus: splitLines(b.focus, 30),
    currency: ['RUB', 'USD', 'EUR'].includes(b.currency) ? b.currency : 'RUB',
    telegram: /^https:\/\/t\.me\/[A-Za-z0-9_]{4,}$/.test(telegram) ? telegram : /^@?[A-Za-z0-9_]{4,}$/.test(telegram) ? `https://t.me/${telegram.replace('@', '')}` : '',
    instagram: /^https:\/\/(www\.)?instagram\.com\/[\w.]+\/?$/.test(instagram) ? instagram : '',
    results: splitLines(b.results, 30),
    method: splitLines(b.method, 30),
    services,
    reviews,
    reviewsCount: reviews.length,
    education: titled(b.education).map((x, i) => ({ ...x, verified: !!(s.education && s.education[i] && s.education[i].title === x.title && s.education[i].verified) })),
    experience: titled(b.experience),
    achievements: titled(b.achievements),
    formats: { ...(s.formats || {}), online: b.online === '1', groups: b.groups === '1', trial: b.trial === '1', atHome: csv(b.atHome), travel: csv(b.travel), offline: csv(b.offline) },
    profiUrl: /^https:\/\/(www\.)?profi\.ru\//.test(b.profiUrl || '') ? b.profiUrl.trim() : '',
    updatedAt: new Date().toISOString(),
    editedAt: new Date().toISOString(),
  };
  if (photo !== (s.photo || '')) {
    Object.assign(updated, photoFields(photo));
    delete updated.photoWebp;
    delete updated.photoSquare;
    delete updated.photoSquareWebp;
  }
  await db.put('specialists', s.slug, updated);
  if (updated.status === 'published') pingIndexNow(changedUrls(updated));
  res.redirect(303, `/kabinet/anketa?flash=saved${req.user.role === 'admin' ? `&id=${encodeURIComponent(s.slug)}` : ''}`);
});

app.get('/kabinet/statistika', requireUser, requireStaff, async (req, res) => {
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

/* — фото — */

app.get('/kabinet/media', requireUser, requireStaff, (req, res) => {
  const items = media.list().filter((m) => req.user.role === 'admin' || m.owner === req.user.id);
  res.send(cab.mediaPage({ user: req.user, items, flash: FLASH[req.query.flash] }));
});

app.post('/kabinet/media/upload', requireUser, requireStaff, express.raw({ type: ['image/webp', 'image/jpeg', 'image/png'], limit: '5mb' }), requireCsrf, async (req, res) => {
  try {
    const id = String(req.query.id || '');
    const base = id.replace(/-sm$/, '');
    const existing = media.info(id) || media.info(base);
    if (existing && existing.owner !== req.user.id && req.user.role !== 'admin') return res.status(403).send('Нет доступа');
    if (id.endsWith('-sm') && !media.info(base)) return res.status(400).send('Сначала загрузите основное фото');
    const m = await media.put({
      id,
      mime: req.get('content-type'),
      data: req.body,
      width: parseInt(req.query.w, 10) || null,
      height: parseInt(req.query.h, 10) || null,
      alt: req.query.alt,
      owner: req.user.id,
    });
    media.invalidate(id);
    res.json({ ok: true, url: media.url(m.id) });
  } catch (err) {
    res.status(400).send(err.message);
  }
});

app.post('/kabinet/media/:id/udalit', requireUser, requireStaff, requireCsrf, async (req, res) => {
  const m = media.info(req.params.id);
  if (m && (req.user.role === 'admin' || m.owner === req.user.id)) {
    await media.remove(m.id);
    await media.remove(`${m.id}-sm`);
    media.invalidate(m.id);
    media.invalidate(`${m.id}-sm`);
  }
  res.redirect(303, '/kabinet/media?flash=deleted');
});

/* — админ: заказы, форматы, модерация — */

app.get('/kabinet/zakazy', requireUser, requireAdmin, (req, res) => {
  const list = db.all('orders').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.send(cab.orders({ user: req.user, orders: list, flash: FLASH[req.query.flash], paymentsOn: payments.enabled() }));
});

app.post('/kabinet/zakazy/:id', requireUser, requireAdmin, requireCsrf, async (req, res) => {
  const o = db.get('orders', req.params.id);
  if (o && req.body.status === 'paid') await markPaid(o.id, null);
  else if (o && req.body.status === 'canceled' && o.status === 'pending') await db.put('orders', o.id, { ...o, status: 'canceled', canceledAt: new Date().toISOString() });
  res.redirect(303, '/kabinet/zakazy?flash=order');
});

app.get('/kabinet/formaty', requireUser, requireAdmin, (req, res) => {
  const offers = db.all('offers').sort((a, b) => (a.order || 0) - (b.order || 0));
  res.send(cab.offersList({ user: req.user, offers, flash: FLASH[req.query.flash] }));
});

app.post('/kabinet/formaty', requireUser, requireAdmin, requireCsrf, async (req, res) => {
  const title = String(req.body.title || '').trim().slice(0, 120);
  if (!title) return res.redirect(303, '/kabinet/formaty');
  let slug = slugify(title, 'programma');
  for (let i = 2; db.get('offers', slug); i++) slug = `${slugify(title, 'programma')}-${i}`;
  const kind = req.body.kind === 'service' ? 'service' : 'program';
  const now = new Date().toISOString();
  await db.put('offers', slug, {
    slug,
    kind,
    title,
    status: 'draft',
    order: 50,
    trainer: SITE.owner,
    short: '',
    description: '',
    includes: [],
    forWhom: [],
    packages: [{ id: 'access', title: kind === 'program' ? 'Доступ к программе' : '1 месяц', price: null, accessDays: kind === 'program' ? 180 : 30 }],
    modules: [],
    createdAt: now,
    updatedAt: now,
    editedAt: now,
  });
  res.redirect(303, `/kabinet/formaty/${slug}`);
});

app.get('/kabinet/formaty/:slug', requireUser, requireAdmin, (req, res, next) => {
  const o = db.get('offers', req.params.slug);
  if (!o) return next();
  res.send(cab.offerEdit({ user: req.user, o, trainers: db.filter('specialists', (s) => s.kind === 'trener'), directions: DIRECTIONS, flash: FLASH[req.query.flash] }));
});

// Уроки программы из текста: «## Модуль», «### Урок | видео», ниже — текст урока.
function parseModules(text, prev = []) {
  const prevIds = new Map(prev.flatMap((m) => (m.lessons || []).map((l) => [`${m.title}::${l.title}`, l.id])));
  const mods = [];
  let mod = null;
  let lesson = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (/^##\s+/.test(line) && !/^###/.test(line)) {
      mod = { title: line.replace(/^##\s+/, '').slice(0, 120), lessons: [] };
      mods.push(mod);
      lesson = null;
    } else if (/^###\s+/.test(line)) {
      if (!mod) mods.push((mod = { title: 'Уроки', lessons: [] }));
      const [title, video] = line.replace(/^###\s+/, '').split('|').map((x) => x.trim());
      lesson = { id: prevIds.get(`${mod.title}::${title}`) || crypto.randomBytes(4).toString('hex'), title: (title || 'Урок').slice(0, 160), video: (video || '').slice(0, 300), text: '' };
      mod.lessons.push(lesson);
    } else if (lesson) {
      lesson.text += (lesson.text ? '\n' : '') + line;
    }
  }
  for (const m of mods) for (const l of m.lessons) l.text = l.text.trim().slice(0, 20000);
  return mods;
}

function parsePackages(text) {
  return splitLines(text, 12).map((line, i) => {
    const [id, title, priceRaw, old, sessions, days, note] = line.split('|').map((x) => (x || '').trim());
    const num = (v) => (v && /\d/.test(v) ? parseInt(v.replace(/\D/g, ''), 10) : null);
    return {
      id: (id || `p${i + 1}`).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || `p${i + 1}`,
      title: (title || id || 'Тариф').slice(0, 80),
      price: num(priceRaw),
      ...(num(old) ? { oldPrice: num(old) } : {}),
      ...(num(sessions) ? { sessions: num(sessions) } : {}),
      ...(num(days) ? { accessDays: num(days) } : {}),
      ...(note ? { note: note.slice(0, 120) } : {}),
    };
  });
}

app.post('/kabinet/formaty/:slug', requireUser, requireAdmin, requireCsrf, async (req, res, next) => {
  const o = db.get('offers', req.params.slug);
  if (!o) return next();
  const b = req.body;
  const cover = String(b.cover || '').trim();
  const coverInfo = (() => {
    const m = cover.match(/^\/m\/([a-z0-9-]+)\.(webp|jpg|png)$/);
    const i = m ? media.info(m[1]) : null;
    return i ? { cover, coverWidth: i.width, coverHeight: i.height } : { cover: '' };
  })();
  const updated = {
    ...o,
    title: String(b.title || o.title).trim().slice(0, 120),
    status: ['on_sale', 'waitlist', 'draft', 'hidden'].includes(b.status) ? b.status : o.status,
    trainer: db.get('specialists', String(b.trainer || '')) ? b.trainer : o.trainer,
    direction: directionBySlug(b.direction) ? b.direction : '',
    order: Math.max(0, Math.min(999, parseInt(b.order, 10) || 0)),
    ...coverInfo,
    short: String(b.short || '').trim().slice(0, 240),
    description: String(b.description || '').trim().slice(0, 3000),
    includes: splitLines(b.includes, 20),
    forWhom: splitLines(b.forWhom, 12),
    packages: parsePackages(b.packages),
    ...(o.kind === 'program' ? { modules: parseModules(b.modules, o.modules) } : {}),
    seoTitle: String(b.seoTitle || '').trim().slice(0, 70),
    seoDescription: String(b.seoDescription || '').trim().slice(0, 170),
    updatedAt: new Date().toISOString(),
    editedAt: new Date().toISOString(),
  };
  await db.put('offers', o.slug, updated);
  if (updated.status === 'on_sale' || updated.status === 'waitlist') pingIndexNow([`${SITE.url}/programmy/${o.slug}`, `${SITE.url}/programmy`, `${SITE.url}/`]);
  res.redirect(303, `/kabinet/formaty/${o.slug}?flash=saved`);
});

app.get('/kabinet/moderaciya', requireUser, requireAdmin, (req, res) => {
  const specialists = db.all('specialists').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.send(cab.moderation({ user: req.user, specialists, leadsCount: db.all('leads').length, flash: FLASH[req.query.flash] }));
});

app.post('/kabinet/moderaciya/:slug', requireUser, requireAdmin, requireCsrf, async (req, res) => {
  const s = db.get('specialists', req.params.slug);
  if (s && ['published', 'hidden', 'review'].includes(req.body.status)) {
    await db.put('specialists', s.slug, { ...s, status: req.body.status, updatedAt: new Date().toISOString() });
    pingIndexNow(changedUrls(s));
  }
  res.redirect(303, '/kabinet/moderaciya?flash=moderated');
});

/* ---------- SEO: robots, sitemap, llms.txt, IndexNow ---------- */

const AI_BOTS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
  'ClaudeBot', 'Claude-SearchBot', 'Claude-User',
  'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'Applebot-Extended',
  'YandexAdditional', 'YandexAdditionalBot',
  'Bingbot', 'DuckAssistBot', 'MistralAI-User', 'cohere-ai',
];
const PRIVATE_RULES = ['Allow: /', 'Disallow: /kabinet', 'Disallow: /zayavka', 'Disallow: /predzapis', 'Disallow: /zakaz', 'Disallow: /api/', 'Disallow: /*?sent=', 'Disallow: /*?wait=', 'Disallow: /*?preview='];

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    [
      'User-agent: *',
      ...PRIVATE_RULES,
      '',
      'User-agent: Yandex',
      ...PRIVATE_RULES,
      'Clean-param: sent&wait&preview&cel /',
      'Clean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&yclid&gclid /',
      '',
      'User-agent: Googlebot',
      ...PRIVATE_RULES,
      '',
      ...AI_BOTS.map((b) => `User-agent: ${b}`),
      ...PRIVATE_RULES,
      '',
      `Sitemap: ${SITE.url}/sitemap.xml`,
      '',
    ].join('\n')
  );
});

function llmsText(full) {
  const o = owner();
  const list = trainers();
  const offers = visibleOffers();
  const priceText = (x) => (x.status === 'waitlist' ? 'скоро, открыта предзапись' : ui.offerFrom(x) ? `от ${layout.price(ui.offerFrom(x))}` : 'стоимость по запросу');
  const out = [
    `# ${SITE.brand} — Евгения Шатова`,
    '',
    `> Сайт Евгении Шатовой: онлайн-тренер, тренер по позированию для фитнес-бикини, спортсменка IFBB Pro Bikini, участница Olympia 2025. Онлайн-ведение (тренировки и питание), позирование онлайн и в Москве, подготовка к соревнованиям и программы тренировок и питания с доступом в личном кабинете.`,
    '',
    'Первая консультация бесплатная — заявка через форму на сайте. Программы покупаются на сайте и открываются в личном кабинете.',
    '',
    '## Форматы и программы',
    '',
    ...offers.map((x) => `- [${x.title}](${SITE.url}${ui.offerPath(x)}): ${x.short} Цена: ${priceText(x)}.`),
    '',
    '## Тренеры',
    '',
    ...list.map((s) => `- [${s.name} — ${String(s.role || '').toLowerCase()}](${SITE.url}${ui.profilePath(s)}): ${s.headline || ''}`),
    '',
    '## Разделы',
    '',
    `- [Главная](${SITE.url}/)`,
    `- [Форматы и программы](${SITE.url}/programmy)`,
    `- [Тренеры](${SITE.url}/trenery)`,
    `- [Направления](${SITE.url}/zanyatiya)`,
    '',
  ];
  if (full) {
    if (o) {
      out.push(`## О Евгении Шатовой`, '', o.about || '', '', 'Достижения:', ...(o.achievements || []).map((a) => `- ${a.title}${a.years ? ` (${a.years})` : ''}`), '', 'Позирование:', ...(o.posing || []).map((p) => `- ${p}`), '');
    }
    for (const x of offers) {
      out.push(`## ${x.title}`, '', x.description || x.short, '', ...(x.includes || []).map((i) => `- ${i}`), '', 'Тарифы:', ...(x.packages || []).map((p) => `- ${p.title}: ${typeof p.price === 'number' && p.price > 0 ? layout.price(p.price) : 'по запросу'}`), '', `Страница: ${SITE.url}${ui.offerPath(x)}`, '');
    }
    for (const s of list.filter((s) => s.slug !== SITE.owner)) {
      out.push(`## ${s.name}`, '', s.about || s.headline || '', '', `Анкета: ${SITE.url}${ui.profilePath(s)}`, '');
    }
  } else {
    out.push('## Подробнее', '', `- [Полная версия для AI-ассистентов](${SITE.url}/llms-full.txt): описания форматов, тарифы, достижения и анкеты тренеров`, '');
  }
  return out.join('\n');
}

app.get('/llms.txt', (req, res) => res.type('text/plain; charset=utf-8').send(llmsText(false)));
app.get('/llms-full.txt', (req, res) => res.type('text/plain; charset=utf-8').send(llmsText(true)));

function sitemapUrls() {
  const list = trainers();
  const offers = visibleOffers();
  const latest = (arr) => arr.map((s) => s.updatedAt || s.createdAt).sort().pop() || new Date().toISOString();
  const all = [...list, ...offers];
  const o = owner();
  return [
    { loc: '/', lastmod: latest(all), priority: '1.0', changefreq: 'weekly', image: o && (o.heroPhoto || o.photo) },
    { loc: '/programmy', lastmod: latest(offers), priority: '0.9', changefreq: 'weekly' },
    ...offers.map((x) => ({ loc: ui.offerPath(x), lastmod: x.updatedAt || x.createdAt, priority: x.kind === 'service' ? '0.9' : '0.8', changefreq: 'weekly', image: x.cover })),
    { loc: '/trenery', lastmod: latest(list), priority: '0.8', changefreq: 'weekly' },
    ...list.map((s) => ({ loc: ui.profilePath(s), lastmod: s.updatedAt || s.createdAt, priority: '0.8', changefreq: 'weekly', image: s.photo })),
    { loc: '/zanyatiya', lastmod: latest(list), priority: '0.6', changefreq: 'monthly' },
    ...DIRECTIONS.filter((d) => list.some((s) => (s.subjects || []).includes(d.slug))).map((d) => ({ loc: `/zanyatiya/${d.slug}`, lastmod: latest(list), priority: '0.6', changefreq: 'monthly' })),
    { loc: '/oferta', lastmod: '2026-10-26T00:00:00.000Z', priority: '0.2', changefreq: 'yearly' },
    { loc: '/politika', lastmod: '2026-10-26T00:00:00.000Z', priority: '0.2', changefreq: 'yearly' },
  ];
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

// IndexNow: Яндекс напрямую и общий узел, который передаёт адреса Bing и другим поисковикам.
const INDEXNOW_ENDPOINTS = ['https://yandex.com/indexnow', 'https://api.indexnow.org/indexnow'];
async function pingIndexNow(urls) {
  if (!IS_PROD || process.env.INDEXNOW_DISABLED === '1' || !urls.length) return;
  const body = JSON.stringify({ host: SITE.host, key: INDEXNOW_KEY, keyLocation: `${SITE.url}/${INDEXNOW_KEY}.txt`, urlList: [...new Set(urls)] });
  await Promise.all(
    INDEXNOW_ENDPOINTS.map(async (endpoint) => {
      try {
        const r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body, signal: AbortSignal.timeout(10000) });
        console.log(`[indexnow] ${new URL(endpoint).host}: ${urls.length} url(s) → ${r.status}`);
      } catch (err) {
        console.error(`[indexnow] ${endpoint} failed:`, err.message);
      }
    })
  );
}

function changedUrls(s) {
  return [ui.profilePath(s), '/trenery', '/', ...(s.subjects || []).map((x) => `/zanyatiya/${x}`)].map((p) => SITE.url + p);
}

// После запуска сообщаем поисковикам о карте сайта, если она изменилась с прошлого раза.
async function announceOnStart() {
  if (!IS_PROD || process.env.INDEXNOW_DISABLED === '1') return;
  const version = crypto.createHash('sha1').update(JSON.stringify(sitemapUrls())).update(layout.ASSET_VERSION).digest('hex').slice(0, 12);
  const last = db.get('meta', 'indexnow');
  if (last && last.version === version) return;
  // Вместе с картой сайта — удалённые адреса репетиторов, чтобы поисковики быстрее увидели редирект.
  const gone = ['/repetitory', '/repetitory/ruslan-aliev', '/zanyatiya/geografiya', '/zanyatiya/oge-geografiya', '/zanyatiya/ege-geografiya'];
  await pingIndexNow([...sitemapUrls().map((u) => SITE.url + u.loc), ...gone.map((p) => SITE.url + p)]);
  await db.put('meta', 'indexnow', { version, at: new Date().toISOString() });
}

app.get('/healthz', (req, res) => res.json({ ok: true, store: db.kind, payments: payments.enabled() }));

/* ---------- 404 и ошибки ---------- */

app.use((req, res) => res.status(404).send(views.notFound({ user: req.user })));

app.use((err, req, res, _next) => {
  console.error('[error]', req.method, req.originalUrl, err);
  res.status(500).send('Что-то пошло не так. Обновите страницу через минуту.');
});

/* ---------- запуск ---------- */

function assetHash() {
  const h = crypto.createHash('sha1');
  for (const f of ['css/site.css', 'js/site.js', 'js/cabinet.js']) {
    try {
      h.update(fs.readFileSync(path.join(PUBLIC, f)));
    } catch {}
  }
  h.update(fs.readFileSync(__filename));
  return h.digest('hex').slice(0, 10);
}

async function main() {
  await db.init();
  await media.init();
  let meta = db.get('meta', 'secret');
  if (!process.env.SESSION_SECRET) {
    if (!meta) meta = await db.put('meta', 'secret', { value: crypto.randomBytes(32).toString('hex') });
    auth.setSecret(meta.value);
  }
  await seed();
  const o = owner();
  if (o && o.ogImage) layout.setDefaultOg({ url: o.ogImage, w: 1200, h: 630 });
  const v = assetHash();
  layout.setInlineCss(fs.readFileSync(path.join(PUBLIC, 'css', 'site.css'), 'utf8'));
  layout.setAssetVersion(v);
  layout.ASSET_VERSION = v;
  app.listen(PORT, () => {
    console.log(`trainer.moscow on :${PORT} (store: ${db.kind}, payments: ${payments.enabled() ? 'yookassa' : 'manual'})`);
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
