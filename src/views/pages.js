'use strict';
const { esc, ruDate, price, plural, page, breadcrumbs, breadcrumbsLd, abs } = require('./layout');
const { SITE, SECTIONS, SUBJECTS, TRAINER_DIRECTIONS, subjectBySlug } = require('../catalog');

/* ---------- helpers ---------- */

// «От» считаем по основным занятиям: дополнительные услуги (проверка ДЗ) не учитываем.
const minPrice = (s, subject) => {
  const list = (s.services || []).filter((x) => x.price > 0 && !x.extra && (!subject || x.subject === subject));
  return list.length ? Math.min(...list.map((x) => x.price)) : null;
};
const profilePath = (s) => `/${s.kind === 'trener' ? 'trenery' : 'repetitory'}/${s.slug}`;

function stars(rating) {
  const r = Math.round(Number(rating) || 0);
  let out = '';
  for (let i = 1; i <= 5; i++) out += `<svg class="star${i <= r ? ' on' : ''}" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8l2.5 5.3 5.8.7-4.3 4 1.1 5.7L10 14.7l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7z"/></svg>`;
  return `<span class="stars" role="img" aria-label="Оценка ${esc(Number(rating).toFixed(1))} из 5">${out}</span>`;
}

function photo(s, variant, { eager = false, w, h } = {}) {
  const square = variant === 'square';
  const src = square ? s.photoSquare || s.photo : s.photo;
  const webp = square ? s.photoSquareWebp || s.photoWebp : s.photoWebp;
  if (!src) {
    const initials = (s.name || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('');
    return `<span class="avatar-fallback${square ? ' sq' : ''}" aria-hidden="true">${esc(initials)}</span>`;
  }
  const dims = square ? { w: w || 240, h: h || 240 } : { w: w || 320, h: h || 427 };
  const attrs = `width="${dims.w}" height="${dims.h}" alt="${esc(s.name)}, ${esc((s.role || '').toLowerCase())}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"`;
  return webp
    ? `<picture><source srcset="${esc(webp)}" type="image/webp"><img src="${esc(src)}" ${attrs}></picture>`
    : `<img src="${esc(src)}" ${attrs}>`;
}

function formatsLine(s) {
  const f = s.formats || {};
  const parts = [];
  if (f.online) parts.push('онлайн');
  if (f.atHome && f.atHome.length) parts.push(`у себя: ${f.atHome.join(', ')}`);
  if (f.travel && f.travel.length) parts.push(`выезд: ${f.travel.join(', ')}`);
  return parts.join('; ');
}

function specialistCard(s, { hero = false } = {}) {
  const from = minPrice(s);
  const subj = (s.subjects || []).map(subjectBySlug).filter(Boolean);
  const H = hero ? 'h2' : 'h3';
  return `<article class="spec-card${hero ? ' spec-card--hero' : ''}">
  <div class="spec-top">
    <a class="spec-photo" href="${profilePath(s)}" tabindex="-1" aria-hidden="true">${photo(s, hero ? 'full' : 'square', { eager: hero })}</a>
    <div class="spec-id">
      <${H} class="spec-name"><a href="${profilePath(s)}">${esc(s.name)}</a></${H}>
      <p class="spec-role">${esc(s.role)}${s.grades ? `, ${esc(s.grades)}` : ''}</p>
      ${s.reviewsCount ? `<p class="spec-rating">${stars(s.rating)}<span><b>${Number(s.rating).toFixed(1).replace('.', ',')}</b> · ${s.reviewsCount} ${plural(s.reviewsCount, 'отзыв', 'отзыва', 'отзывов')}</span></p>` : ''}
    </div>
  </div>
  <p class="spec-headline">${esc(s.headline)}</p>
  ${subj.length ? `<ul class="chips">${subj.map((x) => `<li><a href="/zanyatiya/${x.slug}">${esc(x.title)}</a></li>`).join('')}</ul>` : ''}
  <p class="spec-formats">${esc(formatsLine(s))}</p>
  <div class="spec-foot">
    ${from ? `<p class="spec-price">от <b>${price(from)}</b> <span>за 60 мин</span></p>` : ''}
    <a class="btn btn-primary" href="${profilePath(s)}#zapis">Записаться</a>
  </div>
</article>`;
}

function route(stations, { label, compact = false } = {}) {
  return `<ol class="route${compact ? ' route--compact' : ''}"${label ? ` aria-label="${esc(label)}"` : ''}>${stations
    .map(
      (st) => `<li class="station line-${st.line || 'ink'}">${st.href ? `<a href="${st.href}">` : '<div>'}<span class="st-dot" aria-hidden="true"></span><span class="st-name">${esc(st.name)}</span>${st.meta ? `<span class="st-meta">${esc(st.meta)}</span>` : ''}${st.href ? '</a>' : '</div>'}</li>`
    )
    .join('')}</ol>`;
}

const reviewItem = (r) => `<li class="review">
  <div class="review-head">${stars(r.rating)}<p><b>${esc(r.author)}</b> <span class="muted">· ${esc(r.service)} · ${ruDate(r.date)}</span></p></div>
  ${r.text ? `<p class="review-text">${esc(r.text)}</p>` : '<p class="review-text muted">Оценка без комментария.</p>'}
  ${r.reply ? `<div class="review-reply"><p class="muted">Ответ специалиста</p><p>${esc(r.reply)}</p></div>` : ''}
</li>`;

/* ---------- главная ---------- */

function home({ specialists, user, counts }) {
  const featured = specialists.find((s) => s.featured) || specialists[0];
  const subjects = SUBJECTS.filter((x) => counts.bySubject[x.slug]);
  const textReviews = featured ? (featured.reviews || []).filter((r) => r.text && r.text.length > 20) : [];

  const body = `
<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-text">
      <h1>Репетиторы и&nbsp;тренеры в&nbsp;Москве</h1>
      <p class="lead">Анкеты с подтверждёнными документами, цены за час и отзывы учеников. Занятия онлайн, у специалиста или с выездом.</p>
      ${route(
        [
          { name: 'Репетиторы', line: 'blue', href: '/repetitory', meta: `${counts.repetitor} ${plural(counts.repetitor, 'анкета', 'анкеты', 'анкет')}` },
          { name: 'Тренеры', line: 'green', href: '/trenery', meta: counts.trener ? `${counts.trener} ${plural(counts.trener, 'анкета', 'анкеты', 'анкет')}` : 'набираем' },
          { name: 'Занятия', line: 'orange', href: '/zanyatiya', meta: 'предметы и цены' },
        ],
        { label: 'Разделы сайта' }
      )}
    </div>
    <div class="hero-card">${featured ? specialistCard(featured, { hero: true }) : ''}</div>
  </div>
</section>

${
  subjects.length
    ? `<section class="block">
  <div class="wrap">
    <div class="block-head"><h2>Занятия и цены</h2><a class="link-more" href="/zanyatiya">Все занятия</a></div>
    <ul class="price-rows">${subjects
      .map((x) => {
        const list = specialists.filter((s) => (s.subjects || []).includes(x.slug));
        const from = Math.min(...list.map((s) => minPrice(s, x.slug) || minPrice(s)).filter(Boolean));
        return `<li><a href="/zanyatiya/${x.slug}"><span class="pr-title">${esc(x.title)}</span><span class="pr-meta">${list.length} ${plural(list.length, 'специалист', 'специалиста', 'специалистов')}</span><span class="pr-price">от ${price(from)}</span></a></li>`;
      })
      .join('')}</ul>
  </div>
</section>`
    : ''
}

<section class="block block--mist">
  <div class="wrap">
    <h2>Как начать заниматься</h2>
    ${route(
      [
        { name: 'Заявка', meta: 'выберите специалиста и оставьте телефон', line: 'blue' },
        { name: 'Звонок', meta: 'специалист свяжется и уточнит цель', line: 'blue' },
        { name: 'Пробное занятие', meta: 'диагностика уровня и план', line: 'blue' },
        { name: 'Занятия', meta: 'по расписанию, онлайн или очно', line: 'blue' },
      ],
      { label: 'Шаги записи' }
    )}
  </div>
</section>

${
  textReviews.length
    ? `<section class="block">
  <div class="wrap">
    <div class="block-head"><h2>Отзывы учеников</h2><a class="link-more" href="${profilePath(featured)}#otzyvy">Все отзывы</a></div>
    <ul class="reviews reviews--row">${textReviews.map(reviewItem).join('')}</ul>
  </div>
</section>`
    : ''
}

<section class="block block--ink">
  <div class="wrap join">
    <div>
      <h2>Вы репетитор или тренер?</h2>
      <p>Создайте анкету: заявки от учеников приходят в личный кабинет, без комиссии за контакт.</p>
    </div>
    <a class="btn btn-light" href="/kabinet/registraciya">Создать анкету</a>
  </div>
</section>`;

  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE.name,
      alternateName: SITE.title,
      url: SITE.url + '/',
      inLanguage: 'ru-RU',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE.name,
      url: SITE.url + '/',
      logo: abs('/img/icon-512.png'),
      areaServed: { '@type': 'City', name: 'Москва' },
    },
  ];

  return page({
    title: `Репетиторы и тренеры в Москве — ${SITE.name}`,
    description: SITE.description,
    path: '/',
    ld,
    user,
    body,
    bodyClass: 'page-home',
  });
}

