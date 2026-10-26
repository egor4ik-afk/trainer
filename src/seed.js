'use strict';
const db = require('./db');
const { hashPassword } = require('./auth');

// Анкета Дарьи Калашниковой — перенесена с её прежнего сайта (проект kalashnikova).
const DARIA = {
  slug: 'darya-kalashnikova',
  kind: 'trener',
  status: 'published',
  name: 'Дарья Калашникова',
  role: 'Персональный фитнес-тренер',
  headline: 'КМС по лёгкой атлетике: 10 лет в профессиональном спорте и 7 лет тренерской работы',
  seoTitle: 'Дарья Калашникова — персональный фитнес-тренер, онлайн-тренировки',
  seoDescription:
    'Фитнес-тренер, КМС по лёгкой атлетике. Онлайн-тренировки: похудение, набор массы, осанка, фитнес для беременных. Консультация бесплатно.',
  photo: '/img/darya-kalashnikova.jpg',
  photoWebp: '/img/darya-kalashnikova.webp',
  photoSquare: '/img/darya-kalashnikova-square.jpg',
  photoSquareWebp: '/img/darya-kalashnikova-square.webp',
  photoWidth: 600,
  photoHeight: 800,
  ogImage: '/img/og-darya-kalashnikova.png',
  currency: 'USD',
  subjects: ['personalnyy-trener', 'onlayn-trenirovki', 'korrekciya-osanki', 'fitnes-dlya-beremennyh'],
  about:
    'Разработанные мной программы помогают прийти к цели — похудеть, набрать мышечную массу или поддерживать форму — ' +
    'и делают путь эффективным, интересным и безопасным для здоровья. Тренирую онлайн из любого города, очно — в Тбилиси.',
  focus: [
    'Похудение',
    'Набор мышечной массы',
    'Поддержание формы',
    'Силовой и функциональный тренинг',
    'Растяжка и мягкие виды фитнеса',
    'Коррекция осанки',
    'Реабилитация после травм и операций',
    'Протрузии и грыжи',
    'Варикоз, диабет, сердечная недостаточность',
    'Фитнес для беременных и восстановление после родов',
    'Питание: основы нутрициологии',
  ],
  focusNote: 'При ограничениях по здоровью программа строится с учётом рекомендаций вашего врача.',
  method: [
    'Бесплатная консультация: знакомство, цель и выбор формата',
    'Индивидуальный план с учётом целей и здоровья',
    'Постановка техники и регулярная обратная связь',
    'Плавное наращивание нагрузки и смена упражнений, чтобы не было скучно',
  ],
  education: [
    { title: 'Училище олимпийского резерва, диплом', years: '2015' },
    { title: 'Учебный центр профессионалов фитнеса, инструктор тренажёрного зала', years: '2018' },
    { title: 'Учебный центр профессионалов фитнеса, персональный тренер', years: '2019' },
    { title: 'Уральский институт фитнеса, нутрициология в фитнесе', years: '2019' },
    { title: 'Коррекция осанки. Холистический подход', years: '2022' },
    { title: 'Фитнес для беременных', years: '2022' },
  ],
  alumniOf: ['Училище олимпийского резерва', 'Учебный центр профессионалов фитнеса', 'Уральский институт фитнеса'],
  experience: [
    { title: 'Персональный фитнес-тренер: онлайн и очно', years: '7 лет' },
    { title: 'Профессиональный спорт, лёгкая атлетика', years: '10 лет' },
  ],
  achievements: [{ title: 'Кандидат в мастера спорта по лёгкой атлетике', years: '' }],
  services: [
    { title: 'Онлайн-консультация', note: 'знакомство, цель, выбор формата', subject: 'onlayn-trenirovki', price: 0, unit: 'консультация' },
    { title: 'Онлайн-ведение, 4 тренировки', note: 'индивидуальный план, постановка техники', subject: 'onlayn-trenirovki', price: 50, unit: 'месяц' },
    { title: 'Онлайн-ведение, 8 тренировок', note: 'индивидуальный план, постановка техники', subject: 'onlayn-trenirovki', price: 90, unit: 'месяц' },
    { title: 'Онлайн-ведение, 12 тренировок', note: 'индивидуальный план, постановка техники', subject: 'onlayn-trenirovki', price: 120, unit: 'месяц' },
    { title: 'Сопровождение', note: 'план, 1 видеотренировка в неделю, 2 самостоятельные, обратная связь', subject: 'onlayn-trenirovki', price: 100, unit: 'месяц' },
    { title: '30-минутные тренировки, 8 занятий', note: 'короткие онлайн-тренировки', subject: 'onlayn-trenirovki', price: 65, unit: 'месяц' },
    { title: 'Персональная тренировка в Тбилиси', note: 'парк Мзиури или Ваке', subject: 'personalnyy-trener', price: 12, unit: 'тренировка' },
    { title: 'Мини-группа на открытом воздухе, Тбилиси', note: 'функциональные и силовые тренировки', subject: 'personalnyy-trener', price: 50, unit: '8 тренировок' },
  ],
  pricesNote: 'Цены в долларах США. Точную стоимость в рублях тренер подскажет при записи.',
  formats: {
    online: true,
    atHome: [],
    travel: [],
    offline: ['Тбилиси — парки Мзиури и Ваке'],
    groups: true,
    groupsNote: 'на открытом воздухе в Тбилиси',
    trial: true,
    trialNote: 'Первая консультация — бесплатно',
  },
  telegram: 'https://t.me/kalashadasha',
  badges: ['КМС по лёгкой атлетике', 'Сертифицированный тренер'],
  rating: 0,
  reviewsCount: 2,
  reviewsNote: 'Отзывы перенесены с личного сайта тренера.',
  reviews: [
    {
      author: 'Марина',
      service: 'Онлайн-тренировки',
      text:
        'Я начала тренироваться после хирургической операции в онлайн-формате. Даша внимательно и постепенно наращивала физическую нагрузку. ' +
        'Спустя месяц мы дошли до 5 тренировок в неделю. Занятия проходят в приятной и ненавязчивой обстановке. Набор упражнений регулярно меняется ' +
        'и расширяется, что обеспечивает приятное разнообразие. Я достигла хорошей спортивной формы и не планирую останавливаться на достигнутом. ' +
        'Всем, кто хочет быть красивым и здоровым, очень рекомендую тренировки с Дашей!',
    },
    {
      author: 'Ирина',
      service: 'Персональные тренировки',
      text:
        'На мой взгляд, успех тренировки зависит на 50% от своей мотивации и на 50% от тренера. Очень многое зависит от общего настроя, вы с тренером ' +
        'должны быть на одной волне, заинтересованы в процессе и прогрессе. С самого первого занятия меня покорила Дарья своей вовлечённостью, терпением, ' +
        'внимательностью к технике выполнения, своей энергией и физической формой! Приятно смотреть и стремиться к лучшему на примере тренера. ' +
        'С помощью Дарьи я вернулась к регулярным тренировкам, пропускать не хочется, лень пропадает, появилась мотивация становиться лучше!',
    },
  ],
  gallery: [
    { src: '/img/darya-gallery-1.webp', small: '/img/darya-gallery-1-sm.webp', w: 552, h: 720, alt: 'Дарья Калашникова показывает выпад из планки на коврике' },
    { src: '/img/darya-gallery-2.webp', small: '/img/darya-gallery-2-sm.webp', w: 720, h: 710, alt: 'Растяжка на коврике в зале' },
    { src: '/img/darya-gallery-3.webp', small: '/img/darya-gallery-3-sm.webp', w: 489, h: 720, alt: 'Тренировка на стадионе' },
    { src: '/img/darya-gallery-4.webp', small: '/img/darya-gallery-4-sm.webp', w: 634, h: 720, alt: 'Выпад с поворотом корпуса на коврике' },
    { src: '/img/darya-gallery-5.webp', small: '/img/darya-gallery-5-sm.webp', w: 465, h: 720, alt: 'Разминка на беговой дорожке стадиона' },
    { src: '/img/darya-gallery-6.webp', small: '/img/darya-gallery-6-sm.webp', w: 720, h: 583, alt: 'Беговая тренировка на стадионе' },
  ],
};


