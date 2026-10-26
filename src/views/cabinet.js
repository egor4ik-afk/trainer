'use strict';
const { esc, ruDate, price, plural, page } = require('./layout');
const { LEAD_STATUSES, ORDER_STATUSES, SUBJECTS, SITE, subjectBySlug, goalById } = require('../catalog');

const TABS = {
  client: [
    { key: 'moi', title: 'Мои программы' },
    { key: 'nastroyki', title: 'Настройки' },
  ],
  specialist: [
    { key: 'zayavki', title: 'Заявки' },
    { key: 'anketa', title: 'Анкета' },
    { key: 'media', title: 'Фото' },
    { key: 'statistika', title: 'Статистика' },
    { key: 'nastroyki', title: 'Настройки' },
  ],
  admin: [
    { key: 'zayavki', title: 'Заявки' },
    { key: 'zakazy', title: 'Заказы' },
    { key: 'formaty', title: 'Форматы и программы' },
    { key: 'anketa', title: 'Анкеты' },
    { key: 'media', title: 'Фото' },
    { key: 'statistika', title: 'Статистика' },
    { key: 'nastroyki', title: 'Настройки' },
    { key: 'moderaciya', title: 'Модерация' },
  ],
};

function shell({ user, tab, body, title, flash, scripts }) {
  const tabs = TABS[user.role] || TABS.specialist;
  return page({
    title: `${title} — личный кабинет | ${SITE.name}`,
    path: `/kabinet/${tab}`,
    noindex: true,
    user,
    scripts,
    bodyClass: 'page-cab',
    body: `
<div class="wrap cab">
  <div class="cab-head">
    <div>
      <p class="muted small">Личный кабинет</p>
      <p class="cab-user">${esc(user.name)}</p>
    </div>
    <form method="post" action="/kabinet/vyhod"><input type="hidden" name="_csrf" value="${esc(user.csrf)}"><button class="btn btn-ghost" type="submit">Выйти</button></form>
  </div>
  <nav class="cab-tabs" aria-label="Разделы кабинета">${tabs
    .map((t) => `<a href="/kabinet/${t.key}"${t.key === tab ? ' aria-current="page"' : ''}>${t.title}${t.badge ? ` <span class="badge">${t.badge}</span>` : ''}</a>`)
    .join('')}</nav>
  ${flash ? `<p class="flash" role="status">${esc(flash)}</p>` : ''}
  ${body}
</div>`,
  });
}

/* ---------- вход и регистрация ---------- */

function login({ error, login: l = '', next = '' }) {
  return page({
    title: `Вход в личный кабинет | ${SITE.name}`,
    path: '/kabinet',
    noindex: true,
    bodyClass: 'page-cab',
    body: `
<section class="block"><div class="wrap auth">
  <h1>Вход в кабинет</h1>
  <p class="muted">Для учеников — доступ к купленным программам. Для тренеров — заявки и анкета.</p>
  ${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ''}
  <form method="post" action="/kabinet/vhod" class="form">
    <input type="hidden" name="next" value="${esc(next)}">
    <label>Почта или логин<input name="login" required autocomplete="username" autocapitalize="none" value="${esc(l)}"></label>
    <label>Пароль<input name="password" type="password" required autocomplete="current-password"></label>
    <button class="btn btn-primary btn-block" type="submit">Войти</button>
  </form>
  <p class="center small">Кабинет ученика появляется после первой покупки. Тренерам: <a href="/kabinet/registraciya">создать анкету</a></p>
</div></section>`,
  });
}

