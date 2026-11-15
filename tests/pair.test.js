// node tests/pair.test.js —— 「单文件版」与「启动.bat 版」两个独立存储,经本机服务自动配对后:事项、设置、大模型配置都互通
const els = {}; const handlersAll = {}; const mk = (s) => els[s] || (els[s] = { innerHTML: '', value: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, focus() {}, insertAdjacentHTML() {} });
global.window = global;
global.document = { readyState: 'complete', querySelector: mk, getElementById: mk, querySelectorAll: () => [], addEventListener(t, f) { (handlersAll[t] = handlersAll[t] || []).push(f); }, createElement: () => mk('n' + Math.random()), body: { classList: { toggle() {} }, appendChild() {}, style: {} }, hidden: false };
let store = {}; const mkStore = () => ({ getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => (store[k] = v), removeItem: (k) => delete store[k] });
global.localStorage = mkStore(); global.navigator = {}; global.location = { hash: '', search: '', protocol: 'file:', hostname: '', pathname: '/' }; global.history = { replaceState() {} }; global.matchMedia = () => ({ matches: false }); global.scrollTo = () => {}; global.addEventListener = () => {};
global.setInterval = () => 0; const st0 = global.setTimeout; global.setTimeout = (f, ms) => (ms > 1000 ? 0 : st0(f, ms));
const assert = require('assert'); let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ✓ ' + m); };
['core', 'holiday', 'parse', 'sched', 'app', 'views', 'today', 'llm', 'sync', 'longterm', 'remote', 'agent', 'boot'].forEach((f) => require('../' + f + '.js'));
const A = window.A, C = window.Chrono, S = A.Sync, L = A.LLM;
// 内存里的「本机服务」:与 tools/server.js、server.py 同一协议
const cloud = {}; let serverUp = true, CODE = 'localcode1234567890';
global.fetch = async (url, o) => {
  if (!serverUp) throw new TypeError('fetch failed');
  const m = String(url).match(/\/sync\/([a-f0-9]{64})$/), method = (o && o.method) || 'GET';
  const R = (code, j) => ({ ok: code < 300, status: code, json: async () => j, text: async () => JSON.stringify(j) });
  if (/\/sync-code$/.test(url)) return R(200, { code: CODE });
  if (!m) return R(404, {});
  const room = m[1];
  if (method === 'GET') return cloud[room] ? R(200, cloud[room]) : R(404, { error: 'empty' });
  if (method === 'PUT') { const b = JSON.parse(o.body), rev = cloud[room] ? cloud[room].rev : 0; if ((b.rev || 0) !== rev) return R(409, { rev }); cloud[room] = { rev: rev + 1, blob: b.blob }; return R(200, { rev: rev + 1 }); }
  return R(200, {});
};
const tick = (ms = 30) => new Promise((r) => st0(r, ms));
const now = Date.now();
const device = (name) => ({ name, store: {}, st: null });
const swapTo = (d) => { store = d.store; if (!d.st) { d.st = C.load(); } A.st = d.st; };

