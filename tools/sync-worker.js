// 时序 Chrono · 云端同步服务(Cloudflare Workers + KV,免费额度足够个人使用)
// 部署:Cloudflare 控制台 → Workers → 创建 → 粘贴本文件 → 设置 → 绑定 → KV 命名空间,变量名填 CHRONO → 部署。
// 得到的地址形如 https://xxx.workers.dev ,在时序里填「同步服务器地址」: https://xxx.workers.dev/sync
// 服务器只保存已加密的数据,看不到日程内容。房间号是 64 位十六进制,等同于访问口令。
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET, PUT, DELETE, OPTIONS' };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'content-type': 'application/json' } });

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const m = new URL(req.url).pathname.match(/^\/sync\/([a-f0-9]{64})$/);
    if (!m) return json({ error: 'not found' }, 404);
    const key = 'room:' + m[1];
    if (req.method === 'GET') {
      const v = await env.CHRONO.get(key, 'json');
      return v ? json(v) : json({ error: 'empty' }, 404);
    }
    if (req.method === 'DELETE') { await env.CHRONO.delete(key); return json({ ok: true }); }
    if (req.method === 'PUT') {
      const body = await req.json().catch(() => null);
      if (!body || typeof body.blob !== 'string' || body.blob.length > 20 * 1024 * 1024) return json({ error: 'bad body' }, body ? 413 : 400);
      const cur = await env.CHRONO.get(key, 'json');
      const rev = cur ? cur.rev : 0;
      if ((body.rev || 0) !== rev) return json({ error: 'conflict', rev }, 409);   // 乐观并发:别的设备刚写过
      const next = { rev: rev + 1, blob: body.blob, t: Date.now() };
      await env.CHRONO.put(key, JSON.stringify(next));
      return json({ rev: next.rev });
    }
    return json({ error: 'method' }, 405);
  },
};
