// /proxy:大模型代理。只转发到白名单里的服务商,避免被滥用成开放代理。
import { CORS, json, preflight, gate } from './_shared.js';
const ALLOW = ['api.anthropic.com', 'api.openai.com', 'dashscope.aliyuncs.com', 'open.bigmodel.cn', 'api.deepseek.com', 'api.moonshot.cn', 'api.siliconflow.cn'];
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  const g = await gate(env, request, 'proxy'); if (g) return g;
  let t; try { t = new URL(request.headers.get('x-target-url')); } catch (e) { return new Response('bad x-target-url', { status: 400, headers: CORS }); }
  if (t.protocol !== 'https:' || !ALLOW.includes(t.hostname)) return new Response('host not allowed: ' + t.hostname, { status: 403, headers: CORS });
  const h = new Headers(request.headers); ['host', 'origin', 'referer', 'x-target-url', 'x-license', 'cf-connecting-ip', 'content-length'].forEach((k) => h.delete(k));
  const r = await fetch(t.toString(), { method: 'POST', headers: h, body: request.body });
  const oh = new Headers(r.headers); Object.keys(CORS).forEach((k) => oh.set(k, CORS[k])); oh.delete('content-encoding');
  return new Response(r.body, { status: r.status, headers: oh });
}
