'use strict';
const { SITE, DIRECTIONS } = require('../catalog');

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

// Картинка для превью ссылок по умолчанию; после загрузки фото в медиатеку её можно поменять.
let defaultOg = { url: '/img/og-default.png', w: 1200, h: 630 };
const setDefaultOg = (og) => (defaultOg = og && og.url ? og : defaultOg);

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

const NAV = [
  { key: 'vedenie', href: '/programmy/onlayn-vedenie', title: 'Онлайн-ведение' },
  { key: 'pozirovanie', href: '/programmy/pozirovanie', title: 'Позирование' },
  { key: 'programmy', href: '/programmy', title: 'Программы' },
  { key: 'trenery', href: '/trenery', title: 'Тренеры' },
];

function header(current, user) {
  return `<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="/" aria-label="${esc(SITE.brand)} — на главную"><span class="brand-name">Shatova</span><span class="brand-pro">Pro</span></a>
    <nav class="nav" aria-label="Разделы">${NAV.map((n) => `<a href="${n.href}"${current === n.key ? ' aria-current="page"' : ''}>${n.title}</a>`).join('')}</nav>
    <a class="header-login" href="/kabinet">${user ? 'Кабинет' : 'Войти'}</a>
  </div>
</header>`;
}

function footer() {
  const dirs = DIRECTIONS.slice(0, 6).map((s) => `<li><a href="/zanyatiya/${s.slug}">${esc(s.title)}</a></li>`).join('');
  return `<footer class="site-footer">
  <div class="wrap footer-grid">
    <div class="footer-about">
      <p class="footer-brand"><span class="brand-name">Shatova</span><span class="brand-pro">Pro</span></p>
      <p>Евгения Шатова — онлайн-тренер и тренер по позированию, IFBB Pro Bikini.</p>
      <p><a href="${SITE.instagram}" rel="nofollow noopener" target="_blank">Instagram*: @${SITE.instagramHandle}</a></p>
    </div>
    <div>
      <p class="footer-h">Форматы</p>
      <ul><li><a href="/programmy/onlayn-vedenie">Онлайн-ведение</a></li><li><a href="/programmy/pozirovanie">Позирование</a></li><li><a href="/programmy/podgotovka-k-sorevnovaniyam">Подготовка к соревнованиям</a></li><li><a href="/programmy">Программы тренировок и питания</a></li></ul>
    </div>
    <div>
      <p class="footer-h">Направления</p>
      <ul>${dirs}</ul>
    </div>
    <div>
      <p class="footer-h">Сайт</p>
      <ul><li><a href="/trenery">Тренеры</a></li><li><a href="/kabinet">Личный кабинет</a></li><li><a href="/kabinet/registraciya">Тренерам: создать анкету</a></li><li><a href="/oferta">Публичная оферта</a></li><li><a href="/politika">Политика конфиденциальности</a></li></ul>
    </div>
  </div>
  <div class="wrap footer-bottom">
    <p>© ${new Date().getFullYear()} ${esc(SITE.brand)}, ${esc(SITE.host)}</p>
    <p class="footer-note">* Instagram принадлежит компании Meta, признанной экстремистской и запрещённой в России.</p>
  </div>
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
  const og = opts.image ? { url: opts.image, w: opts.imageW, h: opts.imageH } : defaultOg;
  const image = abs(og.url);
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
${og.w && og.h ? `<meta property="og:image:width" content="${og.w}">\n<meta property="og:image:height" content="${og.h}">` : /\/img\/og-/.test(image) ? '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">' : ''}
<meta property="og:image:alt" content="${esc(opts.ogTitle || title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#1E1417">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preload" href="/fonts/golos-text-cyrillic-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/golos-text-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/fira-sans-extra-condensed-cyrillic-800-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/fira-sans-extra-condensed-latin-800-normal.woff2" as="font" type="font/woff2" crossorigin>
${(opts.preload || []).map((p) => `<link rel="preload" as="image" href="${esc(p.href)}"${p.srcset ? ` imagesrcset="${esc(p.srcset)}" imagesizes="${esc(p.sizes || '100vw')}"` : ''} fetchpriority="high">`).join('')}
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
${(opts.scripts || []).map((src) => `<script src="${esc(src)}?v=${assetVersion}" defer></script>`).join('')}
${metrika()}
</body>
</html>`;
}

module.exports = { esc, ruDate, price, plural, page, breadcrumbs, breadcrumbsLd, abs, jsonLd, setAssetVersion, setInlineCss, setDefaultOg };