function register({ error, form = {} }) {
  const v = (k) => esc(form[k] || '');
  const kind = 'trener';
  return page({
    title: `Создать анкету тренера | ${SITE.name}`,
    description: 'Создайте анкету тренера и получайте заявки от учеников в личном кабинете.',
    path: '/kabinet/registraciya',
    noindex: true,
    bodyClass: 'page-cab',
    body: `
<section class="block"><div class="wrap auth">
  <h1>Создать анкету</h1>
  <p class="muted">Анкета появится на сайте после проверки. Заявки от учеников будут приходить в личный кабинет.</p>
  ${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ''}
  <form method="post" action="/kabinet/registraciya" class="form">
    <input type="hidden" name="kind" value="${kind}">
    <label>Имя и фамилия<input name="name" required maxlength="80" autocomplete="name" value="${v('name')}"></label>
    <label>Специализация<input name="role" required maxlength="80" placeholder="Персональный фитнес-тренер" value="${v('role')}"></label>
    <label>Логин<input name="login" required minlength="3" maxlength="40" autocapitalize="none" autocomplete="username" placeholder="латиница, цифры, точка" value="${v('login')}"></label>
    <label>Пароль<input name="password" type="password" required minlength="8" autocomplete="new-password"></label>
    <label class="check"><input type="checkbox" name="consent" value="1" required> Согласен с <a href="/politika" target="_blank">политикой конфиденциальности</a></label>
    <button class="btn btn-primary btn-block" type="submit">Создать анкету</button>
  </form>
  <p class="center">Уже есть анкета? <a href="/kabinet">Войти</a></p>
</div></section>`,
  });
}

/* ---------- заявки ---------- */

function leads({ user, leads: list, filter, specialistsById, flash }) {
  const counts = Object.fromEntries(Object.keys(LEAD_STATUSES).map((k) => [k, list.filter((l) => l.status === k).length]));
  const shown = filter ? list.filter((l) => l.status === filter) : list;
  const filters = `<div class="filters"><a href="/kabinet/zayavki"${!filter ? ' aria-current="true"' : ''}>Все <span>${list.length}</span></a>${Object.entries(LEAD_STATUSES)
    .map(([k, t]) => `<a href="/kabinet/zayavki?status=${k}"${filter === k ? ' aria-current="true"' : ''}>${t} <span>${counts[k]}</span></a>`)
    .join('')}</div>`;

  const items = shown
    .map((l) => {
      const subj = subjectBySlug(l.subject);
      const goal = goalById(l.goal);
      const tel = /^[+\d][\d\s()-]{6,}$/.test(l.contact) ? `tel:${l.contact.replace(/[^\d+]/g, '')}` : /^@?[a-z0-9_]{4,}$/i.test(l.contact) ? `https://t.me/${l.contact.replace('@', '')}` : null;
      return `<li class="lead-item st-${l.status}">
  <div class="lead-top">
    <p class="lead-name">${esc(l.name)}</p>
    <p class="muted small">${l.type === 'waitlist' ? '<b>Предзапись</b> · ' : ''}${ruDate(l.createdAt)}, ${new Date(l.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })}${user.role === 'admin' && specialistsById[l.specialistId] ? ` · для: ${esc(specialistsById[l.specialistId].name)}` : ''}</p>
  </div>
  <p class="lead-contact">${tel ? `<a href="${esc(tel)}">${esc(l.contact)}</a>` : esc(l.contact)}</p>
  <p class="small">${[l.offerTitle, goal ? goal.title : l.goal === 'other' ? 'Другая цель' : '', subj ? subj.title : '', l.grade, l.format].filter(Boolean).map(esc).join(' · ')}</p>
  ${l.message ? `<p class="lead-msg">${esc(l.message)}</p>` : ''}
  <form method="post" action="/kabinet/zayavki/${esc(l.id)}" class="lead-actions">
    <input type="hidden" name="_csrf" value="${esc(user.csrf)}">
    ${Object.entries(LEAD_STATUSES)
      .map(([k, t]) => `<button type="submit" name="status" value="${k}" class="pill${l.status === k ? ' on' : ''}"${l.status === k ? ' aria-pressed="true"' : ''}>${t}</button>`)
      .join('')}
  </form>
</li>`;
    })
    .join('');

  return shell({
    user,
    tab: 'zayavki',
    title: 'Заявки',
    flash,
    body: `${filters}${
      shown.length
        ? `<ul class="leads">${items}</ul>`
        : `<div class="empty"><h2>${filter ? 'Здесь пусто' : 'Заявок пока нет'}</h2><p>Заявки из формы «Записаться» в вашей анкете появятся здесь.</p>${user.specialistId ? `<a class="btn btn-ghost" href="/kabinet/anketa">Проверить анкету</a>` : ''}</div>`
    }`,
  });
}

