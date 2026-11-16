// node tests/cloud.test.js —— 云函数与管理后台:认证、授权码、设备、公告/开关、对同步与代理的拦截
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const src = path.join(__dirname, '..', 'cloud', 'functions'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chrono-fn-'));
(function cp(from, to) { fs.mkdirSync(to, { recursive: true }); fs.readdirSync(from, { withFileTypes: true }).forEach((e) => { const f = path.join(from, e.name), t = path.join(to, e.name.replace(/\.js$/, '.mjs')); if (e.isDirectory()) return cp(f, path.join(to, e.name)); fs.writeFileSync(t, fs.readFileSync(f, 'utf8').replace(/from '([^']+)\.js'/g, "from '$1.mjs'")); }); })(src, tmp);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ✓ ' + m); };
(async () => {
  const imp = (p) => import(require('url').pathToFileURL(path.join(tmp, p)).href);
  const admin = (await imp('api/admin/[[path]].mjs')).onRequest, verify = (await imp('api/license/verify.mjs')).onRequest, pubcfg = (await imp('api/config.mjs')).onRequest, sync = (await imp('sync/[room].mjs')).onRequest, proxy = (await imp('proxy.mjs')).onRequest;
  const store = new Map(); const KV = { get: async (k, t) => (store.has(k) ? JSON.parse(store.get(k)) : null), put: async (k, v) => store.set(k, v), delete: async (k) => store.delete(k), list: async ({ prefix }) => ({ keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }) };
  const TOKEN = 'correct-horse-battery-staple', env = { CHRONO: KV, ADMIN_TOKEN: TOKEN };
  const A = (p, m = 'GET', body, tok = TOKEN, e = env) => admin({ request: new Request('https://x/api/admin/' + p, { method: m, headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env: e, params: { path: p.split('/') } });
  const V = (code, device) => verify({ request: new Request('https://x/api/license/verify', { method: 'POST', body: JSON.stringify({ code, device }) }), env });
  const R = 'a'.repeat(64), S = (m, hdr = {}, body) => sync({ request: new Request('https://x/sync/' + R, { method: m, headers: hdr, body: body ? JSON.stringify(body) : undefined }), params: { room: R }, env });
  const P = (hdr = {}) => proxy({ request: new Request('https://x/proxy', { method: 'POST', headers: { 'x-target-url': 'https://api.anthropic.com/v1/messages', ...hdr }, body: '{}' }), env });

  console.log('管理员认证');
  ok((await A('stats', 'GET', null, 'wrong-token-xxxxxxxxxx')).status === 401, '口令错误 → 401');
  ok((await A('stats', 'GET', null, '')).status === 401, '没有口令 → 401');
  ok((await A('stats', 'GET', null, 'short', { CHRONO: KV, ADMIN_TOKEN: 'short' })).status === 401, '管理员口令少于 16 位:即使对上也拒绝(防弱口令)');
  ok((await A('stats', 'GET', null, 'x', { CHRONO: KV })).status === 401, '没有配置 ADMIN_TOKEN:后台整体关闭');
  ok((await A('stats')).status === 200, '正确口令 → 200');

  console.log('授权码全生命周期');
  let r = await A('licenses', 'POST', { plan: 'pro', days: 30, maxDevices: 2, count: 2, note: '<img src=x onerror=1>' }), j = await r.json();
  ok(r.status === 201 && j.licenses.length === 2 && /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(j.licenses[0].code), '批量生成 2 个,格式 XXXX-XXXX-XXXX-XXXX');
  ok(j.licenses[0].code !== j.licenses[1].code, '两个码不重复');
  const code = j.licenses[0].code; const lower = code.toLowerCase().replace(/-/g, ' ');
  r = await V(lower, 'dev-1'); j = await r.json(); ok(r.status === 200 && j.ok && j.plan === 'pro' && j.devices === 1, '校验通过(大小写、空格不敏感),登记第 1 台设备');
  ok((await (await V(code, 'dev-1')).json()).devices === 1, '同一设备重复校验不重复计数');
  ok((await (await V(code, 'dev-2')).json()).devices === 2, '第 2 台设备');
  r = await V(code, 'dev-3'); j = await r.json(); ok(r.status === 409 && j.state === 'device-limit', '第 3 台超过上限 2 → 409');
  ok((await (await A('licenses/' + code + '/reset-devices', 'POST')).json()).devices.length === 0, '管理员可清空设备');
  await A('licenses/' + code + '/revoke', 'POST'); r = await V(code, 'dev-1'); ok(r.status === 403 && (await r.json()).state === 'revoked', '停用后校验失败');
  await A('licenses/' + code + '/restore', 'POST'); ok((await V(code, 'dev-1')).status === 200, '恢复后可用');
  const rec = JSON.parse(store.get('lic:' + code.replace(/-/g, ''))); rec.expires = Date.now() - 1000; store.set('lic:' + code.replace(/-/g, ''), JSON.stringify(rec));
  r = await V(code, 'dev-1'); ok(r.status === 403 && (await r.json()).state === 'expired', '过期后校验失败');
  r = await A('licenses/' + code + '/extend', 'POST', { days: 10 }); j = await r.json(); ok(j.state === 'active' && j.expires > Date.now(), '延期 10 天后重新有效');
  ok((await (await V('NOPE-NOPE-NOPE-NOPE', 'd')).json()).state === 'invalid', '不存在的码 → invalid');
  ok((await V('x', 'd')).status === 400, '格式不对 → 400');
  const list = await (await A('licenses')).json(); ok(list.licenses.length === 2 && list.licenses.every((l) => l.devices.every((d) => d.id.length <= 8)), '列表里设备编号被截断,不暴露完整设备 ID');
  ok(list.licenses[0].note.includes('<img') && !JSON.stringify(list).includes('<script'), '备注原样当文本存储(页面用 textContent 渲染,不会执行)');
  await A('licenses/' + list.licenses.find((l) => l.code !== code).code, 'DELETE'); ok((await (await A('licenses')).json()).licenses.length === 1, '删除');

  console.log('公告与开关');
  ok((await (await pubcfg({ request: new Request('https://x/api/config'), env })).json()).announcement === null, '默认没有公告');
  r = await A('config', 'PUT', { announcement: { text: '周六 2:00 维护', level: 'warn' }, minVersion: '1.5.2' }); j = await r.json(); const id1 = j.announcement.id;
  const pc = await (await pubcfg({ request: new Request('https://x/api/config'), env })).json(); ok(pc.announcement.text === '周六 2:00 维护' && pc.announcement.level === 'warn' && pc.minVersion === '1.5.2', '公开配置返回公告与最低版本');
  ok(!JSON.stringify(pc).includes(TOKEN) && !('licenses' in pc), '公开配置不含口令或授权信息');
  j = await (await A('config', 'PUT', { announcement: { text: '周六 2:00 维护', level: 'warn' } })).json(); ok(j.announcement.id === id1, '同样的公告内容保持同一个 id(用户关闭后不会反复弹)');
  j = await (await A('config', 'PUT', { announcement: { text: '换了新内容' } })).json(); ok(j.announcement.id !== id1, '内容变了生成新 id');
  j = await (await A('config', 'PUT', { minVersion: 'abc; drop' })).json(); ok(j.minVersion === '', '非法版本号被忽略');
  await A('config', 'PUT', { announcement: { text: '' } }); ok((await (await pubcfg({ request: new Request('https://x/api/config'), env })).json()).announcement === null, '清空公告');

  console.log('开关真的拦得住同步与代理');
  ok((await S('GET')).status === 404, '默认(开源自建):不要求授权码,同步直接可用');
  await A('config', 'PUT', { requireLicense: true });
  r = await S('GET'); j = await r.json(); ok(r.status === 402 && j.state === 'missing', '要求授权码:没带 → 402');
  ok((await S('GET', { 'x-license': 'NOPE-NOPE-NOPE-NOPE' })).status === 402, '要求授权码:假码 → 402');
  ok((await S('GET', { 'x-license': code })).status === 404, '要求授权码:有效码 → 放行');
  ok((await P()).status === 402, '代理同样被拦');
  await A('licenses/' + code + '/revoke', 'POST'); ok((await S('GET', { 'x-license': code })).status === 402, '授权码被停用后立即失效');
  await A('config', 'PUT', { requireLicense: false, aiProxy: false }); r = await P(); ok(r.status === 403, '关闭托管 AI 代理 → 403');
  await A('config', 'PUT', { aiProxy: true, maintenance: true, maintenanceText: '升级中' }); r = await S('GET'); j = await r.json(); ok(r.status === 503 && j.message === '升级中', '维护模式 → 同步 503 并带提示');
  await A('config', 'PUT', { maintenance: false });
  ok((await S('PUT', {}, { rev: 0, blob: 'x' })).status === 200, '关闭维护后恢复');
  const st = await (await A('stats')).json(); ok(st.syncRooms === 1 && st.licenses === 1, '概览统计:同步房间 1、授权码 1');
  ok(!JSON.stringify(st).includes('"blob"'), '概览里没有任何用户数据');

  fs.rmSync(tmp, { recursive: true, force: true }); console.log('\n云函数与后台测试通过:' + n); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