/* ---------- раздел «Репетиторы» ---------- */

function repetitory({ specialists, user }) {
  const list = specialists.filter((s) => s.kind === 'repetitor');
  const crumbs = [
    { name: 'Главная', path: '/' },
    { name: 'Репетиторы', path: '/repetitory' },
  ];
  const body = `
<section class="page-head line-blue">
  <div class="wrap">
    ${breadcrumbs(crumbs)}
    <h1>Репетиторы в Москве</h1>
    <p class="lead">${list.length} ${plural(list.length, 'анкета', 'анкеты', 'анкет')} с ценами, документами и отзывами. Занятия онлайн и очно.</p>
    <ul class="chips chips--lg">${SUBJECTS.filter((x) => x.kind === 'repetitor')
      .map((x) => `<li><a href="/zanyatiya/${x.slug}">${esc(x.title)}</a></li>`)
      .join('')}</ul>
  </div>
</section>
<section class="block">
  <div class="wrap">
    ${list.length ? `<div class="spec-list">${list.map((s) => specialistCard(s)).join('')}</div>` : emptyState('Анкеты репетиторов появятся здесь', 'Станьте первым — анкета публикуется после проверки.')}
  </div>
</section>`;
  return page({
    title: `Репетиторы в Москве — цены и отзывы | ${SITE.name}`,
    description: `Репетиторы в Москве и онлайн: география, подготовка к ОГЭ и ЕГЭ. ${list.length} ${plural(list.length, 'анкета', 'анкеты', 'анкет')} с ценами, документами и отзывами учеников.`,
    path: '/repetitory',
    section: 'repetitory',
    noindex: list.length === 0,
    ld: [breadcrumbsLd(crumbs), itemListLd(list)],
    user,
    body,
  });
}