/* ---------- анкета ---------- */

const lines = (arr, fn) => (arr || []).map(fn).join('\n');

function anketa({ user, s, all, flash, error }) {
  if (!s) {
    return shell({ user, tab: 'anketa', title: 'Анкета', flash, body: `<div class="empty"><h2>Выберите анкету</h2><ul class="mod-list">${all.map((x) => `<li><a href="/kabinet/anketa?id=${esc(x.slug)}">${esc(x.name)}</a></li>`).join('')}</ul></div>` });
  }
  const f = s.formats || {};
  const field = (name, label, value, attrs = '') => `<label>${label}<input name="${name}" value="${esc(value || '')}" ${attrs}></label>`;
  const area = (name, label, value, hint, rows = 4) => `<label>${label}${hint ? `<span class="hint">${hint}</span>` : ''}<textarea name="${name}" rows="${rows}">${esc(value || '')}</textarea></label>`;
  const statusText = { published: 'Опубликована', review: 'На проверке', hidden: 'Скрыта' }[s.status] || s.status;
  const publicUrl = `/trenery/${s.slug}`;

  return shell({
    user,
    tab: 'anketa',
    title: 'Анкета',
    flash,
    body: `
${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ''}
<div class="cab-status">
  <p>Статус: <b>${esc(statusText)}</b></p>
  <a class="btn btn-ghost" href="${publicUrl}${s.status !== 'published' ? '?preview=1' : ''}" target="_blank">Открыть анкету</a>
</div>
${user.role === 'admin' && all.length > 1 ? `<p class="small">Другие анкеты: ${all.map((x) => `<a href="/kabinet/anketa?id=${esc(x.slug)}">${esc(x.name)}</a>`).join(', ')}</p>` : ''}
<form method="post" action="/kabinet/anketa" class="form form-wide">
  <input type="hidden" name="_csrf" value="${esc(user.csrf)}">
  <input type="hidden" name="id" value="${esc(s.slug)}">
  <h2>Основное</h2>
  <div class="form-grid">
    ${field('name', 'Имя и фамилия', s.name, 'required maxlength="80"')}
    ${field('role', 'Кто вы', s.role, 'required maxlength="80"')}
    ${field('photo', 'Фото (адрес из раздела «Фото»)', s.photo, 'maxlength="300" placeholder="/m/…webp"')}
    ${field('instagram', 'Instagram (необязательно)', s.instagram, 'maxlength="120" placeholder="https://www.instagram.com/…"')}
  </div>
  <p class="hint">Загрузите фото во вкладке «Фото» и вставьте сюда его адрес — размеры подставятся сами.</p>
  ${area('headline', 'Коротко о главном', s.headline, 'одна фраза под именем', 2)}
  ${area('about', 'О себе', s.about, '', 5)}
  <fieldset class="checks"><legend>${s.kind === 'trener' ? 'Направления' : 'Предметы'}</legend>${SUBJECTS.filter((x) => x.kind === s.kind)
    .map((x) => `<label><input type="checkbox" name="subjects" value="${x.slug}"${(s.subjects || []).includes(x.slug) ? ' checked' : ''}> ${esc(x.title)}</label>`)
    .join('')}</fieldset>

  ${area('focus', 'С чем работаете', lines(s.focus, (x) => x), 'направления и запросы, каждое с новой строки')}

  <h2>Результаты и подход</h2>
  ${area('results', 'Результаты учеников', lines(s.results, (x) => x), 'каждый пункт с новой строки')}
  ${area('method', 'Как проходит работа', lines(s.method, (x) => x), 'каждый шаг с новой строки')}
  ${area('reviews', 'Отзывы', lines(s.reviews, (x) => `${x.author} | ${x.service || ''} | ${x.text || ''}`), 'формат строки: Имя | услуга | текст отзыва', 4)}

  <h2>Услуги и цены</h2>
  ${area('services', 'Услуги', lines(s.services, (x) => `${x.title} | ${x.price}${x.unit && x.unit !== '60 мин' ? ` | ${x.unit}` : ''}`), 'формат строки: Название | цена | за что (по умолчанию «60 мин»); цена 0 — бесплатно', 6)}
  <label>Валюта цен<select name="currency">${[['RUB', 'Рубли, ₽'], ['USD', 'Доллары, $'], ['EUR', 'Евро, €']]
    .map(([k, t]) => `<option value="${k}"${(s.currency || 'RUB') === k ? ' selected' : ''}>${t}</option>`)
    .join('')}</select></label>

  <h2>Где занимаетесь</h2>
  <fieldset class="checks">
    <label><input type="checkbox" name="online" value="1"${f.online ? ' checked' : ''}> Онлайн</label>
    <label><input type="checkbox" name="groups" value="1"${f.groups ? ' checked' : ''}> Мини-группы</label>
    <label><input type="checkbox" name="trial" value="1"${f.trial ? ' checked' : ''}> Пробное занятие</label>
  </fieldset>
  <div class="form-grid">
    ${field('atHome', 'Принимаю у себя (города или районы через запятую)', (f.atHome || []).join(', '))}
    ${field('travel', 'Выезжаю (через запятую)', (f.travel || []).join(', '))}
  </div>

  <h2>Образование и опыт</h2>
  ${area('education', 'Образование', lines(s.education, (x) => `${x.title} | ${x.years || ''}`), 'формат строки: Учебное заведение, программа | годы')}
  ${area('experience', 'Опыт работы', lines(s.experience, (x) => `${x.title} | ${x.years || ''}`), 'формат строки: Должность и место | годы', 3)}
  ${area('achievements', 'Достижения', lines(s.achievements, (x) => `${x.title} | ${x.years || ''}`), 'формат строки: Награда | год', 3)}
  <h2>Контакты</h2>
  <div class="form-grid">
    ${field('telegram', 'Telegram для учеников (необязательно)', s.telegram, 'maxlength="100" placeholder="https://t.me/username"')}
    ${field('profiUrl', 'Анкета на Профи.ру (необязательно)', s.profiUrl, 'maxlength="200" placeholder="https://profi.ru/profile/..."')}
    ${field('offline', 'Очно (через запятую)', (f.offline || []).join(', '), 'maxlength="200" placeholder="Москва — студия в центре"')}
  </div>

  <div class="form-actions"><button class="btn btn-primary" type="submit">Сохранить анкету</button></div>
</form>`,
  });
}

