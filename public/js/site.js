// Убираем служебные параметры (?sent=1, ?wait=1, ?cel=…) из адреса, чтобы ссылку можно было пересылать.
(function () {
  if (!history.replaceState || !location.search) return;
  var p = new URLSearchParams(location.search);
  var changed = false;
  ['sent', 'wait', 'cel'].forEach(function (k) {
    if (p.has(k)) { p.delete(k); changed = true; }
  });
  if (changed) {
    var q = p.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
  }
})();
