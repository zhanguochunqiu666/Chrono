// Independent browser contexts, serialized encrypted cloud transport, no shared records.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const NOW = Date.parse('2026-11-16T00:00:00Z'), CODE = 'timezone-regression-only';
const copy = (o) => JSON.parse(JSON.stringify(o));
let checks = 0;
function ok(condition, message) { assert.ok(condition, message); checks++; console.log('  ✓ ' + message); }
function cloudServer() {
  return { data: null, conflict: false, writes: 0, async fetch(url, options) {
    const response = (status, data) => ({ status, json: async () => copy(data) });
    if (options.method === 'GET') return this.data ? response(200, this.data) : response(404, {});
    const body = JSON.parse(options.body), rev = this.data ? this.data.rev : 0;
    if (this.conflict || body.rev !== rev) return response(409, { rev });
    this.data = { rev: rev + 1, blob: body.blob }; this.writes++;
    return response(200, { rev: rev + 1 });
  } };
}
function device(zone, cloud, store = {}) {
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [NOW])); } static now() { return NOW; } }
  const context = vm.createContext({ console, Date: Clock, crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, AbortController, btoa, atob,
    Intl: { DateTimeFormat: function(locale, opts) { return new Intl.DateTimeFormat(locale, { timeZone: zone, ...opts }); } },
    document: { addEventListener() {}, hidden: false }, navigator: {}, location: { protocol: 'https:', origin: 'https://test.invalid', hostname: 'test.invalid' },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, addEventListener() {},
    localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } },
    fetch: cloud.fetch.bind(cloud)
  });
  context.window = context;
  for (const file of ['core', 'sched']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file + '.js'), 'utf8'), context);
  const C = context.Chrono;
  context.A = { st: C.load(), $: () => null, esc: (s) => s, render() {}, toast() {} };
  context.A.st.settings.timeZone = zone;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'sync.js'), 'utf8'), context);
  const S = context.A.Sync;
  if (!S.getCfg().on) S.setCfg({ ...S.getCfg(), on: true, code: CODE, server: 'https://test.invalid/sync' });
  return { C, S, A: context.A, store, get st() { return context.A.st; }, async sync() { const r = await S.run(false); assert.ok(!r.error, r.error); return r; } };
}
function fixture(d, legacy = true) {
  const C = d.C, anchor = C.parseDateTime('2026-11-16', 'Asia/Shanghai');
  const h = { id: 'class1', title: '高等数学', routine: true, kind: 'commit', domain: 'study', days: [0], time: 600, dur: 60, anchor, skipHoliday: false, ex: [] };
  if (!legacy) h.timeZone = 'Asia/Shanghai';
  d.st.habits = [h];
  const block = (id, zone) => { const day = C.parseDateTime('2026-11-23', zone), start = day + 600 * 60000; return { id, habitId: h.id, routineId: h.id, hkey: h.id + '@' + day, title: h.title, kind: 'commit', locked: true, start, end: start + 3600000 }; };
  return { h, block };
}
const active = (d, date = '2026-11-23', id = 'class1') => d.st.blocks.filter((b) => !b.skipped && b.habitId === id && d.C.occurrenceOf(b, d.st.habits.find((h) => h.id === id)) === date);

