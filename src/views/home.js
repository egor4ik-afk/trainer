'use strict';
const { esc, page, abs } = require('./layout');
const { SITE, GOALS } = require('../catalog');
const ui = require('./ui');

const FAQ = [
  ['Как проходит онлайн-ведение?', 'После знакомства вы получаете план тренировок и питания. Технику присылаете на видео, тренер разбирает её и отвечает в мессенджере. Раз в неделю — отчёт и корректировка плана.'],
  ['Нужен ли тренажёрный зал?', 'Нет. План можно составить для зала или для дома — с резинками, гантелями или вообще без инвентаря.'],
  ['Подойдёт ли новичку?', 'Да. Нагрузку подбираем по вашему уровню и здоровью и увеличиваем постепенно.'],
  ['Можно ли начать после родов?', 'Да, после разрешения врача. Евгения — мама двух дочерей и знает, как мягко вернуться в форму.'],
  ['Будет ли питание?', 'Да, в онлайн-ведении есть сопровождение по питанию: рацион и рекомендации без голодовок и жёстких запретов.'],
  ['Как проходит позирование онлайн?', 'По видеосвязи: ставим стойки, повороты и дефиле, между занятиями вы присылаете видео прогонов на разбор. Можно заниматься и в студии в центре Москвы.'],
  ['Как получить доступ к программе?', 'После оплаты программа открывается в личном кабинете на сайте. Войти можно по почте и паролю, который вы зададите при покупке.'],
  ['Сколько стоит?', 'Цены указаны на странице каждого формата. Если там «по запросу» — оставьте заявку, тренер подскажет стоимость под вашу задачу.'],
];

