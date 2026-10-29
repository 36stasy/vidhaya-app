/* Vidhaya: сначала сеть (чтобы обновления приходили сразу), без сети - последняя сохранённая копия.

   Починка офлайна 29.10.2026. Проверка «без сети» показала: после первого входа
   самой страницы в кэше НЕТ. Первый заход идёт мимо служебной части (её ещё
   нет), а кэш наполнялся только со второго открытия. Кто вошёл один раз - или
   нажал «Очистить и войти заново» - и потом остался без сети, видел «не удаётся
   открыть страницу». Теперь:
   1. страница кладётся в кэш сразу при установке служебной части;
   2. запись в кэш дожидается конца (waitUntil): страница весит 3 МБ, и айфон
      мог усыпить служебную часть раньше, чем копия дописалась;
   3. открытие со ссылки с хвостом (?utm=… из Телеграма) находит ту же копию;
   4. слабая сеть (вай-фай в самолёте, метро): если за 4 секунды сервер не
      начал отвечать, показываем сохранённую копию, а свежая докачивается
      в кэш сама и откроется в следующий раз. */
var CACHE = 'vidhaya-app-v1';
var WAIT_MS = 4000;
var SHELL = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
function noop() {}
function pageKey() { return self.registration.scope; }

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    var jobs = SHELL.map(function (u) {
      return fetch(new Request(u, { cache: 'reload' })).then(function (r) { if (r.ok) return c.put(u, r); })['catch'](noop);
    });
    jobs.push(fetch(new Request(pageKey(), { cache: 'reload' })).then(function (r) { if (r.ok) return c.put(pageKey(), r); })['catch'](noop));
    return Promise.all(jobs);
  }));
});
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var fonts = /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== self.location.origin && !fonts) return;
  /* Саму страницу всегда тянем мимо кэша браузера: иначе телефон может
     сутки держать старую версию и не узнать про починку. */
  var opts = (req.mode === 'navigate' || /\.(html|js|json|txt)$/.test(url.pathname)) ? { cache: 'reload' } : undefined;
  /* главная страница - одна копия, с каким бы хвостом её ни открыли */
  var isPage = req.mode === 'navigate' && (url.pathname === new URL(pageKey()).pathname || /\/index\.html$/.test(url.pathname));
  var key = isPage ? pageKey() : req;

  var put = null;
  var net = fetch(req, opts).then(function (res) {
    if (res && (res.ok || res.type === 'opaque')) {
      var copy = res.clone();
      put = caches.open(CACHE).then(function (c) { return c.put(key, copy); });
    }
    return res;
  });
  e.waitUntil(net.then(function () { return put; })['catch'](noop));

  function saved() {
    return caches.match(key, { ignoreSearch: req.mode === 'navigate' }).then(function (hit) {
      if (hit) return hit;
      if (req.mode === 'navigate') return caches.match(pageKey());
    });
  }
  function orError(r) { return r || Response.error(); }

  if (req.mode !== 'navigate') {
    e.respondWith(net['catch'](function () { return saved().then(orError); }));
    return;
  }
  e.respondWith(saved().then(function (hit) {
    if (!hit) return net['catch'](function () { return Response.error(); });
    return new Promise(function (resolve) {
      var t = setTimeout(function () { resolve(hit); }, WAIT_MS);
      net.then(function (res) {
        clearTimeout(t);
        resolve(res.status >= 500 ? hit : res);
      }, function () { clearTimeout(t); resolve(hit); });
    });
  }));
});

/* ===== Уведомления «Послание дня» =====
   Текст приходит с сервера уже готовым: телефон только показывает его.
   Нажатие открывает приложение, а если оно уже открыто - просто выводит наверх. */
self.addEventListener('push', function (e) {

  /* Красная точка на иконке. Приложение может быть закрыто - значит
     ставить её должна служебная часть, прямо при получении послания. */
  try { if (self.navigator && self.navigator.setAppBadge) self.navigator.setAppBadge(1); } catch (e) {}
  var d = { title: '✨ Послание дня', body: 'Послание дня уже ждёт.', url: 'https://app.vidhaya.ru/' };
  try { if (e.data) d = Object.assign(d, e.data.json()); } catch (err) {
    try { d.body = e.data.text() || d.body; } catch (e2) {}
  }
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: d.tag || 'vidhaya-day',
    renotify: true,
    data: { url: d.url }
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var target = (e.notification.data && e.notification.data.url) || 'https://app.vidhaya.ru/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf(self.location.origin) === 0 && 'focus' in list[i]) return list[i].focus();
    }
    return clients.openWindow(target);
  }));
});
