// 时区回归:真实时刻不变、当地日期边界、夏令时、日历互通、课表幂等。
const assert = require('node:assert/strict');
const C = require('../core'); require('../parse'); require('../sched'); require('../holiday');
const st = C.fresh(); global.A = { st }; st.settings.timeZone = 'Asia/Shanghai';
const iso = (v) => new Date(v).toISOString();
const at = (v, zone) => C.parseDateTime(v, zone || C.timeZone());
let checks = 0;
const equal = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
const t = Date.parse('2026-11-19T01:00:00Z');
equal(C.fmtT(t), '09:00', '北京时间');
C.changeTimeZone(st, 'America/New_York');
equal(C.dateVal(t) + ' ' + C.fmtT(t), '2026-11-18 20:00', '纽约前一天');
equal(C.dayLabel(t, Date.parse('2026-11-19T06:00:00Z')), '昨天', '当地昨天');
C.changeTimeZone(st, 'Asia/Kathmandu');
equal(C.fmtT(t), '06:45', '45 分钟偏移');
equal(iso(at('2026-11-19T06:45')), '2026-11-19T01:00:00.000Z', '输入反向换算');
equal(C.changeTimeZone(st, 'Invalid/Zone'), false, '无效时区不覆盖设置');
equal(st.settings.timeZone, 'Asia/Kathmandu', '无效时区保留当前设置');
equal(at('2026-02-30'), null, '拒绝无效日期');

C.changeTimeZone(st, 'America/New_York');
const spring = at('2026-03-08'), fall = at('2026-11-01');
equal((C.addDays(spring, 1) - spring) / C.MIN, 23 * 60, '春季一天 23 小时');
equal((C.addDays(fall, 1) - fall) / C.MIN, 25 * 60, '秋季一天 25 小时');
equal(C.fmtT(C.atMinute(spring, 540)), '09:00', '夏令时当天仍是 9 点');
equal(iso(at('2026-03-08T02:30')), '2026-03-08T07:30:00.000Z', '缺失时刻顺延至 03:30');
equal(iso(at('2026-11-01T01:30')), '2026-11-01T05:30:00.000Z', '重复时刻选择第一次');
equal(C.calendarDiff(at('2026-03-09'), at('2026-03-07')), 2, '日历天数不受夏令时影响');
equal(C.dateVal(C.addDays(at('2026-03-07T09:00'), 1)) + ' ' + C.fmtT(C.addDays(at('2026-03-07T09:00'), 1)), '2026-03-08 09:00', '日历加一天保留钟面时间');
st.blocks = [
  { id: 'late', start: at('2026-11-01T23:30'), end: at('2026-11-02T00:30') },
  { id: 'carry', start: at('2026-10-31T23:30'), end: at('2026-11-01T00:30') },
  { id: 'next', start: at('2026-11-02'), end: at('2026-11-02T01:00') },
];
equal(C.blocksOn(st, fall).map((b) => b.id), ['carry', 'late'], '跨夜显示、25 小时日期边界、按时间排序');
st.blocks = [{ id: 'next', start: at('2026-03-09T00:30'), end: at('2026-03-09T01:30') }];
equal(C.blocksOn(st, spring).length, 0, '23 小时日不误收次日安排');

