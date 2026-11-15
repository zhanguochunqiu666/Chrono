// GET /api/config:客户端启动时读取的公开配置(公告、最低版本、开关)。不含任何敏感信息。
import { json, preflight, getCfg } from '../_shared.js';
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  const c = await getCfg(env), a = c.announcement && c.announcement.text && (!c.announcement.until || c.announcement.until > Date.now()) ? c.announcement : null;
  return json({ announcement: a ? { id: a.id, text: a.text, level: a.level === 'warn' ? 'warn' : 'info' } : null, minVersion: c.minVersion || '', maintenance: !!c.maintenance, maintenanceText: c.maintenanceText || '', requireLicense: !!c.requireLicense, aiProxy: c.aiProxy !== false }, 200, { 'cache-control': 'public, max-age=60' });
}
