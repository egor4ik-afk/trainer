'use strict';
const { esc, page, price, plural, breadcrumbs, breadcrumbsLd, abs } = require('./layout');
const { SITE, DIRECTIONS, TRAINER_DIRECTIONS, subjectBySlug } = require('../catalog');
const ui = require('./ui');

/* ---------- тренеры ---------- */

function trenery({ specialists, offers, user }) {
  const crumbs = [
    { name: 'Главная', path: '/' },
    { name: 'Тренеры', path: '/trenery' },
  ];
  const body = `
<section class="page-head">
  <div class="wrap">
    ${breadcrumbs(crumbs)}
    <h1>Тренеры</h1>
    <p class="lead">Команда Евгении Шатовой: онлайн-ведение, персональные тренировки и подготовка к сцене.</p>
  </div>
</section>
<section class="block">
  <div class="wrap">
    <h2 class="sr-only">Анкеты тренеров</h2>
    <div class="t-list">${specialists.map((s) => ui.trainerCard(s, offers)).join('')}</div>
    <div class="join-inline"><p>Вы тренер и хотите в команду? Создайте анкету — она появится после проверки.</p><a class="btn btn-ghost" href="/kabinet/registraciya">Создать анкету</a></div>
  </div>
</section>`;
  return page({
    title: 'Тренеры команды Shatova Pro — онлайн и в Москве',
    description: `Персональные фитнес-тренеры онлайн и в Москве: онлайн-ведение, позирование, подготовка к соревнованиям. ${specialists.length} ${plural(specialists.length, 'тренер', 'тренера', 'тренеров')} с ценами и отзывами.`,
    path: '/trenery',
    section: 'trenery',
    ld: [breadcrumbsLd(crumbs), ui.itemListLd(specialists.map((s) => ({ url: ui.profilePath(s), name: s.name })))],
    user,
    body,
  });
}

/* ---------- направления ---------- */

function zanyatiya({ specialists, offers, user }) {
  const crumbs = [
    { name: 'Главная', path: '/' },
    { name: 'Направления', path: '/zanyatiya' },
  ];
  const rows = DIRECTIONS.filter((d) => specialists.some((s) => (s.subjects || []).includes(d.slug)))
    .map((d) => `<li><a class="offer-row" href="/zanyatiya/${d.slug}"><span class="or-title">${esc(d.title)}</span><span class="or-short">${esc(d.intro)}</span><span class="or-price"></span></a></li>`)
    .join('');
  const body = `
<section class="page-head">
  <div class="wrap">
    ${breadcrumbs(crumbs)}
    <h1>Направления</h1>
    <p class="lead">С чем помогают тренеры команды — онлайн из любого города и очно в Москве.</p>
  </div>
</section>
<section class="block">
  <div class="wrap">
    <ul class="offer-rows">${rows}</ul>
  </div>
</section>
<section class="block block--blush">
  <div class="wrap">
    <h2>Форматы</h2>
    <div class="formats">
      <div><h3>Онлайн-ведение</h3><p>План тренировок и питания, техника по видео и связь с тренером в мессенджере.</p></div>
      <div><h3>Онлайн-занятия</h3><p>Тренировка или позирование по видеосвязи в реальном времени.</p></div>
      <div><h3>Очно в Москве</h3><p>Позирование в студии в центре Москвы.</p></div>
      <div><h3>Программы</h3><p>Готовые планы тренировок и питания с доступом в личном кабинете.</p></div>
    </div>
  </div>
</section>`;
  return page({
    title: 'Направления: онлайн-ведение, позирование, тренировки после родов',
    description: 'Онлайн-ведение, позирование для фитнес-бикини, подготовка к соревнованиям, тренировки после родов и коррекция осанки — с тренерами команды Shatova Pro.',
    path: '/zanyatiya',
    section: 'programmy',
    ld: [breadcrumbsLd(crumbs)],
    user,
    body,
  });
}

