// Убираем служебный ?sent=1 из адреса после отправки заявки, чтобы ссылку можно было пересылать.
(function () {
  if (location.search.indexOf('sent=1') > -1 && history.replaceState) {
    history.replaceState(null, '', location.pathname + location.hash);
  }
})();
