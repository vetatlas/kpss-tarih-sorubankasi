/* ═══════════ SERVICE WORKER — Auto Update (Network-First) ═══════════
   ✅ Her açılışta güncel içerik alınır (internet varsa)
   ✅ İnternet yoksa cache'ten çalışır (offline destek)
   ✅ sw.js'i elle güncellemene gerek yok — sadece dosyaları push et
   ════════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'kpssbm-cache-v2';   // ⚠️ v1 → v2 (ESKİ CACHE SİLİNİR)

/* Kurulum — hemen devreye gir */
self.addEventListener('install', e => {
  self.skipWaiting();
});

/* Aktivasyon — eski cache'leri temizle */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* Fetch — akıllı strateji */
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // Sadece GET isteklerini işle
  if(req.method !== 'GET') return;

  // ═══ 1) Fontlar + görseller → CACHE-FIRST
  const isFont = url.hostname.includes('fonts.googleapis.com') ||
                 url.hostname.includes('fonts.gstatic.com');
  const isImage = url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|eot)$/i);

  if(isFont || isImage){
    e.respondWith(
      caches.match(req).then(cached => {
        if(cached) return cached;
        return fetch(req).then(res => {
          if(res.ok) caches.open(CACHE_NAME).then(c => c.put(req, res.clone()));
          return res;
        });
      })
    );
    return;
  }

  // ═══ 2) Diğer her şey → NETWORK-FIRST
  e.respondWith(
    fetch(req)
      .then(res => {
        if(res.ok && res.status === 200){
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return res;
      })
      .catch(() => {
        return caches.match(req).then(cached => {
          if(cached) return cached;
          if(req.mode === 'navigate') return caches.match('./index.html');
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

/* Yeni SW devreye girdiğinde sayfaya bildir */
self.addEventListener('message', e => {
  if(e.data === 'SKIP_WAITING') self.skipWaiting();
});