function directionPage({ d, specialists, offers, user }) {
  const list = specialists.filter((s) => (s.subjects || []).includes(d.slug));
  const related = offers.filter((o) => o.direction === d.slug);
  const crumbs = [
    { name: 'Главная', path: '/' },
    { name: 'Направления', path: '/zanyatiya' },
    { name: d.title, path: `/zanyatiya/${d.slug}` },
  ];
  const faq = [
    ['Сколько стоит?', related.length && related.some(ui.offerFrom) ? `От ${price(Math.min(...related.map(ui.offerFrom).filter(Boolean)))} — цены указаны на страницах форматов.` : 'Цены указаны в анкетах тренеров и на страницах форматов; если указано «по запросу», тренер назовёт стоимость на бесплатной консультации.'],
    ['Можно заниматься онлайн?', 'Да. Тренер составляет план, разбирает технику по видео и на связи в мессенджере.'],
    ['С чего начать?', 'Оставьте заявку на бесплатную консультацию: тренер уточнит цель, опыт и здоровье и предложит формат.'],
  ];
  const body = `
<section class="page-head">
  <div class="wrap">
    ${breadcrumbs(crumbs)}
    <h1>${esc(d.h1)}</h1>
    <p class="lead">${esc(d.intro)}</p>
  </div>
</section>
${
  related.length
    ? `<section class="block">
  <div class="wrap">
    <h2>Форматы</h2>
    <ul class="offer-rows">${related.map((o) => `<li><a class="offer-row" href="${ui.offerPath(o)}"><span class="or-title">${esc(o.title)}</span><span class="or-short">${esc(o.short)}</span><span class="or-price">${esc(ui.offerPriceText(o))}</span></a></li>`).join('')}</ul>
  </div>
</section>`
    : ''
}
<section class="block${related.length ? ' block--blush' : ''}">
  <div class="wrap">
    <h2>Тренеры</h2>
    <div class="t-list">${list.map((s) => ui.trainerCard(s, offers)).join('')}</div>
  </div>
</section>
<section class="block">
  <div class="wrap narrow">
    <h2>Частые вопросы</h2>
    ${ui.faqHtml(faq)}
  </div>
</section>`;
  return page({
    title: d.seoTitle,
    description: d.seoDescription,
    path: `/zanyatiya/${d.slug}`,
    section: 'programmy',
    noindex: list.length === 0,
    ld: [breadcrumbsLd(crumbs), ui.itemListLd(list.map((s) => ({ url: ui.profilePath(s), name: s.name }))), ui.faqLd(faq)],
    user,
    body,
  });
}

/* ---------- анкета тренера ---------- */

