// node tests/ui-smoke.js —— 不依赖浏览器:用最小 DOM 桩把整个界面逻辑跑一遍,抓运行时异常
const handlers = {}, els = {};
const mk = (sel) => els[sel] || (els[sel] = { innerHTML: '', value: '', hidden: false, textContent: '', style: {}, dataset: {}, isConnected: true,
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, addEventListener() {}, querySelectorAll: () => [], focus() {}, click() {}, remove() {} });
global.URL = Object.assign(global.URL, { createObjectURL: () => 'blob:x', revokeObjectURL() {} });
global.window = global;
global.document = { readyState: 'complete', querySelector: mk, getElementById: mk, querySelectorAll: () => [], addEventListener: (t, f) => (handlers[t] = handlers[t] || []).push(f),
  createElement: () => mk('_n' + Math.random()), body: { classList: { toggle() {}, add() {} }, appendChild() {}, style: {} }, activeElement: null, hidden: false };
const store = {}; global.localStorage = { getItem: (k) => store[k] || null, setItem: (k, v) => (store[k] = v), removeItem: (k) => delete store[k] };
global.navigator = { vibrate() {} }; global.location = { hash: '', search: '', protocol: 'file:', pathname: '/' }; global.history = { replaceState() {} };
global.matchMedia = () => ({ matches: false }); global.scrollTo = () => {}; global.addEventListener = () => {};
const realSI = global.setInterval; global.setInterval = () => 0;
const assert = require('assert'); let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ✓ ' + m); };

['core', 'holiday', 'parse', 'sched', 'app', 'views', 'today', 'llm', 'sync', 'longterm', 'remote', 'agent', 'boot'].forEach((f) => require('../' + f + '.js'));
const A = window.A, C = window.Chrono;
const click = (act, data) => { const el = { dataset: Object.assign({ act }, data || {}), textContent: '', isConnected: true };
  const e = { target: { closest: (s) => (s === '[data-act]' || (s === '[data-act="try"]' && act === 'try') ? el : null), classList: { contains: () => false } } };
  (handlers.click || []).forEach((h) => h(e)); return el; };
const html = () => els['#view'].innerHTML + els['#top'].innerHTML + els['#banners'].innerHTML;

console.log('首次启动');
ok(els['#nav'].innerHTML.includes('今天') && els['#nav'].innerHTML.includes('回顾'), '导航渲染');
ok(!(els['#sheet-root'] && els['#sheet-root'].innerHTML), '首次启动不再自动弹出欢迎页');
click('close');

console.log('捕获 → 回执卡');
A.capture('周四前把方案给张总,周三下午三点碰个头,一个半小时,周末记得带娃去打疫苗,还有下周五要还信用卡。');
ok(A.rc && A.rc.cards.length === 4, '回执卡 4 张');
const sheet = els['#sheet-root'].innerHTML;
ok(sheet.includes('就这样') && sheet.includes('改一下') && sheet.includes('先放着'), '三个按钮齐全');
click('rc-field', { i: '0', f: 'dur' }); ok(els['#sheet-root'].innerHTML.includes('1.5 小时'), '点时长标签只展开时长编辑器');
click('rc-set', { i: '0', f: 'dur', v: '120' }); ok(A.rc.cards[0].d.estMin === 120 && A.rc.cards[0].edits === 1, '修改时长生效并计入修改次数');
click('rc-field', { i: '1', f: 'when' }); click('rc-field', { i: '2', f: 'dom' }); click('rc-set', { i: '2', f: 'dom', v: 'relation' }); ok(A.rc.cards[2].d.domain === 'relation', '改领域');
click('rc-park', { i: '2' });
click('rc-all');
ok(A.st.items.length === 4, '4 个事项入库');
ok(A.st.items.filter((i) => i.status === 'inbox').length === 1, '「先放着」进了收件箱');
ok(A.st.blocks.some((b) => b.kind === 'focus') && A.st.blocks.some((b) => b.kind === 'commit'), '生成专注块与承诺块');

console.log('习惯与周期');
A.capture('每周三次健身,一小时'); click('rc-all'); ok(A.st.habits.length === 1 && A.st.blocks.some((b) => b.habitId), '习惯入库并占位');
A.capture('每周一9:30周会'); click('rc-all'); ok(A.st.habits.length === 2 && A.st.blocks.some((b) => b.habitId && b.kind === 'commit'), '周会成为承诺块模板');

console.log('四个 Tab');
['today', 'plan', 'life', 'review'].forEach((t) => { click('tab', { v: t }); ok(html().length > 400, t + ' 渲染无异常 (' + html().length + ' 字符)'); });
click('tab', { v: 'plan' }); ok(html().includes('收件箱') && html().includes('待安排池') && html().includes('wk-col'), '计划页:周视图 + 收件箱 + 待安排池');
click('tab', { v: 'life' }); ok((html().match(/ringc/g) || []).length >= 6, '领域页:六个圆环');
ok(html().includes('生活平衡指数') && html().includes('节律视图'), '领域页:平衡指数与节律图');