// Анкета Евгении Шатовой — по её Instagram (shatova.fitmom): факты из её публикаций.
const SHATOVA = {
  slug: 'evgeniya-shatova',
  kind: 'trener',
  status: 'published',
  featured: true,
  headCoach: true,
  name: 'Евгения Шатова',
  role: 'Онлайн-тренер и тренер по позированию',
  headline: 'IFBB Pro Bikini, участница Olympia 2025. Тренирую онлайн и готовлю девушек к выходу на сцену',
  seoTitle: 'Евгения Шатова — онлайн-тренер, IFBB Pro Bikini, позирование',
  seoDescription:
    'IFBB Pro Bikini, участница Olympia 2025. Онлайн-ведение: тренировки и питание, позирование для фитнес-бикини, подготовка к соревнованиям. Онлайн и в Москве.',
  subjects: ['onlayn-trenirovki', 'pozirovanie-bikini', 'podgotovka-k-sorevnovaniyam', 'vosstanovlenie-posle-rodov', 'personalnyy-trener'],
  about:
    'Я спортсменка IFBB Pro в категории бикини, онлайн-тренер и мама двух дочерей. В спорт пришла в 2018 году — тогда я даже не знала, на что способна. ' +
    'Сегодня за плечами титулы абсолютной чемпионки и выход на сцену Olympia 2025 в Лас-Вегасе. ' +
    'Работаю дистанционно: консультации, тренировочный план и сопровождение по питанию. Научу правильно питаться и слышать свой организм, ' +
    'покажу, как заниматься дома, помогу восстановиться после родов. А тем, кто мечтает о сцене, — помогу подготовиться к старту и научу позировать.',
  quote: {
    text: 'Позирование — это не просто заученные связки, это умение рассказать историю своего тела без слов.',
    source: 'из публикации Евгении в Instagram',
  },
  focus: [
    'Похудение и рельеф',
    'Набор мышечной массы',
    'Тренировки в зале и дома',
    'Питание и сопровождение',
    'Восстановление после родов',
    'Позирование для фитнес-бикини',
    'Подготовка к соревнованиям',
  ],
  method: [
    'Знакомство: цель, опыт, здоровье и удобный формат',
    'Индивидуальный план тренировок и питания',
    'Техника по видео и обратная связь в мессенджере',
    'Регулярные отчёты и корректировка плана',
  ],
  posing: [
    'Работаю и с новичками, которые только делают первые шаги в фитнес-бикини, и с опытными спортсменками перед серьёзными стартами',
    'Без шаблонов: нахожу «ключики», которые подчёркивают сильные стороны фигуры',
    'Главная цель — не просто научить ходить по сцене, а раскрыть женственность и грацию',
    'Онлайн — гибкий график; офлайн — в студии в центре Москвы',
  ],
  achievements: [
    { title: 'Olympia 2025, Лас-Вегас — участница в категории Bikini', years: '2025' },
    { title: 'IFBB Pro League — профессиональный статус в категории Bikini', years: '' },
    { title: 'Grand Prix SN PRO (NBC Russia) — абсолютная чемпионка, 1 место в бикини до 167 см', years: '2021' },
    { title: 'Romania Muscle Fest Pro — 1 место Bikini Novice и абсолютное первенство новичков, 2 место Bikini class C', years: '2021' },
    { title: 'WFF Russia и NBC Russia Grand Prix 5 — абсолютные победы в бикини', years: '2021' },
    { title: 'Grand Prix Tula — абсолютная чемпионка в фитнес-бикини (новички)', years: '2019' },
    { title: 'Grand Prix NBC, Москва — бронза в фитнес-бикини до 164 см', years: '2019' },
    { title: 'Чемпионат России — вице-чемпионка', years: '2019' },
  ],
  experience: [
    { title: 'Онлайн-тренер: ведение, питание, восстановление после родов', years: '' },
    { title: 'Тренер по позированию для фитнес-бикини', years: '' },
    { title: 'В спорте с 2018 года; тренер — Юлия Жаркова, IFBB Pro', years: '' },
  ],
  services: [],
  formats: {
    online: true,
    atHome: [],
    travel: [],
    offline: ['Москва — студия позирования в центре'],
    trial: true,
    trialNote: 'Первая консультация — бесплатно',
  },
  instagram: 'https://www.instagram.com/shatova.fitmom/',
  badges: ['IFBB Pro Bikini', 'Olympia 2025', 'Мама двух дочерей'],
  rating: 0,
  reviewsCount: 0,
  reviews: [],
};

