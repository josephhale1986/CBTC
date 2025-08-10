self.addEventListener('install', e => {
  e.waitUntil(caches.open('cbc-v1').then(cache => cache.addAll([
    './', './index.html', './game.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'
  ])));
});
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});