/* ---------- раздел «Тренеры» ---------- */

function trenery({ specialists, user }) {
  const list = specialists.filter((s) => s.kind === 'trener');
  const crumbs = [
    { name: 'Главная', path: '/' },
    { name: 'Тренеры', path: '/trenery' },
  ];
  const body = `
<section class="page-head line-green">
  <div class="wrap">
    ${breadcrumbs(crumbs)}
    <h1>Тренеры в Москве</h1>
    <p class="lead">Персональные тренировки для взрослых и детей: в зале, на улице, дома или онлайн.</p>
  </div>
</section>
<section class="block">
  <div class="wrap">
    ${
      list.length
        ? `<div class="spec-list">${list.map((s) => specialistCard(s)).join('')}</div>`
        : `<div class="empty">
      <h2>Набираем тренеров</h2>
      <p>Раздел только открылся. Если вы тренер, создайте анкету — она появится здесь после проверки.</p>
      <ul class="chips chips--lg">${TRAINER_DIRECTIONS.map((d) => `<li><span>${esc(d)}</span></li>`).join('')}</ul>
      <a class="btn btn-primary" href="/kabinet/registraciya?kind=trener">Создать анкету тренера</a>
    </div>`
    }
  </div>
</section>`;
  return page({
    title: `Тренеры в Москве — персональные тренировки | ${SITE.name}`,
    description: 'Персональные тренеры в Москве: фитнес, йога, плавание, единоборства, детский спорт. Анкеты, цены и отзывы.',
    path: '/trenery',
    section: 'trenery',
    noindex: list.length === 0,
    ld: [breadcrumbsLd(crumbs)],
    user,
    body,
  });
}

/* ---------- раздел «Занятия» ---------- */

