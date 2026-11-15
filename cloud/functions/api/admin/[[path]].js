// /api/admin/*:管理员接口。全部需要 Authorization: Bearer <ADMIN_TOKEN>。
//   GET    /api/admin/stats                      概览
//   GET    /api/admin/licenses                   授权码列表
//   POST   /api/admin/licenses                   批量生成 {plan, days, maxDevices, note, count}
//   POST   /api/admin/licenses/<code>/revoke | restore | extend {days} | reset-devices
//   DELETE /api/admin/licenses/<code>
//   GET|PUT /api/admin/config                    公告、最低版本、维护模式、是否要求授权码、AI 代理开关
import { json, preflight, isAdmin, getCfg, getLic, putLic, genCode, normCode, licState } from '../../_shared.js';
const DAY = 86400000;
const pub = (l) => ({ code: l.code, plan: l.plan, note: l.note || '', created: l.created, expires: l.expires || 0, maxDevices: l.maxDevices || 3, revoked: !!l.revoked, state: licState(l), devices: (l.devices || []).map((d) => ({ id: d.id.slice(0, 8), first: d.first, last: d.last })) });
async function listAll(env, prefix) { const out = []; let cursor; do { const r = await env.CHRONO.list({ prefix, cursor, limit: 1000 }); out.push(...r.keys.map((k) => k.name)); cursor = r.list_complete ? null : r.cursor; } while (cursor && out.length < 5000); return out; }

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return preflight();
  if (!env.CHRONO) return json({ error: 'KV binding CHRONO is missing' }, 500);
  if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
  const path = [].concat(params.path || []), [a, b, c] = path, M = request.method, body = M === 'POST' || M === 'PUT' ? await request.json().catch(() => ({})) : {};

  if (a === 'stats' && M === 'GET') {
    const names = await listAll(env, 'lic:'), lics = (await Promise.all(names.map((n) => env.CHRONO.get(n, 'json')))).filter(Boolean), rooms = (await listAll(env, 'room:')).length, now = Date.now();
    return json({ licenses: lics.length, active: lics.filter((l) => licState(l, now) === 'active').length, expiringIn7d: lics.filter((l) => licState(l, now) === 'active' && l.expires && l.expires - now < 7 * DAY).length, devices: lics.reduce((s, l) => s + (l.devices || []).length, 0), syncRooms: rooms, config: await getCfg(env) });
  }
  if (a === 'licenses') {
    if (!b && M === 'GET') { const names = await listAll(env, 'lic:'); const ls = (await Promise.all(names.map((n) => env.CHRONO.get(n, 'json')))).filter(Boolean).sort((x, y) => y.created - x.created); return json({ licenses: ls.map(pub) }); }
    if (!b && M === 'POST') {
      const n = Math.max(1, Math.min(100, +body.count || 1)), days = +body.days > 0 ? Math.min(3650, +body.days) : 0, made = [];
      for (let i = 0; i < n; i++) { const l = { code: genCode(), plan: ['free', 'pro'].includes(body.plan) ? body.plan : 'pro', note: String(body.note || '').slice(0, 80), created: Date.now(), expires: days ? Date.now() + days * DAY : 0, maxDevices: Math.max(1, Math.min(20, +body.maxDevices || 3)), revoked: false, devices: [] }; await putLic(env, l); made.push(pub(l)); }
      return json({ licenses: made }, 201);
    }
    const code = normCode(b), l = code ? await getLic(env, code) : null; if (!l) return json({ error: 'not found' }, 404);
    if (M === 'DELETE' && !c) { await env.CHRONO.delete('lic:' + code); return json({ ok: true }); }
    if (M === 'POST' && c === 'revoke') { l.revoked = true; await putLic(env, l); return json(pub(l)); }
    if (M === 'POST' && c === 'restore') { l.revoked = false; await putLic(env, l); return json(pub(l)); }
    if (M === 'POST' && c === 'extend') { const d = Math.max(1, Math.min(3650, +body.days || 30)); l.expires = Math.max(l.expires || Date.now(), Date.now()) + d * DAY; await putLic(env, l); return json(pub(l)); }
    if (M === 'POST' && c === 'reset-devices') { l.devices = []; await putLic(env, l); return json(pub(l)); }
  }
  if (a === 'config') {
    if (M === 'GET') return json(await getCfg(env));
    if (M === 'PUT') {
      const cur = await getCfg(env), next = { ...cur };
      if (body.announcement !== undefined) { const t = String((body.announcement && body.announcement.text) || '').slice(0, 300); next.announcement = t ? { id: (cur.announcement && cur.announcement.text === t ? cur.announcement.id : Math.max(Date.now(), ((cur.announcement && cur.announcement.id) || 0) + 1)), text: t, level: body.announcement.level === 'warn' ? 'warn' : 'info', until: +body.announcement.until || 0 } : null; }
      if (body.minVersion !== undefined) next.minVersion = /^\d+(\.\d+){0,2}$/.test(String(body.minVersion)) ? String(body.minVersion) : '';
      ['maintenance', 'requireLicense', 'aiProxy'].forEach((k) => { if (body[k] !== undefined) next[k] = !!body[k]; });
      if (body.maintenanceText !== undefined) next.maintenanceText = String(body.maintenanceText).slice(0, 200);
      await env.CHRONO.put('cfg', JSON.stringify(next)); return json(next);
    }
  }
  return json({ error: 'not found' }, 404);
}
