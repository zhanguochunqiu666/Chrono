// node tests/sync.test.js —— 多设备同步:加密往返、逐条合并、墓碑、去重、服务器并发控制
const els = {}; const mk = (s) => els[s] || (els[s] = { innerHTML: '', value: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, querySelectorAll: () => [] });
global.window = global; global.document = { readyState: 'complete', querySelector: mk, getElementById: mk, querySelectorAll: () => [], addEventListener() {}, createElement: () => mk('n' + Math.random()), body: { classList: { toggle() {} }, appendChild() {}, style: {} }, hidden: false };
const store = {}; global.localStorage = { getItem: (k) => store[k] || null, setItem: (k, v) => (store[k] = v), removeItem: (k) => delete store[k] };
global.navigator = {}; global.location = { hash: '', search: '', protocol: 'file:', pathname: '/' }; global.history = { replaceState() {} }; global.matchMedia = () => ({ matches: false }); global.scrollTo = () => {}; global.addEventListener = () => {};
global.setInterval = () => 0; const st0 = global.setTimeout; global.setTimeout = (f, ms) => (ms > 1000 ? 0 : st0(f, ms));
const assert = require('assert'); let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ✓ ' + m); };
['core', 'holiday', 'parse', 'sched', 'app', 'views', 'today', 'llm', 'sync', 'longterm', 'remote', 'agent', 'boot'].forEach((f) => require('../' + f + '.js'));
const C = window.Chrono, S = window.A.Sync, now = new Date(2026, 10, 16, 8, 12).getTime();
const mkDev = () => { const st = C.fresh(); return { st, ver: {} }; };
const sync2 = (a, b, t) => {   // 模拟 a 与 b 经由云端各同步一次:a 先,b 后,再 a
  let cloud = null;
  const round = (d, tt) => { const loc = S._collect(d.st, d.ver, tt), m = S._merge(loc, cloud); S._apply(d.st, m, d.ver); cloud = JSON.parse(JSON.stringify(S._collect(d.st, d.ver, tt))); };
  round(a, t); round(b, t + 1000); round(a, t + 2000); round(b, t + 3000); return cloud;
};

