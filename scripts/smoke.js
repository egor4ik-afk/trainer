'use strict';
/*
 * Быстрая проверка: запускает сайт на временной базе, обходит страницы,
 * отправляет заявку, оформляет заказ, открывает доступ и проверяет кабинет.
 * Запуск: npm run check
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trainer-'));
const PASS = 'smoke-' + Math.random().toString(36).slice(2);

const env = { ...process.env, PORT: String(PORT), DATA_FILE: path.join(tmp, 'db.json'), MEDIA_DIR: path.join(tmp, 'media'), ADMIN_PASSWORD: PASS, DARYA_PASSWORD: PASS, NODE_ENV: 'development' };
delete env.DATABASE_URL;
delete env.YOOKASSA_SHOP_ID;
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
const post = (p, body, cookie) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) }, body: form(body), redirect: 'manual' });

(async () => {
  try {
    await waitUp();
    for (const [p, code, needle] of [
      ['/', 200, 'Евгения <span>Шатова</span>'],
      ['/programmy', 200, 'Онлайн-ведение'],
      ['/programmy/onlayn-vedenie', 200, '"@type":"Service"'],
      ['/programmy/trenirovki-v-zale', 200, 'Узнать о старте'],
      ['/trenery', 200, 'Дарья Калашникова'],
      ['/trenery/evgeniya-shatova', 200, 'ProfilePage'],
      ['/trenery/darya-kalashnikova', 200, 'Записаться к Дарье Калашниковой'],
      ['/trenery/aleksandr-erokhin', 404, ''],
      ['/zanyatiya', 200, 'Направления'],
      ['/zanyatiya/pozirovanie-bikini', 200, 'FAQPage'],
      ['/oferta', 200, 'Публичная оферта'],
      ['/politika', 200, '152-ФЗ'],
      ['/robots.txt', 200, 'User-agent: GPTBot'],
      ['/sitemap.xml', 200, '/programmy/onlayn-vedenie'],
      ['/llms.txt', 200, 'Евгения Шатова'],
      ['/llms-full.txt', 200, 'Olympia 2025'],
      ['/googlecee020f869c68a59.html', 200, 'google-site-verification'],
      ['/kabinet', 200, 'Вход в кабинет'],
      ['/net-takoy', 404, 'Такой страницы нет'],
    ]) {
      const r = await fetch(BASE + p, { redirect: 'manual' });
      const t = await r.text();
      ok(r.status === code && t.includes(needle), `${p} → ${r.status}`);
    }
    for (const [from, to] of [['/repetitory', '/trenery'], ['/repetitory/ruslan-aliev', '/trenery'], ['/zanyatiya/geografiya', '/programmy']]) {
      const r = await fetch(BASE + from, { redirect: 'manual' });
      ok(r.status === 301 && r.headers.get('location') === to, `${from} → 301 ${to}`);
    }
    const home = await (await fetch(BASE + '/')).text();
    ok(!/Руслан|репетитор/i.test(home), 'на главной нет репетиторов');
    ok(/<link rel="canonical" href="https:\/\/trainer\.moscow\/">/.test(home), 'canonical на главной');
    ok(home.includes('Instagram принадлежит компании Meta'), 'пометка про Meta в подвале');

    // заявка с главной
    const bad = await post('/zayavka', { specialist: 'evgeniya-shatova', from: 'home', name: 'Тест', contact: '12', consent: '1' });
    ok(bad.status === 400, 'заявка с плохим телефоном отклонена');
    const good = await post('/zayavka', { specialist: 'evgeniya-shatova', from: 'home', name: 'Анна', contact: '+7 900 123-45-67', goal: 'stage', message: 'Хочу на сцену', consent: '1' });
    ok(good.status === 303 && good.headers.get('location') === '/?sent=1#zapis', 'заявка с главной принята');
    const wait = await post('/predzapis', { offer: 'plan-pitaniya', contact: 'anna@example.com', consent: '1' });
    ok(wait.status === 303 && wait.headers.get('location').includes('wait=1'), 'предзапись на программу');

    // админ: цена, программа, уроки
    const admin = cookieOf(await post('/kabinet/vhod', { login: 'admin', password: PASS }));
    ok(admin.startsWith('tm_sess='), 'вход админа');
    const edit = await (await fetch(BASE + '/kabinet/formaty/plan-pitaniya', { headers: { cookie: admin } })).text();
    const csrf = (edit.match(/name="_csrf" value="([^"]+)"/) || [])[1];
    const save = await post(
      '/kabinet/formaty/plan-pitaniya',
      {
        _csrf: csrf,
        title: 'План питания',
        status: 'on_sale',
        trainer: 'evgeniya-shatova',
        direction: 'onlayn-trenirovki',
        order: '12',
        short: 'Рацион и правила',
        packages: 'access | Доступ на год | 2990 | 3990 | | 365',
        modules: '## Неделя 1\n### Как считать калории | https://www.youtube.com/watch?v=dQw4w9WgXcQ\nПервый абзац.\n\nВторой абзац.\n### Список продуктов\nТекст',
      },
      admin
    );
    ok(save.status === 303, 'программа сохранена с ценой и уроками');
    const offerPage = await (await fetch(BASE + '/programmy/plan-pitaniya')).text();
    ok(offerPage.includes('/zakaz/plan-pitaniya/access') && /2\s990\s₽/.test(offerPage), 'на странице программы есть «Купить» и цена');

    // покупка без онлайн-оплаты
    const buy = await post('/zakaz/plan-pitaniya/access', { name: 'Мария', phone: '+7 911 000-11-22', email: 'maria@example.com', password: 'secret123', consent: '1' });
    const client = cookieOf(buy);
    ok(buy.status === 303 && buy.headers.get('location').startsWith('/zakaz/status/') && client, 'заказ оформлен, ученик вошёл');
    const status = await (await fetch(BASE + buy.headers.get('location'), { headers: { cookie: client } })).text();
    ok(status.includes('Заказ принят'), 'страница статуса заказа');
    const locked = await fetch(BASE + '/kabinet/programma/plan-pitaniya', { headers: { cookie: client }, redirect: 'manual' });
    ok(locked.status === 303, 'до оплаты программа закрыта');
    const orders = await (await fetch(BASE + '/kabinet/zakazy', { headers: { cookie: admin } })).text();
    const orderId = (orders.match(/action="\/kabinet\/zakazy\/([0-9a-f]+)"/) || [])[1];
    const paid = await post(`/kabinet/zakazy/${orderId}`, { _csrf: csrf, status: 'paid' }, admin);
    ok(paid.status === 303, 'админ отметил оплату');
    const lesson = await (await fetch(BASE + '/kabinet/programma/plan-pitaniya', { headers: { cookie: client } })).text();
    ok(lesson.includes('youtube-nocookie.com/embed/dQw4w9WgXcQ') && lesson.includes('Второй абзац'), 'после оплаты урок открыт, видео встроено');
    const my = await (await fetch(BASE + '/kabinet/moi', { headers: { cookie: client } })).text();
    ok(my.includes('План питания') && my.includes('доступ до'), 'программа в «Моих программах»');
    const clientCab = await fetch(BASE + '/kabinet/zakazy', { headers: { cookie: client }, redirect: 'manual' });
    ok(clientCab.status === 404, 'ученику недоступны заказы');

    // фото: загрузка и выдача
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf000000020001e221bc330000000049454e44ae426082', 'hex');
    const up = await fetch(BASE + '/kabinet/media/upload?id=testphoto1&w=1&h=1&alt=test', { method: 'POST', headers: { cookie: admin, 'content-type': 'image/png', 'x-csrf-token': csrf }, body: png });
    ok(up.status === 200, 'фото загружено');
    const got = await fetch(BASE + '/m/testphoto1.png');
    ok(got.status === 200 && got.headers.get('content-type') === 'image/png', 'фото отдаётся');
    const noCsrf = await fetch(BASE + '/kabinet/media/upload?id=testphoto2&w=1&h=1', { method: 'POST', headers: { cookie: admin, 'content-type': 'image/png' }, body: png });
    ok(noCsrf.status === 403, 'без CSRF-токена фото не загрузить');

    // тренер Дарья
    const darya = cookieOf(await post('/kabinet/vhod', { login: 'darya', password: PASS }));
    const dl = await (await fetch(BASE + '/kabinet/zayavki', { headers: { cookie: darya } })).text();
    ok(!dl.includes('Анна'), 'тренер видит только свои заявки');
    const dz = await fetch(BASE + '/kabinet/formaty', { headers: { cookie: darya } });
    ok(dz.status === 404, 'тренеру недоступно редактирование форматов');
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
