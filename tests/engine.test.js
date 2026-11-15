// node tests/engine.test.js —— 按方案「场景 A/B」跑一遍引擎
const C = require('../core.js'); require('../parse.js'); require('../sched.js');
const assert = require('assert');
const { MIN, DAY } = C;
let pass = 0; const ok = (c, m) => { assert(c, m); pass++; console.log('  ✓ ' + m); };

// 固定“现在”:2026-11-16 周一 08:12
const now = new Date(2026, 10, 16, 8, 12).getTime();
const st = C.fresh();

console.log('场景A:一句话录入四件事');
const text = '周四前把方案给张总，周三下午三点碰个头，周末记得带娃去打疫苗，还有这周五要还信用卡。';
const r = C.parse(text, st, now);
r.items.forEach((d) => console.log('   ', d.type, '|', d.short, '|', d.domain, d.energy, d.estMin + 'm', d.due ? 'due ' + new Date(d.due).toLocaleDateString() : '', d.start ? 'at ' + C.fmtT(d.start) : ''));
ok(r.items.length === 4, '解析出 4 个事项');
const [plan1, meet, vac, card] = r.items;
plan1.statedMin = 0;
ok(plan1.type === 'task' && plan1.energy === 'deep' && C.dow(plan1.due) === 3, '方案:深度任务,周四截止');
ok(meet.type === 'event' && C.dow(meet.start) === 2 && C.fmtT(meet.start) === '15:00', '碰头:周三 15:00 事件');
ok(vac.domain === 'health' || vac.domain === 'relation', '疫苗:领域=' + vac.domain);
ok(card.type === 'deadline' && card.domain === 'finance' && C.dow(card.due) === 4, '还款:财务期限,周五');
const meetEdit = r.items[1]; meetEdit.estMin = 90; meetEdit.end = meetEdit.start + 90 * MIN;
const added = C.addItems(st, r.items, now);
plan1.id = added[0].id; vac.id = added[2].id;
const res = C.plan(st, now, 'inc');
console.log('   排程:', st.blocks.filter(b => b.itemId).map(b => b.title + ' ' + new Date(b.start).toLocaleDateString() + ' ' + C.fmtT(b.start) + '-' + C.fmtT(b.end) + ' ←' + (b.why || '')).join('\n         '));
ok(res.conflicts.length === 0, '无冲突');
const planBlocks = st.blocks.filter((b) => b.itemId === plan1.id);
ok(planBlocks.length >= 2, '方案被拆成 ' + planBlocks.length + ' 块');
ok(planBlocks.every((b) => b.end <= plan1.due), '所有块都在截止前');
ok(planBlocks.every((b) => C.dow(b.start) !== 3) || planBlocks.some((b) => C.dow(b.start) < 3), '没有全堆在截止当天');
ok(planBlocks.every((b) => (b.end - b.start) / MIN <= 90 && (b.end - b.start) / MIN >= 60), '切块 60–90 分钟');
const vb = st.blocks.find((b) => b.itemId === vac.id);
ok(vb && C.dow(vb.start) >= 5, '疫苗落在周末');
ok(planBlocks.every((b) => b.why), '每个块都有解释');

console.log('留白与缓冲');
for (let k = 0; k < 7; k++) { const d = C.addDays(C.dayStart(now), k); ok(C.dayLoad(st, d) <= C.dayCap(st.settings), C.WD[C.dow(d)] + ' 负载 ≤ 容量(留白 25%)'); }
// 相邻块之间缓冲 ≥15 分钟
const sorted = st.blocks.slice().sort((a, b) => a.start - b.start); let minGap = 1e9;
for (let i = 1; i < sorted.length; i++) if (C.sameDay(sorted[i].start, sorted[i - 1].start)) minGap = Math.min(minGap, (sorted[i].start - sorted[i - 1].end) / MIN);
ok(minGap >= 15, '块间缓冲 ≥15 分钟(最小 ' + minGap + ')');

console.log('场景B:临时会议插入');
const nowB = now;
const before = JSON.stringify(st.blocks.map((b) => [b.id, b.start]));
const ev = C.parse('周三上午九点开会，两个小时', st, nowB).items[0];
ok(ev.type === 'event' && C.fmtT(ev.start) === '09:00' && ev.estMin === 120, '会议解析 09:00 / 120m');
const nBefore = st.blocks.filter(b => b.kind !== 'commit').length;
C.addItems(st, [ev], nowB);
// 临时事件可能覆盖已排任务,先增量(不动别人),冲突再全量
let rb = C.plan(st, nowB, 'inc');
const clash = st.blocks.filter((b) => b.kind !== 'commit' && !b.skipped && b.start < ev.end && b.end > ev.start);
console.log('   diff', JSON.stringify(rb.diff), 'conflicts', rb.conflicts.length);
ok(rb.conflicts.length === 0, '新会议插入后无冲突');
ok(st.blocks.filter(b => b.kind !== 'commit' && !b.skipped).length === nBefore, '被挤的块全部重新落位,数量不变');
ok(!st.blocks.some(b => b.kind !== 'commit' && !b.skipped && b.start < ev.end && b.end > ev.start), '没有块压在新会议上');
ok(rb.diff.kept >= 1, '其余块未改动:' + rb.diff.kept);

