// Service worker: кэширует приложение и данные иероглифов для офлайн-работы
const CACHE = 'hanzi-trainer-v1';
const CORE = [
  './',
  './index.html',
  'https://cdn.jsdelivr.net/npm/hanzi-writer@3.6/dist/hanzi-writer.min.js',
  'https://cdn.jsdelivr.net/npm/pinyin-pro@3.29.4/dist/index.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Проходим «по сети с запасом в кэш», а иероглифы hanzi-writer-data кэшируем навечно
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

  e.respondWith(
    caches.match(e.request).then((hit) => {
      const fetched = fetch(e.request)
        .then((resp) => {
          if (resp.ok && (url.origin === location.origin || /jsdelivr|unpkg/.test(url.host))) {
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