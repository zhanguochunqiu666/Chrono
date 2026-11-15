// POST /api/license/verify {code, device}:校验授权码并登记设备(受设备数上限约束)。
import { json, preflight, getLic, putLic, licState, normCode } from '../../_shared.js';
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  if (!env.CHRONO) return json({ error: 'KV binding CHRONO is missing' }, 500);
  const b = await request.json().catch(() => null), code = normCode(b && b.code), dev = String((b && b.device) || '').slice(0, 64);
  if (code.length < 12 || !dev) return json({ ok: false, state: 'invalid', message: '授权码格式不对。' }, 400);
  const l = await getLic(env, code), st = licState(l);
  if (st !== 'active') return json({ ok: false, state: st, message: { invalid: '授权码不存在。', revoked: '授权码已被停用。', expired: '授权码已过期。' }[st] }, 403);
  l.devices = l.devices || []; const now = Date.now(); let d = l.devices.find((x) => x.id === dev);
  if (!d) { if (l.devices.length >= (l.maxDevices || 3)) return json({ ok: false, state: 'device-limit', message: '该授权码的设备数已达上限(' + (l.maxDevices || 3) + ' 台)。', maxDevices: l.maxDevices || 3 }, 409); d = { id: dev, first: now }; l.devices.push(d); }
  d.last = now; await putLic(env, l);
  return json({ ok: true, state: 'active', plan: l.plan, expires: l.expires || 0, maxDevices: l.maxDevices || 3, devices: l.devices.length });
}
