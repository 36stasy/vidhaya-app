/* Vidhaya: сначала сеть (чтобы обновления приходили сразу), без сети - последняя сохранённая копия. */
var CACHE = 'vidhaya-app-v1';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var fonts = /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== self.location.origin && !fonts) return;
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && (res.ok || res.type === 'opaque')) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('./').then(function (r) { return r || caches.match('index.html'); });
        return Response.error();
      });
    })
  );
});

/* ===== Уведомления «Послание дня» =====
   Текст приходит с сервера уже готовым: телефон только показывает его.
   Нажатие открывает приложение, а если оно уже открыто - просто выводит наверх. */
self.addEventListener('push', function (e) {
  var d = { title: 'Vidhaya', body: 'Послание дня уже ждёт.', url: 'https://app.vidhaya.ru/' };
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