/* ---------- статистика ---------- */

function stats({ user, days, leads: list, s }) {
  const views = days.reduce((a, d) => a + d.count, 0);
  const max = Math.max(1, ...days.map((d) => d.count));
  const by = (k) => list.filter((l) => l.status === k).length;
  const conv = views ? ((list.length / views) * 100).toFixed(1).replace('.', ',') : '0';
  return shell({
    user,
    tab: 'statistika',
    title: 'Статистика',
    body: `
<div class="metrics">
  <div><p class="muted small">Просмотры анкеты за 30 дней</p><p class="metric">${views}</p></div>
  <div><p class="muted small">Заявки за 30 дней</p><p class="metric">${list.length}</p></div>
  <div><p class="muted small">Заявки от просмотров</p><p class="metric">${conv}%</p></div>
  <div><p class="muted small">Начали заниматься</p><p class="metric">${by('done')}</p></div>
</div>
<h2>Просмотры по дням</h2>
<div class="bars" role="img" aria-label="Просмотры анкеты по дням за последние 30 дней, всего ${views}">
  ${days.map((d) => `<span title="${esc(ruDate(d.date))}: ${d.count}" style="--h:${Math.round((d.count / max) * 100)}%"></span>`).join('')}
</div>
<div class="bars-axis muted small"><span>${esc(ruDate(days[0].date))}</span><span>сегодня</span></div>
<h2>Заявки по статусам</h2>
<ul class="status-rows">${Object.entries(LEAD_STATUSES)
      .map(([k, t]) => `<li><span>${t}</span><b>${by(k)}</b></li>`)
      .join('')}</ul>
${s ? `<p class="muted small">Считаются просмотры страницы вашей анкеты на ${SITE.host}, без поисковых роботов.</p>` : ''}`,
  });
}

/* ---------- настройки ---------- */