// Черновик анкеты Александра Ерохина: скрыт, пока не заполнен.
const EROKHIN = {
  slug: 'aleksandr-erokhin',
  kind: 'trener',
  status: 'hidden',
  name: 'Александр Ерохин',
  role: 'Персональный тренер',
  headline: '',
  about: '',
  subjects: ['personalnyy-trener', 'onlayn-trenirovki'],
  services: [],
  formats: { online: true, atHome: [], travel: [], offline: [] },
  reviews: [],
  reviewsCount: 0,
  rating: 0,
};

/*
 * Форматы и программы, которые продаются на сайте.
 * price: null — «стоимость по запросу» (кнопка ведёт на заявку), число — можно купить онлайн.
 * status: on_sale — продаётся; waitlist — «скоро», собираем предзапись; draft/hidden — не показываем.
 */
const OFFERS = [
  {
    slug: 'onlayn-vedenie',
    kind: 'service',
    order: 1,
    status: 'on_sale',
    trainer: 'evgeniya-shatova',
    direction: 'onlayn-trenirovki',
    title: 'Онлайн-ведение',
    short: 'Тренировки и питание под вашу цель — с ежедневной связью с тренером.',
    description:
      'Персональная работа онлайн из любого города. Составляю план тренировок для зала или дома и питание под вашу цель, разбираю технику по видео и веду вас каждый день в мессенджере.',
    includes: [
      'Анкета и созвон: цель, опыт, здоровье, график',
      'План тренировок для зала или дома',
      'Питание: рацион и рекомендации без жёстких запретов',
      'Разбор техники по вашим видео',
      'Обратная связь в мессенджере каждый день',
      'Еженедельный отчёт и корректировка плана',
    ],
    forWhom: ['Похудеть и подтянуть тело', 'Набрать мышечную массу', 'Восстановиться после родов', 'Вернуться к регулярным тренировкам'],
    packages: [
      { id: '1m', title: '1 месяц', price: null, accessDays: 30 },
      { id: '3m', title: '3 месяца', price: null, accessDays: 90 },
    ],
  },
  {
    slug: 'pozirovanie',
    kind: 'service',
    order: 2,
    status: 'on_sale',
    trainer: 'evgeniya-shatova',
    direction: 'pozirovanie-bikini',
    title: 'Позирование для фитнес-бикини',
    short: 'Индивидуальные занятия онлайн или в студии в центре Москвы.',
    description:
      'Дефиле, четвертные повороты, презентация и стойки — ставим позирование под вашу фигуру. Подходит и для первого старта, и для спортсменок, которые готовятся к серьёзным турнирам.',
    includes: [
      'Разбор сильных сторон фигуры и подбор стоек',
      'Дефиле и четвертные повороты',
      'Индивидуальная презентация под музыку',
      'Работа с лицом, взглядом и подачей',
      'Видеоразбор ваших прогонов между занятиями',
    ],
    forWhom: ['Новички перед первым стартом', 'Спортсменки перед серьёзным турниром', 'Фитнес-модели для съёмок'],
    packages: [
      { id: '1', title: '1 занятие', sessions: 1, price: null },
      { id: '4', title: '4 занятия', sessions: 4, price: null, accessDays: 60 },
      { id: '8', title: '8 занятий', sessions: 8, price: null, accessDays: 90 },
    ],
  },
  {
    slug: 'podgotovka-k-sorevnovaniyam',
    kind: 'service',
    order: 3,
    status: 'on_sale',
    trainer: 'evgeniya-shatova',
    direction: 'podgotovka-k-sorevnovaniyam',
    title: 'Подготовка к соревнованиям',
    short: 'От первых тренировок до выхода на сцену в фитнес-бикини.',
    description:
      'Сопровождение к старту: тренировки, питание, подводка к пиковой форме и позирование. Помогу выбрать турнир и категорию и буду рядом до выхода на сцену.',
    includes: [
      'Выбор турнира и категории',
      'Тренировки и питание на весь цикл подготовки',
      'Подводка к пиковой форме',
      'Позирование и презентация',
      'Советы по купальнику, загару и образу',
      'Поддержка в день старта',
    ],
    forWhom: ['Первый старт в фитнес-бикини', 'Спортсменки, которые хотят выйти в топ'],
    packages: [{ id: 'season', title: 'Сезон подготовки', price: null }],
  },
  {
    slug: 'trenirovki-v-zale',
    kind: 'program',
    order: 10,
    status: 'waitlist',
    trainer: 'evgeniya-shatova',
    direction: 'onlayn-trenirovki',
    title: 'Программа тренировок в зале',
    short: 'Готовый план на 8 недель с видео техники каждого упражнения.',
    description: 'Программа для самостоятельных тренировок в зале: недели, тренировки, подходы и повторения, видео техники.',
    includes: ['План на 8 недель', 'Видео техники упражнений', 'Доступ в личном кабинете'],
    packages: [{ id: 'access', title: 'Доступ к программе', price: null, accessDays: 180 }],
    modules: [],
  },
  {
    slug: 'trenirovki-doma',
    kind: 'program',
    order: 11,
    status: 'waitlist',
    trainer: 'evgeniya-shatova',
    direction: 'onlayn-trenirovki',
    title: 'Программа тренировок дома',
    short: 'Тренировки с минимальным инвентарём — для занятых и для мам.',
    description: 'Программа для дома: короткие тренировки с резинками и гантелями, которые легко встроить в день.',
    includes: ['План на 8 недель', 'Видео тренировок', 'Доступ в личном кабинете'],
    packages: [{ id: 'access', title: 'Доступ к программе', price: null, accessDays: 180 }],
    modules: [],
  },
  {
    slug: 'plan-pitaniya',
    kind: 'program',
    order: 12,
    status: 'waitlist',
    trainer: 'evgeniya-shatova',
    direction: 'onlayn-trenirovki',
    title: 'План питания',
    short: 'Рацион, список продуктов и правила, которые легко соблюдать.',
    description: 'Как питаться, чтобы худеть или набирать без срывов: рацион, замены продуктов и простые правила.',
    includes: ['Рацион и замены продуктов', 'Список покупок', 'Доступ в личном кабинете'],
    packages: [{ id: 'access', title: 'Доступ к программе', price: null, accessDays: 365 }],
    modules: [],
  },
  {
    slug: 'kurs-pozirovaniya',
    kind: 'program',
    order: 13,
    status: 'waitlist',
    trainer: 'evgeniya-shatova',
    direction: 'pozirovanie-bikini',
    title: 'Видеокурс по позированию',
    short: 'Базовое позирование бикини в записи — от стоек до дефиле.',
    description: 'Видеоуроки по позированию для фитнес-бикини: стойки, повороты, дефиле и подача.',
    includes: ['Видеоуроки', 'Разбор типичных ошибок', 'Доступ в личном кабинете'],
    packages: [{ id: 'access', title: 'Доступ к курсу', price: null, accessDays: 365 }],
    modules: [],
  },
];

