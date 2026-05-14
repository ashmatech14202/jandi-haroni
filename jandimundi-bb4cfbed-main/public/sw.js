const CACHE_NAME = 'jandi-munda-v1';
const urlsToCache = ['/'];

// Skip caching for OAuth and internal routes
const OAUTH_REGEX = /^\/\~oauth/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache OAuth redirects
  if (OAUTH_REGEX.test(url.pathname)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