const calendar = (lines) => 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:跨国会议\r\n' + lines + '\r\nEND:VEVENT\r\nEND:VCALENDAR';
const now = Date.parse('2026-01-01T00:00:00Z');
C.changeTimeZone(st, 'Asia/Shanghai');
let imported = C.fromICS(calendar('DTSTART:20261119T010000Z\r\nDTEND:20261119T020000Z'), now);
equal(imported[0].start, t, '导入 UTC');
imported = C.fromICS(calendar('DTSTART;TZID=America/New_York:20261118T200000\r\nDTEND;TZID=America/New_York:20261118T210000'), now);
equal(imported[0].start, t, '导入 TZID');
imported = C.fromICS(calendar('DTSTART:20261119T090000\r\nDTEND:20261119T100000'), now);
equal(imported[0].start, t, '无时区日历按当前时区解释');
equal(C.fromICS(calendar('DTSTART;TZID=Invalid/Zone:20261119T090000'), now).length, 0, '未知日历时区不猜测');
imported = C.fromICS(calendar('DTSTART;VALUE=DATE:20261119\r\nDTEND;VALUE=DATE:20261121'), now);
equal(C.dateVal(imported[0].due) + ' ' + C.fmtT(imported[0].due), '2026-11-20 23:59', '全天事件结束日是排除边界');
st.blocks = [{ id: 'ev', title: '跨国会议', domain: 'work', kind: 'commit', start: t, end: t + 3600000 }];
const exported = C.toICS(st);
assert(exported.includes('DTSTART:20261119T010000Z')); checks++;
C.changeTimeZone(st, 'America/Los_Angeles');
equal(C.fromICS(exported, now)[0].start, t, '跨时区导入导出保留实际时刻');
equal(st.blocks[0].start, t, '切换不修改原会议时间');

const parsed = C.parse('明天上午九点开会,一小时', st, t);
const event = parsed.items.find((d) => d.type === 'event');
assert(event, '中文事件可解析'); checks++;
equal(C.dateVal(event.start) + ' ' + C.fmtT(event.start), '2026-11-19 09:00', '明天按当前时区解释');

st.items = []; st.blocks = []; st.habits = [];
C.changeTimeZone(st, 'Asia/Shanghai');
const monday = at('2026-11-16T07:00');
st.settings.term = { start: at('2026-11-16'), weeks: 30, timeZone: C.timeZone() };
const h = C.addRoutine(st, { title: '高等数学', days: [0], start: 540, end: 600, skipHoliday: false }, monday);
C.plan(st, monday, 'inc');
const before = st.blocks.filter((b) => b.habitId === h.id).map((b) => [b.id, b.start, b.hkey]);
C.changeTimeZone(st, 'America/New_York');
C.plan(st, monday, 'inc'); C.ensureHorizon(st, Date.parse('2027-09-01T00:00:00Z'), monday);
equal(before, st.blocks.filter((b) => before.some((row) => row[0] === b.id)).map((b) => [b.id, b.start, b.hkey]), '已有课表没有移动或重复');
equal(h.timeZone, 'Asia/Shanghai', '课表保留原时区');
equal(new Set(st.blocks.filter((b) => b.habitId === h.id).map((b) => b.hkey)).size, st.blocks.filter((b) => b.habitId === h.id).length, '扩展课表不重复');
assert(st.blocks.filter((b) => b.habitId === h.id).every((b) => C.withTimeZone(h.timeZone, () => C.fmtT(b.start) === '09:00'))); checks++;
C.changeTimeZone(st, 'Asia/Shanghai'); C.plan(st, monday, 'inc');
equal(before, st.blocks.filter((b) => before.some((row) => row[0] === b.id)).map((b) => [b.id, b.start, b.hkey]), '切回原时区仍保持原安排');

st.items = []; st.blocks = []; st.habits = []; st.settings.term = null;
C.changeTimeZone(st, 'America/New_York');
const h2 = C.addRoutine(st, { title: '夏令时课表', days: [6], start: 540, end: 600, skipHoliday: false }, at('2026-03-01'));
C.plan(st, at('2026-03-01'), 'inc');
equal(st.blocks.filter((b) => b.habitId === h2.id).slice(0, 3).map((b) => C.fmtT(b.start)), ['09:00', '09:00', '09:00'], '夏令时前后固定课仍是 9 点');
st.settings.term = { start: at('2026-03-02'), weeks: 18, timeZone: C.timeZone() };
equal(C.weekNo(st, at('2026-03-09')), 2, '夏令时后学期周次正确');
console.log('时区与时间顺序回归通过: ' + checks);