function zanyatiya({ specialists, user }) {
  const crumbs = [
    { name: 'Главная', path: '/' },
    { name: 'Занятия', path: '/zanyatiya' },
  ];
  const rows = SUBJECTS.map((x) => {
    const list = specialists.filter((s) => (s.subjects || []).includes(x.slug));
    if (!list.length) return '';
    const from = Math.min(...list.map((s) => minPrice(s, x.slug) || minPrice(s)).filter(Boolean));
    return `<li><a href="/zanyatiya/${x.slug}"><span class="pr-title">${esc(x.title)}</span><span class="pr-meta">${esc(x.intro)}</span><span class="pr-price">от ${price(from)}</span></a></li>`;
  }).join('');

  const services = specialists.flatMap((s) => (s.services || []).map((sv) => ({ ...sv, s })));

  const body = `
<section class="page-head line-orange">
  <div class="wrap">
    ${breadcrumbs(crumbs)}
    <h1>Занятия и цены</h1>
    <p class="lead">Что можно изучать с репетиторами и тренерами trainer.moscow и сколько это стоит.</p>
  </div>
</section>
<section class="block">
  <div class="wrap">
    <h2>Предметы</h2>
    <ul class="price-rows price-rows--wide">${rows}</ul>
  </div>
</section>
<section class="block block--mist">
  <div class="wrap">
    <h2>Форматы</h2>
    <div class="formats">
      <div><h3>Онлайн</h3><p>Видеосвязь, общая доска и электронные материалы. Подходит, если неудобно ездить.</p></div>
      <div><h3>У специалиста</h3><p>Занятие в кабинете репетитора или в зале тренера.</p></div>
      <div><h3>С выездом</h3><p>Специалист приезжает к ученику домой — по Москве и ближнему Подмосковью.</p></div>
      <div><h3>Мини-группы</h3><p>2–4 ученика одного уровня. Дешевле индивидуальных занятий.</p></div>
    </div>
  </div>
</section>
<section class="block">
  <div class="wrap">
    <h2>Все услуги</h2>
    <div class="table-wrap"><table class="price-table">
      <thead><tr><th scope="col">Услуга</th><th scope="col">Специалист</th><th scope="col">Цена</th></tr></thead>
      <tbody>${services
        .map((sv) => `<tr><td>${esc(sv.title)}</td><td><a href="${profilePath(sv.s)}">${esc(sv.s.name)}</a></td><td class="nowrap">от ${price(sv.price)} / ${esc(sv.unit)}</td></tr>`)
        .join('')}</tbody>
    </table></div>
  </div>
</section>`;
  return page({
    title: `Занятия с репетитором: предметы и цены | ${SITE.name}`,
    description: 'Предметы и цены занятий с репетиторами в Москве: география, ОГЭ и ЕГЭ по географии. Онлайн, очно, с выездом и в мини-группах.',
    path: '/zanyatiya',
    section: 'zanyatiya',
    ld: [breadcrumbsLd(crumbs)],
    user,
    body,
  });
}

function subjectPage({ subject, specialists, user }) {
  const list = specialists.filter((s) => (s.subjects || []).includes(subject.slug));
  const from = list.length ? Math.min(...list.map((s) => minPrice(s, subject.slug) || minPrice(s)).filter(Boolean)) : null;
  const crumbs = [
    { name: 'Главная', path: '/' },
    { name: 'Занятия', path: '/zanyatiya' },
    { name: subject.title, path: `/zanyatiya/${subject.slug}` },
  ];
  const faq = [
    ['Сколько стоит занятие?', from ? `От ${price(from)} за 60 минут — по ценам из анкет специалистов. Точная стоимость зависит от формата и цели.` : 'Цены указаны в анкетах специалистов.'],
    ['Можно ли заниматься онлайн?', 'Да. Онлайн-занятия проходят по видеосвязи с общей доской; формат указан в каждой анкете.'],
    ['С чего начать?', 'Оставьте заявку в анкете специалиста. Он свяжется с вами, уточнит цель и предложит время пробного занятия.'],
  ];
  const body = `
<section class="page-head line-orange">
  <div class="wrap">
    ${breadcrumbs(crumbs)}
    <h1>${esc(subject.h1)}</h1>
    <p class="lead">${esc(subject.intro)}${from ? ` Цена — от ${price(from)} за 60 минут.` : ''}</p>
  </div>
</section>
<section class="block">
  <div class="wrap">
    ${list.length ? `<div class="spec-list">${list.map((s) => specialistCard(s)).join('')}</div>` : emptyState('Специалистов пока нет', 'Загляните позже или создайте свою анкету.')}
  </div>
</section>
<section class="block block--mist">
  <div class="wrap narrow">
    <h2>Частые вопросы</h2>
    <dl class="faq">${faq.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join('')}</dl>
  </div>
</section>`;
  return page({
    title: `${subject.seoTitle} | ${SITE.name}`,
    description: subject.seoDescription,
    path: `/zanyatiya/${subject.slug}`,
    section: 'zanyatiya',
    noindex: list.length === 0,
    ld: [breadcrumbsLd(crumbs), itemListLd(list)],
    user,
    body,
  });
}

