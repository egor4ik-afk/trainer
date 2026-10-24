'use strict';
const { esc, ruDate, price, plural, page } = require('./layout');
const { LEAD_STATUSES, SUBJECTS, SITE, subjectBySlug } = require('../catalog');

const TABS = [
  { key: 'zayavki', title: 'Заявки' },
  { key: 'anketa', title: 'Анкета' },
  { key: 'statistika', title: 'Статистика' },
  { key: 'nastroyki', title: 'Настройки' },
];

function shell({ user, tab, body, title, flash }) {
  const tabs = [...TABS, ...(user.role === 'admin' ? [{ key: 'moderaciya', title: 'Модерация' }] : [])];
  return page({
    title: `${title} — личный кабинет | ${SITE.name}`,
    path: `/kabinet/${tab}`,
    noindex: true,
    user,
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
  <p class="muted">Для репетиторов и тренеров с анкетой на trainer.moscow.</p>
  ${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ''}
  <form method="post" action="/kabinet/vhod" class="form">
    <input type="hidden" name="next" value="${esc(next)}">
    <label>Логин<input name="login" required autocomplete="username" autocapitalize="none" value="${esc(l)}"></label>
    <label>Пароль<input name="password" type="password" required autocomplete="current-password"></label>
    <button class="btn btn-primary btn-block" type="submit">Войти</button>
  </form>
  <p class="center">Нет анкеты? <a href="/kabinet/registraciya">Создать</a></p>
</div></section>`,
  });
}

function register({ error, form = {} }) {
  const v = (k) => esc(form[k] || '');
  const kind = form.kind || 'repetitor';
  return page({
    title: `Создать анкету специалиста | ${SITE.name}`,
    description: 'Создайте анкету репетитора или тренера на trainer.moscow и получайте заявки от учеников в личном кабинете.',
    path: '/kabinet/registraciya',
    noindex: true,
    bodyClass: 'page-cab',
    body: `
<section class="block"><div class="wrap auth">
  <h1>Создать анкету</h1>
  <p class="muted">Анкета появится на сайте после проверки. Заявки от учеников будут приходить в личный кабинет.</p>
  ${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ''}
  <form method="post" action="/kabinet/registraciya" class="form">
    <fieldset class="seg"><legend>Кто вы</legend>
      <label><input type="radio" name="kind" value="repetitor"${kind === 'repetitor' ? ' checked' : ''}> Репетитор</label>
      <label><input type="radio" name="kind" value="trener"${kind === 'trener' ? ' checked' : ''}> Тренер</label>
    </fieldset>
    <label>Имя и фамилия<input name="name" required maxlength="80" autocomplete="name" value="${v('name')}"></label>
    <label>Предмет или направление<input name="role" required maxlength="80" placeholder="Репетитор по математике" value="${v('role')}"></label>
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
      const tel = /^[+\d][\d\s()-]{6,}$/.test(l.contact) ? `tel:${l.contact.replace(/[^\d+]/g, '')}` : /^@?[a-z0-9_]{4,}$/i.test(l.contact) ? `https://t.me/${l.contact.replace('@', '')}` : null;
      return `<li class="lead-item st-${l.status}">
  <div class="lead-top">
    <p class="lead-name">${esc(l.name)}</p>
    <p class="muted small">${ruDate(l.createdAt)}, ${new Date(l.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })}${user.role === 'admin' && specialistsById[l.specialistId] ? ` · для: ${esc(specialistsById[l.specialistId].name)}` : ''}</p>
  </div>
  <p class="lead-contact">${tel ? `<a href="${esc(tel)}">${esc(l.contact)}</a>` : esc(l.contact)}</p>
  <p class="small">${[subj ? subj.title : l.subject === 'other' ? 'Другое' : '', l.grade, l.format].filter(Boolean).map(esc).join(' · ')}</p>
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
  const publicUrl = `/${s.kind === 'trener' ? 'trenery' : 'repetitory'}/${s.slug}`;

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
    ${field('grades', 'Возраст учеников', s.grades, 'maxlength="60" placeholder="5–11 классы"')}
    ${field('photo', 'Фото (ссылка на изображение)', s.photo, 'maxlength="300"')}
  </div>
  ${area('headline', 'Коротко о главном', s.headline, 'одна фраза под именем', 2)}
  ${area('about', 'О себе', s.about, '', 5)}
  <fieldset class="checks"><legend>${s.kind === 'trener' ? 'Направления' : 'Предметы'}</legend>${SUBJECTS.filter((x) => x.kind === s.kind)
    .map((x) => `<label><input type="checkbox" name="subjects" value="${x.slug}"${(s.subjects || []).includes(x.slug) ? ' checked' : ''}> ${esc(x.title)}</label>`)
    .join('')}</fieldset>

  ${area('focus', 'С чем работаете', lines(s.focus, (x) => x), 'направления и запросы, каждое с новой строки')}

  <h2>Результаты и подход</h2>
  ${area('results', 'Результаты учеников', lines(s.results, (x) => x), 'каждый пункт с новой строки')}
  ${area('method', 'Как проходят занятия', lines(s.method, (x) => x), 'каждый шаг с новой строки')}

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

module.exports = { login, register, leads, anketa, stats, settings, moderation };
