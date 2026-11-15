// node tests/agent.test.js —— 大模型助手:上下文、操作校验、预览确认、调课/停课/改期/放假/课表导入、追问、路由
const els = {}; const mk = (s) => els[s] || (els[s] = { innerHTML: '', value: '', style: {}, dataset: {}, checked: true, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, addEventListener() {}, querySelectorAll: () => [], focus() {}, click() {}, remove() {}, insertAdjacentHTML() {}, querySelector: () => null, setAttribute() {}, getAttribute() { return 'false'; } });
global.window = global; const handlers = {};
global.document = { readyState: 'complete', querySelector: mk, getElementById: mk, querySelectorAll: () => [], addEventListener: (t, f) => (handlers[t] = handlers[t] || []).push(f), createElement: () => mk('n' + Math.random()), body: { classList: { toggle() {} }, appendChild() {}, style: {} }, hidden: false };
const store = {}; global.localStorage = { getItem: (k) => store[k] || null, setItem: (k, v) => (store[k] = v), removeItem: (k) => delete store[k] };
global.navigator = {}; global.location = { hash: '', search: '', protocol: 'file:', pathname: '/' }; global.history = { replaceState() {} }; global.matchMedia = () => ({ matches: false }); global.scrollTo = () => {}; global.addEventListener = () => {};
global.setInterval = () => 0; const st0 = global.setTimeout; global.setTimeout = (f, ms) => (ms > 1000 ? 0 : st0(f, ms));
global.URL = Object.assign(global.URL, { createObjectURL: () => 'blob:x', revokeObjectURL() {} });
const assert = require('assert'); let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ✓ ' + m); };
['core', 'holiday', 'parse', 'sched', 'app', 'views', 'today', 'llm', 'sync', 'longterm', 'remote', 'agent', 'boot'].forEach((f) => require('../' + f + '.js'));
const A = window.A, C = window.Chrono, L = A.LLM, MIN = 60000, DAY = 86400000;
const click = (act, data) => { const el = { dataset: Object.assign({ act }, data || {}), textContent: '', isConnected: true }; const e = { target: { closest: (s) => (s === '[data-act]' ? el : null) } }; (handlers.click || []).forEach((h) => h(e)); };
const sheet = () => els['#sheet-root'].innerHTML; const tick = () => new Promise((r) => st0(r, 25));
const ymd = (ts) => { const d = new Date(ts); return d.getFullYear() + '-' + C.p2(d.getMonth() + 1) + '-' + C.p2(d.getDate()); };
const t0 = C.dayStart(Date.now()), day = (k) => ymd(C.addDays(t0, k));
L.setCfg(Object.assign(L.getCfg(), { key: 'sk', preset: 'anthropic', fmt: 'anthropic', base: 'https://api.anthropic.com', model: 'm', consent: true, textMode: 'fallback' }));
L._setPrep(async () => ({ mediaType: 'image/jpeg', data: 'IMG' }));
let reqs = [], reply = null;
global.fetch = async (u, o) => { const b = JSON.parse(o.body); reqs.push(b); return { ok: true, status: 200, text: async () => JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(reply(b)) }] }) }; };
const lastUser = () => { const c = reqs[reqs.length - 1].messages[0].content; return c.filter((x) => x.type === 'text').map((x) => x.text).join('\n'); };
mk('#sheet-root'); const fresh = () => { A.st = C.fresh(); A.st.meta.onboarded = true; C.save(A.st); els['#sheet-root'].innerHTML = ''; reqs = []; };

