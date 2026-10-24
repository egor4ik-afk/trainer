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

async function seed() {
  const now = new Date().toISOString();

  if (!db.get('specialists', RUSLAN.slug)) {
    await db.put('specialists', RUSLAN.slug, { ...RUSLAN, createdAt: now, updatedAt: now });
    console.log('[seed] specialist ruslan-aliev created');
  }

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

module.exports = { seed, RUSLAN };
