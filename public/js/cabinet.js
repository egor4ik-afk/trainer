// Медиатека в кабинете: уменьшаем фото в браузере и загружаем на сервер.
(function () {
  var box = document.querySelector('.media-up');
  if (!box) return;
  var csrf = box.getAttribute('data-csrf');
  var status = document.getElementById('media-status');
  var say = function (t) {
    status.textContent = t;
  };

  function newId() {
    var r = new Uint8Array(3);
    crypto.getRandomValues(r);
    return Date.now().toString(36) + Array.prototype.map.call(r, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  function encode(bitmap, maxW, maxSide, quality) {
    var scale = Math.min(1, maxW / bitmap.width, maxSide / Math.max(bitmap.width, bitmap.height));
    var w = Math.round(bitmap.width * scale);
    var h = Math.round(bitmap.height * scale);
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    return new Promise(function (resolve) {
      c.toBlob(function (b) {
        if (b && b.type === 'image/webp') return resolve({ blob: b, w: w, h: h });
        c.toBlob(function (j) { resolve({ blob: j, w: w, h: h }); }, 'image/jpeg', 0.86);
      }, 'image/webp', quality);
    });
  }

  function upload(id, img, alt) {
    var q = '?id=' + encodeURIComponent(id) + '&w=' + img.w + '&h=' + img.h + '&alt=' + encodeURIComponent(alt || '');
    return fetch('/kabinet/media/upload' + q, {
      method: 'POST',
      headers: { 'content-type': img.blob.type, 'x-csrf-token': csrf },
      body: img.blob,
      credentials: 'same-origin',
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || r.status); });
      return r.json();
    });
  }

  function processBlob(blob, alt) {
    return createImageBitmap(blob).then(function (bmp) {
      var id = newId();
      return encode(bmp, 1600, 1600, 0.84)
        .then(function (full) { return upload(id, full, alt); })
        .then(function () { return encode(bmp, 640, 1200, 0.8); })
        .then(function (sm) { return upload(id + '-sm', sm, alt); })
        .then(function () { return id; });
    });
  }

  function run(items, getBlob) {
    var done = 0;
    var failed = 0;
    var chain = Promise.resolve();
    items.forEach(function (item) {
      chain = chain.then(function () {
        say('Загружаю ' + (done + failed + 1) + ' из ' + items.length + '…');
        return getBlob(item)
          .then(function (b) { return processBlob(b.blob, b.alt); })
          .then(function () { done++; })
          .catch(function (e) { failed++; console.warn('media', e); });
      });
    });
    return chain.then(function () {
      say('Готово: ' + done + (failed ? ', не получилось: ' + failed : '') + '. Обновляю…');
      setTimeout(function () { location.reload(); }, 700);
    });
  }

  document.getElementById('media-files').addEventListener('change', function (e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    if (!files.length) return;
    run(files, function (f) { return Promise.resolve({ blob: f, alt: f.name.replace(/\.[^.]+$/, '') }); });
  });

  document.getElementById('media-import').addEventListener('click', function () {
    var urls = document.getElementById('media-urls').value.split(/\s+/).filter(function (u) { return /^https:\/\//.test(u); });
    var alt = document.getElementById('media-alt').value;
    if (!urls.length) return say('Вставьте хотя бы одну ссылку, начинающуюся с https://');
    run(urls, function (u) {
      return fetch(u, { mode: 'cors' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.blob();
      }).then(function (b) { return { blob: b, alt: alt }; });
    });
  });
})();
