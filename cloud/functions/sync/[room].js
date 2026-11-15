// /sync/<房间号>:端到端加密数据的存取。服务器只保存密文。
import { CORS, json, preflight, gate } from '../_shared.js';
export async function onRequest({ request, params, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (!env.CHRONO) return json({ error: 'KV binding CHRONO is missing' }, 500);
  const room = String(params.room || '');
  if (!/^[a-f0-9]{64}$/.test(room)) return json({ error: 'not found' }, 404);
  const g = await gate(env, request, 'sync'); if (g) return g;
  const key = 'room:' + room;
  if (request.method === 'GET') { const v = await env.CHRONO.get(key, 'json'); return v ? json(v) : json({ error: 'empty' }, 404); }
  if (request.method === 'DELETE') { await env.CHRONO.delete(key); return json({ ok: true }); }
  if (request.method === 'PUT') {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.blob !== 'string') return json({ error: 'bad body' }, 400);
    if (body.blob.length > 20 * 1024 * 1024) return json({ error: 'too large' }, 413);
    const cur = await env.CHRONO.get(key, 'json'), rev = cur ? cur.rev : 0;
    if ((body.rev || 0) !== rev) return json({ error: 'conflict', rev }, 409);
    const next = { rev: rev + 1, blob: body.blob, t: Date.now() };
    await env.CHRONO.put(key, JSON.stringify(next));
    return json({ rev: next.rev });
  }
  return json({ error: 'method' }, 405);
}
