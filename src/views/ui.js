'use strict';
/* Общие куски разметки для страниц сайта. */
const { esc, ruDate, price, plural, abs } = require('./layout');
const { SITE, GOALS, subjectBySlug } = require('../catalog');

const profilePath = (s) => `/trenery/${s.slug}`;
const offerPath = (o) => `/programmy/${o.slug}`;
const reviewsWord = (n) => `${n} ${plural(n, 'отзыв', 'отзыва', 'отзывов')}`;

/* ---------- цены ---------- */

// Самая дешёвая основная услуга анкеты (для «от …»). Бесплатные и доп. услуги не считаем.
function cheapest(s, subject) {
  const main = (x) => x.price > 0 && !x.extra && (!subject || x.subject === subject);
  const list = (s.services || []).filter(main).length ? (s.services || []).filter(main) : (s.services || []).filter((x) => x.price > 0 && !x.extra);
  if (!list.length) return null;
  const sv = list.reduce((a, b) => (b.price < a.price ? b : a));
  return { ...sv, currency: s.currency || 'RUB' };
}
const money = (sv) => price(sv.price, sv.currency);
const svPrice = (sv, cur) => (sv.price > 0 ? `от ${price(sv.price, cur)}` : sv.price === 0 ? 'бесплатно' : 'по запросу');

// Минимальная цена пакета у формата/программы; null — «по запросу».
function offerFrom(o) {
  const prices = (o.packages || []).map((p) => p.price).filter((p) => typeof p === 'number' && p > 0);
  return prices.length ? Math.min(...prices) : null;
}
const offerPriceText = (o) => {
  const from = offerFrom(o);
  if (o.status === 'waitlist') return 'Скоро';
  return from ? `от ${price(from)}` : 'По запросу';
};
const perSession = (p) => (p.sessions > 1 && p.price ? price(Math.round(p.price / p.sessions)) : null);

/* ---------- изображения ---------- */

// Фото из медиатеки (/m/…) отдаём двумя размерами; старые фото (/img/…) — с WebP-вариантом.
function img(src, { alt = '', w, h, sizes = '100vw', eager = false, cls = '', sm } = {}) {
  if (!src) return '';
  const loading = eager ? 'fetchpriority="high"' : 'loading="lazy"';
  const dims = w && h ? ` width="${w}" height="${h}"` : '';
  const small = sm || (src.startsWith('/m/') ? src.replace(/(\.[a-z]+)$/, '-sm$1') : null);
  const srcset = small && w ? ` srcset="${esc(small)} ${Math.min(640, w)}w, ${esc(src)} ${w}w" sizes="${esc(sizes)}"` : '';
  return `<img${cls ? ` class="${cls}"` : ''} src="${esc(src)}"${srcset}${dims} alt="${esc(alt)}" ${loading} decoding="async">`;
}

