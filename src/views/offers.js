'use strict';
const { esc, page, price, breadcrumbs, breadcrumbsLd, abs, ruDate } = require('./layout');
const { SITE, ORDER_STATUSES, directionBySlug } = require('../catalog');
const ui = require('./ui');

/* ---------- каталог /programmy ---------- */

function catalog({ offers, user, trainersBySlug }) {
  const services = offers.filter((o) => o.kind === 'service');
  const programs = offers.filter((o) => o.kind === 'program');
  const crumbs = [
    { name: 'Главная', path: '/' },
    { name: 'Форматы и программы', path: '/programmy' },
  ];
  const row = (o) => `<li>
    <a class="offer-row" href="${ui.offerPath(o)}">
      <span class="or-title">${esc(o.title)}</span>
      <span class="or-short">${esc(o.short)}${trainersBySlug[o.trainer] ? ` <span class="or-trainer">${esc(trainersBySlug[o.trainer].name)}</span>` : ''}</span>
      <span class="or-price">${esc(ui.offerPriceText(o))}</span>
    </a>
  </li>`;
  const body = `
<section class="page-head">
  <div class="wrap">
    ${breadcrumbs(crumbs)}
    <h1>Форматы и программы</h1>
    <p class="lead">Персональная работа с тренером онлайн или в Москве — и готовые программы тренировок и питания с доступом в личном кабинете.</p>
  </div>
</section>
<section class="block">
  <div class="wrap">
    <h2>Работа с тренером</h2>
    <ul class="offer-rows">${services.map(row).join('')}</ul>
  </div>
</section>
${
  programs.length
    ? `<section class="block block--blush" id="programmy">
  <div class="wrap">
    <h2>Программы тренировок и питания</h2>
    <p class="block-lead">Покупаете один раз — программа открывается в личном кабинете. Если программа ещё готовится, оставьте почту: напишем в день старта продаж.</p>
    <ul class="offer-rows">${programs.map(row).join('')}</ul>
  </div>
</section>`
    : ''
}`;
  return page({
    title: 'Онлайн-ведение, позирование и программы тренировок — цены',
    description: 'Онлайн-ведение с тренером, позирование для фитнес-бикини, подготовка к соревнованиям и программы тренировок и питания с доступом в личном кабинете.',
    path: '/programmy',
    section: 'programmy',
    ld: [breadcrumbsLd(crumbs), ui.itemListLd(offers.map((o) => ({ url: ui.offerPath(o), name: o.title })))],
    user,
    body,
  });
}

/* ---------- страница формата или программы ---------- */