function settings({ user, flash, error }) {
  return shell({
    user,
    tab: 'nastroyki',
    title: 'Настройки',
    flash,
    body: `
<form method="post" action="/kabinet/nastroyki" class="form auth-inline">
  <input type="hidden" name="_csrf" value="${esc(user.csrf)}">
  <h2>Сменить пароль</h2>
  ${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ''}
  <p class="muted small">Логин: ${esc(user.login)}</p>
  <label>Текущий пароль<input name="current" type="password" required autocomplete="current-password"></label>
  <label>Новый пароль<input name="password" type="password" required minlength="8" autocomplete="new-password"></label>
  <label>Повторите новый пароль<input name="password2" type="password" required minlength="8" autocomplete="new-password"></label>
  <button class="btn btn-primary" type="submit">Сменить пароль</button>
</form>`,
  });
}

/* ---------- модерация (админ) ---------- */

function moderation({ user, specialists, leadsCount, flash }) {
  const statusText = { published: 'Опубликована', review: 'На проверке', hidden: 'Скрыта' };
  return shell({
    user,
    tab: 'moderaciya',
    title: 'Модерация',
    flash,
    body: `
<p class="muted">Всего анкет: ${specialists.length}, заявок: ${leadsCount}.</p>
<ul class="mod-list">${specialists
      .map(
        (s) => `<li>
  <div><p><b>${esc(s.name)}</b> · ${esc(s.role || '')}</p><p class="muted small">${s.kind === 'trener' ? 'Тренер' : 'Репетитор'} · ${esc(statusText[s.status] || s.status)} · создана ${ruDate(s.createdAt)}</p></div>
  <div class="mod-actions">
    <a class="btn btn-ghost" href="/kabinet/anketa?id=${esc(s.slug)}">Редактировать</a>
    <form method="post" action="/kabinet/moderaciya/${esc(s.slug)}">
      <input type="hidden" name="_csrf" value="${esc(user.csrf)}">
      ${s.status === 'published' ? '<button class="btn btn-ghost" name="status" value="hidden">Скрыть</button>' : '<button class="btn btn-primary" name="status" value="published">Опубликовать</button>'}
    </form>
  </div>
</li>`
      )
      .join('')}</ul>`,
  });
}


/* ---------- ученик: мои программы ---------- */

function myPrograms({ user, items, orders }) {
  const orderRow = (o) => `<li><span>${esc(o.offerTitle)} — ${esc(o.packageTitle)}</span><span class="muted">${ruDate(o.createdAt)}</span><b>${price(o.amount)}</b><span class="st st-${o.status}">${esc(ORDER_STATUSES[o.status])}</span>${o.status === 'pending' && o.paymentUrl ? `<a href="${esc(o.paymentUrl)}">Оплатить</a>` : ''}</li>`;
  return shell({
    user,
    tab: 'moi',
    title: 'Мои программы',
    body: `
${
  items.length
    ? `<ul class="my-progs">${items
        .map(
          ({ offer, until }) => `<li>
      <div><p class="mp-title">${esc(offer.title)}</p><p class="muted small">${offer.kind === 'program' ? 'Программа' : 'Работа с тренером'}${until ? ` · доступ до ${ruDate(until)}` : ''}</p></div>
      ${offer.kind === 'program' ? `<a class="btn btn-primary" href="/kabinet/programma/${esc(offer.slug)}">Открыть</a>` : '<span class="muted small">Тренер свяжется с вами</span>'}
    </li>`
        )
        .join('')}</ul>`
    : `<div class="empty"><h2>Пока пусто</h2><p>Купленные программы и форматы появятся здесь.</p><a class="btn btn-primary" href="/programmy">Выбрать программу</a></div>`
}
${orders.length ? `<h2>Заказы</h2><ul class="order-list">${orders.map(orderRow).join('')}</ul>` : ''}`,
  });
}

// Ссылка на видео → адрес для встраивания (YouTube, Rutube, VK Видео, Kinescope).
function embedUrl(url) {
  const u = String(url || '').trim();
  let m;
  if ((m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/))) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
  if ((m = u.match(/rutube\.ru\/(?:video|shorts)\/([0-9a-f]{20,})/))) return `https://rutube.ru/play/embed/${m[1]}`;
  if ((m = u.match(/(?:vk\.com|vkvideo\.ru)\/video(-?\d+)_(\d+)/))) return `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}&hd=2`;
  if ((m = u.match(/kinescope\.io\/(?:embed\/)?([\w-]{6,})/))) return `https://kinescope.io/embed/${m[1]}`;
  return null;
}

