// 共用工具。存储用 Cloudflare KV(绑定名 CHRONO)。键:room:<房间>  lic:<授权码>  cfg(全局配置)
export const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization, x-license, x-target-url', 'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS' };
export const json = (o, s = 200, extra = {}) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } });
export const preflight = () => new Response(null, { status: 204, headers: CORS });

const AL = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const fmtCode = (n) => n.match(/.{1,4}/g).join('-');
export function genCode() { const a = crypto.getRandomValues(new Uint8Array(16)); return fmtCode([...a].map((x) => AL[x % AL.length]).join('')); }

export async function getCfg(env) { return (env.CHRONO && (await env.CHRONO.get('cfg', 'json'))) || {}; }
export const getLic = (env, code) => env.CHRONO.get('lic:' + normCode(code), 'json');
export const putLic = (env, l) => env.CHRONO.put('lic:' + normCode(l.code), JSON.stringify(l));
export function licState(l, now = Date.now()) { if (!l) return 'invalid'; if (l.revoked) return 'revoked'; if (l.expires && l.expires < now) return 'expired'; return 'active'; }

/* 管理员认证:Authorization: Bearer <ADMIN_TOKEN>。ADMIN_TOKEN 是 Cloudflare 里设置的密钥,至少 16 位。常量时间比较。 */
export function isAdmin(request, env) {
  const t = env.ADMIN_TOKEN; if (!t || String(t).length < 16) return false;
  const got = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''); if (got.length !== t.length) return false;
  let d = 0; for (let i = 0; i < t.length; i++) d |= got.charCodeAt(i) ^ t.charCodeAt(i); return d === 0;
}

/* 同步与大模型代理的前置检查:维护模式、是否要求授权码。默认都不要求(开源自建即用)。 */
export async function gate(env, request, feature) {
  const cfg = await getCfg(env);
  if (cfg.maintenance) return json({ error: 'maintenance', message: cfg.maintenanceText || '服务维护中,请稍后再试。' }, 503);
  if (feature === 'proxy' && cfg.aiProxy === false) return json({ error: 'disabled', message: '托管的大模型代理暂未开放。' }, 403);
  if (cfg.requireLicense) {
    const code = request.headers.get('x-license'); const st = code ? licState(await getLic(env, code)) : 'missing';
    if (st !== 'active') return json({ error: 'license', state: st, message: '需要有效的授权码(设置 → 账号与授权)。' }, 402);
  }
  return null;
}