function offerPage({ o, trainer, user, sent, error, form = {}, waitSent, waitError, waitForm = {}, hasAccess }) {
  const crumbs = [
    { name: 'Главная', path: '/' },
    { name: 'Форматы и программы', path: '/programmy' },
    { name: o.title, path: ui.offerPath(o) },
  ];
  const direction = directionBySlug(o.direction);
  const onSale = o.status === 'on_sale';
  const from = ui.offerFrom(o);
  const isProgram = o.kind === 'program';
  const lessons = (o.modules || []).reduce((n, m) => n + (m.lessons || []).length, 0);

  const pkgRow = (p) => {
    const buy = onSale && typeof p.price === 'number' && p.price > 0;
    const per = ui.perSession(p);
    return `<li class="pkg">
      <div class="pkg-main"><p class="pkg-title">${esc(p.title)}</p>${p.note ? `<p class="pkg-note">${esc(p.note)}</p>` : ''}${p.accessDays ? `<p class="pkg-note">${isProgram ? 'доступ' : 'действует'} ${p.accessDays} дней</p>` : ''}</div>
      <div class="pkg-price">${
        typeof p.price === 'number' && p.price > 0
          ? `${p.oldPrice ? `<s>${price(p.oldPrice)}</s> ` : ''}<b>${price(p.price)}</b>${per ? `<span>${per} за занятие</span>` : ''}`
          : `<b>${o.status === 'waitlist' ? 'скоро' : 'по запросу'}</b>`
      }</div>
      ${buy ? `<a class="btn btn-primary" href="/zakaz/${esc(o.slug)}/${esc(p.id)}">Купить</a>` : o.status === 'waitlist' ? '' : `<a class="btn btn-ghost" href="#zapis">Узнать стоимость</a>`}
    </li>`;
  };

  const body = `
<section class="page-head">
  <div class="wrap">
    ${breadcrumbs(crumbs)}
    <div class="offer-head">
      <div>
        <h1>${esc(o.title)}</h1>
        <p class="lead">${esc(o.description || o.short)}</p>
        ${trainer ? `<p class="offer-by">Ведёт <a href="${ui.profilePath(trainer)}">${esc(trainer.name)}</a>${trainer.headline ? ` — ${esc(trainer.headline.split('.')[0])}` : ''}</p>` : ''}
        ${hasAccess ? `<p class="flash">У вас есть доступ. <a href="/kabinet/programma/${esc(o.slug)}">Открыть в кабинете</a></p>` : ''}
      </div>
      ${o.cover ? `<figure class="offer-cover">${ui.img(o.cover, { alt: o.title, w: o.coverWidth, h: o.coverHeight, eager: true, sizes: '(max-width: 960px) 72vw, 420px' })}</figure>` : ''}
    </div>
  </div>
</section>

<section class="block">
  <div class="wrap offer-grid">
    <div>
      ${o.includes && o.includes.length ? `<h2>${isProgram ? 'Что внутри' : 'Что входит'}</h2><ul class="ticks">${o.includes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${isProgram && lessons ? `<p class="muted">${(o.modules || []).length} модул(ей), ${lessons} урок(ов).</p><ol class="modules">${(o.modules || []).map((m) => `<li><b>${esc(m.title)}</b> <span class="muted">${(m.lessons || []).length} урок(ов)</span></li>`).join('')}</ol>` : ''}
      ${o.forWhom && o.forWhom.length ? `<h2>Кому подойдёт</h2><ul class="chips chips--lg">${o.forWhom.map((x) => `<li><span>${esc(x)}</span></li>`).join('')}</ul>` : ''}
      ${direction ? `<p class="muted small">Направление: <a href="/zanyatiya/${direction.slug}">${esc(direction.title)}</a></p>` : ''}
    </div>
    <aside class="pkg-box" id="ceny">
      <h2>${o.status === 'waitlist' ? 'Старт продаж скоро' : 'Стоимость'}</h2>
      <ul class="pkgs">${(o.packages || []).map(pkgRow).join('')}</ul>
      ${
        o.status === 'waitlist'
          ? waitlistForm(o, { sent: waitSent, error: waitError, form: waitForm })
          : !from
          ? '<p class="muted small">Стоимость зависит от задачи — тренер назовёт её на бесплатной консультации.</p>'
          : '<p class="muted small">Оплата картой или через СБП. После оплаты тренер свяжется с вами в течение дня.</p>'
      }
    </aside>
  </div>
</section>

${
  trainer && o.status !== 'waitlist'
    ? `<section class="block block--ink" id="zapis">
  <div class="wrap lead-wrap">
    ${ui.leadForm({ s: trainer, offer: o, sent, error, form, title: from ? 'Остались вопросы?' : 'Узнать стоимость', intro: 'Оставьте контакты — тренер ответит на вопросы и подскажет, с чего начать. Консультация бесплатная.' })}
  </div>
</section>`
    : ''
}`;

  const offers = (o.packages || [])
    .filter((p) => typeof p.price === 'number' && p.price > 0)
    .map((p) => ({ '@type': 'Offer', name: p.title, price: p.price, priceCurrency: 'RUB', availability: onSale ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder', url: abs(ui.offerPath(o)) }));
  const ld = [
    breadcrumbsLd(crumbs),
    isProgram
      ? {
          '@context': 'https://schema.org',
          '@type': 'Course',
          name: o.title,
          description: o.description || o.short,
          provider: trainer ? { ...ui.personLd(trainer) } : { '@type': 'Organization', name: SITE.brand, url: SITE.url },
          ...(offers.length ? { offers } : {}),
          hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'online' },
        }
      : {
          '@context': 'https://schema.org',
          '@type': 'Service',
          name: o.title,
          serviceType: o.title,
          description: o.description || o.short,
          provider: trainer ? ui.personLd(trainer) : undefined,
          areaServed: [{ '@type': 'Country', name: 'Россия' }, { '@type': 'City', name: 'Москва' }],
          ...(offers.length ? { offers } : {}),
        },
  ];

  return page({
    title: o.seoTitle || `${o.title}${trainer ? ` — ${trainer.name}` : ''}`,
    description: o.seoDescription || `${o.description || o.short}${from ? ` От ${price(from)}.` : ''}`.slice(0, 200),
    path: ui.offerPath(o),
    section: o.slug === 'onlayn-vedenie' ? 'vedenie' : o.slug === 'pozirovanie' ? 'pozirovanie' : 'programmy',
    // Для превью ссылок нужна горизонтальная картинка 1200×630 — берём карточку тренера.
    image: (trainer && trainer.ogImage) || o.cover,
    imageW: trainer && trainer.ogImage ? 1200 : o.coverWidth,
    imageH: trainer && trainer.ogImage ? 630 : o.coverHeight,
    noindex: o.status === 'draft' || o.status === 'hidden',
    ld,
    user,
    body,
  });
}

function waitlistForm(o, { sent, error, form }) {
  if (sent) return '<p class="flash" role="status">Готово! Напишем, как только программа откроется.</p>';
  return `<form method="post" action="/predzapis#ceny" class="form form-compact">
    <input type="hidden" name="offer" value="${esc(o.slug)}">
    <div class="hp" aria-hidden="true"><label>Не заполняйте <input name="website" tabindex="-1" autocomplete="off"></label></div>
    ${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ''}
    <label>Почта или Telegram<input name="contact" required maxlength="80" autocomplete="email" value="${esc(form.contact || '')}"></label>
    <label class="check"><input type="checkbox" name="consent" value="1" required><span>Согласна(-ен) на обработку персональных данных</span></label>
    <button class="btn btn-primary" type="submit">Узнать о старте</button>
  </form>`;
}

/* ---------- оформление заказа ---------- */

function checkout({ o, pkg, user, error, form = {}, paymentsOn }) {
  const v = (k) => esc(form[k] || (user && user.role === 'client' ? { name: user.name, email: user.login, phone: user.phone }[k] || '' : ''));
  const isClient = user && user.role === 'client';
  const body = `
<section class="block">
  <div class="wrap narrow checkout">
    ${breadcrumbs([{ name: 'Главная', path: '/' }, { name: o.title, path: ui.offerPath(o) }, { name: 'Оформление', path: `/zakaz/${o.slug}/${pkg.id}` }])}
    <h1>Оформление заказа</h1>
    <div class="order-sum">
      <p><b>${esc(o.title)}</b> — ${esc(pkg.title)}</p>
      <p class="order-total">${price(pkg.price)}</p>
    </div>
    ${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ''}
    <form method="post" action="/zakaz/${esc(o.slug)}/${esc(pkg.id)}" class="form">
      <div class="hp" aria-hidden="true"><label>Не заполняйте <input name="website" tabindex="-1" autocomplete="off"></label></div>
      <div class="form-grid">
        <label>Имя<input name="name" required maxlength="80" autocomplete="name" value="${v('name')}"></label>
        <label>Телефон или Telegram<input name="phone" required maxlength="80" autocomplete="tel" value="${v('phone')}"></label>
        <label class="span-2">Почта — для чека и входа в кабинет<input name="email" type="email" required maxlength="120" autocomplete="email" value="${v('email')}"${isClient ? ' readonly' : ''}></label>
        ${isClient ? '' : `<label class="span-2">Придумайте пароль для личного кабинета<input name="password" type="password" required minlength="8" autocomplete="new-password"><span class="hint">Не короче 8 символов. Уже покупали? <a href="/kabinet?next=${encodeURIComponent(`/zakaz/${o.slug}/${pkg.id}`)}">Войдите</a></span></label>`}
      </div>
      <label class="check"><input type="checkbox" name="consent" value="1" required><span>Принимаю условия <a href="/oferta" target="_blank">публичной оферты</a> и согласна(-ен) на обработку персональных данных по <a href="/politika" target="_blank">политике</a></span></label>
      <button class="btn btn-primary" type="submit">${paymentsOn ? `Перейти к оплате ${price(pkg.price)}` : 'Оформить заказ'}</button>
      <p class="muted small">${paymentsOn ? 'Оплата проходит на защищённой странице ЮKassa: карта или СБП.' : 'После оформления тренер пришлёт ссылку на оплату. Доступ откроется сразу после оплаты.'}</p>
    </form>
  </div>
</section>`;
  return page({ title: `Оформление: ${o.title}`, path: `/zakaz/${o.slug}/${pkg.id}`, noindex: true, user, body });
}

function orderStatus({ order, o, user, paymentsOn }) {
  const paid = order.status === 'paid';
  const canceled = order.status === 'canceled';
  const body = `
<section class="block">
  <div class="wrap narrow checkout">
    <h1>${paid ? 'Оплата прошла' : canceled ? 'Заказ отменён' : 'Заказ принят'}</h1>
    <div class="order-sum">
      <p><b>${esc(order.offerTitle)}</b> — ${esc(order.packageTitle)}</p>
      <p class="order-total">${price(order.amount)}</p>
      <p class="muted small">Заказ ${esc(order.id.slice(0, 8))} от ${ruDate(order.createdAt)} · ${esc(ORDER_STATUSES[order.status])}</p>
    </div>
    ${
      paid
        ? o && o.kind === 'program'
          ? `<p>Программа уже открыта в личном кабинете.</p><a class="btn btn-primary" href="/kabinet/programma/${esc(o.slug)}">Открыть программу</a>`
          : '<p>Спасибо! Тренер свяжется с вами в течение дня, чтобы начать.</p><a class="btn btn-primary" href="/kabinet">Личный кабинет</a>'
        : canceled
        ? `<p>Оплата не прошла или была отменена.</p>${o ? `<a class="btn btn-primary" href="${ui.offerPath(o)}#ceny">Попробовать снова</a>` : ''}`
        : paymentsOn && order.paymentUrl
        ? `<p>Ждём подтверждения оплаты от банка — обычно это несколько секунд. Обновите страницу или вернитесь к оплате.</p><a class="btn btn-primary" href="${esc(order.paymentUrl)}">Вернуться к оплате</a> <a class="btn btn-ghost" href="/zakaz/status/${esc(order.id)}">Обновить</a>`
        : '<p>Мы получили заказ. Тренер пришлёт ссылку на оплату в течение дня — после оплаты доступ откроется в личном кабинете.</p><a class="btn btn-primary" href="/kabinet">Личный кабинет</a>'
    }
  </div>
</section>`;
  return page({ title: 'Статус заказа', path: `/zakaz/status/${order.id}`, noindex: true, user, body });
}

module.exports = { catalog, offerPage, checkout, orderStatus };