function programView({ user, offer, lessonId }) {
  const all = (offer.modules || []).flatMap((m) => (m.lessons || []).map((l) => ({ ...l, module: m.title })));
  const cur = all.find((l) => l.id === lessonId) || all[0];
  const idx = cur ? all.indexOf(cur) : -1;
  const video = cur && cur.video ? embedUrl(cur.video) : null;
  return shell({
    user,
    tab: user.role === 'client' ? 'moi' : 'formaty',
    title: offer.title,
    body: `
<p class="small"><a href="/kabinet/moi">← Мои программы</a></p>
<h1 class="cab-h1">${esc(offer.title)}</h1>
${
  !all.length
    ? '<div class="empty"><h2>Материалы скоро появятся</h2><p>Тренер наполняет программу — загляните чуть позже.</p></div>'
    : `<div class="prog-view">
  <nav class="prog-nav" aria-label="Уроки">${(offer.modules || [])
    .map(
      (m) => `<p class="pn-mod">${esc(m.title)}</p><ol>${(m.lessons || [])
        .map((l) => `<li><a href="/kabinet/programma/${esc(offer.slug)}?urok=${esc(l.id)}"${cur && l.id === cur.id ? ' aria-current="page"' : ''}>${esc(l.title)}</a></li>`)
        .join('')}</ol>`
    )
    .join('')}</nav>
  <article class="lesson">
    <p class="muted small">${esc(cur.module)}</p>
    <h2>${esc(cur.title)}</h2>
    ${video ? `<div class="video"><iframe src="${esc(video)}" title="${esc(cur.title)}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen></iframe></div>` : cur.video ? `<p><a href="${esc(cur.video)}" target="_blank" rel="noopener">Смотреть видео</a></p>` : ''}
    ${(cur.text || '').split(/\n{2,}/).filter(Boolean).map((para) => `<p>${esc(para).replace(/\n/g, '<br>')}</p>`).join('')}
    <p class="lesson-nav">${idx > 0 ? `<a class="btn btn-ghost" href="/kabinet/programma/${esc(offer.slug)}?urok=${esc(all[idx - 1].id)}">Назад</a>` : ''}${idx < all.length - 1 ? `<a class="btn btn-primary" href="/kabinet/programma/${esc(offer.slug)}?urok=${esc(all[idx + 1].id)}">Следующий урок</a>` : ''}</p>
  </article>
</div>`
}`,
  });
}

/* ---------- админ: заказы ---------- */

function orders({ user, orders: list, flash, paymentsOn }) {
  return shell({
    user,
    tab: 'zakazy',
    title: 'Заказы',
    flash,
    body: `
${paymentsOn ? '' : '<p class="cab-status"><span>Онлайн-оплата не подключена: заказы приходят со статусом «Ждёт оплаты». Пришлите ученику ссылку на оплату и отметьте заказ оплаченным — доступ откроется автоматически.</span></p>'}
${
  list.length
    ? `<ul class="leads">${list
        .map(
          (o) => `<li class="lead-item st-${o.status === 'paid' ? 'done' : o.status === 'canceled' ? 'rejected' : 'new'}">
  <div class="lead-top"><p class="lead-name">${esc(o.customer.name)} — ${esc(o.offerTitle)}, ${esc(o.packageTitle)}</p><p class="muted small">${ruDate(o.createdAt)} · ${esc(o.id.slice(0, 8))}</p></div>
  <p class="lead-contact">${esc(o.customer.email)} · ${esc(o.customer.phone || '')}</p>
  <p class="small"><b>${price(o.amount)}</b> · ${esc(ORDER_STATUSES[o.status])}${o.paidAt ? ` ${ruDate(o.paidAt)}` : ''}${o.paymentId ? ` · ЮKassa ${esc(o.paymentId)}` : ''}</p>
  <form method="post" action="/kabinet/zakazy/${esc(o.id)}" class="lead-actions">
    <input type="hidden" name="_csrf" value="${esc(user.csrf)}">
    ${o.status !== 'paid' ? '<button class="pill" name="status" value="paid">Отметить оплаченным</button>' : ''}
    ${o.status === 'pending' ? '<button class="pill" name="status" value="canceled">Отменить</button>' : ''}
  </form>
</li>`
        )
        .join('')}</ul>`
    : '<div class="empty"><h2>Заказов пока нет</h2><p>Покупки форматов и программ появятся здесь.</p></div>'
}`,
  });
}