(async () => {
  console.log('导入课表(图片 + 文字)');
  fresh();
  reply = () => ({ term: { week1_monday: '2026-09-07', current_week: null, weeks: 18 }, clarify: '', courses: [
    { name: '高等数学', teacher: '王老师', slots: [{ days: [1, 3], start: '08:00', end: '09:40', weeks_text: '1-16周', location: '教二 301' }] },
    { name: '大学物理实验', slots: [{ days: [4], start: '14:00', end: '16:00', weeks_text: '1-15周(单)', location: '实验楼 B2' }] },
    { name: '英语听说', slots: [{ days: [5], start: '10:00', end: '11:40', weeks_text: '', location: '外语楼 204' }] },
    { name: '', slots: [{ days: [1], start: '08:00', end: '09:00' }] }] });
  A.addPending([{ type: 'image/png' }]); const files = A.pending.map((p) => p.file); A.clearPending();
  A.agent('第1周是9月7日', files, 'timetable'); await tick(); await tick();
  ok(/课表转录员/.test(reqs[0].system) && reqs[0].messages[0].content.some((c) => c.type === 'image'), '课表导入:专用转录提示词,并带图片');
  ok(/今天是 \d{4}-\d{2}-\d{2}/.test(lastUser()) && lastUser().includes('第1周是9月7日'), '转录请求里带今天的日期和用户的说明');
  ok(sheet().includes('我理解的是') && sheet().includes('高等数学') && sheet().includes('大学物理实验') && sheet().includes('识别到 3 门课'), '预览列出 3 门课(没有名字的一项被丢弃)');
  ok(sheet().includes('agTermDate') && sheet().includes('2026') || sheet().includes('课表需要知道学期周次'), '需要学期时展示周次输入');
  click('ag-apply'); await tick();
  const rs = A.st.habits.filter((h) => h.routine); ok(rs.length === 3, '生成 3 个固定周程');
  ok(A.st.settings.term && C.ymd === undefined && ymd(A.st.settings.term.start) === '2026-09-07', '学期第 1 周周一 = 2026-09-07(来自模型识别)');
  const phy = rs.find((h) => h.title === '大学物理实验'); ok(phy.parity === 'odd' && JSON.stringify(phy.weeks) === '[[1,15]]' && phy.loc === '实验楼 B2', '单周 + 周次 + 地点被保存');
  ok(rs.find((h) => h.title === '高等数学').days.join() === '0,2', '星期 1、3 → 周一、周三');

  console.log('上下文含 ID,调课(只影响一次)');
  fresh(); A.st.settings.term = { start: C.weekStart(t0), weeks: 18 };
  const math = C.addRoutine(A.st, { title: '高等数学', days: [(new Date(C.addDays(t0, 2)).getDay() + 6) % 7], start: 8 * 60, end: 9 * 60 + 40, loc: '教二 301', domain: 'study' }, Date.now() - 60 * MIN * 24 * 3); C.plan(A.st, Date.now(), 'inc');
  const target = C.addDays(t0, 2);
  reply = (b) => ({ summary: '把后天的高数调到下午两点', term: {}, ops: [{ op: 'move_occurrence', routine_id: 'r:' + math.id, date: ymd(target), to_date: ymd(target), start: '14:00', end: '15:40', reason: '老师通知' }], clarify: '', answer: '' });
  await A.agent('后天的高数调到下午两点'); await tick();
  ok(lastUser().includes('r:' + math.id) && lastUser().includes('高等数学') && lastUser().includes('教二 301'), '上下文里有这门课及其 ID');
  ok(sheet().includes('调到') && sheet().includes('14:00–15:40') && sheet().includes('只影响这一次'), '预览:这一次调到 14:00–15:40');
  const before = JSON.stringify(A.st.blocks.map((b) => b.id));
  click('ag-apply'); await tick();
  const mv = A.st.blocks.find((b) => b.habitId === math.id && !b.skipped && C.dayStart(b.start) === target);
  ok(mv && C.fmtT(mv.start) === '14:00' && C.fmtT(mv.end) === '15:40' && /调课/.test(mv.why), '课程块实际改到了 14:00–15:40');
  ok(A.st.habits.find((h) => h.id === math.id).time === 8 * 60, '固定周程的常规时间没有被改(只是这一次例外)');
  click('undo'); ok(true, '撤销入口可点击');

  console.log('停课 / 改整个周程 / 无效 ID');
  reply = () => ({ summary: '', term: {}, ops: [{ op: 'cancel_occurrence', routine_id: math.id, date: ymd(target), reason: '老师出差' }, { op: 'edit_routine', routine_id: 'r:不存在', start: '09:00' }, { op: 'delete_item', id: 'i:nope' }], clarify: '', answer: '' });
  await A.agent('后天高数停课'); await tick();
  ok(sheet().includes('停课') && sheet().includes('已忽略 2 项') && sheet().includes('找不到'), '有效的停课保留;乱编的 ID 被拦下并说明原因');
  click('ag-apply'); await tick(); ok(!A.st.blocks.some((b) => b.habitId === math.id && !b.skipped && C.dayStart(b.start) === target), '后天的课已停');
  reply = () => ({ summary: '以后都改到九点', term: {}, ops: [{ op: 'edit_routine', routine_id: math.id, start: '09:00', end: '10:40', location: '教三 105' }], clarify: '', answer: '' });
  await A.agent('高数以后都改到九点'); await tick(); click('ag-apply'); await tick();
  const h2 = A.st.habits.find((h) => h.id === math.id); ok(h2.time === 9 * 60 && h2.dur === 100 && h2.loc === '教三 105', '整个周程的时间与地点改了');

  console.log('改期 / 挪动 / 删除 / 休假');
  fresh();
  const ev = C.addItems(A.st, [{ title: '和张总过方案', short: '和张总过方案', type: 'event', domain: 'work', energy: 'mid', ctx: '', priority: 2, status: 'planned', flex: 'fixed', lead: 15, postponed: 0, actual: 0, createdAt: Date.now(), start: C.addDays(t0, 3) + 15 * 60 * MIN, end: C.addDays(t0, 3) + 16 * 60 * MIN, estMin: 60, statedMin: 60, conf: 0.9, src: 'stated', hasClock: true }], Date.now())[0];
  const tk = C.addItems(A.st, C.parse('周内写完季度报告,三个小时', A.st, Date.now()).items, Date.now())[0]; C.plan(A.st, Date.now(), 'inc');
  reply = () => ({ summary: '改期并休假', term: {}, ops: [
    { op: 'edit_item', id: 'i:' + ev.id, date: day(4), start: '10:30', dur_min: 90 },
    { op: 'move_item', id: tk.id, date: day(5) },
    { op: 'add_away', from: day(8), to: day(10), label: '出差' }], clarify: '', answer: '' });
  await A.agent('把过方案改到大后天十点半,报告挪到后面,下下周我出差'); await tick();
  ok(sheet().includes('10:30') && sheet().includes('出差') && sheet().includes('挪到'), '三项修改都在预览里');
  click('ag-apply'); await tick();
  const ev2 = A.st.items.find((i) => i.id === ev.id); ok(C.fmtT(ev2.start) === '10:30' && ev2.estMin === 90 && ymd(ev2.start) === day(4), '日程改到新的日期、时间与时长');
  ok(A.st.blocks.find((b) => b.itemId === ev.id && b.kind === 'commit').start === ev2.start, '对应的日历块同步移动');
  const tkB = A.st.blocks.filter((b) => b.itemId === tk.id && !b.skipped); ok(tkB.length && tkB.every((b) => C.dayStart(b.start) >= C.addDays(t0, 5)), '报告的块全部在 ' + day(5) + ' 之后');
  ok(A.st.settings.off.length === 1 && ymd(A.st.settings.off[0].from) === day(8), '出差标记为不可用日');
  reply = () => ({ summary: '', term: {}, ops: [{ op: 'delete_item', id: ev.id }], clarify: '', answer: '' });
  await A.agent('把过方案删了'); ok(sheet().includes('删除'), '删除操作有醒目标记'); click('ag-apply'); await tick(); ok(!A.st.items.some((i) => i.id === ev.id), '删除生效');

  console.log('追问 / 回答 / 路由');
  fresh(); reply = () => ({ summary: '', term: {}, ops: [], clarify: '你说的「那节课」是指哪一门?', answer: '' });
  await A.agent('把那节课调一下'); await tick(); ok(sheet().includes('你说的「那节课」是指哪一门?') && sheet().includes('agReply'), '信息不足时只问一个问题');
  els['#agReply'] = Object.assign(els['#agReply'] || {}, { value: '高等数学' }); reply = (b) => ({ summary: 'ok', term: {}, ops: [], clarify: '', answer: '你周三没有课。' });
  click('ag-reply'); await tick(); await tick(); ok(/用户补充回答:高等数学/.test(lastUser()) && lastUser().includes('把那节课调一下'), '回答后带着原问题继续');
  fresh(); reply = () => ({ summary: '', term: {}, ops: [], clarify: '', answer: '周三 08:00 有高等数学。' }); await A.agent('我周三有什么课'); await tick(); ok(sheet().includes('周三 08:00 有高等数学'), '提问类:直接回答,不改数据');
  fresh(); reqs = []; reply = () => ({ summary: '', term: {}, ops: [], clarify: '', answer: '' });
  ok(A.Agent.ADJ.test('下周三的高数调到周四') && A.Agent.ADJ.test('周五实验课取消') && A.Agent.ADJ.test('这是我的课表') && !A.Agent.ADJ.test('明天下午三点和张总开会') && !A.Agent.ADJ.test('周四前把方案给张总'), '路由:调整类措辞交给助手,普通新增不拦截');
  A.capture('明天下午三点和张总开会'); await tick(); ok(reqs.length === 0 && A.rc && A.rc.cards.length === 1, '普通新增仍走原回执卡流程(规则解析,不调用大模型)');
  els['#sheet-root'].innerHTML = ''; A.capture('把周三的会议调到周四'); await tick(); ok(reqs.length === 1 && /用户的话/.test(lastUser()), '调整类措辞自动交给助手');
  L.setCfg(Object.assign(L.getCfg(), { textMode: 'off' })); reqs = []; A.capture('把周三的会议调到周四'); await tick(); ok(reqs.length === 0, '「只用内置规则」时不联网');

  fresh(); L.setCfg(Object.assign(L.getCfg(), { textMode: 'fallback' })); reply = () => ({ summary: '', term: {}, ops: [], clarify: '', answer: '' }); reqs = [];
  A.addPending([{ type: 'image/png' }]); A.capture('这是我的课表,第1周是9月7日'); await tick(); await tick();
  ok(reqs.length === 1 && /课表转录员/.test(reqs[0].system) && reqs[0].messages[0].content.some((c) => c.type === 'image'), '图片 + 「课表」措辞 → 自动进入导入课表模式');

  console.log('一门课每周多个不同时间');
  fresh(); L.setCfg(Object.assign(L.getCfg(), { textMode: 'fallback' }));
  reply = () => ({ summary: '', term: {}, ops: [{ op: 'add_routine', title: '高等数学', location: '教二 301', slots: [{ days: [1], start: '08:00', end: '09:40' }, { days: [3], start: '10:00', end: '11:40' }, { days: [5], start: '14:00', end: '15:40' }] }], clarify: '', answer: '' });
  await A.agent('高数每周一早上八点、周三十点、周五下午两点,各一节半'); await tick();
  ok(/同一个 add_routine 的 slots/.test(reqs[0].system), '提示词要求同一门课的多个时间写进 slots');
  ok(sheet().includes('每周 3 个时间') && sheet().includes('08:00–09:40') && sheet().includes('10:00–11:40') && sheet().includes('14:00–15:40'), '预览:一门课 3 个不同时间,各自保留');
  click('ag-apply'); await tick();
  const mr = A.st.habits.filter((h) => h.routine && h.title === '高等数学'); ok(mr.length === 3 && mr.map((h) => h.time / 60).sort((a, b) => a - b).join() === '8,10,14' && mr.map((h) => h.days[0]).sort().join() === '0,2,4', '生成 3 个固定周程:周一 8:00 / 周三 10:00 / 周五 14:00');
  const far = C.addDays(t0, 100); C.ensureHorizon(A.st, far, Date.now()); ok(A.st.blocks.some((b) => mr.some((h) => h.id === b.habitId) && b.start > C.addDays(t0, 60)), '60 天之后仍然有课');
  fresh();
  reply = () => ({ summary: '', term: {}, ops: [{ op: 'add_routine', title: '英语', days: [2, 4], start: ['08:00', '10:00'], end: ['09:40', '11:40'] }], clarify: '', answer: '' });
  await A.agent('英语周二八点周四十点'); await tick(); click('ag-apply'); await tick();
  const en = A.st.habits.filter((h) => h.routine); ok(en.length === 2 && en.find((h) => h.days[0] === 1).time === 480 && en.find((h) => h.days[0] === 3).time === 600, '旧格式:start/end 是与 days 对齐的数组,也能正确拆成两个时间');
  fresh();
  reply = () => ({ summary: '', term: {}, ops: [{ op: 'add_routine', title: '体育', slots: [{ days: [1, 3], start: '08:00', end: '09:40' }, { days: [3], start: '08:00', end: '09:40' }] }], clarify: '', answer: '' });
  await A.agent('体育'); await tick(); click('ag-apply'); await tick(); ok(A.st.habits.filter((h) => h.routine).length === 1 && A.st.habits.find((h) => h.routine).days.join() === '0,2', '相同时间的星期自动合并并去重');

  console.log('调课:只给课名 + 日期也能找到对的那个时间段');
  fresh(); A.st.settings.term = { start: C.weekStart(t0), weeks: 18 };
  const wk = (k) => (new Date(C.addDays(t0, k)).getDay() + 6) % 7;
  const m1 = C.addRoutine(A.st, { title: '高等数学', days: [wk(1)], start: 480, end: 580 }, Date.now() - DAY * 3), m2 = C.addRoutine(A.st, { title: '高等数学', days: [wk(3)], start: 600, end: 700 }, Date.now() - DAY * 3); C.plan(A.st, Date.now(), 'inc');
  reply = () => ({ summary: '', term: {}, ops: [{ op: 'cancel_occurrence', routine_id: 'r:乱写的', title: '高数', date: day(3), reason: '老师出差' }], clarify: '', answer: '' });
  await A.agent('大后天的高数停课'); await tick(); ok(sheet().includes('停课') && !sheet().includes('已忽略'), 'ID 错了但有课名 + 日期:仍然匹配到「高等数学」(模糊简称「高数」)');
  click('ag-apply'); await tick(); ok(!A.st.blocks.some((b) => b.habitId === m2.id && !b.skipped && C.dayStart(b.start) === C.addDays(t0, 3)) && A.st.blocks.some((b) => b.habitId === m1.id && !b.skipped && C.dayStart(b.start) === C.addDays(t0, 1)), '只停了大后天那个时间段的课,另一个时间段不受影响');

  console.log('课表导入:模型只转录,程序换算');
  fresh();
  reply = (b) => ({ term: { week1_monday: null, current_week: 5, weeks: 18 }, clarify: '', courses: [
    { name: '高等数学', teacher: '王老师', slots: [{ days: [1], start: '08:00', end: '09:40', weeks_text: '1-16周', location: '教二301' }, { days: [3], start: '10:00', end: '11:40', weeks_text: '1-16周', location: '教二301' }] },
    { name: '大学物理实验', teacher: '', slots: [{ days: [4], start: '14:00', end: '16:00', weeks_text: '2-16周(双)', location: '实验楼B2' }] },
    { name: '体育', slots: [{ days: [2, 4], start: '16:00', end: '17:40', weeks_text: '', location: '操场' }] }] });
  A.addPending([{ type: 'image/png' }]); const tf = A.pending.map((p) => p.file); A.clearPending();
  await A.agent('课表', tf, 'timetable'); await tick();
  ok(/课表转录员/.test(reqs[0].system) && !/可用操作/.test(reqs[0].system), '课表导入用专门的「只转录」提示词,不要求模型理解应用操作');
  ok(sheet().includes('识别到 3 门课,共 4 个上课时间段') && sheet().includes('每周 2 个时间') && sheet().includes('双周'), '预览:3 门课 4 个时间段;「2-16周(双)」由程序换算为双周');
  ok(sheet().includes('课表需要知道学期周次') && sheet().includes('agTermWeek'), '模型识别到「现在第 5 周」→ 需要学期时给出确认输入');
  click('ag-apply'); await tick();
  const tr = A.st.habits.filter((h) => h.routine); ok(tr.length === 4 && A.st.settings.term && C.weekNo(A.st, t0) === 5, '4 个固定周程;学期按「现在第 5 周」设置');
  const ph = tr.find((h) => h.title === '大学物理实验'); ok(ph.parity === 'even' && JSON.stringify(ph.weeks) === '[[2,16]]', '实验课:双周 + 2–16 周');
  ok(tr.find((h) => h.title === '体育').days.join() === '1,3', '体育:周二、周四合并为一个时间段');
  C.ensureHorizon(A.st, C.addDays(t0, 120), Date.now()); ok(A.st.blocks.some((b) => b.habitId && b.start > C.addDays(t0, 80)), '课表已生成到 80 天以后');
  fresh(); reply = () => ({ term: {}, clarify: '请告诉我每节课的上课时间', courses: [] }); await A.agent('课表', tf, 'timetable'); await tick(); ok(sheet().includes('请告诉我每节课的上课时间') && sheet().includes('agReply'), '只有节次号、没有时间:追问而不是编造');

  console.log('直接打字写课表(不联网)');
  fresh(); reqs = []; L.setCfg(Object.assign(L.getCfg(), { key: '' }));
  A.capture('高数 周一 8:00-9:40 周三 10:00-11:40 教二301 1-16周'); await tick();
  ok(reqs.length === 0 && sheet().includes('固定周程「高数」') && sheet().includes('每周 2 个时间') && sheet().includes('教二301'), '没有大模型也能识别:一门课每周两个时间');
  els['#agTermDate'].value = '2026-09-07'; click('ag-apply'); await tick(); ok(A.st.habits.filter((h) => h.routine).length === 2 && A.st.settings.term, '确认后生成,并设置学期');
  fresh(); A.capture('周五下午3点到4点开会'); await tick(); ok(A.rc && A.rc.cards.length === 1 && !sheet().includes('固定周程'), '没有「每周/课」等字样的单次带时间段事项,仍是普通日程');
  fresh(); A.capture('把每周三的高数改到 10:00-11:40'); await tick(); ok(!sheet().includes('固定周程「'), '含「改到」的调整语句不会被误当成新增课表');
  L.setCfg(Object.assign(L.getCfg(), { key: 'sk' }));

  console.log('\n助手测试通过:' + n); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