(async () => {
  console.log('设备 A:单文件版(file://),已有事项、设置与大模型配置');
  const A1 = device('file'); swapTo(A1); A.st = C.fresh(); A1.st = A.st;
  C.addItems(A.st, C.parse('周三下午三点开会,一个小时', A.st, now).items, now); C.addItems(A.st, C.parse('周五前写方案,三个小时', A.st, now).items, now); C.plan(A.st, now, 'inc');
  C.addHabit(A.st, C.parse('每周三次健身,一小时', A.st, now).habits[0], now);
  A.st.settings.lunch = [11 * 60 + 30, 13 * 60]; A.st.settings.dayStart = 7 * 60; A.st.settings.freeRatio = 0.3;
  L.setCfg(Object.assign(L.getCfg(), { key: 'sk-SECRET', model: 'claude-sonnet-4-5', fastModel: 'haiku', consent: true })); C.save(A.st);
  ok(!S.getCfg().on, '未配对前同步是关闭的');
  await S.autoPair(); await tick(80);
  ok(S.getCfg().on && S.getCfg().auto && /\/sync$/.test(S.getCfg().server) && S.getCfg().code === CODE, 'A 自动向本机服务取得同步码并开启同步(无需手填)');
  ok(Object.keys(cloud).length === 1, '数据已加密上传到本机服务');
  ok(!JSON.stringify(cloud).includes('开会') && !JSON.stringify(cloud).includes('SECRET'), '服务端保存的是密文:看不到事项,也看不到 API Key');

  console.log('设备 B:启动.bat 版(http://localhost:8765),全新、空白');
  const B1 = device('http'); swapTo(B1); A.st = C.fresh(); B1.st = A.st;
  ok(C.fresh().settings.lunch[0] === 720 && A.st.items.length === 0, '前提:B 是空白、默认设置');
  await S.autoPair(); await tick(80);
  ok(A.st.items.length === 2, 'B 自动拿到 A 的 2 个事项');
  console.log('   habits', A.st.habits.length, 'blocks', A.st.blocks.length); ok(A.st.habits.length === 1 && A.st.blocks.length >= 2, 'B 拿到习惯与已排好的日程块');
  ok(A.st.settings.lunch[0] === 690 && A.st.settings.lunch[1] === 780 && A.st.settings.dayStart === 420 && A.st.settings.freeRatio === 0.3, 'B 拿到 A 的设置(午休 11:30–13:00、可用时段、留白比例)');
  ok(L.getCfg().key === 'sk-SECRET' && L.getCfg().fastModel === 'haiku', 'B 拿到 A 的大模型配置(含密钥与快速模型)');

  console.log('B 里新增 / 改设置 → A 里可见');
  C.addItems(A.st, C.parse('周四上午十点和客户对账,一个小时', A.st, now).items, now); A.st.settings.buffer = 20; L.setCfg(Object.assign(L.getCfg(), { model: 'claude-opus' })); C.save(A.st);
  await S.run(false); await tick(50);
  swapTo(A1); await S.run(false); await tick(50);
  ok(A.st.items.length === 3 && A.st.items.some((i) => /对账/.test(i.title)), 'A 看到了 B 新增的事项');
  ok(A.st.settings.buffer === 20, 'A 看到了 B 改的设置');
  ok(L.getCfg().model === 'claude-opus', 'A 看到了 B 改的大模型配置');

  console.log('服务没开 / 再次打开');
  serverUp = false; swapTo(A1); C.addItems(A.st, C.parse('周六上午十点洗车,一个小时', A.st, now).items, now); C.save(A.st);
  const r = await S.run(false); ok(r && r.error, '本机服务没启动:同步静默失败,本地照常使用,数据不丢');
  serverUp = true; await S.run(false); await tick(50);
  swapTo(B1); await S.run(false); await tick(50); ok(A.st.items.some((i) => /洗车/.test(i.title)), '服务恢复后,离线期间新增的事项补同步到另一个版本');
  console.log('手动关闭后不再自动配对');
  const cc = S.getCfg(); cc.on = false; cc.autoOff = true; S.setCfg(cc); await S.autoPair(); ok(!S.getCfg().on, '用户手动关闭同步后,不会被自动重新开启');

  console.log('点「立即同步」不重开设置面板');
  swapTo(A1); const c2 = S.getCfg(); c2.on = true; c2.autoOff = false; S.setCfg(c2);
  let sheets = 0; const oldSheet = A.sheet; A.sheet = function () { sheets++; return oldSheet.apply(this, arguments); };
  const box = mk('#syncBox'); box.innerHTML = 'OLD';
  const btn = { dataset: { act: 'sync-now' }, textContent: '立即同步', disabled: false };
  (handlersAll.click || []).forEach((h) => h({ target: { closest: (q) => (q === '[data-act]' ? btn : null) } })); await tick(120);
  ok(sheets === 0, '点「立即同步」:没有重新打开面板(不会滑入、不会回到顶部),共 ' + sheets + ' 次');
  ok(box.innerHTML !== 'OLD' && /已开启|同步/.test(box.innerHTML), '同步状态块原地刷新');
  A.sheet = oldSheet;
  console.log('\n自动配对测试通过:' + n); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
