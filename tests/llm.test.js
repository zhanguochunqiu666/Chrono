// node tests/llm.test.js —— 用假的大模型接口,验证「截图识别」整条链路(提示词→解析→去重→回执→入库→排程)
const handlers = {}, els = {};
const mk = (sel) => els[sel] || (els[sel] = { innerHTML: '', value: '', hidden: false, textContent: '', style: {}, dataset: {}, isConnected: true, placeholder: '',
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, addEventListener() {}, querySelectorAll: () => [], focus() {}, click() {}, remove() {}, insertAdjacentHTML() {}, querySelector: () => null });
global.URL = Object.assign(global.URL, { createObjectURL: () => 'blob:x', revokeObjectURL() {} });
global.window = global;
global.document = { readyState: 'complete', querySelector: mk, getElementById: mk, querySelectorAll: () => [], addEventListener: (t, f) => (handlers[t] = handlers[t] || []).push(f),
  createElement: () => mk('_n' + Math.random()), body: { classList: { toggle() {}, add() {} }, appendChild() {}, style: {} }, activeElement: null, hidden: false };
const store = {}; global.localStorage = { getItem: (k) => store[k] || null, setItem: (k, v) => (store[k] = v), removeItem: (k) => delete store[k] };
global.navigator = { vibrate() {} }; global.location = { hash: '', search: '', protocol: 'file:', pathname: '/' }; global.history = { replaceState() {} };
global.matchMedia = () => ({ matches: false }); global.scrollTo = () => {}; global.addEventListener = () => {}; global.setInterval = () => 0;
const assert = require('assert'); let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ✓ ' + m); };
['core', 'holiday', 'parse', 'sched', 'app', 'views', 'today', 'llm', 'sync', 'longterm', 'remote', 'agent', 'boot'].forEach((f) => require('../' + f + '.js'));
const A = window.A, C = window.Chrono, L = A.LLM;
const click = (act, data) => { const el = { dataset: Object.assign({ act }, data || {}), textContent: '', isConnected: true }; const e = { target: { closest: (s) => (s === '[data-act]' ? el : null) } }; (handlers.click || []).forEach((h) => h(e)); };
const sheet = () => els['#sheet-root'].innerHTML;
const ymd = (ts) => { const d = new Date(ts); return d.getFullYear() + '-' + C.p2(d.getMonth() + 1) + '-' + C.p2(d.getDate()); };
const tick = () => new Promise((r) => setTimeout(r, 20));
const day = (k) => ymd(C.addDays(C.dayStart(Date.now()), k));

console.log('配置');
ok(!L.ready(), '未配置时不可用');
L.setCfg(Object.assign(L.getCfg(), { key: 'sk-test', preset: 'anthropic', consent: true })); ok(L.ready(), '填入密钥后可用');

let lastReq = null, reply = null;
global.fetch = async (url, opt) => { lastReq = { url, opt, body: JSON.parse(opt.body) }; return { ok: true, status: 200, text: async () => JSON.stringify(reply(lastReq)) }; };
const anth = (txt) => () => ({ content: [{ type: 'text', text: txt }] });
const payload = { items: [
  { title: '和张总过方案', type: 'event', date: day(2), start: '15:00', end: '16:30', domain: 'work', priority: 1, location: '3楼会议室', remind_before_min: 30, travel_min: 20, confidence: 0.95, evidence: '周X 15:00 过方案' },
  { title: '体检', type: 'event', date: day(3), start: '08:30', dur_min: 120, domain: 'health', confidence: 0.9 },
  { title: '信用卡还款', type: 'deadline', due: day(5), domain: 'finance', confidence: 0.9 },
  { title: '交季度报告', type: 'task', due: day(6), dur_min: 180, domain: 'work', confidence: 0.8 },
  { title: '去年的会议', type: 'event', date: day(-30), start: '10:00', dur_min: 60, confidence: 0.9 },
  { title: '模糊的事', type: 'task', confidence: 0.2 },
  { title: '', type: 'task' },
] };