// Версия стартовых данных. Документ, который ещё не правили в кабинете, обновляется
// при повышении версии; отредактированные вручную (editedAt) не трогаем.
const SEED_VERSION = 3;

async function upsert(col, key, data, now) {
  const cur = db.get(col, key);
  if (!cur) {
    await db.put(col, key, { ...data, seedVersion: SEED_VERSION, createdAt: now, updatedAt: now });
    console.log(`[seed] ${col}/${key} created`);
  } else if (!cur.editedAt && (cur.seedVersion || 0) < SEED_VERSION) {
    // Фото, загруженные через кабинет, сохраняем.
    const keep = {};
    for (const k of ['photo', 'photoSm', 'photoWidth', 'photoHeight', 'ogImage', 'cover', 'gallery', 'modules']) {
      if (cur[k] && (String(cur[k]).startsWith('/m/') || (Array.isArray(cur[k]) && cur[k].length))) keep[k] = cur[k];
    }
    await db.put(col, key, { ...data, ...keep, status: cur.status || data.status, seedVersion: SEED_VERSION, createdAt: cur.createdAt, updatedAt: now });
    console.log(`[seed] ${col}/${key} refreshed to v${SEED_VERSION}`);
  }
}

async function seed() {
  const now = new Date().toISOString();

  // Репетиторов больше нет: убираем анкету Руслана, его учётку и данные.
  if (db.get('specialists', 'ruslan-aliev')) {
    await db.del('specialists', 'ruslan-aliev');
    for (const u of db.filter('users', (x) => x.specialistId === 'ruslan-aliev')) await db.del('users', u.id);
    for (const l of db.filter('leads', (x) => x.specialistId === 'ruslan-aliev')) await db.del('leads', l.id);
    for (const v of db.filter('views', (x) => x.specialistId === 'ruslan-aliev')) await db.del('views', v.id);
    console.log('[seed] ruslan-aliev removed');
  }

  await upsert('specialists', SHATOVA.slug, SHATOVA, now);
  await upsert('specialists', DARIA.slug, DARIA, now);
  if (!db.get('specialists', EROKHIN.slug)) await upsert('specialists', EROKHIN.slug, EROKHIN, now);
  for (const o of OFFERS) await upsert('offers', o.slug, o, now);

  // Учётные записи создаются из переменных окружения при первом запуске.
  // Пароль потом меняется в кабинете — переменная больше не используется.
  const accounts = [
    { login: process.env.ADMIN_LOGIN || 'admin', password: process.env.ADMIN_PASSWORD, role: 'admin', name: 'Администратор', specialistId: null },
    { login: 'shatova', password: process.env.SHATOVA_PASSWORD, role: 'admin', name: 'Евгения Шатова', specialistId: SHATOVA.slug },
    { login: 'darya', password: process.env.DARYA_PASSWORD, role: 'specialist', name: 'Дарья Калашникова', specialistId: DARIA.slug },
    { login: 'erokhin', password: process.env.EROKHIN_PASSWORD, role: 'specialist', name: 'Александр Ерохин', specialistId: EROKHIN.slug },
  ];
  for (const a of accounts) {
    if (!a.password) continue;
    const id = a.login.toLowerCase();
    if (db.get('users', id)) continue;
    await db.put('users', id, {
      login: id,
      name: a.name,
      role: a.role,
      specialistId: a.specialistId,
      passwordHash: await hashPassword(a.password),
      createdAt: now,
    });
    console.log(`[seed] user ${id} created`);
  }
}

module.exports = { seed, SHATOVA, DARIA, EROKHIN, OFFERS };
