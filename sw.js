/* ═══════════ SERVICE WORKER — Offline Cache ═══════════ */
const CACHE_NAME = 'kpssbm-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/animations.css',
  './css/screens.css',
  './css/theme-light.css',
  './js/core/config.js',
  './js/core/utils.js',
  './js/core/storage.js',
  './js/core/ui.js',
  './js/core/sound.js',
  './js/core/theme.js',
  './js/core/api.js',
  './js/site/home.js',
  './js/site/subject.js',
  './js/site/quiz.js',
  './js/site/lesson.js',
  './js/site/exam.js',
  './js/site/favorites.js',
  './js/site/wrongs.js',
  './js/site/stats.js',
  './js/site/keyboard.js',
  './js/site/main.js',
  './manifest.json',
  './icons/icon.svg'
];

/* Kurulum — statik dosyaları cache'le */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS).catch(err => console.warn('Bazı dosyalar cache\'lenemedi:', err)))
      .then(() => self.skipWaiting())
  );
});

/* Aktivasyon — eski cache'leri temizle */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* Fetch — GitHub raw / jsdelivr için network, diğerleri için cache-first */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API / data dosyaları → network-first (güncel kalsın)
  if(url.hostname === 'raw.githubusercontent.com' ||
     url.hostname === 'cdn.jsdelivr.net' ||
     url.hostname === 'api.github.com'){
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Google Fonts → cache-first ama yine de ağ varsa dene
  if(url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')){
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return res;
      }))
    );
    return;
  }

  // Diğer statik dosyalar → cache-first, yoksa network
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      // Sadece başarılı GET isteklerini cache'le
      if(e.request.method === 'GET' && res.ok && res.status === 200){
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