console.log('估时学习');
const st2 = C.fresh();
for (let i = 0; i < 3; i++) { st2.stats.ratio.work = { n: 3, sum: 6.3 }; }
const e = C.parse('明天写个方案，一个小时', st2, now).items[0];
console.log('   说 60m →', e.estMin, e.src);
ok(e.estMin > 60 && e.src === 'learned', '按个人历史把 1 小时修正为 ' + e.estMin + ' 分钟');

console.log('冲突消解');
const st3 = C.fresh();
const big = C.parse('明天前写完季度报告，三十个小时', st3, now).items[0]; big.id = C.addItems(st3, [big], now)[0].id;
const r3 = C.plan(st3, now, 'inc');
ok(r3.conflicts.length > 0, '排不下时产生冲突');
const opts = C.conflictOptions(st3, big.id, now); console.log('   选项:', opts.map(o => o.label + ' · ' + o.note).join(' | '));
ok(opts.length >= 1, '给出 ' + opts.length + ' 个可比较选项');

console.log('习惯 + 完成回写');
const st4 = C.fresh();
const h = C.parse('每周三次健身，一小时', st4, now).habits[0]; C.addHabit(st4, h, now);
C.plan(st4, now, 'full');
ok(st4.blocks.filter(b => b.habitId).length >= 5, '两周内生成习惯块 ' + st4.blocks.filter(b => b.habitId).length);
const t = C.parse('明天写周报，一小时', st4, now).items[0]; t.id = C.addItems(st4, [t], now)[0].id; C.plan(st4, now, 'inc');
const tb = st4.blocks.find(b => b.itemId === t.id); const d = C.markDone(st4, tb.id, 100, now);
ok(d.finished && st4.stats.ratio.work.n === 1, '完成后回写估时模型');


console.log('每月 / 每 N 天周期');
const st5 = C.fresh();
const hm = C.parse('每月18号还信用卡', st5, now).habits[0]; ok(hm.monthDay === 18 && C.habitLabel(hm) === '每月 18 号', '每月 18 号 → 月周期');
const he = C.parse('每3天浇花,十分钟', st5, now).habits[0]; ok(he.every === 3 && he.dur === 10, '每 3 天 → 间隔周期');
C.addHabit(st5, hm, now); C.addHabit(st5, he, now); C.plan(st5, now, 'full');
const days = (h) => st5.blocks.filter((b) => b.habitId === h.id && b.start < C.dayStart(now) + 14 * 86400000).map((b) => new Date(b.start).getDate());
ok(days(hm).length === 1 && days(hm)[0] === 18, '月周期只在 18 号生成');
ok(days(he).join() === '16,19,22,25,28', '间隔周期每 3 天一次:' + days(he).join());

console.log('休假 / 出差');
const aw = C.parse('下周三到周五出差', st5, now).aways[0]; ok(aw && C.dow(aw.from) === 2 && C.dow(aw.to) === 4, '「下周三到周五出差」解析为 3 天');
const one = C.parse('明天请假', st5, now).aways[0]; ok(one && one.from === one.to, '「明天请假」解析为单日');
const t6 = C.addItems(st5, C.parse('周五前写方案,四个小时', st5, now).items, now)[0]; C.plan(st5, now, 'inc');
const nBefore5 = st5.blocks.filter((b) => b.itemId === t6.id && !b.skipped).length;
const r6 = C.addAway(st5, C.addDays(C.dayStart(now), 1), C.addDays(C.dayStart(now), 1), '请假', now);
ok(!st5.blocks.some((b) => !b.skipped && C.sameDay(b.start, C.addDays(C.dayStart(now), 1))), '请假当天没有任何块');
ok(st5.blocks.filter((b) => b.itemId === t6.id && !b.skipped).length === nBefore5, '被让位的块重新落到了其他天,总量不变');
C.removeAway(st5, st5.settings.off[0].id, now); ok(st5.settings.off.length === 0, '可以取消');

console.log('自定义时长');
const PD = C.parseDurText; const cases = [['50', 50], ['90分钟', 90], ['90 分钟', 90], ['1.5小时', 90], ['1.5 小时', 90], ['1小时20分', 80], ['1 小时 20 分', 80], ['1:30', 90], ['1：30', 90], ['2h', 120], ['45min', 45], ['一个半小时', 90], ['半小时', 30], ['两小时', 120], ['十五分钟', 15], ['3 小时', 180]];
cases.forEach(([t, m]) => ok(PD(t) === m, '「' + t + '」→ ' + m + ' 分钟'));
ok(PD('') === null && PD('abc') === null && PD('0') === null && PD('2000') === null && PD('-5') === null, '空 / 乱写 / 0 / 超过 24 小时 → 拒绝');
ok(PD(C.fmtDur(80)) === 80 && PD(C.fmtDur(125)) === 125 && PD(C.fmtDur(45)) === 45, '界面显示的格式可以被原样读回');

console.log('洞察 / ICS / CSV');
ok(C.toICS(st).includes('BEGIN:VALARM'), 'ICS 含提醒');
ok(C.toCSV(st).split('\n').length > 3, 'CSV 导出');
ok(Array.isArray(C.insights(st, now)), '洞察可生成');

console.log('\n全部通过:' + pass);