function home({ owner, specialists, offers, user, sent, error, form }) {
  const services = offers.filter((o) => o.kind === 'service');
  const programs = offers.filter((o) => o.kind === 'program');
  const team = specialists.filter((s) => s.slug !== owner.slug);
  const heroSrc = owner.heroPhoto || owner.photo;
  const heroW = owner.heroPhoto ? owner.heroWidth : owner.photoWidth;
  const heroH = owner.heroPhoto ? owner.heroHeight : owner.photoHeight;
  const timeline = (owner.achievements || []).filter((a) => a.years);

  const body = `
<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-text">
      <h1 class="hero-title"><span class="hero-name">Евгения <span>Шатова</span></span><span class="hero-role">онлайн-тренер и тренер по позированию</span></h1>
      <p class="hero-lead">Помогаю похудеть, набрать форму и восстановиться после родов — онлайн из любого города. А тем, кто мечтает о сцене, — подготовиться к старту и научиться позировать.</p>
      <div class="hero-cta">
        <a class="btn btn-primary" href="#zapis">Записаться на бесплатную консультацию</a>
        <a class="btn btn-ghost" href="/programmy">Форматы и цены</a>
      </div>
    </div>
    <figure class="hero-photo">
      ${heroSrc ? ui.img(heroSrc, { alt: 'Евгения Шатова на сцене Olympia 2025', w: heroW, h: heroH, eager: true, sizes: '(max-width: 960px) 100vw, 46vw' }) : '<span class="hero-photo-empty" aria-hidden="true"></span>'}
      <figcaption class="stage-tag"><span class="tag-pro">IFBB PRO</span><span class="tag-ev">Olympia 2025 · Las Vegas</span></figcaption>
    </figure>
  </div>
  <div class="wrap">
    <ul class="creds" aria-label="Коротко о тренере">
      ${(owner.badges || []).concat(['Абсолютная чемпионка 2019 и 2021']).map((b) => `<li>${esc(b)}</li>`).join('')}
    </ul>
  </div>
</section>

<section class="block" id="formaty">
  <div class="wrap">
    <div class="block-head"><h2>Чем я помогу</h2><a class="link-more" href="/programmy">Все форматы и программы</a></div>
    <ul class="offer-rows">${services
      .map(
        (o) => `<li>
      <a class="offer-row" href="${ui.offerPath(o)}">
        <span class="or-title">${esc(o.title)}</span>
        <span class="or-short">${esc(o.short)}</span>
        <span class="or-price">${esc(ui.offerPriceText(o))}</span>
      </a>
    </li>`
      )
      .join('')}</ul>
    <div class="goals">
      <p class="goals-q">С какой целью вы пришли?</p>
      <ul class="chips chips--lg">${GOALS.map((g) => `<li><a href="/programmy/${g.offer}?cel=${g.id}">${esc(g.title)}</a></li>`).join('')}</ul>
    </div>
  </div>
</section>

<section class="block block--blush">
  <div class="wrap">
    <h2>Как это работает</h2>
    ${ui.steps(
      [
        { title: 'Заявка', text: 'Оставляете контакты и цель — это минута.' },
        { title: 'Бесплатная консультация', text: 'Созваниваемся: цель, опыт, здоровье, график. Подбираем формат.' },
        { title: 'План', text: 'Получаете тренировки и питание под себя — для зала или дома.' },
        { title: 'Ведение', text: 'Техника по видео, ответы в мессенджере, корректировки каждую неделю.' },
      ],
      'Как начать'
    )}
    <a class="btn btn-primary" href="#zapis">Начать с консультации</a>
  </div>
</section>

${
  programs.length
    ? `<section class="block">
  <div class="wrap">
    <div class="block-head"><h2>Программы тренировок и питания</h2><a class="link-more" href="/programmy#programmy">Все программы</a></div>
    <p class="block-lead">Готовые планы, которые открываются в личном кабинете сразу после оплаты.</p>
    <ul class="prog-grid">${programs
      .map(
        (o) => `<li class="prog">
      <a href="${ui.offerPath(o)}">
        ${o.cover ? ui.img(o.cover, { alt: o.title, w: o.coverWidth, h: o.coverHeight, sizes: '(max-width: 680px) 100vw, 280px' }) : '<span class="prog-cover" aria-hidden="true"></span>'}
        <span class="prog-title">${esc(o.title)}</span>
        <span class="prog-short">${esc(o.short)}</span>
        <span class="prog-price">${esc(ui.offerPriceText(o))}</span>
      </a>
    </li>`
      )
      .join('')}</ul>
  </div>
</section>`
    : ''
}

<section class="block block--stage" id="put">
  <div class="wrap stage-grid">
    <div>
      <h2>Путь на сцену Olympia</h2>
      <blockquote class="stage-quote"><p>Девушка, которая не была «создана» для бодибилдинга. Она создала себя сама.</p><footer>— о Евгении в журнале @fitness_bikini</footer></blockquote>
      <p class="stage-text">В 2018 году Евгения пришла к тренеру Юлии Жарковой, не зная, на что способна. Через год — первые медали, через три — абсолютные победы, в 2025-м — сцена Olympia в Лас-Вегасе.</p>
    </div>
    <ol class="timeline" aria-label="Достижения по годам">${timeline
      .map((a) => `<li><span class="tl-year">${esc(a.years)}</span><span class="tl-text">${esc(a.title)}</span></li>`)
      .join('')}</ol>
  </div>
</section>

${
  owner.quote
    ? `<section class="block">
  <div class="wrap posing">
    <div class="posing-text">
      <h2>Позирование: быть собой на сцене</h2>
      <blockquote class="posing-quote"><p>${esc(owner.quote.text)}</p></blockquote>
      <ul class="ticks">${(owner.posing || []).map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
      <a class="btn btn-primary" href="/programmy/pozirovanie">Записаться на позирование</a>
    </div>
    ${owner.posingPhoto ? `<figure class="posing-photo">${ui.img(owner.posingPhoto, { alt: 'Евгения Шатова: позирование на сцене', w: owner.posingWidth, h: owner.posingHeight, sizes: '(max-width: 960px) 100vw, 40vw' })}</figure>` : ''}
  </div>
</section>`
    : ''
}

${
  team.length
    ? `<section class="block block--blush">
  <div class="wrap">
    <div class="block-head"><h2>Тренеры команды</h2><a class="link-more" href="/trenery">Все тренеры</a></div>
    <div class="t-list">${team.map((s) => ui.trainerCard(s, offers)).join('')}</div>
  </div>
</section>`
    : ''
}

<section class="block" id="voprosy">
  <div class="wrap narrow">
    <h2>Частые вопросы</h2>
    ${ui.faqHtml(FAQ)}
  </div>
</section>

<section class="block block--ink" id="zapis">
  <div class="wrap lead-wrap">
    ${ui.leadForm({ s: owner, sent, error, form, title: 'Бесплатная консультация', intro: 'Расскажите о цели — Евгения свяжется с вами, ответит на вопросы и подберёт формат. Это ни к чему не обязывает.', action: '/zayavka', from: 'home' })}
  </div>
</section>`;

  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE.brand, alternateName: SITE.name, url: SITE.url + '/', inLanguage: 'ru-RU' },
    {
      '@context': 'https://schema.org',
      ...ui.personLd(owner),
      url: SITE.url + '/',
      description: owner.headline,
      knowsAbout: ['Онлайн-тренировки', 'Фитнес-бикини', 'Позирование', 'Питание', 'Восстановление после родов'],
      award: (owner.achievements || []).map((a) => `${a.title}${a.years ? `, ${a.years}` : ''}`),
      memberOf: { '@type': 'SportsOrganization', name: 'IFBB Professional League' },
      makesOffer: services.map((o) => ({ '@type': 'Offer', name: o.title, url: abs(ui.offerPath(o)), ...(ui.offerFrom(o) ? { price: ui.offerFrom(o), priceCurrency: 'RUB' } : {}) })),
    },
    ui.faqLd(FAQ),
  ];

  return page({
    title: 'Евгения Шатова — онлайн-тренер, IFBB Pro Bikini, позирование',
    description: SITE.description,
    path: '/',
    image: owner.ogImage,
    imageW: owner.ogImage ? 1200 : undefined,
    imageH: owner.ogImage ? 630 : undefined,
    preload: heroSrc && heroSrc.startsWith('/m/') ? [{ href: heroSrc, srcset: `${heroSrc.replace(/(\.[a-z]+)$/, '-sm$1')} 640w, ${heroSrc} ${heroW}w`, sizes: '(max-width: 960px) 100vw, 46vw' }] : [],
    ld,
    user,
    body,
    bodyClass: 'page-home',
  });
}

module.exports = { home, FAQ };