/* ---------- анкета специалиста ---------- */

function profile({ s, user, sent, error, form = {}, preview = false }) {
  const section = s.kind === 'trener' ? SECTIONS.trenery : SECTIONS.repetitory;
  const path = profilePath(s);
  const crumbs = [
    { name: 'Главная', path: '/' },
    { name: section.title, path: `/${section.slug}` },
    { name: s.name, path },
  ];
  const from = minPrice(s);
  const subj = (s.subjects || []).map(subjectBySlug).filter(Boolean);
  const f = s.formats || {};
  const verified = (x) => (x.verified ? '<span class="ok" title="Подтверждено документами">документы проверены</span>' : '');
  const listBlock = (title, items, id) =>
    items && items.length
      ? `<section class="prof-sec"${id ? ` id="${id}"` : ''}><h2>${title}</h2><ul class="facts">${items
          .map((x) => `<li><p>${esc(x.title)}</p><p class="muted">${esc(x.years || '')} ${verified(x)}</p></li>`)
          .join('')}</ul></section>`
      : '';

  const body = `
${preview ? '<div class="preview-bar">Предпросмотр: анкета на проверке и пока не видна посетителям.</div>' : ''}
<div class="wrap">${breadcrumbs(crumbs)}</div>
<div class="wrap profile">
  <aside class="prof-aside">
    <div class="prof-photo">${photo(s, 'full', { eager: true })}</div>
    <h1 class="prof-name">${esc(s.name)}</h1>
    <p class="prof-role">${esc(s.role)}${s.grades ? `, ${esc(s.grades)}` : ''}</p>
    ${s.reviewsCount ? `<p class="spec-rating">${stars(s.rating)}<a href="#otzyvy"><b>${Number(s.rating).toFixed(1).replace('.', ',')}</b> · ${s.reviewsCount} ${plural(s.reviewsCount, 'отзыв', 'отзыва', 'отзывов')}</a></p>` : ''}
    ${s.badges && s.badges.length ? `<ul class="badges">${s.badges.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
    ${from ? `<p class="prof-price">от <b>${price(from)}</b> за 60 мин</p>` : ''}
    <a class="btn btn-primary btn-block" href="#zapis">Записаться на занятие</a>
    ${f.trial ? '<p class="muted small center">Первое занятие — пробное, с диагностикой уровня</p>' : ''}
  </aside>

  <div class="prof-main">
    <section class="prof-sec prof-intro">
      <p class="prof-headline">${esc(s.headline)}</p>
      <p>${esc(s.about)}</p>
      ${subj.length ? `<ul class="chips">${subj.map((x) => `<li><a href="/zanyatiya/${x.slug}">${esc(x.title)}</a></li>`).join('')}</ul>` : ''}
    </section>

    ${
      s.results && s.results.length
        ? `<section class="prof-sec"><h2>Результаты учеников</h2><ul class="results">${s.results.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></section>`
        : ''
    }
    ${
      s.method && s.method.length
        ? `<section class="prof-sec"><h2>Как проходят занятия</h2>${route(
            s.method.map((m) => ({ name: m, line: 'blue' })),
            { compact: true, label: 'Порядок занятий' }
          )}</section>`
        : ''
    }

    <section class="prof-sec" id="ceny">
      <h2>Услуги и цены</h2>
      <ul class="services">${(s.services || [])
        .map((sv) => `<li><span>${esc(sv.title)}</span><span class="dots" aria-hidden="true"></span><b class="nowrap">от ${price(sv.price)}</b><span class="muted nowrap">/ ${esc(sv.unit)}</span></li>`)
        .join('')}</ul>
    </section>

    <section class="prof-sec">
      <h2>Где проходят занятия</h2>
      <ul class="where">
        ${f.online ? '<li><b>Онлайн</b><span>видеосвязь и общая доска</span></li>' : ''}
        ${f.atHome && f.atHome.length ? `<li><b>У специалиста</b><span>${esc(f.atHome.join(', '))}</span></li>` : ''}
        ${f.travel && f.travel.length ? `<li><b>С выездом к ученику</b><span>${esc(f.travel.join(', '))}</span></li>` : ''}
        ${f.groups ? '<li><b>Мини-группы</b><span>2–4 ученика одного уровня</span></li>' : ''}
      </ul>
    </section>

    ${listBlock('Образование', s.education)}
    ${listBlock('Опыт работы', s.experience)}
    ${listBlock('Достижения', s.achievements)}

    ${
      s.reviews && s.reviews.length
        ? `<section class="prof-sec" id="otzyvy">
      <h2>Отзывы <span class="muted">${s.reviews.length}</span></h2>
      <ul class="reviews">${s.reviews.map(reviewItem).join('')}</ul>
      ${s.profiUrl ? `<p class="muted small">Отзывы перенесены из анкеты на <a href="${esc(s.profiUrl)}" rel="nofollow noopener" target="_blank">Профи.ру</a>.</p>` : ''}
    </section>`
        : ''
    }

    <section class="prof-sec lead-form" id="zapis">
      ${leadForm(s, { sent, error, form })}
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
      mainEntity: {
        '@type': 'Person',
        name: s.name,
        jobTitle: s.role,
        description: s.headline,
        image: s.photo ? abs(s.photo) : undefined,
        url: abs(path),
        knowsAbout: subj.map((x) => x.title),
        address: f.atHome && f.atHome.length ? { '@type': 'PostalAddress', addressLocality: f.atHome[0], addressCountry: 'RU' } : undefined,
        alumniOf: (s.education || []).slice(0, 1).map((e) => ({ '@type': 'CollegeOrUniversity', name: e.title.split(',')[0] })),
        hasCredential: (s.achievements || []).map((a) => ({ '@type': 'EducationalOccupationalCredential', name: a.title })),
        sameAs: s.profiUrl ? [s.profiUrl] : undefined,
        makesOffer: (s.services || []).map((sv) => ({
          '@type': 'Offer',
          name: sv.title,
          priceCurrency: 'RUB',
          price: sv.price,
          areaServed: 'Москва',
        })),
      },
    },
  ];

  return page({
    title: s.seoTitle || `${s.name} — ${s.role.toLowerCase()} в Москве`,
    ogTitle: `${s.name} — ${s.role.toLowerCase()}`,
    description: s.seoDescription || `${s.name}: ${s.headline}. ${from ? `От ${price(from)} за час. ` : ''}${s.reviewsCount ? `Рейтинг ${Number(s.rating).toFixed(1)}, ${s.reviewsCount} ${plural(s.reviewsCount, 'отзыв', 'отзыва', 'отзывов')}. ` : ''}Запись на пробное занятие.`.slice(0, 300),
    path,
    image: s.ogImage || s.photo,
    ogType: 'profile',
    section: section.slug,
    noindex: preview || s.status !== 'published',
    ld,
    user,
    body,
    bodyClass: 'page-profile',
  });
}

