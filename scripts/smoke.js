'use strict';
/*
 * Быстрая проверка: запускает сайт на временной базе, обходит страницы,
 * отправляет заявку и проверяет кабинет. Запуск: npm run check
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trainer-'));
const PASS = 'smoke-' + Math.random().toString(36).slice(2);

const env = { ...process.env, PORT: String(PORT), DATA_FILE: path.join(tmp, 'db.json'), ADMIN_PASSWORD: PASS, RUSLAN_PASSWORD: PASS, NODE_ENV: 'development' };
delete env.DATABASE_URL;
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: ['ignore', 'pipe', 'inherit'] });

let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failed++;
};

async function waitUp() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(BASE + '/healthz');
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server did not start');
}

const form = (o) => new URLSearchParams(o).toString();
const cookieOf = (r) => (r.headers.get('set-cookie') || '').split(';')[0];

(async () => {
  try {
    await waitUp();
    for (const [p, code, needle] of [
      ['/', 200, 'Руслан Алиев'],
      ['/repetitory', 200, 'Репетиторы в Москве'],
      ['/trenery', 200, 'Дарья Калашникова'],
      ['/trenery/darya-kalashnikova', 200, 'Фото с тренировок'],
      ['/zanyatiya/onlayn-trenirovki', 200, 'FAQPage'],
      ['/llms.txt', 200, '## Специалисты'],
      ['/llms-full.txt', 200, 'Услуги и цены:'],
      ['/googlecee020f869c68a59.html', 200, 'google-site-verification: googlecee020f869c68a59.html'],
      ['/zanyatiya', 200, 'Занятия и цены'],
      ['/zanyatiya/ege-geografiya', 200, 'Подготовка к ЕГЭ по географии'],
      ['/repetitory/ruslan-aliev', 200, 'ProfilePage'],
      ['/politika', 200, '152-ФЗ'],
      ['/robots.txt', 200, 'Sitemap: https://trainer.moscow/sitemap.xml'],
      ['/sitemap.xml', 200, '/repetitory/ruslan-aliev'],
      ['/kabinet', 200, 'Вход в кабинет'],
      ['/net-takoy', 404, 'Такой страницы нет'],
    ]) {
      const r = await fetch(BASE + p, { redirect: 'manual' });
      const t = await r.text();
      ok(r.status === code && t.includes(needle), `${p} → ${r.status}`);
    }
    const trenery = await (await fetch(BASE + '/trenery')).text();
    ok(!trenery.includes('noindex') && trenery.includes('$12'), '/trenery открыта для индексации, цены в долларах');
    const daria = await (await fetch(BASE + '/trenery/darya-kalashnikova')).text();
    ok(daria.includes('Записаться к Дарье Калашниковой') && daria.includes('https://t.me/kalashadasha') && !/instagram/i.test(daria), 'анкета Дарьи: падеж, Telegram, без Instagram');
    ok(daria.includes('<style>') && !daria.includes('rel="stylesheet"'), 'стили встроены в страницу');
    const robots = await (await fetch(BASE + '/robots.txt')).text();
    ok(robots.includes('User-agent: GPTBot') && robots.includes('User-agent: ClaudeBot') && robots.includes('User-agent: YandexAdditional'), 'robots.txt открыт для AI-ботов');
    const home = await (await fetch(BASE + '/')).text();
    ok(/<link rel="canonical" href="https:\/\/trainer\.moscow\/">/.test(home), 'canonical на главной');
    ok(home.includes('og:image'), 'og:image на главной');
    const r301 = await fetch(BASE + '/repetitory/', { redirect: 'manual' });
    ok(r301.status === 301 && r301.headers.get('location') === '/repetitory', 'слеш в конце → 301');

    // заявка
    const bad = await fetch(BASE + '/zayavka', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ specialist: 'ruslan-aliev', name: 'Тест', contact: '12', consent: '1' }), redirect: 'manual' });
    ok(bad.status === 400, 'заявка с плохим телефоном отклонена');
    const good = await fetch(BASE + '/zayavka', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ specialist: 'ruslan-aliev', name: 'Мама Пети', contact: '+7 900 123-45-67', subject: 'oge-geografiya', grade: '9 класс', format: 'онлайн', message: 'Проверка', consent: '1' }), redirect: 'manual' });
    ok(good.status === 303 && good.headers.get('location').includes('sent=1'), 'заявка принята');

    // кабинет
    const badLogin = await fetch(BASE + '/kabinet/vhod', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ login: 'ruslan', password: 'wrong' }), redirect: 'manual' });
    ok(badLogin.status === 401, 'неверный пароль не пускает');
    const login = await fetch(BASE + '/kabinet/vhod', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ login: 'ruslan', password: PASS }), redirect: 'manual' });
    const cookie = cookieOf(login);
    ok(login.status === 303 && cookie.startsWith('tm_sess='), 'вход Руслана');
    const leads = await (await fetch(BASE + '/kabinet/zayavki', { headers: { cookie } })).text();
    ok(leads.includes('Мама Пети') && leads.includes('tel:+79001234567'), 'заявка видна в кабинете');
    const csrf = (leads.match(/name="_csrf" value="([^"]+)"/) || [])[1];
    const leadId = (leads.match(/action="\/kabinet\/zayavki\/([^"]+)"/) || [])[1];
    const upd = await fetch(BASE + `/kabinet/zayavki/${leadId}`, { method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: form({ _csrf: csrf, status: 'in_work' }), redirect: 'manual' });
    ok(upd.status === 303, 'смена статуса заявки');
    const noCsrf = await fetch(BASE + `/kabinet/zayavki/${leadId}`, { method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: form({ status: 'done' }), redirect: 'manual' });
    ok(noCsrf.status === 403, 'без CSRF-токена отказ');
    for (const p of ['/kabinet/anketa', '/kabinet/statistika', '/kabinet/nastroyki']) {
      const r = await fetch(BASE + p, { headers: { cookie } });
      ok(r.status === 200, `${p} → ${r.status}`);
    }
    const mod = await fetch(BASE + '/kabinet/moderaciya', { headers: { cookie } });
    ok(mod.status === 404, 'модерация недоступна специалисту');

    // регистрация нового специалиста
    const reg = await fetch(BASE + '/kabinet/registraciya', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ kind: 'trener', name: 'Анна Смирнова', role: 'Тренер по плаванию', login: 'anna', password: 'password123', consent: '1' }), redirect: 'manual' });
    ok(reg.status === 303, 'регистрация тренера');
    const hidden = await fetch(BASE + '/trenery/anna-smirnova');
    ok(hidden.status === 404, 'анкета на проверке не видна посетителям');
    const admin = cookieOf(await fetch(BASE + '/kabinet/vhod', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ login: 'admin', password: PASS }), redirect: 'manual' }));
    const modPage = await (await fetch(BASE + '/kabinet/moderaciya', { headers: { cookie: admin } })).text();
    const acsrf = (modPage.match(/name="_csrf" value="([^"]+)"/) || [])[1];
    await fetch(BASE + '/kabinet/moderaciya/anna-smirnova', { method: 'POST', headers: { cookie: admin, 'content-type': 'application/x-www-form-urlencoded' }, body: form({ _csrf: acsrf, status: 'published' }), redirect: 'manual' });
    const shown = await fetch(BASE + '/trenery/anna-smirnova');
    ok(shown.status === 200, 'после публикации анкета видна');
    const tr2 = await (await fetch(BASE + '/trenery')).text();
    ok(tr2.includes('Анна Смирнова'), 'новый тренер появился в разделе');
  } catch (err) {
    console.error(err);
    failed++;
  } finally {
    await new Promise((r) => {
      srv.once('exit', r);
      srv.kill();
    });
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {}
    console.log(failed ? `\n${failed} проверок не прошло` : '\nВсе проверки пройдены');
    process.exit(failed ? 1 : 0);
  }
})();
