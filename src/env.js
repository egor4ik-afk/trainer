'use strict';
/*
 * Необязательные настройки из переменных окружения.
 *
 * Читаем только через process.env[name]: для записи через точку RelaxDev
 * подставляет заглушку, если переменной нет в настройках проекта, и значение
 * по умолчанию тогда не срабатывает. Пустая строка считается «не задано».
 */
function env(name, fallback = '') {
  const v = process.env[name];
  if (v === undefined || v === null) return fallback;
  const s = String(v).trim();
  return s === '' ? fallback : s;
}

module.exports = { env };