(async () => {
  console.log('Anthropic 协议 + 图片');
  reply = anth('```json\n' + JSON.stringify(payload) + '\n```');
  const res = await L.recognize({ images: [{ mediaType: 'image/jpeg', data: 'AAAA' }], source: 'image' });
  ok(lastReq.url === 'https://api.anthropic.com/v1/messages', '请求地址正确');
  ok(lastReq.opt.headers['x-api-key'] === 'sk-test' && lastReq.opt.headers['anthropic-dangerous-direct-browser-access'] === 'true', '请求头含密钥与浏览器直连标记');
  ok(lastReq.body.messages[0].content[0].type === 'image' && lastReq.body.messages[0].content[0].source.data === 'AAAA', '图片以 base64 随请求发送');
  ok(/当前时间/.test(lastReq.body.system) && lastReq.body.system.includes(C.timeZone()), '提示词带当前时间和所选时区,便于换算「下周三」');
  ok(res.drafts.length === 5, '解析出 5 项(过期与空标题被丢弃): ' + res.drafts.map((d) => d.short).join('、'));
  ok(res.skipped.stale === 1 && res.skipped.bad === 1, '过期 1 项、无效 1 项被忽略');
  const ev = res.drafts[0]; ok(ev.type === 'event' && C.fmtT(ev.start) === '15:00' && ev.estMin === 90 && ev.lead === 30 && ev.travel === 20 && ev.loc === '3楼会议室', '会议:起止/提前量/路上/地点');
  ok(res.drafts[2].type === 'deadline' && res.drafts[2].lead === 2880, '还款:期限类,提前 2 天提醒');
  ok(res.drafts[3].type === 'task' && res.drafts[3].estMin === 180, '任务:时长 180');
  ok(res.drafts[4].status === 'inbox', '低置信度进收件箱,不硬排');

  console.log('回执 → 入库 → 排程');
  A.st = C.fresh(); A.st.meta.onboarded = true;
  A.rc = { text: '图片', note: '', cards: res.drafts.map((d) => ({ kind: 'item', d, state: 'pending', edit: false, field: null, edits: 0 })) };
  A.drawReceipt(); ok(sheet().includes('读到 5 项') && sheet().includes('3楼会议室'), '回执卡显示 5 项与地点');
  click('rc-all'); await tick();
  ok(A.st.items.length === 5, '5 项入库');
  ok(A.st.blocks.some((b) => b.travelFor) && A.st.blocks.some((b) => b.kind === 'commit' && b.title.includes('过方案')), '会议及其路上时间成为硬约束块');
  ok(A.st.blocks.some((b) => b.itemId === A.st.items[3].id && b.kind === 'focus'), '报告被排成专注块');

  console.log('去重');
  reply = anth(JSON.stringify({ items: [payload.items[0], payload.items[1], { title: '新的约会', type: 'event', date: day(4), start: '19:00', dur_min: 90, confidence: 0.9 }] }));
  const r2 = await L.recognize({ images: [{ mediaType: 'image/jpeg', data: 'BBBB' }] });
  ok(r2.dups === 2 && r2.drafts.length === 1, '同一截图再识别一次:2 项重复被跳过,仅留新增 1 项');

  console.log('OpenAI 兼容协议');
  L.setCfg(Object.assign(L.getCfg(), { preset: 'qwen', fmt: 'openai', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-vl-max' }));
  reply = () => ({ choices: [{ message: { content: '{"items":[{"title":"家长会","type":"event","date":"' + day(3) + '","start":"19:00","dur_min":60,"confidence":0.9}]}' } }] });
  const r3 = await L.recognize({ images: [{ mediaType: 'image/jpeg', data: 'CCCC' }] });
  ok(lastReq.url.endsWith('/chat/completions') && lastReq.opt.headers.authorization === 'Bearer sk-test', 'OpenAI 格式:地址与鉴权');
  ok(lastReq.body.messages[1].content[0].image_url.url.startsWith('data:image/jpeg;base64,CCCC'), '图片以 data URL 发送');
  ok(r3.drafts.length === 1 && r3.drafts[0].domain === 'relation', '解析成功,领域按语义归类');

  console.log('代理');
  L.setCfg(Object.assign(L.getCfg(), { proxy: 'http://localhost:8765/proxy' }));
  await L.recognize({ text: 'x' }).catch(() => {});
  ok(lastReq.url === 'http://localhost:8765/proxy' && lastReq.opt.headers['x-target-url'].endsWith('/chat/completions'), '走本地代理时,目标地址放在 x-target-url');
  L.setCfg(Object.assign(L.getCfg(), { proxy: '' }));

  console.log('错误提示');
  global.fetch = async () => ({ ok: false, status: 401, text: async () => 'no' });
  await L.call({ system: 's', user: 'u' }).then(() => ok(false, 'should fail'), (e) => ok(/密钥/.test(e.message), '401 → 提示检查密钥'));
  global.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await L.call({ system: 's', user: 'u' }).then(() => ok(false, 'x'), (e) => ok(/代理/.test(e.message), '网络/跨域失败 → 提示使用本地代理'));
  global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: '我无法识别这张图' } }] }) });
  await L.recognize({ text: 'x' }).then(() => ok(false, 'x'), (e) => ok(/结构化/.test(e.message), '模型没按格式返回 → 明确报错'));

  console.log('文字增强:规则吃不准才调用');
  L.setCfg(Object.assign(L.getCfg(), { preset: 'anthropic', fmt: 'anthropic', base: 'https://api.anthropic.com', model: 'm' }));
  let calls = 0; global.fetch = async (u, o) => { calls++; return { ok: true, status: 200, text: async () => JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ items: [{ title: '和老王对账', type: 'task', due: day(3), dur_min: 45, domain: 'finance', confidence: 0.8 }] }) }] }) }; };
  A.st = C.fresh(); A.capture('明天上午十点开会,一个小时'); await tick(); ok(calls === 0, '规则能解析清楚的句子 → 不调用大模型(省钱、离线可用)');
  click('close'); A.capture('下周找个时间聊聊'); await tick(); await tick(); ok(calls === 1, '规则判定「待澄清」→ 交给大模型');
  ok(sheet().includes('老王对账'), '大模型结果进入回执卡');

  console.log('对话式追问');
  global.fetch = async (u, o) => { lastReq = { body: JSON.parse(o.body) }; return { ok: true, status: 200, text: async () => JSON.stringify({ content: [{ type: 'text', text: '周四连续排了 7 小时。建议把周四的报告挪到周三上午。' }] }) }; };
  A.st = C.fresh(); A.st.settings.quotas = C.fresh().settings.quotas; C.addItems(A.st, C.parse('周四下午三点开会', A.st, Date.now()).items, Date.now());
  await A.askSheet('我为什么这周这么累?'); ok(sheet().includes('周四连续排了'), '回答展示');
  ok(/不要使用「懒」/.test(lastReq.body.system) && /开会/.test(lastReq.body.system), '系统提示:只评价安排;并附带真实日程数据');

  console.log('文字 + 图片一起发送');
  L.setCfg(Object.assign(L.getCfg(), { preset: 'anthropic', fmt: 'anthropic', base: 'https://api.anthropic.com', model: 'm', consent: true }));
  L._setPrep(async () => ({ mediaType: 'image/jpeg', data: 'ZZZZ' }));
  A.st = C.fresh(); A.pending = [];
  A.addPending([{ type: 'image/png', name: 'a.png' }, { type: 'text/plain' }, { type: 'image/png' }]); ok(A.pending.length === 2, '托盘只收图片(2 张),文本文件被忽略');
  A.addPending([{ type: 'image/png' }, { type: 'image/png' }, { type: 'image/png' }]); ok(A.pending.length === 4, '最多 4 张');
  click('tray-del', { i: '0' }); ok(A.pending.length === 3, '可以移除单张');
  A.pending = A.pending.slice(0, 1);
  global.fetch = async (u, o) => { lastReq = { body: JSON.parse(o.body) }; return { ok: true, status: 200, text: async () => JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ items: [{ title: '高数课', type: 'event', date: day(2), start: '08:00', dur_min: 90, confidence: 0.9 }] }) }] }) }; };
  await A.capture('这是下周要上的课,只排周三的,都设成重要'); await tick(); await tick();
  const content = lastReq.body.messages[0].content;
  ok(content.some((c) => c.type === 'image' && c.source.data === 'ZZZZ'), '同一次请求里有图片');
  ok(content.some((c) => c.type === 'text' && c.text.includes('只排周三的,都设成重要')), '同一次请求里有用户的文字说明');
  ok(/用户说明.*优先|优先遵循/.test(content.find((c) => c.type === 'text').text) && /说明是用户对这些图片的指示/.test(lastReq.body.system), '提示词要求以说明为准');
  ok(A.pending.length === 0, '发送后托盘清空');
  ok(sheet().includes('高数课') && sheet().includes('读到 1 项'), '结果进入回执卡');
  A.addPending([{ type: 'image/png' }]); await A.capture(''); await tick(); await tick(); ok(lastReq.body.messages[0].content.some((c) => c.type === 'image') && /请识别图片中的事项/.test(lastReq.body.messages[0].content.find((c) => c.type === 'text').text), '只有图片没有文字也能发送');
  L.setCfg(Object.assign(L.getCfg(), { key: '' })); A.addPending([{ type: 'image/png' }]); await A.capture('只要周三'); ok(A._pendingText === '只要周三' && sheet().includes('大模型'), '未配置模型时:文字不丢,配置后自动继续');

  console.log('\n大模型链路测试通过:' + n); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
