// Service Worker - Harmonia
// Estratégia: cache-first para estáticos (HTML/CSS/JS/ícones),
// network-first para chamadas de API (Supabase) — nunca serve dados
// de escala/repertório desatualizados quando há internet.

const CACHE_VERSION = 'harmonia-v2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/definir-senha.html',
  '/css/style.css',
  '/js/app.js',
  '/js/supabase-config.js',
  '/manifest.json',
  '/assets/logo-completa-480.png',
  '/assets/logo-h-160.png',
  '/assets/favicon-64.png',
  '/offline.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('harmonia-') && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Nunca interceptar chamadas para o Supabase (auth, REST, storage, edge functions).
  // Deixa passar direto pra rede — dados de escala/repertório sempre atualizados.
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // Só trata GET; POST/PUT/DELETE (ex: Edge Functions) sempre vão direto pra rede.
  if (request.method !== 'GET') {
    return;
  }

  // Navegação (abrir a página, já que é SPA com redirect pra index.html):
  // network-first, cai pro cache/offline se falhar.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put('/index.html', clone));
          return response;
        })
        .catch(() =>
          caches.match('/index.html').then((cached) => cached || caches.match('/offline.html'))
        )
    );
    return;
  }

  // Estáticos (CSS/JS/ícones): cache-first, atualiza em segundo plano.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});

// Permite forçar atualização do SW a partir da UI (ex: botão "Atualizar app")
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
