// Service worker: кэширует приложение и данные иероглифов для офлайн-работы.
// Имя кэша привязано к номеру сборки: когда выходит новая версия, старый кэш
// автоматически удаляется при активации нового SW — на устройство не оседает
// устаревший index.html/библиотеки.
const VERSION = '1.8.18';
const CACHE = `hanzi-trainer-${VERSION}`;

const LIBS = [
  'https://cdn.jsdelivr.net/npm/hanzi-writer@3.6/dist/hanzi-writer.min.js',
  'https://cdn.jsdelivr.net/npm/pinyin-pro@3.29.4/dist/index.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(LIBS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Сеть с запасом в кэш:
// - index.html и sw-файлы — всегда пробуем сеть (чтобы не оставаться на старой версии приложения);
// - встроенные библиотеки и данные иероглифов — кэшируем навсегда (быстро + офлайн).
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  if (/hanzi-writer-data/.test(url.href)) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        const resp = await fetch(e.request);
        if (resp.ok) c.put(e.request, resp.clone());
        return resp;
      })
    );
    return;
  }

  // html/фреймы с того же origin — network-first: каждую перезагрузку сверяемся с сетью,
  // чтобы новая версия index.html появлялась без ручной чистки кэша.
  const sameOrigin = url.origin === location.origin;
  const isPage = e.request.mode === 'navigate' || (/\.html?$/.test(url.pathname) && sameOrigin);

  if (isPage) {
    e.respondWith(
      fetch(e.request)
        .then((resp) => {
          if (resp.ok) {
            const cl = resp.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', cl));
          }
          return resp;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((hit) => {
      const fetched = fetch(e.request)
        .then((resp) => {
          if (resp.ok && (sameOrigin || /jsdelivr|unpkg/.test(url.host))) {
            const cl = resp.clone();
            caches.open(CACHE).then((c) => c.put(e.request, cl));
          }
          return resp;
        })
        .catch(() => hit);
      return hit || fetched;
    })
  );
});