/* ---------- админ: форматы и программы ---------- */

const STATUS_TITLES = { on_sale: 'Продаётся', waitlist: 'Скоро (предзапись)', draft: 'Черновик', hidden: 'Скрыт' };

function offersList({ user, offers, flash }) {
  return shell({
    user,
    tab: 'formaty',
    title: 'Форматы и программы',
    flash,
    body: `
<ul class="mod-list">${offers
      .map(
        (o) => `<li><div><p><b>${esc(o.title)}</b></p><p class="muted small">${o.kind === 'program' ? 'Программа' : 'Формат'} · ${esc(STATUS_TITLES[o.status] || o.status)} · ${(o.packages || []).map((p) => `${esc(p.title)}: ${typeof p.price === 'number' && p.price > 0 ? price(p.price) : 'по запросу'}`).join('; ')}</p></div>
  <div class="mod-actions"><a class="btn btn-ghost" href="/programmy/${esc(o.slug)}" target="_blank">На сайте</a><a class="btn btn-primary" href="/kabinet/formaty/${esc(o.slug)}">Редактировать</a></div></li>`
      )
      .join('')}</ul>
<h2>Добавить</h2>
<form method="post" action="/kabinet/formaty" class="form form-wide">
  <input type="hidden" name="_csrf" value="${esc(user.csrf)}">
  <div class="form-grid">
    <label>Название<input name="title" required maxlength="120"></label>
    <label>Тип<select name="kind"><option value="program">Программа (доступ в кабинете)</option><option value="service">Формат работы с тренером</option></select></label>
  </div>
  <button class="btn btn-primary" type="submit">Создать черновик</button>
</form>`,
  });
}

const modulesToText = (mods) =>
  (mods || [])
    .map((m) => [`## ${m.title}`, ...(m.lessons || []).map((l) => `### ${l.title}${l.video ? ` | ${l.video}` : ''}${l.text ? `\n${l.text}` : ''}`)].join('\n'))
    .join('\n\n');