function profile({ s, offers = [], user, sent, error, form = {}, preview = false }) {
  const path = ui.profilePath(s);
  const crumbs = [
    { name: 'Главная', path: '/' },
    { name: 'Тренеры', path: '/trenery' },
    { name: s.name, path },
  ];
  const from = ui.cheapest(s);
  const cur = s.currency || 'RUB';
  const own = offers.filter((o) => o.trainer === s.slug);
  const subj = (s.subjects || []).map(subjectBySlug).filter(Boolean);
  const f = s.formats || {};
  const verified = (x) => (x.verified ? '<span class="ok" title="Подтверждено документами">документы проверены</span>' : '');
  const listBlock = (title, items) =>
    items && items.length
      ? `<section class="prof-sec"><h2>${title}</h2><ul class="facts">${items
          .map((x) => `<li><p>${esc(x.title)}</p>${x.years || x.verified ? `<p class="muted">${esc(x.years || '')} ${verified(x)}</p>` : ''}</li>`)
          .join('')}</ul></section>`
      : '';

  const body = `
${preview ? '<div class="preview-bar">Предпросмотр: анкета скрыта и не видна посетителям.</div>' : ''}
<div class="wrap">${breadcrumbs(crumbs)}</div>
<div class="wrap profile">
  <aside class="prof-aside">
    <div class="prof-photo">${ui.photo(s, 'full', { eager: true })}</div>
    <h1 class="prof-name">${esc(s.name)}</h1>
    <p class="prof-role">${esc(s.role)}</p>
    ${s.reviewsCount ? `<p class="prof-rev"><a href="#otzyvy">${ui.reviewsWord(s.reviewsCount)}</a></p>` : ''}
    ${s.badges && s.badges.length ? `<ul class="badges">${s.badges.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
    ${from ? `<p class="prof-price">от <b>${ui.money(from)}</b> / ${esc(from.unit)}</p>` : ''}
    <a class="btn btn-primary btn-block" href="#zapis">Записаться на консультацию</a>
    ${s.telegram ? `<a class="btn btn-ghost btn-block" href="${esc(s.telegram)}" rel="nofollow noopener" target="_blank">Написать в Telegram</a>` : ''}
    ${s.instagram ? `<p class="small center"><a href="${esc(s.instagram)}" rel="nofollow noopener" target="_blank">Instagram*</a></p>` : ''}
    ${f.trial ? `<p class="muted small center">${esc(f.trialNote || 'Первая консультация — бесплатно')}</p>` : ''}
  </aside>

  <div class="prof-main">
    <section class="prof-sec prof-intro">
      ${s.headline ? `<p class="prof-headline">${esc(s.headline)}</p>` : ''}
      ${s.about ? `<p>${esc(s.about)}</p>` : ''}
      ${subj.length ? `<ul class="chips">${subj.map((x) => `<li><a href="/zanyatiya/${x.slug}">${esc(x.title)}</a></li>`).join('')}</ul>` : ''}
    </section>

    ${s.focus && s.focus.length ? `<section class="prof-sec"><h2>С чем работаю</h2><ul class="focus">${s.focus.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${s.focusNote ? `<p class="muted small">${esc(s.focusNote)}</p>` : ''}</section>` : ''}
    ${s.method && s.method.length ? `<section class="prof-sec"><h2>Как проходит работа</h2>${ui.steps(s.method, 'Порядок работы')}</section>` : ''}
    ${s.posing && s.posing.length ? `<section class="prof-sec"><h2>Позирование</h2>${s.quote ? `<blockquote class="posing-quote"><p>${esc(s.quote.text)}</p></blockquote>` : ''}<ul class="ticks">${s.posing.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}
    ${s.results && s.results.length ? `<section class="prof-sec"><h2>Результаты учеников</h2><ul class="ticks">${s.results.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></section>` : ''}

    ${
      own.length
        ? `<section class="prof-sec" id="ceny"><h2>Форматы и цены</h2><ul class="offer-rows offer-rows--compact">${own
            .map((o) => `<li><a class="offer-row" href="${ui.offerPath(o)}"><span class="or-title">${esc(o.title)}</span><span class="or-short">${esc(o.short)}</span><span class="or-price">${esc(ui.offerPriceText(o))}</span></a></li>`)
            .join('')}</ul></section>`
        : (s.services || []).length
        ? `<section class="prof-sec" id="ceny"><h2>Услуги и цены</h2><ul class="services">${s.services
            .map((sv) => `<li><span>${esc(sv.title)}${sv.note ? `<span class="sv-note">${esc(sv.note)}</span>` : ''}</span><span class="dots" aria-hidden="true"></span><b class="nowrap">${ui.svPrice(sv, cur)}</b>${sv.price > 0 ? `<span class="muted nowrap">/ ${esc(sv.unit)}</span>` : ''}</li>`)
            .join('')}</ul>${s.pricesNote ? `<p class="muted small">${esc(s.pricesNote)}</p>` : ''}</section>`
        : ''
    }

    <section class="prof-sec">
      <h2>Где проходят занятия</h2>
      <ul class="where">
        ${f.online ? '<li><b>Онлайн</b><span>из любого города</span></li>' : ''}
        ${f.atHome && f.atHome.length ? `<li><b>У тренера</b><span>${esc(f.atHome.join(', '))}</span></li>` : ''}
        ${f.travel && f.travel.length ? `<li><b>С выездом</b><span>${esc(f.travel.join(', '))}</span></li>` : ''}
        ${f.offline && f.offline.length ? `<li><b>Очно</b><span>${esc(f.offline.join(', '))}</span></li>` : ''}
        ${f.groups ? `<li><b>Мини-группы</b><span>${esc(f.groupsNote || 'небольшие группы')}</span></li>` : ''}
      </ul>
    </section>

    ${
      s.gallery && s.gallery.length
        ? `<section class="prof-sec"><h2>Фото</h2><ul class="gallery">${s.gallery
            .map((g) => `<li>${ui.img(g.src, { alt: g.alt, w: g.w, h: g.h, sm: g.small, sizes: '(max-width: 680px) 45vw, 240px' })}</li>`)
            .join('')}</ul></section>`
        : ''
    }

    ${s.achievements && s.achievements.length ? `<section class="prof-sec"><h2>Достижения</h2><ol class="timeline timeline--light">${s.achievements
      .map((a) => `<li><span class="tl-year">${esc(a.years || '')}</span><span class="tl-text">${esc(a.title)}</span></li>`)
      .join('')}</ol></section>` : ''}
    ${listBlock('Образование', s.education)}
    ${listBlock('Опыт', s.experience)}

    ${
      s.reviews && s.reviews.length
        ? `<section class="prof-sec" id="otzyvy">
      <h2>Отзывы <span class="muted">${s.reviews.length}</span></h2>
      <ul class="reviews">${s.reviews.map(ui.reviewItem).join('')}</ul>
      ${s.reviewsNote ? `<p class="muted small">${esc(s.reviewsNote)}</p>` : ''}
    </section>`
        : ''
    }

    <section class="prof-sec lead-form" id="zapis">
      ${ui.leadForm({ s, sent, error, form })}
    </section>
  </div>
</div>`;

  const ld = [
    breadcrumbsLd(crumbs),
    {
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      url: abs(path),
      name: `${s.name} — ${s.role}`,
      dateCreated: s.createdAt,
      dateModified: s.updatedAt || s.createdAt,
      mainEntity: {
        ...ui.personLd(s),
        description: s.headline,
        knowsAbout: [...subj.map((x) => x.title), ...(s.focus || [])],
        alumniOf: (s.alumniOf || []).map((name) => ({ '@type': 'EducationalOrganization', name })),
        hasCredential: [...(s.education || [])].map((a) => ({ '@type': 'EducationalOccupationalCredential', name: a.title })),
        award: (s.achievements || []).map((a) => `${a.title}${a.years ? `, ${a.years}` : ''}`),
        makesOffer: own.length
          ? own.map((o) => ({ '@type': 'Offer', name: o.title, url: abs(ui.offerPath(o)), ...(ui.offerFrom(o) ? { price: ui.offerFrom(o), priceCurrency: 'RUB' } : {}) }))
          : (s.services || []).map((sv) => ({ '@type': 'Offer', name: sv.title, priceCurrency: cur, price: sv.price })),
      },
    },
  ];

  return page({
    title: s.seoTitle || `${s.name} — ${String(s.role || 'тренер').toLowerCase()}`,
    ogTitle: `${s.name} — ${String(s.role || 'тренер').toLowerCase()}`,
    description: s.seoDescription || `${s.name}: ${s.headline || s.role}. ${from ? `От ${ui.money(from)} / ${from.unit}. ` : ''}Запись на бесплатную консультацию.`.slice(0, 300),
    path,
    image: s.ogImage || s.photo,
    imageW: s.ogImage ? 1200 : s.photoWidth,
    imageH: s.ogImage ? 630 : s.photoHeight,
    ogType: 'profile',
    section: 'trenery',
    noindex: preview || s.status !== 'published',
    ld,
    user,
    body,
    bodyClass: 'page-profile',
  });
}

/* ---------- документы ---------- */

function privacy({ user }) {
  const body = `
<section class="page-head">
  <div class="wrap narrow">
    ${breadcrumbs([{ name: 'Главная', path: '/' }, { name: 'Политика конфиденциальности', path: '/politika' }])}
    <h1>Политика конфиденциальности</h1>
  </div>
</section>
<section class="block">
  <div class="wrap narrow prose">
    <p>Документ описывает, какие персональные данные собирает сайт ${SITE.host} и как они используются. Политика составлена в соответствии с Федеральным законом № 152-ФЗ «О персональных данных».</p>
    <h2>Какие данные мы собираем</h2>
    <p>Имя, телефон или ник в Telegram, почта, цель и комментарий — то, что вы указываете в заявке или при покупке. Для покупателей — история заказов и доступов к программам. Для тренеров — данные анкеты и логин для входа в кабинет.</p>
    <h2>Зачем</h2>
    <p>Чтобы связаться с вами по заявке, выполнить заказ, открыть доступ к купленной программе и отправить чек. Данные не используются для рекламных рассылок без вашего согласия и не передаются третьим лицам, кроме тренера, к которому вы записываетесь, и платёжного сервиса ЮKassa при оплате.</p>
    <h2>Оплата</h2>
    <p>Данные банковской карты вводятся на странице ЮKassa и не попадают на этот сайт.</p>
    <h2>Хранение</h2>
    <p>Данные хранятся на серверах в России. Заявки — пока нужны для связи, но не дольше трёх лет; данные о заказах — столько, сколько требует закон.</p>
    <h2>Ваши права</h2>
    <p>Вы можете отозвать согласие и попросить удалить свои данные, написав тренеру или через форму заявки на сайте.</p>
    <h2>Cookie</h2>
    <p>Сайт использует технические cookie для входа в личный кабинет. Если подключена Яндекс Метрика, она собирает обезличенную статистику посещений.</p>
  </div>
</section>`;
  return page({ title: 'Политика конфиденциальности', description: `Как сайт ${SITE.host} собирает, хранит и использует персональные данные.`, path: '/politika', user, body });
}

function oferta({ user }) {
  const seller = process.env.SELLER_NAME || '';
  const inn = process.env.SELLER_INN || '';
  const email = process.env.SELLER_EMAIL || '';
  const body = `
<section class="page-head">
  <div class="wrap narrow">
    ${breadcrumbs([{ name: 'Главная', path: '/' }, { name: 'Публичная оферта', path: '/oferta' }])}
    <h1>Публичная оферта</h1>
  </div>
</section>
<section class="block">
  <div class="wrap narrow prose">
    <p>Настоящий документ — предложение ${seller ? esc(seller) : 'исполнителя'}${inn ? `, ИНН ${esc(inn)}` : ''} (далее — Исполнитель) заключить договор на оказание услуг онлайн-ведения, занятий позированием и предоставления доступа к программам тренировок и питания на сайте ${SITE.host}.</p>
    <h2>1. Предмет</h2>
    <p>Исполнитель оказывает услуги и предоставляет доступ к материалам, описанным на странице выбранного формата или программы, а Заказчик оплачивает их.</p>
    <h2>2. Акцепт</h2>
    <p>Оплата заказа на сайте означает полное принятие условий оферты.</p>
    <h2>3. Доступ к программам</h2>
    <p>Доступ к программе открывается в личном кабинете после оплаты на срок, указанный на странице программы. Материалы предназначены для личного использования; передача доступа третьим лицам и распространение материалов запрещены.</p>
    <h2>4. Персональные услуги</h2>
    <p>Сроки и порядок онлайн-ведения и занятий согласуются с тренером после оплаты. Пакет занятий действует в течение срока, указанного на странице формата.</p>
    <h2>5. Здоровье</h2>
    <p>Заказчик подтверждает, что не имеет противопоказаний к физическим нагрузкам или согласовал их с врачом, и сообщает тренеру об ограничениях по здоровью.</p>
    <h2>6. Возврат</h2>
    <p>Возврат за неиспользованные занятия или программу, к которой не открывался доступ, производится по заявлению Заказчика в соответствии с законом «О защите прав потребителей».</p>
    <h2>7. Реквизиты и связь</h2>
    <p>${seller ? esc(seller) : 'Реквизиты Исполнителя уточняются'}${inn ? `, ИНН ${esc(inn)}` : ''}${email ? `, почта: ${esc(email)}` : ''}.</p>
  </div>
</section>`;
  return page({ title: 'Публичная оферта', description: `Условия оказания услуг и доступа к программам на сайте ${SITE.host}.`, path: '/oferta', user, body });
}

function notFound({ user }) {
  return page({
    title: 'Страница не найдена',
    description: 'Такой страницы нет.',
    path: '/404',
    noindex: true,
    user,
    body: `<section class="block"><div class="wrap narrow">
      <h1>Такой страницы нет</h1>
      <p class="lead">Возможно, ссылка устарела. Вот что есть на сайте:</p>
      <ul class="offer-rows">
        <li><a class="offer-row" href="/"><span class="or-title">Главная</span><span class="or-short">Евгения Шатова — онлайн-тренер</span><span class="or-price"></span></a></li>
        <li><a class="offer-row" href="/programmy"><span class="or-title">Форматы и программы</span><span class="or-short">Онлайн-ведение, позирование, программы</span><span class="or-price"></span></a></li>
        <li><a class="offer-row" href="/trenery"><span class="or-title">Тренеры</span><span class="or-short">Команда Shatova Pro</span><span class="or-price"></span></a></li>
      </ul>
    </div></section>`,
  });
}

module.exports = { trenery, zanyatiya, directionPage, profile, privacy, oferta, notFound, TRAINER_DIRECTIONS };
