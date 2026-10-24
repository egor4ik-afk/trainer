'use strict';
const { SITE, SECTIONS, SUBJECTS } = require('../catalog');

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function ruDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
// Цена в валюте анкеты: рубли — «1 000 ₽», доллары — «$50», евро — «€50».
function price(n, currency = 'RUB') {
  const v = Number(n).toLocaleString('ru-RU');
  if (currency === 'USD') return `$${v}`;
  if (currency === 'EUR') return `€${v}`;
  return `${v} ₽`;
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

let assetVersion = '1';
const setAssetVersion = (v) => (assetVersion = v);
// Стили встраиваем в страницу: так нет блокирующего запроса и первый экран рисуется сразу.
let inlineCss = null;
const setInlineCss = (css) => (inlineCss = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '\n'));

const abs = (p) => (p && p.startsWith('http') ? p : SITE.url + (p || '/'));

function jsonLd(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}

function breadcrumbsLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: abs(it.path) })),
  };
}

function breadcrumbs(items) {
  return `<nav class="crumbs" aria-label="Навигация по разделам"><ol>${items
    .map((it, i) =>
      i === items.length - 1
        ? `<li aria-current="page">${esc(it.name)}</li>`
        : `<li><a href="${esc(it.path)}">${esc(it.name)}</a></li>`
    )
    .join('')}</ol></nav>`;
}

function header(current, user) {
  const link = (key) => {
    const s = SECTIONS[key];
    return `<a class="nav-link line-${s.line}" href="/${s.slug}"${current === key ? ' aria-current="page"' : ''}><span class="dot" aria-hidden="true"></span>${s.title}</a>`;
  };
  return `<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="/" aria-label="trainer.moscow — на главную">
      <svg class="brand-mark" viewBox="0 0 44 16" aria-hidden="true"><rect x="2" y="6.5" width="40" height="3" rx="1.5"/><circle cx="7" cy="8" r="5" class="m-blue"/><circle cx="22" cy="8" r="5" class="m-green"/><circle cx="37" cy="8" r="5" class="m-orange"/></svg>
      <span>trainer<span class="brand-tld">.moscow</span></span>
    </a>
    <nav class="nav" aria-label="Разделы">${link('repetitory')}${link('trenery')}${link('zanyatiya')}</nav>
    <a class="btn btn-ghost header-cta" href="/kabinet">${user ? 'Кабинет' : 'Войти'}</a>
  </div>
</header>`;
}

function footer() {
  const subj = SUBJECTS.map((s) => `<li><a href="/zanyatiya/${s.slug}">${esc(s.title)}</a></li>`).join('');
  return `<footer class="site-footer">
  <div class="wrap footer-grid">
    <div>
      <p class="footer-brand">trainer.moscow</p>
      <p class="muted">Репетиторы и тренеры в Москве и Подмосковье. Занятия онлайн и очно.</p>
    </div>
    <div>
      <p class="footer-h">Разделы</p>
      <ul><li><a href="/repetitory">Репетиторы</a></li><li><a href="/trenery">Тренеры</a></li><li><a href="/zanyatiya">Занятия</a></li></ul>
    </div>
    <div>
      <p class="footer-h">Направления</p>
      <ul>${subj}</ul>
    </div>
    <div>
      <p class="footer-h">Специалистам</p>
      <ul><li><a href="/kabinet/registraciya">Создать анкету</a></li><li><a href="/kabinet">Личный кабинет</a></li><li><a href="/politika">Политика конфиденциальности</a></li></ul>
    </div>
  </div>
  <div class="wrap footer-bottom muted">© ${new Date().getFullYear()} trainer.moscow</div>
</footer>`;
}

function metrika() {
  const id = process.env.YANDEX_METRIKA_ID;
  if (!id || !/^\d+$/.test(id)) return '';
  return `<script>(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym(${id},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});</script><noscript><div><img src="https://mc.yandex.ru/watch/${id}" style="position:absolute;left:-9999px" alt=""></div></noscript>`;
}

/**
 * Обёртка страницы.
 * opts: title, description, path, image, noindex, section, ld (массив JSON-LD), user, body, bodyClass, ogType
 */
function page(opts) {
  let title = opts.title ? `${opts.title}` : `${SITE.title} — ${SITE.name}`;
  // Длинный заголовок обрезается в выдаче — тогда жертвуем названием сайта, а не смыслом.
  if (title.length > 62 && title.endsWith(` | ${SITE.name}`)) title = title.slice(0, -(` | ${SITE.name}`).length);
  const desc = opts.description || SITE.description;
  const url = abs(opts.path || '/');
  const image = abs(opts.image || '/img/og-default.png');
  const robots = opts.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1';
  const verif = [
    process.env.YANDEX_VERIFICATION && `<meta name="yandex-verification" content="${esc(process.env.YANDEX_VERIFICATION)}">`,
    process.env.GOOGLE_SITE_VERIFICATION && `<meta name="google-site-verification" content="${esc(process.env.GOOGLE_SITE_VERIFICATION)}">`,
  ]
    .filter(Boolean)
    .join('');
  const ld = (opts.ld || []).map(jsonLd).join('');

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="${robots}">
${opts.noindex ? '' : `<link rel="canonical" href="${esc(url)}">`}
<meta property="og:type" content="${opts.ogType || 'website'}">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:locale" content="ru_RU">
<meta property="og:title" content="${esc(opts.ogTitle || title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
${/\/img\/og-/.test(image) ? '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">' : ''}
<meta property="og:image:alt" content="${esc(opts.ogTitle || title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#16202E">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preload" href="/fonts/golos-text-cyrillic-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/golos-text-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/unbounded-cyrillic-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/unbounded-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/golos-text-cyrillic-600-normal.woff2" as="font" type="font/woff2" crossorigin>
${inlineCss ? `<style>${inlineCss}</style>` : `<link rel="stylesheet" href="/css/site.css?v=${assetVersion}">`}
${verif}${ld}
</head>
<body class="${opts.bodyClass || ''}">
<a class="skip" href="#main">Перейти к содержимому</a>
${header(opts.section, opts.user)}
<main id="main">${opts.body}</main>
${footer()}
<script src="/js/site.js?v=${assetVersion}" defer></script>
${metrika()}
</body>
</html>`;
}

module.exports = { esc, ruDate, price, plural, page, breadcrumbs, breadcrumbsLd, abs, setAssetVersion, setInlineCss };
