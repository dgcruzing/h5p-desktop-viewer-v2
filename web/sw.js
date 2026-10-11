// Kept as a same-origin registration anchor for the shell. The player uses its bundled worker.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
