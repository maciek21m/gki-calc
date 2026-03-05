self.addEventListener('install', (e)=>{
  self.skipWaiting();
});
self.addEventListener('activate', (e)=>{
  e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (e)=>{
  // basic offline for docs and assets
  if(e.request.method !== 'GET') return;
  e.respondWith(caches.open('gki-v1').then(cache=>cache.match(e.request).then(res=>res||fetch(e.request).then(f=>{ cache.put(e.request,f.clone()); return f; }).catch(()=>cache.match('/index.html')))));
});