function offerEdit({ user, o, trainers, directions, flash, error }) {
  const field = (name, label, value, attrs = '') => `<label>${label}<input name="${name}" value="${esc(value == null ? '' : value)}" ${attrs}></label>`;
  const area = (name, label, value, hint, rows = 4) => `<label>${label}${hint ? `<span class="hint">${hint}</span>` : ''}<textarea name="${name}" rows="${rows}">${esc(value || '')}</textarea></label>`;
  const pkgLine = (p) => [p.id, p.title, p.price == null ? '' : p.price, p.oldPrice || '', p.sessions || '', p.accessDays || '', p.note || ''].join(' | ');
  return shell({
    user,
    tab: 'formaty',
    title: o.title,
    flash,
    body: `
<p class="small"><a href="/kabinet/formaty">← Все форматы и программы</a> · <a href="/programmy/${esc(o.slug)}" target="_blank">Открыть на сайте</a>${o.kind === 'program' ? ` · <a href="/kabinet/programma/${esc(o.slug)}">Предпросмотр уроков</a>` : ''}</p>
${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ''}
<form method="post" action="/kabinet/formaty/${esc(o.slug)}" class="form form-wide">
  <input type="hidden" name="_csrf" value="${esc(user.csrf)}">
  <div class="form-grid">
    ${field('title', 'Название', o.title, 'required maxlength="120"')}
    <label>Статус<select name="status">${Object.entries(STATUS_TITLES).map(([k, t]) => `<option value="${k}"${o.status === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    <label>Тренер<select name="trainer">${trainers.map((t) => `<option value="${esc(t.slug)}"${o.trainer === t.slug ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
    <label>Направление<select name="direction"><option value="">—</option>${directions.map((d) => `<option value="${d.slug}"${o.direction === d.slug ? ' selected' : ''}>${esc(d.title)}</option>`).join('')}</select></label>
    ${field('order', 'Порядок в списке', o.order, 'type="number" min="0" max="999"')}
    ${field('cover', 'Обложка (адрес из раздела «Фото»)', o.cover, 'maxlength="200" placeholder="/m/…webp"')}
  </div>
  ${area('short', 'Коротко', o.short, 'одна фраза для списка', 2)}
  ${area('description', 'Описание', o.description, '', 4)}
  ${area('includes', 'Что входит', (o.includes || []).join('\n'), 'каждый пункт с новой строки')}
  ${area('forWhom', 'Кому подойдёт', (o.forWhom || []).join('\n'), 'каждый пункт с новой строки', 3)}
  ${area('packages', 'Тарифы', (o.packages || []).map(pkgLine).join('\n'), 'формат строки: код | название | цена | старая цена | занятий | дней доступа | примечание. Пустая цена — «по запросу», кнопки «Купить» не будет', 4)}
  ${
    o.kind === 'program'
      ? area(
          'modules',
          'Уроки программы',
          modulesToText(o.modules),
          '«## Модуль» — новый модуль; «### Урок | ссылка на видео» — новый урок (YouTube, Rutube, VK Видео, Kinescope); строки ниже — текст урока',
          14
        )
      : ''
  }
  <div class="form-grid">
    ${field('seoTitle', 'Заголовок для поисковиков', o.seoTitle, 'maxlength="70"')}
    ${field('seoDescription', 'Описание для поисковиков', o.seoDescription, 'maxlength="170"')}
  </div>
  <div class="form-actions"><button class="btn btn-primary" type="submit">Сохранить</button></div>
</form>`,
  });
}

/* ---------- фото ---------- */

function mediaPage({ user, items, flash }) {
  return shell({
    user,
    tab: 'media',
    title: 'Фото',
    flash,
    scripts: ['/js/cabinet.js'],
    body: `
<div class="media-up" data-csrf="${esc(user.csrf)}">
  <h2>Загрузить</h2>
  <p class="hint">Фото уменьшаются и сжимаются прямо в браузере: большая версия до 1600 px и маленькая до 640 px.</p>
  <label class="file-drop">Выберите фото<input type="file" id="media-files" accept="image/*" multiple></label>
  <details class="media-import"><summary>Загрузить по ссылкам</summary>
    <label>Ссылки на изображения, по одной в строке; подпись можно добавить через « | »<textarea id="media-urls" rows="4"></textarea></label>
    <label>Подпись (alt) для всех<input id="media-alt" maxlength="200"></label>
    <button class="btn btn-ghost" type="button" id="media-import">Загрузить по ссылкам</button>
  </details>
  <p id="media-status" class="small" role="status"></p>
</div>
<h2>Медиатека <span class="muted">${items.length}</span></h2>
<ul class="media-grid">${items
      .map(
        (m) => `<li>
  <img src="/m/${esc(m.id)}-sm.${m.mime === 'image/jpeg' ? 'jpg' : m.mime === 'image/png' ? 'png' : 'webp'}" alt="${esc(m.alt)}" loading="lazy" width="${m.width || 200}" height="${m.height || 200}">
  <input readonly value="/m/${esc(m.id)}.${m.mime === 'image/jpeg' ? 'jpg' : m.mime === 'image/png' ? 'png' : 'webp'}" aria-label="Адрес фото" onclick="this.select()">
  <p class="muted small">${m.width}×${m.height} · ${Math.round(m.bytes / 1024)} КБ</p>
  <form method="post" action="/kabinet/media/${esc(m.id)}/udalit"><input type="hidden" name="_csrf" value="${esc(user.csrf)}"><button class="pill" type="submit">Удалить</button></form>
</li>`
      )
      .join('')}</ul>`,
  });
}

module.exports = { login, register, leads, anketa, stats, settings, moderation, myPrograms, programView, orders, offersList, offerEdit, mediaPage, embedUrl };
