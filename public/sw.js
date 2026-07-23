// Minimal service worker for PWA installability.
// Deliberately does NO caching — every request goes straight to the network —
// so deployments are never served stale. Its only job is to satisfy
// install criteria on browsers that still require a fetch handler.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Intentionally empty: default network handling applies.
});