(async () => {
  const cloud = cloudServer(), a = device('Asia/Shanghai', cloud), b = device('America/New_York', cloud);
  const { block } = fixture(a);
  a.st.blocks = [block('china', 'Asia/Shanghai'), block('utc', 'UTC'), block('ny', 'America/New_York')];
  const expected = a.st.blocks[0].start;
  // Seed an actual legacy server snapshot with a future timestamp (clock skew).
  const legacy = a.S._collect(a.st, {}, NOW + 86400000);
  legacy.single.settings.d.timeZone = 'Asia/Shanghai';
  cloud.data = { rev: 1, blob: await a.S._seal(CODE, legacy) };
  await b.sync();
  ok(active(b).length === 1 && active(b)[0].start === expected, '跨时区的固定、锁定课程合并为创建地时间的一份');
  ok(b.st.settings.timeZone === 'America/New_York' && b.st.habits[0].timeZone === 'Asia/Shanghai', '显示时区独立保存,旧模板从创建日期恢复来源时区');
  const uploaded = await b.S._open(CODE, cloud.data.blob);
  ok(Object.values(uploaded.ents.blocks).filter((p) => p.d && !p.d.skipped).length === 1, '上传的是修复后的结果');
  ok(uploaded.ents.blocks.utc.u > legacy.ents.blocks.utc.u && uploaded.ents.blocks.ny.u > legacy.ents.blocks.ny.u, '修复版本超过时钟超前的旧记录');
  ok(!('timeZone' in uploaded.single.settings.d), '显示时区不再上传到共享设置');
  ok(uploaded.ents.blocks.utc.d.duplicateOf === 'china', '重复记录保留并标记,没有直接删除数据');
  await a.sync();
  for (let i = 0; i < 3; i++) {
    b.C.changeTimeZone(b.st, i % 2 ? 'Europe/London' : 'America/New_York');
    for (const d of [a, b]) { d.C.plan(d.st, NOW, 'inc'); d.C.ensureHorizon(d.st, NOW + 180 * 86400000, NOW); await d.sync(); }
  }
  const b2 = device('America/New_York', cloud, b.store); await b2.sync();
  ok(active(a).length === 1 && active(b2).length === 1 && active(b2)[0].start === expected, '切换时区、翻周、反复同步、重新打开都不再重复');
  ok(a.st.settings.timeZone === 'Asia/Shanghai', '其他设备切换时区不会改变本机选择');
  const before = cloud.writes; await b2.sync(); await a.sync(); await b2.sync();
  ok(cloud.writes === before, '同步收敛后不反复上传');
  const fresh = device('Europe/London', cloud); await fresh.sync();
  ok(active(fresh).length === 1 && fresh.st.settings.timeZone === 'Europe/London', '全新设备直接拿到修复结果并保留自己的时区');
  // An offline old client tries to upload an active copy with a newer timestamp.
  const stale = copy(legacy), current = await a.S._open(CODE, cloud.data.blob);
  stale.ents.blocks.utc.u = NOW + 7 * 86400000;
  const merged = a.S._merge(current, stale);
  ok(merged.ents.blocks.utc.d.skipped && merged.ents.blocks.utc.d.duplicateOf, '离线旧副本不能擦掉重复标记');

  const moved = device('America/New_York', cloudServer()), f = fixture(moved, false);
  moved.st.blocks = [f.block('normal', 'Asia/Shanghai'), { ...f.block('moved', 'UTC'), moved: true, pin: true }];
  moved.st.blocks[1].start += 86400000; moved.st.blocks[1].end += 86400000;
  const movedStart = moved.st.blocks[1].start;
  moved.C.repairRecurring(moved.st);
  ok(active(moved).length === 1 && active(moved)[0].id === 'moved' && active(moved)[0].start === movedStart, '手动移动过的课程保留新位置和原定日期身份');
  moved.st.blocks.push({ ...f.block('done', 'Asia/Shanghai'), done: true, actual: 65 });
  moved.C.repairRecurring(moved.st);
  ok(active(moved).length === 2, '两份存在不同明确操作时都保留,避免误删完成记录');
  const completed = device('UTC', cloudServer()), fc = fixture(completed, false);
  completed.st.blocks = [{ ...fc.block('done', 'UTC'), done: true, actual: 65 }, fc.block('auto', 'Asia/Shanghai')];
  completed.C.repairRecurring(completed.st);
  ok(active(completed).length === 1 && active(completed)[0].id === 'done' && active(completed)[0].actual === 65, '完成记录优先于自动副本,保留实际用时');
  completed.st.habits.push({ ...completed.st.habits[0], id: 'class2' });
  completed.st.blocks.push({ ...fc.block('same-title', 'UTC'), habitId: 'class2', routineId: 'class2', hkey: 'class2@' + completed.C.parseDateTime('2026-11-23', 'UTC') });
  completed.C.repairRecurring(completed.st);
  ok(active(completed, '2026-11-23', 'class2').length === 1, '同名的不同课程模板不会被合并');

  const c1 = device('Asia/Shanghai', cloudServer()), c2 = device('America/New_York', cloudServer());
  fixture(c1, false); c2.st.habits = copy(c1.st.habits);
  c1.C.genRoutines(c1.st, NOW, {}, 30); c2.C.genRoutines(c2.st, NOW, {}, 30);
  ok(active(c1)[0].id === active(c2)[0].id, '两台设备独立生成同次课程使用一致身份');
  const habit = { ...c1.st.habits[0], id: 'habit1', routine: false, kind: 'habit' };
  c1.st.habits.push(habit); c1.C.genHabits(c1.st, NOW, { habitMiss: [] }, 30);
  const hb = c1.st.blocks.find((x) => x.habitId === 'habit1');
  // The course occupies the same slot; place the fixed habit at another hour.
  if (!hb) { habit.time = 900; c1.C.genHabits(c1.st, NOW, { habitMiss: [] }, 30); }
  const fixed = c1.st.blocks.find((x) => x.habitId === 'habit1');
  c1.st.blocks.push({ ...fixed, id: 'habit-copy', hkey: habit.id + '@' + c1.C.parseDateTime(fixed.occurrenceDate, 'UTC') });
  c1.C.repairRecurring(c1.st);
  ok(c1.st.blocks.filter((x) => !x.skipped && x.habitId === 'habit1' && x.occurrenceDate === fixed.occurrenceDate).length === 1, '固定时间习惯也参与跨时区去重');
  c1.C.skipToday(c1.st, active(c1)[0].id, NOW);
  c1.C.genRoutines(c1.st, NOW, {}, 30);
  ok(active(c1).length === 0, '明确跳过的课程不再生成');
  c2.C.routineException(c2.st, 'class1', { date: c2.C.parseDateTime('2026-11-23'), type: 'move', to: { date: c2.C.parseDateTime('2026-11-24'), start: 660, end: 720 } }, NOW);
  c2.C.genRoutines(c2.st, NOW, {}, 30);
  ok(active(c2).length === 1 && active(c2)[0].start === c2.C.parseDateTime('2026-11-24T11:00', 'Asia/Shanghai'), '跨时区调课继续只生成一份');
  c2.C.plan(c2.st, NOW, 'full'); c2.C.plan(c2.st, NOW, 'full');
  ok(new Set(c2.st.blocks.map((x) => x.id)).size === c2.st.blocks.length, '重复全量排程不产生重复 ID');

  const x = copy(legacy), y = copy(legacy); x.ents.blocks.china.d.title = 'A'; y.ents.blocks.china.d.title = 'B';
  ok(JSON.stringify(a.S._merge(x, y).ents) === JSON.stringify(a.S._merge(y, x).ents), '同毫秒修改按一致规则收敛');
  const gc = cloudServer(), g = device('UTC', gc);
  g.st.blocks = [{ id: 'obsolete', skipped: true, end: NOW - 10 * 86400000 }];
  await g.sync();
  const cleaned = await g.S._open(CODE, gc.data.blob);
  ok(cleaned.ents.blocks.obsolete.del === true, '清理旧普通块后上传删除标记');
  gc.conflict = true; g.st.settings.buffer = 35;
  const failed = await g.S.run(false);
  ok(!!failed.error && g.S.getCfg().status.ok === false && g.st.settings.buffer === 35, '连续版本冲突报失败且保留本机修改');
  gc.conflict = false; await g.sync();
  ok(g.S.getCfg().status.ok === true, '冲突解除后可以重新同步');
  console.log('\n跨时区同步测试通过:' + checks);
})().catch((error) => { console.error(error); process.exitCode = 1; });