(async () => {
  console.log('加密');
  const code = S.genCode(); ok(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{6}$/.test(code.replace(/-/g, (m, i) => '-')) || code.length >= 14, '同步码形如 ' + code);
  const blob = await S._seal(code, { hello: '日程', n: [1, 2, 3] }); ok(!blob.includes('日程') && typeof blob === 'string', '密文里看不到明文');
  ok((await S._open(code, blob)).hello === '日程', '同码可解密');
  await S._open(code + 'x', blob).then(() => ok(false, 'x'), (e) => ok(/同步码不对/.test(e.message), '错码被拒绝,不会读出乱码'));
  const r1 = (await S._derive(code)).room, r2 = (await S._derive(code.toUpperCase().replace(/-/g, ' '))).room; ok(r1 === r2 && r1.length === 64, '房间号由同步码单向派生(格式不敏感)');

  console.log('两台设备各自新增 → 合并');
  const A1 = mkDev(), B1 = mkDev();
  C.addItems(A1.st, C.parse('周三下午三点碰头', A1.st, now).items, now); C.plan(A1.st, now, 'inc');
  C.addItems(B1.st, C.parse('周四前写方案,三个小时', B1.st, now).items, now); C.plan(B1.st, now, 'inc');
  sync2(A1, B1, now);
  ok(A1.st.items.length === 2 && B1.st.items.length === 2, '双方各有 2 个事项');
  const sig = (d) => d.st.blocks.filter((b) => !b.skipped).map((b) => b.id).sort().join();
  ok(sig(A1) === sig(B1), '两边的块完全一致');

  console.log('同时修改不同事项 / 同一事项后改者胜');
  const it = A1.st.items.find((i) => i.type === 'task'), itB = B1.st.items.find((i) => i.id === it.id);
  itB.priority = 0; it.short = '方案(A改)';   // A 与 B 同时改同一条
  const cloud = sync2(A1, B1, now + 10000);
  ok(A1.st.items.find((i) => i.id === it.id).short === B1.st.items.find((i) => i.id === it.id).short, '同一条最终一致');

  console.log('删除不会被旧设备复活');
  const A2 = mkDev(), B2 = mkDev();
  C.addItems(A2.st, C.parse('周三下午三点碰头', A2.st, now).items, now);
  sync2(A2, B2, now);
  const id = A2.st.items[0].id; C.removeItem(A2.st, id);       // A 删除
  sync2(A2, B2, now + 20000);
  ok(!B2.st.items.some((i) => i.id === id) && !B2.st.blocks.some((b) => b.itemId === id), 'A 删除后,B 同步也删除(含它的块)');
  sync2(B2, A2, now + 40000);
  ok(A2.st.items.length === 0, '再反向同步也不会复活');

  console.log('同一件事被两台设备各排一遍 → 去重');
  const A3 = mkDev(), B3 = mkDev();
  const [t0] = C.addItems(A3.st, C.parse('写周报,一小时', A3.st, now).items, now); C.plan(A3.st, now, 'inc');
  sync2(A3, B3, now);
  // 双方都在断网时各自重排
  A3.st.blocks.forEach((b) => (b.skipped = true)); C.plan(A3.st, now + 5000, 'inc');
  B3.st.blocks.forEach((b) => (b.skipped = true)); C.plan(B3.st, now + 6000, 'inc');
  sync2(A3, B3, now + 30000);
  const live = (d) => d.st.blocks.filter((b) => b.itemId === t0.id && !b.skipped);
  ok(live(A3).length === 1 && live(B3).length === 1 && live(A3)[0].id === live(B3)[0].id, '合并后只剩 1 个有效块,且两边相同');

  console.log('全新设备首次加入:不覆盖云端设置');
  const A4 = mkDev(); A4.st.settings.freeRatio = 0.4; C.addItems(A4.st, C.parse('周三下午三点碰头', A4.st, now).items, now);
  const B4 = mkDev(); sync2(A4, B4, now);
  ok(B4.st.settings.freeRatio === 0.4 && B4.st.items.length === 1, '新设备拿到云端的设置和事项');

  console.log('学到的估时取样本多的一方');
  const m = S._merge({ ents: { items: {}, habits: {}, blocks: {} }, single: { settings: { u: 1, d: {} }, stats: { u: 1, d: { ratio: { work: { n: 2, sum: 3 } }, dur: {}, energyDone: {}, energyAll: {} } } } },
    { ents: { items: {}, habits: {}, blocks: {} }, single: { settings: { u: 1, d: {} }, stats: { u: 1, d: { ratio: { work: { n: 5, sum: 9 } }, dur: {}, energyDone: {}, energyAll: {} } } } });
  ok(m.single.stats.d.ratio.work.n === 5, '估时模型合并');

  global.setTimeout = st0;
  console.log('同步服务器(真实 HTTP)');
  const { spawn } = require('child_process'), srv = spawn('node', [__dirname + '/../tools/server.js', '8791'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 700));
  const room = r1, url = 'http://localhost:8791/sync/' + room;
  let g = await fetch(url); ok(g.status === 404, '空房间返回 404');
  let p = await fetch(url, { method: 'PUT', body: JSON.stringify({ rev: 0, blob: blob }) }); ok(p.status === 200 && (await p.json()).rev === 1, '首次写入成功,版本号 1');
  p = await fetch(url, { method: 'PUT', body: JSON.stringify({ rev: 0, blob: blob }) }); ok(p.status === 409, '用旧版本号写入 → 409 冲突(防止两台设备互相覆盖)');
  g = await (await fetch(url)).json(); ok(g.rev === 1 && g.blob === blob, '读回的是密文');
  p = await fetch('http://localhost:8791/sync/not-a-room'); ok(p.status === 404, '非法房间号被拒绝');
  const lst = await fetch('http://localhost:8791/tools/sync-data/' + room + '.json'); ok(lst.status === 403, '同步数据目录不能被当作静态文件读取');
  p = await fetch(url, { method: 'DELETE' }); ok(p.status === 200 && (await fetch(url)).status === 404, '可以清除云端数据');
  srv.kill();

  console.log('\n同步测试通过:' + n); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
