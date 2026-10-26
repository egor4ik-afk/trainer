'use strict';
/*
 * Оплата через ЮKassa (API v3). Включается переменными YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY.
 * Без них заказ создаётся со статусом «ждёт оплаты», а администратор отмечает оплату в кабинете.
 *
 * Чеки 54-ФЗ: YOOKASSA_RECEIPT=1 добавляет чек к платежу (нужно, если касса подключена через ЮKassa).
 * YOOKASSA_VAT_CODE — код НДС для чека (по умолчанию 1 — без НДС).
 */
const crypto = require('crypto');

const API = 'https://api.yookassa.ru/v3';
const enabled = () => Boolean(process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY);
const authHeader = () => 'Basic ' + Buffer.from(`${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`).toString('base64');

async function call(method, path, body, idempotenceKey) {
  const headers = { Authorization: authHeader(), 'Content-Type': 'application/json' };
  if (idempotenceKey) headers['Idempotence-Key'] = idempotenceKey;
  const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(`ЮKassa ${r.status}: ${data.description || data.code || 'ошибка'}`);
    err.status = r.status;
    throw err;
  }
  return data;
}

const money = (n) => ({ value: Number(n).toFixed(2), currency: 'RUB' });

async function createPayment({ order, description, returnUrl }) {
  const body = {
    amount: money(order.amount),
    capture: true,
    confirmation: { type: 'redirect', return_url: returnUrl },
    description: description.slice(0, 128),
    metadata: { orderId: order.id },
  };
  if (process.env.YOOKASSA_RECEIPT === '1') {
    body.receipt = {
      customer: { email: order.customer.email },
      items: [
        {
          description: description.slice(0, 128),
          quantity: '1.00',
          amount: money(order.amount),
          vat_code: Number(process.env.YOOKASSA_VAT_CODE || 1),
          payment_mode: 'full_payment',
          payment_subject: 'service',
        },
      ],
    };
  }
  return call('POST', '/payments', body, `order-${order.id}-${crypto.randomBytes(4).toString('hex')}`);
}

const getPayment = (id) => call('GET', `/payments/${encodeURIComponent(id)}`);

module.exports = { enabled, createPayment, getPayment };
