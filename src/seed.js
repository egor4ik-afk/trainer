'use strict';
const db = require('./db');
const { hashPassword } = require('./auth');

// Анкета Руслана Алиева — перенесена с Профи.ру (profi.ru/profile/AlievRG2).
const RUSLAN = {
  slug: 'ruslan-aliev',
  kind: 'repetitor',
  status: 'published',
  featured: true,
  name: 'Руслан Алиев',
  role: 'Репетитор по географии',
  headline: 'Учитель географии физтех-лицея им. П. Л. Капицы, выпускник геофака МГУ, высшая категория',
  seoTitle: 'Руслан Алиев — репетитор по географии в Москве, ОГЭ и ЕГЭ',
  seoDescription:
    'Учитель географии лицея им. Капицы, выпускник геофака МГУ, высшая категория. Подготовка к ОГЭ и ЕГЭ, 5–11 классы, онлайн и очно. От 1000 ₽ за час, рейтинг 5,0.',
  photo: '/img/ruslan-aliev.jpg',
  photoWebp: '/img/ruslan-aliev.webp',
  photoSquare: '/img/ruslan-aliev-square.jpg',
  photoSquareWebp: '/img/ruslan-aliev-square.webp',
  ogImage: '/img/og-ruslan-aliev.png',
  subjects: ['geografiya', 'oge-geografiya', 'ege-geografiya'],
  grades: '5–11 классы',
  about:
    'Преподаю географию в школе 8 лет. Окончил географический факультет МГУ имени М. В. Ломоносова. ' +
    'Готовлю учеников 7–11 классов к ОГЭ и ЕГЭ и помогаю подтянуть школьную программу.',
  results: [
    'ОГЭ-2026: 9 учеников — восемь «5» и одна «4», средний балл 28 из 31',
    'ЕГЭ-2025: средний балл 87 у трёх учеников',
    'Среди учеников — победители регионального этапа и призёры заключительного этапа ВСОШ по географии',
  ],
  method: [
    'Диагностика уровня и объёма работы на первом занятии',
    'Индивидуальный план подготовки под цель и срок',
    'Регулярные домашние задания по слабым темам с проверкой',
  ],
  education: [
    { title: 'МГУ им. М. В. Ломоносова, географический факультет, экология и природопользование', years: '2012–2018', verified: true },
    { title: 'Актион-МЦФЭР, программа «Психолого-педагогическая компетентность педагога»', years: '2020', verified: true },
    { title: 'Академия социального управления, программа «Реализация требований обновлённых ФГОС ООО, ФГОС СОО в работе учителя»', years: '2023', verified: true },
  ],
  experience: [
    { title: 'Учитель географии в АНОО «Физтех-лицей им. П. Л. Капицы»', years: 'с 2019', verified: true },
  ],
  achievements: [
    { title: 'Учитель высшей квалификационной категории, Министерство образования Московской области', years: '2025', verified: true },
    { title: 'Благодарность губернатора Московской области за многолетний добросовестный труд и вклад в обучение', years: '2024', verified: true },
  ],
  services: [
    { title: 'География: школьная программа', subject: 'geografiya', price: 1000, unit: '60 мин' },
    { title: 'Подготовка к ОГЭ по географии', subject: 'oge-geografiya', price: 1000, unit: '60 мин' },
    { title: 'Подготовка к ЕГЭ по географии', subject: 'ege-geografiya', price: 1200, unit: '60 мин' },
    { title: 'Групповые занятия (мини-группа)', subject: 'geografiya', price: 1200, unit: '60 мин' },
    { title: 'Проверка домашнего задания', subject: 'geografiya', price: 500, unit: '60 мин', extra: true },
  ],
  formats: {
    online: true,
    atHome: ['Долгопрудный'],
    travel: ['Москва', 'Лобня', 'Долгопрудный'],
    groups: true,
    trial: true,
  },
  badges: ['Паспорт проверен', 'Документы проверены', 'На Профи.ру с 2015 года'],
  experienceYears: 8,
  rating: 5.0,
  reviewsCount: 5,
  profiUrl: 'https://profi.ru/profile/AlievRG2/',
  reviews: [
    { author: 'Света Д.', date: '2022-06-29', service: 'ОГЭ по географии', rating: 5, text: 'Спасибо большое, всё отлично.', source: 'Профи.ру' },
    {
      author: 'Наталья',
      date: '2022-02-02',
      service: 'География',
      rating: 5,
      text: 'Состоялась только одна встреча, репетитор с ребёнком сразу нашёл общий язык, произвёл хорошее впечатление.',
      reply: 'Спасибо, Лера замечательная ученица, с увлечением осваивает предмет, внимательная и позитивная.',
      source: 'Профи.ру',
    },
    { author: 'Александр', date: '2019-06-26', service: 'География, ОГЭ по географии', rating: 5, text: 'Всё отлично.', source: 'Профи.ру' },
    { author: 'Андрей', date: '2019-05-15', service: 'География', rating: 5, text: '', source: 'Профи.ру' },
    { author: 'Михаил', date: '2019-05-07', service: 'География', rating: 5, text: '', source: 'Профи.ру' },
  ],
};

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

// Версия стартовых анкет. Если анкету ещё не правили в кабинете, при повышении версии
// она обновляется из этого файла; отредактированные вручную анкеты не трогаем.
const SEED_VERSION = 2;

async function upsertSeed(data, now) {
  const cur = db.get('specialists', data.slug);
  if (!cur) {
    await db.put('specialists', data.slug, { ...data, seedVersion: SEED_VERSION, createdAt: now, updatedAt: now });
    console.log(`[seed] specialist ${data.slug} created`);
  } else if (!cur.editedAt && (cur.seedVersion || 0) < SEED_VERSION) {
    await db.put('specialists', data.slug, { ...data, status: cur.status, seedVersion: SEED_VERSION, createdAt: cur.createdAt, updatedAt: now });
    console.log(`[seed] specialist ${data.slug} refreshed to v${SEED_VERSION}`);
  }
}

async function seed() {
  const now = new Date().toISOString();

  await upsertSeed(RUSLAN, now);
  await upsertSeed(DARIA, now);

  // Учётные записи создаются из переменных окружения при первом запуске.
  // Пароль потом меняется в кабинете — переменная больше не используется.
  const accounts = [
    { login: process.env.ADMIN_LOGIN || 'admin', password: process.env.ADMIN_PASSWORD, role: 'admin', name: 'Администратор', specialistId: null },
    { login: process.env.RUSLAN_LOGIN || 'ruslan', password: process.env.RUSLAN_PASSWORD, role: 'specialist', name: 'Руслан Алиев', specialistId: RUSLAN.slug },
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

module.exports = { seed, RUSLAN, DARIA };
