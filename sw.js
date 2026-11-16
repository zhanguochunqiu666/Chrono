/* 时序 Chrono · Service Worker:离线外壳 + 通知动作 */
const VER = 'chrono-v1.5.3';
const SHELL = ['./', 'index.html', 'style.css', 'core.js', 'holiday.js', 'parse.js', 'sched.js', 'app.js', 'views.js', 'today.js', 'llm.js', 'sync.js', 'longterm.js', 'remote.js', 'agent.js', 'boot.js', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VER).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VER).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      const fd = await req.formData(), c = await caches.open('chrono-share');
      await c.put('share-meta', new Response(JSON.stringify({ title: fd.get('title') || '', text: fd.get('text') || '', url: fd.get('url') || '' })));
      let i = 0; for (const f of fd.getAll('media')) { if (f && f.size) await c.put('shared-img-' + (i++), new Response(f, { headers: { 'content-type': f.type } })); }
      return Response.redirect('./index.html?shared=1', 303);
    })());
    return;
  }
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // 网络优先(更新及时),失败回退缓存 —— 保证离线可用
  e.respondWith(
    fetch(req).then((res) => {
      if (!new URL(req.url).search) { const copy = res.clone(); caches.open(VER).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});

self.addEventListener('notificationclick', (e) => {
  const d = e.notification.data || {};
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    const msg = { chrono: 1, act: e.action || 'open', blockId: d.blockId };
    if (cs.length) { cs[0].focus(); cs[0].postMessage(msg); }
    else self.clients.openWindow('./index.html#act=' + (e.action || 'open') + '&b=' + (d.blockId || ''));
  }));
});
