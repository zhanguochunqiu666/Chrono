/* 时序 Chrono · 大模型接入
   - 截图 / 拍照 / 粘贴 / 拖入图片 → 日程事项(多模态)
   - 文字理解增强(规则解析吃不准时交给大模型)
   - 对话式追问(基于你自己的日程数据回答)
   接口兼容两类协议:Anthropic Messages、OpenAI Chat Completions(通义/智谱/DeepSeek/Ollama/中转站等都走后者)。
   密钥只存在本机浏览器里,不进入导出的数据文件。 */
(function (G) {
  'use strict';
  const C = G.Chrono, A = G.A, { MIN, DAY, DOMAINS, DOMAIN_KEYS } = C;
  const { $, esc, now } = A;

  /* ---------- 配置 ---------- */
  const KEY = 'chrono.llm';
  const PRESETS = {
    anthropic: { name: 'Anthropic Claude', fmt: 'anthropic', base: 'https://api.anthropic.com', model: 'claude-sonnet-4-5' },
    openai: { name: 'OpenAI', fmt: 'openai', base: 'https://api.openai.com/v1', model: 'gpt-4o' },
    qwen: { name: '通义千问(阿里云百炼)', fmt: 'openai', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-vl-max' },
    glm: { name: '智谱 GLM', fmt: 'openai', base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4v-plus' },
    ollama: { name: '本机 Ollama(免费,数据不出电脑)', fmt: 'openai', base: 'http://localhost:11434/v1', model: 'qwen2.5vl:7b' },
    custom: { name: '其他(OpenAI 兼容接口)', fmt: 'openai', base: '', model: '' },
  };
  const DEF = () => ({ fastModel: '', preset: 'anthropic', fmt: 'anthropic', base: PRESETS.anthropic.base, model: PRESETS.anthropic.model, key: '', proxy: '', textMode: 'fallback', consent: false });
  const getCfg = () => { try { return Object.assign(DEF(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return DEF(); } };
  const setCfg = (c) => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* */ } };
  const ready = (c) => { c = c || getCfg(); return !!(c.base && c.model && (c.key || /localhost|127\.0\.0\.1/.test(c.base))); };

  /* ---------- 调用 ---------- */
  function friendly(err, status, body, cfg) {
    if (status === 401 || status === 403) return '密钥无效或没有权限(' + status + ')。请到设置里检查 API Key。';
    if (status === 404) return '接口地址或模型名不对(404)。请检查「接口地址」和「模型」。';
    if (status === 429) return '调用太频繁或额度用完了(429)。';
    if (status === 400 && /image|vision|multimodal/i.test(body || '')) return '这个模型不支持看图。请换成支持图片的模型(如 claude-sonnet、gpt-4o、qwen-vl-max)。';
    if (status) return '模型服务返回错误(' + status + '):' + String(body || '').slice(0, 160);
    if (err && err.name === 'AbortError') return '等了太久没有响应,已取消。';
    return '连不上模型服务。可能是网络问题,或浏览器的跨域限制:在设置里填「本地代理」(运行 tools/server.js)即可解决。';
  }

  async function call(o) {
    const cfg = getCfg(); if (!ready(cfg)) throw new Error('还没有配置大模型。');
    const model = (!(o.images || []).length && cfg.fastModel) ? cfg.fastModel : cfg.model;     // 纯文字任务用「快速模型」
    const imgs = o.images || [];
    let url, headers, body;
    if (cfg.fmt === 'anthropic') {
      url = cfg.base.replace(/\/+$/, '') + '/v1/messages';
      headers = { 'content-type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
      const content = imgs.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.data } })).concat([{ type: 'text', text: o.user }]);
      body = { model: model, max_tokens: o.maxTokens || 3000, system: o.system, messages: [{ role: 'user', content }], temperature: 0 };
    } else {
      url = cfg.base.replace(/\/+$/, '') + '/chat/completions';
      headers = { 'content-type': 'application/json' }; if (cfg.key) headers.authorization = 'Bearer ' + cfg.key;
      const content = imgs.map((i) => ({ type: 'image_url', image_url: { url: 'data:' + i.mediaType + ';base64,' + i.data } })).concat([{ type: 'text', text: o.user }]);
      body = { model: model, max_tokens: o.maxTokens || 3000, temperature: 0, messages: [{ role: 'system', content: o.system }, { role: 'user', content: imgs.length ? content : o.user }] };
    }
    if (cfg.proxy) { headers['x-target-url'] = url; url = cfg.proxy; const lc = A.Remote && A.Remote.lic(); if (lc) headers['x-license'] = lc.code; }
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), o.timeout || 90000); A._abort = () => ctl.abort();
    let res;
    try { res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal }); }
    catch (e) { clearTimeout(to); A._abort = null; throw new Error(e && e.name === 'AbortError' ? (A._cancelled ? '已取消。' : '等了太久没有响应,已停止。可以在设置里换一个更快的「快速模型」。') : friendly(e, 0, '', cfg)); }
    clearTimeout(to);
    const txt = await res.text(); A._abort = null;
    if (!res.ok) throw new Error(friendly(null, res.status, txt, cfg));
    let j; try { j = JSON.parse(txt); } catch (e) { throw new Error('模型返回的内容无法读取。'); }
    const out = cfg.fmt === 'anthropic' ? (j.content || []).map((c) => c.text || '').join('') : ((j.choices || [])[0] || {}).message && j.choices[0].message.content;
    if (!out) throw new Error('模型没有返回内容。');
    return typeof out === 'string' ? out : JSON.stringify(out);
  }

  function extractJSON(s) {
    s = String(s).replace(/```(?:json)?/gi, '');
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error('模型没有按要求返回结构化结果。');
    try { return JSON.parse(s.slice(a, b + 1)); }
    catch (e) { try { return JSON.parse(s.slice(a, b + 1).replace(/,\s*([}\]])/g, '$1')); } catch (e2) { throw new Error('模型返回的结构化结果格式有误。'); } }
  }

  /* ---------- 图片压缩(省流量、省 token) ---------- */
  function prepImage(file, maxSide) {
    maxSide = maxSide || 1568;
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        let w = img.naturalWidth, h = img.naturalHeight; const k = Math.min(1, maxSide / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        const dataUrl = cv.toDataURL('image/jpeg', 0.85);
        resolve({ mediaType: 'image/jpeg', data: dataUrl.split(',')[1], dataUrl, w, h });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('这张图片打不开。')); };
      img.src = url;
    });
  }

  /* ---------- 提示词 ---------- */
  const WD = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const ymd = (ts) => { const d = C.date(ts); return d.getFullYear() + '-' + C.p2(d.getMonth() + 1) + '-' + C.p2(d.getDate()); };
  function extractSystem(t) {
    return '你是「时序」日程应用的信息提取器。用户会给你截图/照片/文字,里面可能有会议通知、群消息、海报活动、课表、航班/酒店/快递、体检预约、账单、聊天里的约定等。\n' +
      '任务:找出其中所有「用户需要安排或记住的事项」,只输出一个 JSON 对象,不要任何解释。\n' +
      '当前时间:' + ymd(t) + ' ' + WD[C.dow(t)] + ' ' + C.fmtT(t) + '(时区 ' + C.timeZone() + ')。所有相对日期(明天、下周三、月底)必须换算成具体日期;图中只写月日时,年份取最近的未来日期。\n' +
      'JSON 格式:{"items":[{"title":"12字内短标题,保留关键人物/地点","type":"event|task|deadline","date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","dur_min":数字,"due":"YYYY-MM-DD","domain":"work|health|relation|study|finance|home","priority":0-3,"location":"","remind_before_min":数字,"travel_min":数字,"confidence":0到1,"evidence":"原文里支撑这一项的一句话"}],"note":"一句话说明没识别出来的内容或不确定之处"}\n' +
      '规则:\n' +
      '1. event=有明确开始时间的约定(会议、航班、预约、课程);必须有 date 和 start。没写结束时间就根据常识给 dur_min。\n' +
      '2. deadline=只有日期的到期点(还款、报名截止、快递取件期限、缴费日),给 due。\n' +
      '3. task=需要花时间做的事,有 dur_min(估计)和可选 due。\n' +
      '4. 同一件事在图中出现多次(例如通知+回复)只输出一次,保留信息最完整的。\n' +
      '5. 与用户无关的广告、已过期的事项、纯闲聊不要输出。拿不准就输出并把 confidence 设低(<0.5)。\n' +
      '6. domain 按语义:医院/体检/运动=health;家人/朋友/聚餐/生日=relation;课程/考试/读书=study;账单/还款/报销/保险=finance;打扫/快递/维修=home;其余=work。\n' +
      '7. priority:0=今天必须 1=重要 2=一般 3=有空再说。不要编造图中没有的信息。\n' +
      '8. 如果同时给了「用户说明」和图片:说明是用户对这些图片的指示或补充,优先级高于图片本身。例如说明要求「只排周三的」就只输出周三的;「这是下周的课表」用来确定年月日;「都设成重要」用来定优先级;说明里额外提到的、图片中没有的事项也要一并输出。说明与图片冲突时以说明为准。';
  }

  /* ---------- 结果 → 草稿 ---------- */
  const pd = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return m ? C.parseDateTime(m[0]) : null; };
  const pt = (s) => { const m = String(s || '').match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  const clip = (s) => (s.length > 12 ? s.slice(0, 12) : s);

  function toDrafts(obj, st, t, source) {
    const raw = Array.isArray(obj.items) ? obj.items : [], out = [], skipped = { stale: 0, bad: 0 };
    const t0 = C.dayStart(t);
    raw.forEach((o) => {
      const title = String(o.title || '').trim(); if (!title) { skipped.bad++; return; }
      const domain = DOMAINS[o.domain] ? o.domain : C.domainOf(title), energy = C.energyOf(title);
      let type = ['event', 'task', 'deadline'].includes(o.type) ? o.type : 'task';
      const date = pd(o.date), due = pd(o.due), sm = pt(o.start), em = pt(o.end);
      if (type === 'event' && (date == null || sm == null)) type = date != null || due != null ? 'deadline' : 'task';
      const pri = Math.max(0, Math.min(3, Number.isFinite(+o.priority) ? Math.round(+o.priority) : 2));
      const conf = Math.max(0, Math.min(1, Number.isFinite(+o.confidence) ? +o.confidence : 0.7));
      const d = { id: null, raw: String(o.evidence || title), title, short: clip(title), domain, energy, ctx: C.ctxOf(title), priority: pri, status: conf < 0.45 ? 'inbox' : 'planned', flex: 'move', lead: 0, postponed: 0, actual: 0, createdAt: t, source: source || 'image', loc: String(o.location || '').slice(0, 40), llmConf: conf };
      if (conf < 0.45) d.unclear = true;
      const rem = +o.remind_before_min; if (rem > 0 && rem <= 2880) d.lead = rem;
      if (type === 'event') {
        let start = C.atMinute(date, sm), dur = em != null && em > sm ? em - sm : Math.max(15, Math.min(720, +o.dur_min || 60));
        if (start + dur * MIN < t) { skipped.stale++; return; }
        Object.assign(d, { type: 'event', flex: 'fixed', hasClock: true, start, end: start + dur * MIN, estMin: dur, statedMin: dur, conf: 0.9, src: 'stated' });
        const tr = +o.travel_min; if (tr > 0 && tr <= 240) d.travel = tr;
        if (!d.lead) d.lead = 15;
      } else if (type === 'deadline') {
        const dd = due != null ? due : date; if (dd == null) { skipped.bad++; return; }
        if (C.addDays(dd, 1) <= t) { skipped.stale++; return; }
        Object.assign(d, { type: 'deadline', due: C.dayEnd(dd), estMin: 0, conf: 0.9, src: 'stated', lead: d.lead || (domain === 'finance' ? 2 * 1440 : 1440) });
      } else {
        const dm = +o.dur_min > 0 ? Math.min(720, Math.round(+o.dur_min)) : 0, est = C.estimate(st, domain, energy, dm, false, title);
        Object.assign(d, { type: 'task', estMin: est.min, statedMin: dm, conf: est.conf, src: est.src, learnedFrom: est.stated || 0, splittable: energy === 'deep' || est.min >= 120, minChunk: 60 });
        const dd = due != null ? due : date;
        if (dd != null) { if (C.addDays(dd, 1) <= t) { skipped.stale++; return; } d.due = C.dayEnd(dd); d.notBefore = Math.max(t0, 0); delete d.notBefore; }
      }
      out.push(d);
    });
    return { drafts: out, note: String(obj.note || ''), skipped };
  }

  /* 与已有日程去重:同一时间 + 标题有交集 */
  const grams = (s) => { const g = new Set(), x = s.replace(/[^一-龥A-Za-z0-9]/g, ''); for (let i = 0; i < x.length - 1; i++) g.add(x.slice(i, i + 2)); if (x.length === 1) g.add(x); return g; };
  const similar = (a, b) => { const A1 = grams(a), B1 = grams(b); if (!A1.size || !B1.size) return false; let n = 0; A1.forEach((x) => { if (B1.has(x)) n++; }); return n / Math.min(A1.size, B1.size) >= 0.5; };
  function dedupe(drafts, st) {
    const keep = [], dups = [];
    drafts.forEach((d) => {
      const clash = (d.type === 'event' && st.blocks.some((b) => b.kind === 'commit' && !b.travelFor && !b.skipped && Math.abs(b.start - d.start) <= 10 * MIN && similar(b.title, d.short)))
        || st.items.some((i) => i.status !== 'dropped' && i.status !== 'done' && i.type === d.type && (d.type === 'event' ? Math.abs((i.start || 0) - d.start) <= 10 * MIN : C.dayStart(i.due || 0) === C.dayStart(d.due || -1)) && similar(i.short, d.short))
        || keep.some((k) => k.type === d.type && (d.type === 'event' ? Math.abs(k.start - d.start) <= 10 * MIN : C.dayStart(k.due || 0) === C.dayStart(d.due || -1)) && similar(k.short, d.short));
      (clash ? dups : keep).push(d);
    });
    return { keep, dups };
  }

  /* ---------- 对外:识别 ---------- */
  async function recognize(opts) {
    const t = now(), hasImg = (opts.images || []).length > 0;
    const user = hasImg ? (opts.text ? '用户说明(优先遵循):\n' + opts.text + '\n\n请结合上面的说明,识别并整理图片中的事项。' : '请识别图片中的事项。') : '用户输入的文字:\n' + opts.text;
    const raw = await call({ system: extractSystem(t), user, images: opts.images || [] });
    const obj = extractJSON(raw);
    const r = toDrafts(obj, A.st, t, opts.source);
    const dd = dedupe(r.drafts, A.st);
    return { drafts: dd.keep, dups: dd.dups.length, skipped: r.skipped, note: r.note };
  }

  function showReceipt(res, srcLabel) {
    const parts = [];
    if (res.dups) parts.push(res.dups + ' 项已在日程里,已跳过');
    if (res.skipped.stale) parts.push(res.skipped.stale + ' 项已过期,已忽略');
    if (res.note) parts.push(res.note);
    if (!res.drafts.length) {
      A.sheet('<h3>没有识别出可安排的事项</h3><div class="lead">' + esc(parts.join(';') || '图里没有看到明确的时间或待办。') + '</div><div class="small muted">可以换一张更清晰的图,或直接打字告诉我。</div><button class="btn" style="width:100%;margin-top:12px" data-act="close">好</button>');
      return;
    }
    A.rc = { text: srcLabel, note: parts.join(';'), cards: res.drafts.map((d) => ({ kind: 'item', d, state: 'pending', edit: false, field: null, edits: 0 })) };
    A.drawReceipt();
  }

  function busy(msg, sub) {
    A._cancelled = false; const t0 = Date.now();
    A.sheet('<div style="text-align:center;padding:26px 8px 20px"><div class="spin"></div><h3 style="margin-top:16px">' + esc(msg) + '</h3><div class="small muted">' + esc(sub || '') + ' · 已等待 <span id="busyT">0</span> 秒</div><button class="btn ghost" style="margin-top:12px" data-act="llm-cancel">取消</button></div>');
    clearInterval(A._busyTimer); A._busyTimer = setInterval(() => { const e = $('#busyT'); if (!e) { clearInterval(A._busyTimer); return; } e.textContent = Math.round((Date.now() - t0) / 1000); }, 1000);
  }
  A.busy = busy;
  function fail(e) {
    A.sheet('<h3>没能识别</h3><div class="lead">' + esc(e.message || String(e)) + '</div><div class="row" style="gap:8px;margin-top:8px"><button class="btn" data-act="llm-open">检查大模型设置</button><button class="btn ghost" data-act="close">关闭</button></div>');
  }

  let prep = prepImage;
  async function captureImages(files, extraText) {
    files = [...files].filter((f) => /^image\//.test(f.type)).slice(0, 4);
    if (!files.length) { A.toast('没有找到图片。'); return; }
    if (!ready()) { A._pendingFiles = files; A._pendingText = extraText || ''; A.llmSettings('先接入大模型,才能识别图片。保存后会自动继续。'); return; }
    const c = getCfg();
    if (!c.consent) {
      A._pendingFiles = files; A._pendingText = extraText || '';
      A.sheet('<h3>图片会发给你配置的模型</h3><div class="lead">识别需要把图片(已压缩)发送到「' + esc(PRESETS[c.preset] ? PRESETS[c.preset].name : c.base) + '」。时序本身不经过任何服务器。截图里有他人隐私信息时请留意。</div>' +
        '<button class="btn pri" style="width:100%" data-act="llm-consent">明白了,继续</button><button class="btn ghost" style="width:100%;margin-top:6px" data-act="close">取消</button>');
      return;
    }
    busy('正在识别 ' + files.length + ' 张图片…', '通常需要 5–20 秒');
    try {
      const images = []; for (const f of files) images.push(await prep(f));
      const res = await recognize({ images, text: extraText || '', source: 'image' });
      showReceipt(res, extraText ? extraText : '图片');
    } catch (e) { fail(e); }
  }

  /* ---------- 附件托盘:图片先放进来,和文字一起发 ---------- */
  A.pending = [];
  const MAXIMG = 4;
  A.addPending = (files) => {
    const fs = [...files].filter((f) => /^image\//.test(f.type));
    if (!fs.length) { A.toast('没有找到图片。'); return; }
    let dropped = 0;
    fs.forEach((f) => { if (A.pending.length < MAXIMG) A.pending.push({ file: f, url: URL.createObjectURL(f) }); else dropped++; });
    if (dropped) A.toast('一次最多 ' + MAXIMG + ' 张图片,多出的 ' + dropped + ' 张没有加入。');
    A.drawTray(); const i = $('#capIn'); i && i.focus();
  };
  A.clearPending = () => { A.pending.forEach((p) => { try { URL.revokeObjectURL(p.url); } catch (e) { /* */ } }); A.pending = []; A.drawTray(); };
  A.trayHtml = () => A.pending.length ? '<div class="tray glass" id="tray">' + A.pending.map((p, i) => '<div class="th"><img src="' + p.url + '" alt="待识别图片 ' + (i + 1) + '"><button data-act="tray-del" data-i="' + i + '" aria-label="移除这张图片">×</button></div>').join('') + (A.pending.length < MAXIMG ? '<button class="th add" data-act="img" aria-label="再添加一张">+</button>' : '') + '<div class="tt">补一句说明,和图片一起发给模型<br><span class="faint">例如:只排周三的 / 都设成重要</span></div></div>' : '';
  A.drawTray = () => {
    const cap = $('#capture'); if (!cap) return; const old = $('#tray');
    if (old && old.remove) old.remove();
    const h = A.trayHtml(); if (h && cap.insertAdjacentHTML) cap.insertAdjacentHTML('afterbegin', h);
    const inp = $('#capIn'); if (inp) inp.placeholder = A.pending.length ? '补一句说明(可不填),然后发送' : '说一句话,或粘贴 / 拖入截图';
    const sb = cap.querySelector && cap.querySelector('.send'); if (sb) sb.textContent = A.pending.length ? '识别并排入' : '排进去';
  };

  /* ---------- 文字理解增强:包装 A.capture ---------- */
  const baseCapture = A.capture;
  A.capture = function (text, source) {
    text = (text || '').trim();
    if (A.pending.length) {                       // 有附件:文字 + 图片一起发给模型
      const files = A.pending.map((p) => p.file); const inp = $('#capIn'); if (inp) inp.value = ''; A._capText = '';
      A.clearPending(); return captureImages(files, text);
    }
    if (!text) return;
    const c = getCfg();
    if (source === 'llm' || c.textMode === 'off' || !ready(c)) return baseCapture(text, source);
    const rule = C.parse(text, A.st, now());
    const shaky = !rule.items.length && !rule.habits.length && !rule.aways.length || rule.items.some((i) => i.unclear || i.status === 'inbox');
    if (rule.habits.length || rule.aways.length || (c.textMode !== 'always' && !shaky)) return baseCapture(text, source);
    const inp = $('#capIn'); if (inp) inp.value = ''; A._capText = '';
    busy('正在理解…', '规则没吃准,交给大模型');
    return recognize({ text, source: 'text' }).then((res) => {
      if (!res.drafts.length) { A.closeSheet(); return baseCapture(text, 'llm'); }
      showReceipt(res, text);
    }).catch(() => { A.closeSheet(); baseCapture(text, 'llm'); A.toast('大模型暂时不可用,已用内置规则理解。'); });
  };

  /* ---------- 对话式追问 ---------- */
  function ctxSummary() {
    const st = A.st, t = now(), ws = C.weekStart(t), w = C.weekStats(st, ws, t), dw = C.domainWeek(st, ws), S = st.settings;
    const rows = st.blocks.filter((b) => b.start >= ws - 7 * DAY && b.start < ws + 14 * DAY && !b.skipped && b.kind !== 'free').sort((a, b) => a.start - b.start)
      .map((b) => ymd(b.start) + ' ' + WD[C.dow(b.start)] + ' ' + C.fmtT(b.start) + '-' + C.fmtT(b.end) + ' ' + b.title + ' [' + (DOMAINS[b.domain] ? DOMAINS[b.domain].name : '') + '/' + ({ commit: '承诺', focus: '专注', admin: '事务' }[b.kind] || b.kind) + ']' + (b.done ? '[完成,实际' + Math.round(b.actual || C.bmin(b)) + '分]' : b.missed ? '[漏做]' : '') + ((st.items.find((i) => i.id === b.itemId) || {}).postponed ? '[被顺延' + st.items.find((i) => i.id === b.itemId).postponed + '次]' : ''));
    const quotas = DOMAIN_KEYS.map((k) => DOMAINS[k].name + ':本周' + Math.round(dw[k].done + dw[k].plan) + '分钟/预算' + S.quotas[k].b + '/下限' + S.quotas[k].lo).join(';');
    return '今天:' + ymd(t) + ' ' + WD[C.dow(t)] + ' ' + C.fmtT(t) + '\n本周执行率:' + (w.rate == null ? '暂无' : Math.round(w.rate * 100) + '%') + '(' + w.done + '/' + w.total + ')\n领域:' + quotas + '\n可用时段:' + C.fmtM(S.dayStart) + '-' + C.fmtM(S.dayEnd) + ',高精力 ' + C.fmtM(S.peak[0]) + '-' + C.fmtM(S.peak[1]) + '\n日程(上周至下周):\n' + rows.slice(0, 160).join('\n');
  }
  async function ask(q) {
    const sys = '你是「时序」里的时间分析助手。只依据下面给出的用户真实日程数据回答,不要给通用建议;引用具体的日期、时间、数字。' +
      '只评价「安排」,不评价「人」:不要使用「懒」「拖延症」「自律」「不够努力」这类词。回答要短(5 句以内),最后给一个具体、可执行的调整建议。数据不足就直说。\n\n' + ctxSummary();
    return call({ system: sys, user: q, maxTokens: 800 });
  }

  /* ---------- 设置面板 ---------- */
  A.llmSettings = (msg) => {
    const c = getCfg();
    A.sheet('<h3>大模型</h3><div class="lead">' + esc(msg || '用来识别截图、理解说不清的话、回答「我为什么这周这么累」。') + '</div>' +
      '<label class="field">服务商</label><select id="llPreset" data-act="llm-preset">' + Object.keys(PRESETS).map((k) => '<option value="' + k + '" ' + (c.preset === k ? 'selected' : '') + '>' + PRESETS[k].name + '</option>').join('') + '</select>' +
      '<label class="field">接口地址</label><input type="text" id="llBase" value="' + esc(c.base) + '" autocapitalize="off" spellcheck="false">' +
      '<label class="field">模型(必须支持看图才能识别截图)</label><input type="text" id="llModel" value="' + esc(c.model) + '" autocapitalize="off" spellcheck="false">' +
      '<label class="field">API Key(只保存在这台设备上)</label><input type="password" id="llKey" value="' + esc(c.key) + '" autocomplete="off" placeholder="sk-…">' +
      '<label class="field">本地代理地址(可选;遇到「跨域」错误时填 http://localhost:8765/proxy)</label><input type="text" id="llProxy" value="' + esc(c.proxy) + '" autocapitalize="off" spellcheck="false">' +
      '<label class="field">快速模型(可选:只处理文字、不看图时用,更快更省;留空则用上面的模型)</label><input type="text" id="llFast" value="' + esc(c.fastModel || '') + '" placeholder="例如 claude-haiku-4-5 / gpt-4o-mini / qwen-turbo" autocapitalize="off" spellcheck="false">' +
      '<label class="field">文字录入时</label><select id="llMode"><option value="fallback" ' + (c.textMode === 'fallback' ? 'selected' : '') + '>内置规则优先,吃不准才用大模型(省钱)</option><option value="always" ' + (c.textMode === 'always' ? 'selected' : '') + '>每次都用大模型(更准)</option><option value="off" ' + (c.textMode === 'off' ? 'selected' : '') + '>只用内置规则(不联网)</option></select>' +
      '<div class="row" style="gap:8px;margin-top:14px"><button class="btn pri grow" data-act="llm-save">保存</button><button class="btn" data-act="llm-test">测试连接</button></div><div id="llMsg" class="small muted" style="margin-top:8px"></div>');
  };
  const readForm = () => {
    const c = getCfg(), p = $('#llPreset').value;
    return Object.assign(c, { preset: p, fmt: PRESETS[p].fmt, base: $('#llBase').value.trim(), model: $('#llModel').value.trim(), key: $('#llKey').value.trim(), proxy: $('#llProxy').value.trim(), fastModel: $('#llFast').value.trim(), textMode: $('#llMode').value });
  };

  A.askSheet = async (q) => {
    if (!ready()) { A.llmSettings('先接入大模型,才能对话。'); return; }
    busy('正在翻看你的日程…', '');
    try { const a = await ask(q); A.sheet('<h3>' + esc(q) + '</h3><div class="card" style="white-space:pre-wrap;line-height:1.65">' + esc(a.trim()) + '</div><div class="small faint" style="margin-top:8px">回答只基于你本机的日程数据,评价的是安排,不是你。</div><button class="btn" style="width:100%;margin-top:12px" data-act="close">好</button>'); }
    catch (e) { fail(e); }
  };

  /* ---------- 事件 ---------- */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return; const act = el.dataset.act;
    if (act === 'img' || act === 'cam') {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; if (act === 'img') inp.multiple = true; else inp.setAttribute('capture', 'environment');
      inp.onchange = () => A.addPending(inp.files); inp.click();
    } else if (act === 'llm-open') A.llmSettings();
    else if (act === 'llm-save') {
      const c = readForm(); setCfg(c); const pend = A._pendingFiles, ptx = A._pendingText; A._pendingFiles = null; A._pendingText = ''; A.closeSheet(); A.toast('已保存大模型设置。');
      if (pend && ready(c)) captureImages(pend, ptx);
    } else if (act === 'llm-test') {
      const c = readForm(); setCfg(c); const m = $('#llMsg'); m.textContent = '连接中…';
      call({ system: '只回复 OK', user: 'ping', maxTokens: 16, timeout: 25000 }).then(() => { m.textContent = '连接成功 ✓(注意:能否看图取决于模型)'; }).catch((er) => { m.textContent = er.message; });
    } else if (act === 'llm-consent') { const c = getCfg(); c.consent = true; setCfg(c); const f = A._pendingFiles, ptx = A._pendingText; A._pendingFiles = null; A._pendingText = ''; A.closeSheet(); if (f) captureImages(f, ptx); }
    else if (act === 'ask') { const v = ($('#askIn') || {}).value; if (v && v.trim()) A.askSheet(v.trim()); }
    else if (act === 'ask-q') A.askSheet(el.dataset.q);
    else if (act === 'llm-cancel') { A._cancelled = true; if (A._abort) A._abort(); clearInterval(A._busyTimer); A.closeSheet(); }
    else if (act === 'tray-del') { const p = A.pending.splice(+el.dataset.i, 1)[0]; if (p) { try { URL.revokeObjectURL(p.url); } catch (er) { /* */ } } A.drawTray(); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'llPreset') return; const p = PRESETS[e.target.value];
    $('#llBase').value = p.base; $('#llModel').value = p.model;
    $('#llKey').placeholder = e.target.value === 'ollama' ? '无需填写' : 'sk-…';
  });
  document.addEventListener('paste', (e) => {
    const fs = [...((e.clipboardData && e.clipboardData.files) || [])].filter((f) => /^image\//.test(f.type));
    if (fs.length) { e.preventDefault(); A.addPending(fs); }
  });
  G.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  G.addEventListener('drop', (e) => { const fs = [...((e.dataTransfer && e.dataTransfer.files) || [])].filter((f) => /^image\//.test(f.type)); if (fs.length) { e.preventDefault(); A.addPending(fs); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'askIn' && !e.isComposing) { e.preventDefault(); const v = e.target.value.trim(); if (v) A.askSheet(v); } });

  A.LLM = { prepImage: (f) => prep(f), _setPrep: (f) => { prep = f; }, getCfg, setCfg, ready, call, extractJSON, toDrafts, dedupe, recognize, captureImages, ask, ctxSummary, extractSystem, PRESETS };
})(window);