function photo(s, variant, { eager = false, sizes } = {}) {
  const square = variant === 'square';
  const alt = `${s.name}, ${(s.role || '').toLowerCase()}`;
  if (!s.photo) {
    const initials = (s.name || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('');
    return `<span class="avatar-fallback${square ? ' sq' : ''}" aria-hidden="true">${esc(initials)}</span>`;
  }
  if (s.photo.startsWith('/m/')) {
    return img(s.photo, { alt, w: s.photoWidth, h: s.photoHeight, eager, sizes: sizes || (square ? '120px' : '(max-width: 960px) 100vw, 360px') });
  }
  const src = square ? s.photoSquare || s.photo : s.photo;
  const webp = square ? s.photoSquareWebp || s.photoWebp : s.photoWebp;
  const dims = square ? { w: 240, h: 240 } : { w: s.photoWidth || 320, h: s.photoHeight || 427 };
  const attrs = `width="${dims.w}" height="${dims.h}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"`;
  return webp ? `<picture><source srcset="${esc(webp)}" type="image/webp"><img src="${esc(src)}" ${attrs}></picture>` : `<img src="${esc(src)}" ${attrs}>`;
}

function stars(rating) {
  const r = Math.round(Number(rating) || 0);
  let out = '';
  for (let i = 1; i <= 5; i++) out += `<svg class="star${i <= r ? ' on' : ''}" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8l2.5 5.3 5.8.7-4.3 4 1.1 5.7L10 14.7l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7z"/></svg>`;
  return `<span class="stars" role="img" aria-label="Оценка ${esc(Number(rating).toFixed(1))} из 5">${out}</span>`;
}

const reviewItem = (r) => `<li class="review">
  <div class="review-head">${r.rating ? stars(r.rating) : ''}<p><b>${esc(r.author)}</b>${[r.service, r.date ? ruDate(r.date) : ''].filter(Boolean).map((x) => ` <span class="muted">· ${esc(x)}</span>`).join('')}</p></div>
  ${r.text ? `<p class="review-text">${esc(r.text)}</p>` : '<p class="review-text muted">Оценка без комментария.</p>'}
  ${r.reply ? `<div class="review-reply"><p class="muted">Ответ тренера</p><p>${esc(r.reply)}</p></div>` : ''}
</li>`;

// Нумерованные шаги — только для настоящих последовательностей.
const steps = (items, label) =>
  `<ol class="steps"${label ? ` aria-label="${esc(label)}"` : ''}>${items
    .map((it) => `<li><p class="step-t">${esc(it.title || it)}</p>${it.text ? `<p class="step-x">${esc(it.text)}</p>` : ''}</li>`)
    .join('')}</ol>`;

/* ---------- карточка тренера ---------- */

function formatsLine(s) {
  const f = s.formats || {};
  const parts = [];
  if (f.online) parts.push('онлайн');
  if (f.atHome && f.atHome.length) parts.push(`у себя: ${f.atHome.join(', ')}`);
  if (f.travel && f.travel.length) parts.push(`выезд: ${f.travel.join(', ')}`);
  if (f.offline && f.offline.length) parts.push(`очно: ${f.offline.join(', ')}`);
  return parts.join('; ');
}

function trainerCard(s, offers = []) {
  const from = cheapest(s);
  const own = offers.filter((o) => o.trainer === s.slug && o.kind === 'service');
  const subj = (s.subjects || []).map(subjectBySlug).filter(Boolean).slice(0, 4);
  return `<article class="t-card">
  <a class="t-photo" href="${profilePath(s)}" tabindex="-1" aria-hidden="true">${photo(s, 'square', { sizes: '120px' })}</a>
  <div class="t-body">
    <h3 class="t-name"><a href="${profilePath(s)}">${esc(s.name)}</a></h3>
    <p class="t-role">${esc(s.role)}</p>
    ${s.headline ? `<p class="t-head">${esc(s.headline)}</p>` : ''}
    ${subj.length ? `<ul class="chips">${subj.map((x) => `<li><a href="/zanyatiya/${x.slug}">${esc(x.title)}</a></li>`).join('')}</ul>` : ''}
    <p class="t-meta">${esc(formatsLine(s))}${s.reviewsCount ? ` · ${reviewsWord(s.reviewsCount)}` : ''}</p>
    <p class="t-foot">${from ? `<span>от <b>${money(from)}</b> / ${esc(from.unit)}</span>` : own.length ? `<span>${own.map((o) => esc(o.title)).join(', ')}</span>` : ''}<a class="btn btn-small" href="${profilePath(s)}">Подробнее</a></p>
  </div>
</article>`;
}

/* ---------- заявка ---------- */

// «Евгения Шатова» → «Евгении Шатовой», «Дарья Калашникова» → «Дарье Калашниковой».
function nameDative(full) {
  const [first, last] = String(full).split(' ');
  const f = /ия$/.test(first) ? first.slice(0, -1) + 'и' : /[ая]$/.test(first) ? first.slice(0, -1) + 'е' : /[бвгджзклмнпрстфхцчшщ]$/i.test(first) ? first + 'у' : first;
  const l = !last ? '' : /(ова|ева|ина|ына)$/.test(last) ? last.slice(0, -1) + 'ой' : /(ов|ев|ин|ын)$/.test(last) ? last + 'у' : last;
  return [f, l].filter(Boolean).join(' ');
}

/**
 * Форма заявки на консультацию.
 * opts: s (тренер), offer (формат, если заявка со страницы формата), sent, error, form, title, compact
 */
function leadForm({ s, offer, sent, error, form = {}, title, intro, action = '/zayavka', anchor = 'zapis', from = 'profile' }) {
  if (sent) {
    return `<div class="sent" role="status"><h2>Заявка отправлена</h2><p>${esc(s.name.split(' ')[0])} свяжется с вами в мессенджере или по телефону, обычно в течение дня.</p></div>`;
  }
  const v = (k) => esc(form[k] || '');
  const goal = form.goal || (offer && (GOALS.find((g) => g.offer === offer.slug) || {}).id) || '';
  return `<h2>${esc(title || `Записаться к ${nameDative(s.name)}`)}</h2>
<p class="form-intro">${esc(intro || 'Оставьте контакты — тренер свяжется, уточнит цель и здоровье и предложит формат. Первая консультация бесплатная.')}</p>
${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ''}
<form method="post" action="${action}#${anchor}" class="form" novalidate>
  <input type="hidden" name="specialist" value="${esc(s.slug)}">
  <input type="hidden" name="from" value="${esc(offer ? 'offer' : from)}">
  ${offer ? `<input type="hidden" name="offer" value="${esc(offer.slug)}">` : ''}
  <div class="hp" aria-hidden="true"><label>Не заполняйте <input name="website" tabindex="-1" autocomplete="off"></label></div>
  <div class="form-grid">
    <label>Как к вам обращаться<input name="name" required maxlength="80" autocomplete="name" value="${v('name')}"></label>
    <label>Телефон или Telegram<input name="contact" required maxlength="80" autocomplete="tel" inputmode="tel" placeholder="+7 900 000-00-00" value="${v('contact')}"></label>
    <label class="span-2">Цель<select name="goal">${GOALS.map((g) => `<option value="${g.id}"${goal === g.id ? ' selected' : ''}>${esc(g.title)}</option>`).join('')}<option value="other"${goal === 'other' ? ' selected' : ''}>Другое</option></select></label>
    <label class="span-2">Комментарий<textarea name="message" rows="3" maxlength="1000" placeholder="Например: хочу минус 5 кг к лету, тренируюсь дома, есть протрузия">${v('message')}</textarea></label>
  </div>
  <label class="check"><input type="checkbox" name="consent" value="1" required${form.consent ? ' checked' : ''}> Согласна(-ен) на обработку персональных данных по <a href="/politika" target="_blank">политике конфиденциальности</a></label>
  <button class="btn btn-primary" type="submit">Отправить заявку</button>
</form>`;
}

/* ---------- JSON-LD ---------- */

const faqLd = (faq) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
});

const itemListLd = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(it.url), name: it.name })),
});

const faqHtml = (faq) => `<dl class="faq">${faq.map(([q, a]) => `<div><dt>${esc(q)}</dt><dd>${esc(a)}</dd></div>`).join('')}</dl>`;

const personLd = (s) => ({
  '@type': 'Person',
  name: s.name,
  jobTitle: s.role,
  url: abs(profilePath(s)),
  image: s.photo ? abs(s.photo) : undefined,
  sameAs: [s.instagram, s.telegram, s.profiUrl].filter(Boolean),
});

module.exports = {
  profilePath,
  offerPath,
  reviewsWord,
  cheapest,
  money,
  svPrice,
  offerFrom,
  offerPriceText,
  perSession,
  img,
  photo,
  stars,
  reviewItem,
  steps,
  formatsLine,
  trainerCard,
  nameDative,
  leadForm,
  faqLd,
  faqHtml,
  itemListLd,
  personLd,
  SITE,
};