function leadForm(s, { sent, error, form }) {
  if (sent) {
    return `<div class="sent" role="status"><h2>Заявка отправлена</h2><p>${esc(s.name.split(' ')[0])} получит её в личном кабинете и свяжется с вами, обычно в течение дня.</p></div>`;
  }
  const subj = (s.subjects || []).map(subjectBySlug).filter(Boolean);
  const v = (k) => esc(form[k] || '');
  return `<h2>Записаться к ${esc(nameDative(s.name))}</h2>
<p class="muted">Оставьте контакты — специалист перезвонит, ответит на вопросы и предложит время пробного занятия.</p>
${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ''}
<form method="post" action="/zayavka" class="form" novalidate>
  <input type="hidden" name="specialist" value="${esc(s.slug)}">
  <div class="hp" aria-hidden="true"><label>Не заполняйте <input name="website" tabindex="-1" autocomplete="off"></label></div>
  <div class="form-grid">
    <label>Как к вам обращаться<input name="name" required maxlength="80" autocomplete="name" value="${v('name')}"></label>
    <label>Телефон или Telegram<input name="contact" required maxlength="80" autocomplete="tel" inputmode="tel" placeholder="+7 900 000-00-00" value="${v('contact')}"></label>
    ${
      subj.length
        ? `<label>Цель<select name="subject">${subj.map((x) => `<option value="${x.slug}"${form.subject === x.slug ? ' selected' : ''}>${esc(x.title)}</option>`).join('')}<option value="other"${form.subject === 'other' ? ' selected' : ''}>Другое</option></select></label>`
        : ''
    }
    <label>Класс или возраст<input name="grade" maxlength="40" placeholder="9 класс" value="${v('grade')}"></label>
    <fieldset class="seg"><legend>Формат</legend>
      ${['онлайн', 'очно', 'не важно'].map((x, i) => `<label><input type="radio" name="format" value="${x}"${(form.format || 'не важно') === x ? ' checked' : ''}> ${x}</label>`).join('')}
    </fieldset>
    <label class="span-2">Комментарий<textarea name="message" rows="3" maxlength="1000" placeholder="Например: готовимся к ОГЭ в мае, удобно по вечерам">${v('message')}</textarea></label>
  </div>
  <label class="check"><input type="checkbox" name="consent" value="1" required${form.consent ? ' checked' : ''}> Согласен на обработку персональных данных по <a href="/politika" target="_blank">политике конфиденциальности</a></label>
  <button class="btn btn-primary" type="submit">Отправить заявку</button>
</form>`;
}