console.log('块详情 / 执行');
click('tab', { v: 'today' });
const blk = A.st.blocks.find((b) => b.kind === 'focus' && !b.done);
click('blk', { id: blk.id }); ok(els['#sheet-root'].innerHTML.includes('为什么排在这里'), '块详情含「为什么」');
click('lock', { id: blk.id }); ok(blk.locked === true, '设为不可侵入');
const before = blk.start; const r = C.postpone(A.st, blk.id, 30, Date.now()); ok(r && r.to !== null, '顺延 30 分钟后重新落位:' + new Date(r.to).toLocaleString());
const blk2 = A.st.blocks.find((b) => b.kind === 'focus' && !b.done && !b.skipped);
click('start', { id: blk2.id }); ok(A.focus && A.focus.id === blk2.id, '进入专注');
els['#focus'].innerHTML.includes('专注中'); click('focus-done');
ok(true, '完成专注(可能弹出估时询问)');
click('done', { id: blk2.id }); ok(blk2.done, '标记完成并回写');

console.log('搜索 / 编辑 / 时长');
click('search'); ok(els['#sheet-root'].innerHTML.includes('搜索') && els['#sheet-root'].innerHTML.includes('edit-item'), '搜索面板列出事项');
click('close'); const bd = A.st.blocks.find((b) => b.kind === 'focus' && !b.skipped); const d0 = C.bmin(bd); click('blk-dur', { id: bd.id, v: '15' }); ok(C.bmin(bd) === d0 + 15, '块时长 +15 分');
click('edit-item', { id: bd.itemId }); ok(els['#sheet-root'].innerHTML.includes('删除这件事'), '编辑面板可删除'); click('close');
A.settings(); ok(els['#sheet-root'].innerHTML.includes('液态玻璃') && els['#sheet-root'].innerHTML.includes('休假 / 出差') && els['#sheet-root'].innerHTML.includes('多设备同步'), '设置:玻璃滑块 / 保护区 / 休假 / 同步'); click('close');
console.log('不闪烁:内容没变就不重写 DOM');
A.fakeNow = Date.now(); A.render(); let writes = 0; const sv = els['#view']; let cur = sv.innerHTML; Object.defineProperty(sv, 'innerHTML', { get: () => cur, set: (v) => { writes++; cur = v; }, configurable: true });
A.render(); A.render(); ok(writes === 0, '连续刷新 2 次、内容相同:#view 写入 0 次'); A.fakeNow = null;
console.log('编辑习惯');
const hb = A.st.habits.find((h) => !h.routine); click('tab', { v: 'life' }); ok(els['#view'].innerHTML.includes('data-act="hab-edit"'), '习惯有「编辑」按钮');
A.habitSheet(hb.id); ok(els['#sheet-root'].innerHTML.includes('id="hbTitle"') && els['#sheet-root'].innerHTML.includes('每周 N 次'), '编辑面板含名称与频率');
const vals = { '#hbTitle': '晨跑', '#hbMode': 'per', '#hbN': '2', '#hbDur': '40 分钟', '#hbTime': '', '#hbPref': 'morning', '#hbDom': 'health' }; Object.keys(vals).forEach((k) => (els[k] = Object.assign(els[k] || {}, { value: vals[k] })));
click('hab-save', { id: hb.id }); const hb2 = A.st.habits.find((h) => h.id === hb.id); ok(hb2.title === '晨跑' && hb2.perWeek === 2 && hb2.dur === 40 && hb2.pref === 'morning' && hb2.domain === 'health', '改名与频率、时长保存成功');
ok(A.st.blocks.some((b) => b.habitId === hb.id && b.title === '晨跑'), '未来的块按新名称重新生成');
console.log('自定义午休');
A.settings(); ok(els['#sheet-root'].innerHTML.includes('data-set="lunchA"') && els['#sheet-root'].innerHTML.includes('value="12:00"'), '设置里有午休起止时间输入');
A.setSetting('lunchA', '11:30'); A.setSetting('lunchB', '13:30'); ok(A.st.settings.lunch[0] === 690 && A.st.settings.lunch[1] === 810, '午休改为 11:30–13:30');
A.setSetting('lunchB', '11:35'); ok(A.st.settings.lunch[1] === 810, '短于 15 分钟的午休被拒绝并保持原值');
ok(!A.st.blocks.some((b) => !b.skipped && b.kind !== 'commit' && !b.habitId && b.start > Date.now() && (b.start % 86400000, true) && (() => { const d0 = C.dayStart(b.start); return b.start < d0 + 810 * 60000 && b.end > d0 + 690 * 60000; })()), '改完后没有普通任务压在新午休里');
A.setSetting('lunchA', '12:00'); A.setSetting('lunchB', '13:00'); click('close');
console.log('固定周程界面');
C.addRoutine(A.st, { title: '高等数学', days: [0], start: 480, end: 580, loc: '教二301' }, Date.now()); C.addRoutine(A.st, { title: '高等数学', days: [2], start: 600, end: 700, loc: '教二301' }, Date.now()); C.plan(A.st, Date.now(), 'inc');
click('tab', { v: 'life' }); const lh = els['#view'].innerHTML; ok(lh.includes('固定周程 / 课表') && (lh.match(/高等数学/g) || []).length === 1 && lh.includes('周一 08:00–09:40') && lh.includes('周三 10:00–11:40'), '同一门课的两个时间归在同一个标题下');
ok(/已生成到/.test(lh), '显示已生成到哪一天');
const rid = A.st.habits.find((h) => h.routine).id; click('rt-open', { id: rid }); ok(els['#sheet-root'].innerHTML.includes('给这门课再加一个上课时间'), '管理面板:可再加一个时间');
click('rt-clone', { id: rid }); ok(els['#sheet-root'].innerHTML.includes('value="高等数学"'), '「再加一个时间」预填课名');
click('close'); click('tab', { v: 'today' });
console.log('冲突 / 回顾 / 设置 / 仪式');
const it = A.st.items.find((i) => i.type === 'task'); A.conflictSheet(it.id); ok(els['#sheet-root'].innerHTML.includes('排不下'), '冲突面板');
click('close'); click('tab', { v: 'review' }); ok(html().includes('周计划执行率') && html().includes('时间账本'), '回顾页');
A.settings(); ok(els['#sheet-root'].innerHTML.includes('一键删除全部数据'), '设置面板');
A.rc = null; A.capture('明天下午三点开会'); click('rc-field', { i: '0', f: 'dur' }); ok(els['#sheet-root'].innerHTML.includes('rcDur0'), '回执卡时长编辑器有自定义输入框');
els['#rcDur0'] = Object.assign(els['#rcDur0'] || {}, { value: '1小时20分' }); click('rc-dur', { i: '0' }); ok(A.rc.cards[0].d.estMin === 80 && C.fmtT(A.rc.cards[0].d.end) === C.fmtT(A.rc.cards[0].d.start + 80 * 60000), '回执卡:自定义 1 小时 20 分 → 80 分钟,结束时间同步');
els['#rcDur0'].value = '乱写'; click('rc-dur', { i: '0' }); ok(A.rc.cards[0].d.estMin === 80, '回执卡:读不懂时保持原值');
click('rc-all');
const itE = A.st.items.find((i) => i.type === 'task'); A.editSheet(itE.id); ok(els['#sheet-root'].innerHTML.includes('id="edDur"') && !els['#sheet-root'].innerHTML.includes('<select id="edDur"'), '编辑面板:时长是自由输入框,不再是下拉');
els['#edDur'] = Object.assign(els['#edDur'] || {}, { value: '1 小时 50 分' }); ['#edTitle', '#edPri', '#edDom'].forEach((k) => (els[k] = Object.assign(els[k] || {}, { value: k === '#edTitle' ? itE.title : k === '#edPri' ? '2' : itE.domain }))); els['#edDue'] = Object.assign(els['#edDue'] || {}, { value: '' }); els['#edAfter'] = Object.assign(els['#edAfter'] || {}, { value: '' });
click('edit-save', { id: itE.id }); ok(A.st.items.find((i) => i.id === itE.id).estMin === 110, '编辑保存:自定义 110 分钟生效');
A.editSheet(itE.id); els['#edDur'].value = '???'; click('edit-save', { id: itE.id }); ok(A.st.items.find((i) => i.id === itE.id).estMin === 110, '编辑保存:读不懂的时长不会覆盖,且保持面板');
click('close'); A.morning(); ok(els['#sheet-root'].innerHTML.includes('早上好'), '晨间仪式'); click('close');
A.evening(); ok(els['#sheet-root'].innerHTML.includes('收个尾'), '晚间仪式'); click('close');
A.ritual(0); for (let i = 0; i < 5; i++) { click('rit', { v: '1' }); } ok(true, '周回顾 5 步走通');
click('ics'); click('csv'); click('json'); ok(true, '导出动作无异常');
const snap = JSON.stringify(A.st); A.mutate(() => { A.st.items = []; }); A.undo(snap); ok(A.st.items.length > 0, '撤销可恢复');
// 手机上调整单个块的起止时间
{
  click('tab', { v: 'today' }); const b0 = A.st.blocks.find((x) => !x.done && x.kind !== 'commit' && !x.skipped && x.kind !== 'free');
  if (b0) {
    const d0 = C.dayStart(b0.start); const mk2 = (v) => ({ value: v });
    els['#btA'] = mk2('07:10'); els['#btB'] = mk2('08:05');
    click('blk-time-set', { id: b0.id });
    ok(b0.start === d0 + 430 * C.MIN && b0.end === d0 + 485 * C.MIN && b0.locked, '块的起止时间可直接设定(7:10–8:05)');
    const s1 = b0.start; click('blk-shift', { id: b0.id, v: '15' }); ok(b0.start === s1 + 15 * C.MIN, '整体推后 15 分钟');
    els['#btA'] = mk2('09:00'); els['#btB'] = mk2('08:00'); const e1 = b0.end; click('blk-time-set', { id: b0.id }); ok(b0.end === e1, '结束早于开始会被拒绝');
  }
}

click('settings'); click('wipe'); click('wipe'); ok(A.st.items.length === 0, '一键删除');

console.log('\n界面冒烟测试通过:' + n); process.exit(0);
