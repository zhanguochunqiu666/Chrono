// node tests/lock.test.js —— 「不可侵入」:任何自动排程都不能挪动它、不能压进它;会议/课程重叠只提示不替你挪
const C = require('../core.js'); require('../holiday.js'); require('../parse.js'); require('../sched.js');
const d = (y, m, dd, h = 0, mi = 0) => new Date(y, m - 1, dd, h, mi).getTime(), DAY = 86400000;
const now = d(2026, 11, 16, 8, 12), st = C.fresh();
const add = (t) => C.addItems(st, C.parse(t, st, now).items, now);
add('周三前写方案,三个小时'); add('周五前写报告,两个小时'); add('回复邮件,二十分钟'); C.addHabit(st, C.parse('每周三次健身,一小时', st, now).habits[0], now); C.plan(st, now, 'inc');
const L = st.blocks.filter((b) => !b.skipped && b.kind !== 'commit').slice(0, 4); L.forEach((b) => { b.locked = true; b.pin = true; });
const orig = L.map((b) => [b.id, b.start, b.end]);
const issues = [];
const check = (what) => {
  orig.forEach(([id, s, e]) => { const b = st.blocks.find((x) => x.id === id); if (!b || b.skipped || b.start !== s || b.end !== e) issues.push(what + ' → 被保护的块被挪动/删除'); });
  st.blocks.filter((x) => !x.skipped && x.kind !== 'commit' && !orig.some((o) => o[0] === x.id)).forEach((x) => orig.forEach(([id, s, e]) => { if (x.start < e && x.end > s) issues.push(what + ' → 「' + x.title + '」' + (x.habitId ? '(习惯)' : '') + ' 压进了被保护时间段'); }));
};
const fixedT = (t) => C.parse(t, st, now);
const run = (what, f) => { f(); check(what); };
run('重新排程(full)', () => C.plan(st, now, 'full'));
run('新增 3 个待办', () => { add('周三前做预算,四个小时'); add('周四前整理资料,两个小时'); add('周五前复习英语,三个小时'); C.plan(st, now, 'inc'); });
L.forEach((b) => { const x = st.blocks.find((y) => y.id === b.id); const s0 = x.start; });
run('新增固定时间习惯', () => { const lb = L[0], hr = new Date(lb.start).getHours(), dw = (new Date(lb.start).getDay() + 6) % 7; C.addHabit(st, { title: '早读', domain: 'study', energy: 'low', days: [dw], perWeek: 0, time: hr * 60 + new Date(lb.start).getMinutes(), dur: 30, pref: 'any', kind: 'habit', skipLeft: 1 }, now); C.plan(st, now, 'inc'); });
run('每周N次+固定时间', () => { const lb = L[1], hr = new Date(lb.start).getHours(); C.addHabit(st, { title: '拉伸', domain: 'health', energy: 'low', days: null, perWeek: 7, time: hr * 60 + new Date(lb.start).getMinutes(), dur: 20, pref: 'any', kind: 'habit', skipLeft: 1 }, now); C.plan(st, now, 'inc'); });
run('休假', () => { C.addAway(st, C.addDays(C.dayStart(now), 6), C.addDays(C.dayStart(now), 7), '出差', now); });
run('课表', () => { const lb = L[2], dw = (new Date(lb.start).getDay() + 6) % 7, m = new Date(lb.start).getHours() * 60; st.settings.term = { start: C.weekStart(now), weeks: 18 }; C.addRoutine(st, { title: '高数', days: [dw], start: m, end: m + 100 }, now); C.plan(st, now, 'inc'); });
run('新增事件(重叠)', () => { const lb = L[3]; C.addItems(st, [{ title: '开会', short: '开会', type: 'event', domain: 'work', energy: 'mid', ctx: '', priority: 2, status: 'planned', flex: 'fixed', lead: 15, postponed: 0, actual: 0, createdAt: now, start: lb.start, end: lb.start + 3600e3, estMin: 60, statedMin: 60, conf: 0.9, src: 'stated', hasClock: true }], now); C.plan(st, now, 'inc'); });
run('冲突:挪用配额', () => { st.items.filter((i) => i.type === 'task').forEach((i) => { i.borrow = true; }); C.plan(st, now, 'inc'); });
run('编辑事项', () => { const it = st.items.find((i) => i.type === 'task' && st.blocks.some((b) => b.itemId === i.id && b.locked)); if (it) C.editItem(st, it.id, { priority: 0 }, now); });
if (issues.length) { console.error([...new Set(issues)].join('\n')); process.exit(1); }
console.log('  ✓ 重新排程 / 新增待办 / 固定时间习惯 / 每周N次 / 休假 / 课表 / 挪用配额 / 编辑:被保护的块都没被挪动,也没有自动生成的块压进去');
const lb = L[3]; ok = st.blocks.some((b) => b.kind === 'commit' && !b.skipped && b.start < lb.end && b.end > lb.start) && C.isPinned(lb);
if (!ok) { console.error('冲突检测前提不成立'); process.exit(1); }
console.log('  ✓ 你自己新增的会议、课表里的课可以与之重叠(外部硬约束),界面会弹「冲突」提示,不替你挪');
console.log('\n不可侵入测试通过:2');