// «Руслан Алиев» → «Руслану Алиеву» (для заголовка формы; для сложных случаев — имя как есть).
function nameDative(full) {
  const [first, last] = String(full).split(' ');
  const f = /[бвгджзклмнпрстфхцчшщ]$/i.test(first) ? first + 'у' : /а$/.test(first) ? first.slice(0, -1) + 'е' : first;
  const l = !last ? '' : /(ов|ев|ин|ын)$/.test(last) ? last + 'у' : /(ова|ева|ина|ына)$/.test(last) ? last.slice(0, -1) + 'ой' : last;
  return [f, l].filter(Boolean).join(' ');
}

function itemListLd(list) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: list.map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(profilePath(s)), name: s.name })),
  };
}

function emptyState(title, text) {
  return `<div class="empty"><h2>${esc(title)}</h2><p>${esc(text)}</p><a class="btn btn-primary" href="/kabinet/registraciya">Создать анкету</a></div>`;
}

/* ---------- служебные ---------- */

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
    <p>Имя, телефон или ник в Telegram, класс или возраст ученика, комментарий к заявке — то, что вы указываете в форме записи. Для специалистов — данные анкеты и логин для входа в кабинет.</p>
    <h2>Зачем</h2>
    <p>Чтобы передать заявку выбранному специалисту и чтобы он мог с вами связаться. Данные не используются для рассылок и не передаются третьим лицам, кроме специалиста, которому адресована заявка.</p>
    <h2>Хранение</h2>
    <p>Данные хранятся на серверах в России. Заявки хранятся, пока нужны для связи с учеником, но не дольше трёх лет.</p>
    <h2>Ваши права</h2>
    <p>Вы можете отозвать согласие и попросить удалить свои данные: напишите об этом в комментарии к новой заявке или специалисту, которому оставляли контакты.</p>
    <h2>Cookie</h2>
    <p>Сайт использует технические cookie для входа в личный кабинет. Если подключена Яндекс Метрика, она собирает обезличенную статистику посещений.</p>
  </div>
</section>`;
  return page({
    title: `Политика конфиденциальности | ${SITE.name}`,
    description: 'Как сайт trainer.moscow собирает, хранит и использует персональные данные.',
    path: '/politika',
    user,
    body,
  });
}

function notFound({ user }) {
  return page({
    title: `Страница не найдена | ${SITE.name}`,
    description: 'Такой страницы нет.',
    path: '/404',
    noindex: true,
    user,
    body: `<section class="block"><div class="wrap narrow center">
      <h1>Такой страницы нет</h1>
      <p class="lead">Возможно, ссылка устарела. Начните с разделов:</p>
      ${route(
        [
          { name: 'Репетиторы', line: 'blue', href: '/repetitory' },
          { name: 'Тренеры', line: 'green', href: '/trenery' },
          { name: 'Занятия', line: 'orange', href: '/zanyatiya' },
        ],
        { label: 'Разделы сайта' }
      )}
    </div></section>`,
  });
}

module.exports = { home, repetitory, trenery, zanyatiya, subjectPage, profile, privacy, notFound, profilePath, minPrice };
