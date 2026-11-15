// node tests/remote.test.js —— 客户端:公告/最低版本/维护提示、授权码校验、请求头
const els = {}; const mk = (s) => els[s] || (els[s] = { innerHTML: '', value: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, focus() {}, insertAdjacentHTML() {} });
global.window = global; const handlers = {};
global.document = { readyState: 'complete', querySelector: mk, getElementById: mk, querySelectorAll: () => [], addEventListener: (t, f) => (handlers[t] = handlers[t] || []).push(f), createElement: () => mk('n' + Math.random()), body: { classList: { toggle() {} }, appendChild() {}, style: {} }, hidden: false };
const store = {}; global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k] };
global.navigator = {}; global.location = { hash: '', search: '', protocol: 'https:', hostname: 'chrono.example.com', origin: 'https://chrono.example.com', pathname: '/' }; global.history = { replaceState() {} }; global.matchMedia = () => ({ matches: false }); global.scrollTo = () => {}; global.addEventListener = () => {}; global.setInterval = () => 0;
const st0 = global.setTimeout; global.setTimeout = (f, ms) => (ms > 1000 ? 0 : st0(f, ms));
const assert = require('assert'); let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ✓ ' + m); };
['core', 'holiday', 'parse', 'sched', 'app', 'views', 'today', 'llm', 'sync', 'longterm', 'remote', 'agent', 'boot'].forEach((f) => require('../' + f + '.js'));
const A = window.A, C = window.Chrono, R = A.Remote; mk('#sheet-root'); A.st = C.fresh();
const click = (act, data) => { const el = { dataset: Object.assign({ act }, data || {}) }; return Promise.all((handlers.click || []).map((h) => h({ target: { closest: (s) => (s === '[data-act]' ? el : null) } }))); };
console.log('版本与地址');
ok(R.cmp('1.5.1', '1.5.2') === -1 && R.cmp('1.10.0', '1.9.9') === 1 && R.cmp('1.5.2', '1.5.2') === 0, '版本号比较');
ok(R.base() === 'https://chrono.example.com', '部署在自己的网址上:云服务地址就是当前网址');
console.log('公告 / 更新 / 维护提示');
{ const h0 = A.banners(); ok(!h0.includes('服务维护中') && !h0.includes('有新版本') && !h0.includes('关闭公告'), '没有后台配置时不显示任何公告/更新/维护提示'); }
R.cfg = { announcement: { id: 7, text: '周六 2:00 维护', level: 'warn' }, minVersion: '9.0.0', maintenance: true, maintenanceText: '升级中' };
let h = A.banners(); ok(h.includes('周六 2:00 维护') && h.includes('有新版本') && h.includes('服务维护中') && h.includes('升级中'), '公告、需要更新、维护中三类提示都显示');
click('ann-x'); h = A.banners(); ok(!h.includes('周六 2:00 维护') && store['chrono.ann'] === '7', '关闭公告后不再显示(记住 id)');
R.cfg.announcement = { id: 8, text: '新公告', level: 'info' }; ok(A.banners().includes('新公告'), '公告内容变了(新 id)会再次显示');
R.cfg.announcement = { id: 9, text: '<img src=x onerror=alert(1)>', level: 'info' }; ok(!A.banners().includes('<img') && A.banners().includes('&lt;img'), '公告内容被转义,不会注入');
R.cfg = null;
(async () => {
  console.log('授权码');
  let calls = []; global.fetch = async (u, o) => { calls.push([u, o]); const b = JSON.parse(o.body); const good = /^ABCD/i.test(b.code); return { ok: good, status: good ? 200 : 403, json: async () => (good ? { ok: true, plan: 'pro', expires: 0 } : { ok: false, message: '授权码不存在。' }) }; };
  els['#rmCode'] = { value: 'abcd-efgh-jkmn-pqrs' }; await click('lic-verify'); await new Promise((r) => st0(r, 20));
  ok(calls[0][0] === 'https://chrono.example.com/api/license/verify' && JSON.parse(calls[0][1].body).device.length >= 16, '向自己的后台校验,并带上本机设备编号');
  ok(JSON.parse(store['chrono.license']).code === 'ABCD-EFGH-JKMN-PQRS' && R.lic().plan === 'pro', '校验通过 → 保存(统一为大写)');
  ok(R.html().includes('已激活'), '设置页显示已激活');
  const dev1 = store['chrono.dev']; els['#rmCode'] = { value: 'zzzz' }; await click('lic-verify'); await new Promise((r) => st0(r, 20)); ok(R.lic().code === 'ABCD-EFGH-JKMN-PQRS', '校验失败不会覆盖已激活的授权码'); ok(store['chrono.dev'] === dev1, '设备编号稳定不变');
  console.log('请求头');
  calls = []; global.fetch = async (u, o) => { calls.push([u, o]); return { ok: true, status: 200, text: async () => JSON.stringify({ content: [{ type: 'text', text: '{}' }] }), json: async () => ({}) }; };
  A.LLM.setCfg(Object.assign(A.LLM.getCfg(), { key: 'k', proxy: 'https://chrono.example.com/proxy', consent: true })); await A.LLM.call({ system: 's', user: 'u' }).catch(() => {});
  ok(calls[0][1].headers['x-license'] === 'ABCD-EFGH-JKMN-PQRS', '大模型代理请求自动带授权码');
  calls = []; A.Sync.setCfg({ on: true, server: 'https://chrono.example.com/sync', code: 'abcdefghijklmnopqrstuvwx', ver: {} }); await A.Sync.run(false); ok(calls.length && calls[0][1].headers['x-license'] === 'ABCD-EFGH-JKMN-PQRS', '同步请求自动带授权码');
  global.fetch = async () => ({ status: 402, json: async () => ({}) }); const r = await A.Sync.run(true); ok(/授权码/.test((A.Sync.getCfg().status || {}).msg || ''), '同步收到 402 → 提示需要授权码');
  console.log('\n客户端后台连接测试通过:' + n); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
