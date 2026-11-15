/* 时序 Chrono · 大模型助手(理解需求 → 结构化操作 → 预览确认 → 执行,可撤销)
   不是只会「把文字变成新事项」:它读取你真实的日程上下文(事项/固定周程/休假/节假日,均带 ID),
   理解「把周三的高数调到周四下午」「这周五实验课停课」「下周我出差」「这是我的课表」这类需求,
   输出一组受限的操作;应用前逐条预览、可取消勾选,应用后可一键撤销。模型永远不能直接改你的数据。 */
(function (G) {
  'use strict';
  const C = G.Chrono, A = G.A, L = A.LLM, { MIN, DAY, DOMAINS } = C;
  const { $, esc, now } = A;
  const WD = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const ymd = (ts) => { const d = new Date(ts); return d.getFullYear() + '-' + C.p2(d.getMonth() + 1) + '-' + C.p2(d.getDate()); };
  const pd = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null; };
  const pt = (s) => { const m = String(s || '').match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  const fmtD = (ts) => (new Date(ts).getMonth() + 1) + '月' + new Date(ts).getDate() + '日 ' + WD[C.dow(ts)];
  const fmtM = (m) => C.fmtM(m);
  const dom = (k, t) => (DOMAINS[k] ? k : C.domainOf(t || ''));

  /* ---------- 上下文:让模型看到真实数据(带 ID) ---------- */
  function ctxText() {
    const st = A.st, t = now(), t0 = C.dayStart(t), S = st.settings, L2 = [];
    const T = S.term, wn = C.weekNo(st, t0);
    L2.push('今天:' + ymd(t) + ' ' + WD[C.dow(t)] + ' ' + C.fmtT(t) + ';' + (T ? '学期第 1 周的周一=' + ymd(T.start) + ',共 ' + (T.weeks || '?') + ' 周,今天是第 ' + wn + ' 周' : '尚未设置学期(课表的周次/单双周需要先知道第 1 周是哪天)'));
    const hs = C.Holiday ? C.Holiday.upcoming(t0, 120) : [];
    L2.push('法定节假日(系统已自动处理:放假日工作事项不排、固定周程自动停课,不要再为它们建休假或停课):' + (hs.length ? hs.map((h) => h.name + (h.kind === 'makeup' ? '调休上班 ' : '放假 ') + ymd(h.start) + (h.end > h.start ? '~' + ymd(h.end) : '')).join(';') : '近期无'));
    const rs = st.habits.filter((h) => h.routine);
    L2.push('固定周程/课表(每一行是一个上课时间段;同一门课每周有几个不同时间就有几行,id 各不相同)(id | 名称 | 规则 | 例外):\n' + (rs.length ? rs.map((h) => 'r:' + h.id + ' | ' + h.title + ' | ' + C.routineLabel(h) + (h.skipHoliday === false ? ' | 节假日照常' : '') + ' | ' + ((h.ex || []).length ? h.ex.map((e) => ymd(e.date) + (e.type === 'cancel' ? ' 停课' : ' 调到 ' + ymd(e.to.date) + ' ' + fmtM(e.to.start) + '-' + fmtM(e.to.end))).join(';') : '无')).join('\n') : '(没有)'));
    const nb = (it) => st.blocks.filter((b) => b.itemId === it.id && !b.skipped && b.end > t).sort((a, b) => a.start - b.start)[0];
    const its = st.items.filter((i) => i.status === 'planned' || i.status === 'inbox').filter((i) => i.type === 'event' ? (i.end > t - DAY && i.start < t + 60 * DAY) : (!i.due || i.due < t + 90 * DAY)).sort((a, b) => (a.start || a.due || 9e15) - (b.start || b.due || 9e15)).slice(0, 40);
    L2.push('事项(id | 类型 | 标题 | 时间或截止 | 时长分钟 | 优先级 | 领域):\n' + (its.length ? its.map((i) => { const b = nb(i), when = i.type === 'event' ? ymd(i.start) + ' ' + C.fmtT(i.start) + '-' + C.fmtT(i.end) : i.type === 'deadline' ? '到期 ' + ymd(i.due) : (i.due ? '截止 ' + ymd(i.due) : '无截止') + (b ? ',已排 ' + ymd(b.start) + ' ' + C.fmtT(b.start) : ',未排'); return 'i:' + i.id + ' | ' + ({ event: '日程', task: '待办', deadline: '到期点' }[i.type]) + ' | ' + i.title + ' | ' + when + ' | ' + (i.estMin || 0) + ' | P' + i.priority + ' | ' + DOMAINS[i.domain].name; }).join('\n') : '(没有)'));
    L2.push('休假/出差(id | 名称 | 范围):' + ((S.off || []).length ? '\n' + S.off.map((o) => 'o:' + o.id + ' | ' + o.label + ' | ' + ymd(o.from) + '~' + ymd(o.to)).join('\n') : '(没有)'));
    L2.push('可用时段 ' + fmtM(S.dayStart) + '–' + fmtM(S.dayEnd) + ';高精力 ' + fmtM(S.peak[0]) + '–' + fmtM(S.peak[1]));
    return L2.join('\n');
  }

  function systemPrompt(hint) {
    return '你是「时序」日程应用里的助手。用户用自然语言(可能附图片)告诉你想怎么调整日程,你要真正理解意图,输出结构化「操作」,由应用在用户确认后执行。你不能直接改数据,只能输出操作。\n' +
      '只输出一个 JSON 对象,不要解释:{"summary":"一句话复述你理解的意图","ops":[...],"term":{"week1_monday":"YYYY-MM-DD|null","current_week":数字|null,"weeks":数字|null},"clarify":"信息不足时,只问一个最关键的问题;否则空字符串","answer":"如果用户只是在提问,在这里直接回答;否则空字符串"}\n' +
      '可用操作(所有日期 YYYY-MM-DD,时间 HH:MM,星期用 1~7 表示周一~周日;id 必须原样取自上下文,不要编造):\n' +
      '- add_event {title,date,start,end|dur_min,domain?,priority?,location?,prep_min?,travel_min?}  新增有明确时间的日程\n' +
      '- add_task {title,dur_min,due?,priority?,domain?}  新增需要花时间做的待办\n' +
      '- add_deadline {title,date}  新增只有日期的到期点\n' +
      '- add_routine {title,slots:[{days:[1-7],start,end,weeks?:"1-8,10-16",parity?:"all|odd|even",location?}],note?,domain?}  新增每周固定重复的安排/课程。**同一门课每周有几个不同的上课时间,就在同一个 add_routine 的 slots 里写几项**(例如高数周一 08:00-09:40、周三 10:00-11:40 → 两个 slot);时间相同的多个星期合并进同一个 slot 的 days;单双周、周次不同也各写各的 slot\n' +
      '- edit_routine {routine_id,title?,days?,start?,end?,weeks?,parity?,location?,skip_holiday?}  修改整个固定周程(「以后都改到…」)\n' +
      '- cancel_occurrence {routine_id,title?,date,reason?}  固定周程中某一天停课/不上(routine_id 优先;拿不准 id 就只写 title 课名 + date,系统会按那天实际有课的时间段去匹配)\n' +
      '- move_occurrence {routine_id,title?,date,to_date,start,end?,reason?}  固定周程中某一天调课到别的时间\n' +
      '- delete_routine {routine_id}\n' +
      '- edit_item {id,title?,date?,start?,end?,dur_min?,due?,priority?,domain?,location?}  修改已有事项\n' +
      '- move_item {id,date,start?}  把已有事项挪到另一天(或另一时间)\n' +
      '- delete_item {id}   - complete_item {id}\n' +
      '- add_away {from,to,label}  用户个人的休假/出差/请假(不是法定节假日)   - remove_away {id}\n' +
      '- add_zone {dow,start,end}  深度工作保护区(dow 1~7)\n' +
      '规则:\n' +
      '1. 先判断用户要「新增」还是「调整已有的」。调整时必须用上下文里的 id 精确指向对象;指不到唯一对象就在 clarify 里问,不要猜。\n' +
      '2. 相对日期(下周三、这周五、五一后)按「今天」换算成具体日期。\n' +
      '3. 法定节假日系统已自动处理,用户说「国庆放假」不需要任何操作,在 summary 里说明即可。\n' +
      '4. 课表里的「第N周」需要学期第 1 周的日期:图片或用户若给了(如「第1周是9月7日」「现在是第5周」)就填进 term,否则 term 全填 null,不要编造。\n' +
      '5. 只做用户明确要求的修改,不顺手改别的。宁可少做并 clarify,也不要做错。\n' +
      '6. 提问类需求(「我周三有什么课」)只填 answer,ops 为空数组。\n' +
      (hint === 'timetable' ? '7. 这次是「导入课表」:图片/文字是一份课表或固定周程。把每一门课输出成 add_routine(title 写课程名,location 写教室,note 写老师)。同一门课每周多次且时间相同,用 days 数组合并;时间/周次不同就拆开。上下文里已存在的同名同时间课程不要重复添加。不要输出 add_event。\n' : '');
  }

  /* ---------- 课表导入:两步走 ----------
     第 1 步(模型):只负责把图片/文字里的课表「抄」成结构化数据,不需要理解应用的操作;
     第 2 步(程序):周次文字、单双周、同课多时间、相同时间合并,全部由代码确定性完成。 */
  function ttSystem() {
    return '你是课表转录员。用户给你一张或几张课表(截图/照片/文字)。你的唯一任务是把课表里每一门课的每一个上课时间段原样转录成 JSON,不要做任何解释。\n' +
      '只输出一个 JSON 对象:{"term":{"week1_monday":"YYYY-MM-DD|null","current_week":数字|null,"weeks":数字|null},"clarify":"","courses":[{"name":"课程名","teacher":"老师(没有就空)","slots":[{"days":[1~7],"start":"HH:MM","end":"HH:MM","weeks_text":"周次原文,如 1-16周 / 1-8,10-16周 / 单周 / 2-16周(双);没写就空字符串","location":"教室(没有就空)"}]}]}\n' +
      '规则:\n' +
      '1. 课表通常是网格:列=星期(周一…周日),行=节次或时间。逐列逐格转录,一格一门课就是一个时间段,不要漏格、不要合并不同时间。\n' +
      '2. 一门课在表里出现在几个位置,就有几个 slot(例如高数在周一 1-2 节和周三 3-4 节,就是同一门课的两个 slot,各有各的时间)。时间完全相同、仅星期不同的才能合并进同一个 slot 的 days。\n' +
      '3. 把「第N节」换算成具体时间:表里有节次时间栏就严格按它换算;表里只有节次号没有时间、用户说明里也没写,就把 courses 留空并在 clarify 里问「请告诉我每节课的上课时间」,不要编造。\n' +
      '4. weeks_text 原样抄写,不要自己换算单双周。7 个星期用 1=周一 … 7=周日。\n' +
      '5. 格子里常见写法:「高等数学(1-16周)[单] @教二301 王老师」「大学物理实验 单周 实验楼B2」,请拆出课程名、周次、教室、老师。\n' +
      '6. 午休、空白、「课程表」标题、日期栏都不是课,忽略。学期信息(第1周是几月几日、共几周、现在第几周)如果图上或用户说明里有就填 term,没有全填 null,不要编造。';
  }
  async function ttPlan(text, images) {
    const raw = await L.call({ system: ttSystem(), user: '今天是 ' + ymd(now()) + ' ' + WD[C.dow(now())] + '。\n' + (text ? '用户说明:\n' + text : '请转录这份课表。'), images: images || [], maxTokens: 6000, timeout: 120000 });
    const o = L.extractJSON(raw), cs = Array.isArray(o.courses) ? o.courses : [];
    const ops = cs.filter((c) => c && c.name).map((c) => ({ op: 'add_routine', title: String(c.name), note: c.teacher || '', location: c.location || '', slots: (Array.isArray(c.slots) ? c.slots : []).map((s) => { const w = C.parseWeeksText(s.weeks_text || ''); return { days: s.days || s.day, start: s.start, end: s.end, weeks: w.weeks, parity: s.parity || w.parity, location: s.location || c.location || '' }; }) }));
    const n = ops.reduce((a, o) => a + o.slots.length, 0);
    return { summary: ops.length ? '识别到 ' + ops.length + ' 门课,共 ' + n + ' 个上课时间段。请核对时间、周次、教室。' : '', ops, term: o.term || {}, clarify: String(o.clarify || ''), answer: '' };
  }
  /* 用户直接打字写课表(不联网):「高数 周一 8:00-9:40 周三 10:00-11:40 教二301 1-16周」 */
  function showRoutineText(cs) {
    const by = {}; cs.forEach((c) => { const g = (by[c.title] = by[c.title] || { op: 'add_routine', title: c.title, location: c.loc, slots: [] }); c.slots.forEach((s) => g.slots.push({ days: s.days.map((d) => d + 1), start: C.fmtM(s.start), end: C.fmtM(s.end), weeks: c.weeks, parity: c.parity, location: c.loc })); });
    const ops = Object.keys(by).map((k) => by[k]), n = ops.reduce((a, o) => a + o.slots.length, 0);
    showPlan({ summary: '按你写的整理成固定周程:' + ops.length + ' 门课,共 ' + n + ' 个上课时间段(这一步没有联网)。', ops, term: {}, clarify: '', answer: '' }, {});
  }

  async function plan(text, images, hint) {
    const raw = await L.call({ system: systemPrompt(hint), user: '【当前日程上下文】\n' + ctxText() + '\n\n【用户的话】\n' + (text || '(没有文字,请看图片)'), images: images || [], maxTokens: 1500, timeout: 60000 });
    const o = L.extractJSON(raw);
    return { summary: String(o.summary || ''), ops: Array.isArray(o.ops) ? o.ops.slice(0, 80) : [], term: o.term || {}, clarify: String(o.clarify || ''), answer: String(o.answer || '') };
  }

  /* 一个 add_routine 操作 → 若干个「单一时间段」的固定周程(同一门课每周多个时间也能正确表达) */
  function expandRoutine(op) {
    const title = String(op.title || '').trim().slice(0, 30); if (!title) return [];
    const days = (x) => (Array.isArray(x) ? x : [x]).map((v) => +v - 1).filter((v) => v >= 0 && v <= 6);
    const baseW = Array.isArray(op.weeks) ? C.parseWeeks(op.weeks) : C.parseWeeks(op.weeks), baseP = ['odd', 'even'].includes(op.parity) ? op.parity : 'all';
    let slots = Array.isArray(op.slots) && op.slots.length ? op.slots : null;
    if (!slots) {                                    // 兼容旧格式:days + start/end,start/end 也可能是与 days 对齐的数组
      const ds = Array.isArray(op.days) ? op.days : [op.days];
      slots = Array.isArray(op.start) ? ds.map((d, i) => ({ days: [d], start: op.start[i], end: Array.isArray(op.end) ? op.end[i] : op.end })) : [{ days: ds, start: op.start, end: op.end }];
    }
    const groups = {};
    slots.forEach((s) => {
      const dd = days(s.days != null ? s.days : s.day), a0 = pt(s.start), b0 = pt(s.end); if (!dd.length || a0 == null || b0 == null || b0 <= a0) return;
      const w = s.weeks != null ? C.parseWeeks(s.weeks) : baseW, p = ['odd', 'even'].includes(s.parity) ? s.parity : baseP, loc = String(s.location || op.location || '').slice(0, 30);
      const key = [a0, b0, JSON.stringify(w), p, loc].join('|');
      (groups[key] = groups[key] || { title, days: [], start: a0, end: b0, weeks: w, parity: p, loc, note: String(op.note || '').slice(0, 30), domain: dom(op.domain, title) }).days.push(...dd);
    });
    return Object.keys(groups).map((k) => { const g = groups[k]; g.days = [...new Set(g.days)].sort(); return g; });
  }

  /* ---------- 操作 → 可预览、可执行的条目 ---------- */
  function build(op, P, st, t) {
    const T = op && op.op, bad = (r) => ({ ok: false, text: T + ':' + r });
    const item = (id) => st.items.find((i) => i.id === String(id || '').replace(/^i:/, ''));
    const routine = (id) => st.habits.find((h) => h.routine && h.id === String(id || '').replace(/^r:/, ''));
    const days = (a) => (Array.isArray(a) ? a : [a]).map((x) => +x - 1).filter((x) => x >= 0 && x <= 6);
    const clock = (s, e) => { const a = pt(s), b = pt(e); return a == null ? null : { a, b: b != null && b > a ? b : null }; };
    switch (T) {
      case 'add_event': case 'add_task': case 'add_deadline': {
        const type = T === 'add_event' ? 'event' : T === 'add_task' ? 'task' : 'deadline';
        const r = L.toDrafts({ items: [{ title: op.title, type, date: op.date, start: op.start, end: op.end, dur_min: op.dur_min, due: op.due || op.date, domain: op.domain, priority: op.priority, location: op.location, remind_before_min: op.remind_before_min, travel_min: op.travel_min, confidence: 1 }] }, st, t, 'agent');
        const d = r.drafts[0]; if (!d) return bad(r.skipped.stale ? '时间已经过去了' : '缺少必要的时间信息');
        if (op.prep_min > 0 && type === 'event') d.prep = Math.min(120, +op.prep_min);
        const when = type === 'event' ? fmtD(d.start) + ' ' + C.fmtT(d.start) + '–' + C.fmtT(d.end) : type === 'deadline' ? fmtD(d.due) + ' 到期' : (d.due ? fmtD(d.due) + '前 · ' : '') + C.fmtDur(d.estMin);
        return { ok: true, text: '新增' + { event: '日程', task: '待办', deadline: '到期点' }[type] + '「' + d.short + '」· ' + when, run: () => { C.addItems(st, [d], t); } };
      }
      case 'add_routine': {
        const defs = expandRoutine(op); if (!defs.length) return bad('缺少名称、星期或起止时间');
        const fresh = defs.filter((d) => !st.habits.some((h) => h.routine && h.title === d.title && h.time === d.start && JSON.stringify(h.days) === JSON.stringify(d.days) && JSON.stringify(h.weeks || []) === JSON.stringify(d.weeks)));
        if (!fresh.length) return bad('「' + defs[0].title + '」已存在,已跳过');
        if (fresh.some((d) => d.weeks.length || d.parity !== 'all')) P.needTerm = true;
        const lab = (d) => C.routineLabel({ days: d.days, time: d.start, dur: d.end - d.start, weeks: d.weeks, parity: d.parity, loc: d.loc });
        return { ok: true, text: '固定周程「' + fresh[0].title + '」' + (fresh.length > 1 ? '(每周 ' + fresh.length + ' 个时间)' : '') + ' · ' + fresh.map(lab).join(';  '), run: () => { fresh.forEach((d) => C.addRoutine(st, d, t)); } };
      }
      case 'edit_routine': {
        const h = routine(op.routine_id); if (!h) return bad('找不到这个固定周程');
        const ch = [], patch = {};
        if (op.title) { patch.title = String(op.title).slice(0, 30); ch.push('改名为「' + patch.title + '」'); }
        if (op.days) { patch.days = days(op.days); if (patch.days.length) ch.push('改到' + patch.days.map((x) => WD[x]).join('、')); else delete patch.days; }
        const c = clock(op.start, op.end);
        if (op.start && c) { patch.time = c.a; patch.dur = c.b ? c.b - c.a : h.dur; ch.push('时间 ' + fmtM(patch.time) + '–' + fmtM(patch.time + patch.dur)); }
        else if (op.end && pt(op.end) > h.time) { patch.dur = pt(op.end) - h.time; ch.push('下课 ' + fmtM(pt(op.end))); }
        if (op.weeks != null) { patch.weeks = C.parseWeeks(op.weeks); ch.push('周次 ' + (op.weeks || '不限')); }
        if (['all', 'odd', 'even'].includes(op.parity)) { patch.parity = op.parity; ch.push({ all: '每周', odd: '单周', even: '双周' }[op.parity]); }
        if (op.location != null) { patch.loc = String(op.location).slice(0, 30); ch.push('地点 ' + patch.loc); }
        if (op.skip_holiday != null) { patch.skipHoliday = !!op.skip_holiday; ch.push(op.skip_holiday ? '节假日停课' : '节假日照常'); }
        if (!ch.length) return bad('没有要修改的内容');
        if (patch.weeks || patch.parity) P.needTerm = true;
        return { ok: true, text: '修改固定周程「' + h.title + '」:' + ch.join(',') + '(以后每周都按新规则)', run: () => { Object.assign(h, patch); C.refreshRoutine(st, h.id, t); } };
      }
      case 'cancel_occurrence': {
        const d = pd(op.date), h = C.findRoutine(st, { id: op.routine_id, title: op.title, date: d }); if (!h || d == null) return bad('找不到对应的课程或日期');
        return { ok: true, text: fmtD(d) + ' 「' + h.title + '」停课' + (op.reason ? '(' + op.reason + ')' : '') + ',只影响这一次', run: () => { C.routineException(st, h.id, { date: d, type: 'cancel', reason: op.reason || '' }, t); } };
      }
      case 'move_occurrence': {
        const d = pd(op.date), h = C.findRoutine(st, { id: op.routine_id, title: op.title, date: d }), to = pd(op.to_date || op.date), c = clock(op.start, op.end); if (!h || d == null || to == null || !c) return bad('缺少课程、日期或新时间');
        const e = c.b || c.a + h.dur;
        return { ok: true, text: fmtD(d) + ' 「' + h.title + '」调到 ' + fmtD(to) + ' ' + fmtM(c.a) + '–' + fmtM(e) + (op.reason ? '(' + op.reason + ')' : '') + ',只影响这一次', run: () => { C.routineException(st, h.id, { date: d, type: 'move', to: { date: to, start: c.a, end: e }, reason: op.reason || '调课' }, t); } };
      }
      case 'delete_routine': {
        const h = routine(op.routine_id); if (!h) return bad('找不到这个固定周程');
        return { ok: true, danger: true, text: '删除固定周程「' + h.title + '」(' + C.routineLabel(h) + ')', run: () => { st.habits = st.habits.filter((x) => x.id !== h.id); st.blocks = st.blocks.filter((b) => !(b.habitId === h.id && !b.done)); } };
      }
      case 'edit_item': {
        const it = item(op.id); if (!it) return bad('找不到这件事');
        const patch = {}, ch = [];
        if (op.title) { patch.title = String(op.title); ch.push('改名为「' + patch.title + '」'); }
        if (op.dur_min > 0) { patch.estMin = Math.round(+op.dur_min); ch.push('时长 ' + C.fmtDur(patch.estMin)); }
        if (op.priority != null && op.priority >= 0 && op.priority <= 3) { patch.priority = Math.round(+op.priority); ch.push('优先级 P' + patch.priority); }
        if (DOMAINS[op.domain]) { patch.domain = op.domain; ch.push('领域 ' + DOMAINS[op.domain].name); }
        if (op.location != null) { patch.loc = String(op.location); ch.push('地点 ' + patch.loc); }
        if (it.type === 'event' && (op.date || op.start)) { const d = pd(op.date) != null ? pd(op.date) : C.dayStart(it.start), s = pt(op.start) != null ? pt(op.start) : (it.start - C.dayStart(it.start)) / MIN; patch.start = d + s * MIN; const dur = patch.estMin || it.estMin; patch.end = patch.start + dur * MIN; if (pt(op.end) != null && pt(op.end) > s && !patch.estMin) { patch.estMin = pt(op.end) - s; patch.end = d + pt(op.end) * MIN; } ch.push('时间改为 ' + fmtD(patch.start) + ' ' + C.fmtT(patch.start)); }
        if (it.type !== 'event' && (op.due || (op.date && it.type === 'deadline'))) { const d = pd(op.due || op.date); if (d != null) { patch.due = d + DAY - 1; ch.push((it.type === 'deadline' ? '到期日' : '截止') + '改为 ' + fmtD(d)); } }
        if (!ch.length) return bad('没有要修改的内容');
        return { ok: true, text: '修改「' + it.short + '」:' + ch.join(',') , run: () => { C.editItem(st, it.id, patch, t); } };
      }
      case 'move_item': {
        const it = item(op.id), d = pd(op.date); if (!it || d == null) return bad('找不到这件事或日期');
        if (it.type === 'event') { const s = pt(op.start) != null ? pt(op.start) : (it.start - C.dayStart(it.start)) / MIN, ns = d + s * MIN; return { ok: true, text: '把「' + it.short + '」挪到 ' + fmtD(ns) + ' ' + C.fmtT(ns), run: () => { C.editItem(st, it.id, { start: ns, end: ns + it.estMin * MIN }, t); } }; }
        if (it.type === 'deadline') return { ok: true, text: '「' + it.short + '」到期日改为 ' + fmtD(d), run: () => { C.editItem(st, it.id, { due: d + DAY - 1 }, t); } };
        return { ok: true, text: '把「' + it.short + '」挪到 ' + fmtD(d) + (pt(op.start) != null ? ' ' + op.start : '') + ' 之后再做', run: () => { it.notBefore = d; if (pt(op.start) != null) it.hold = d + pt(op.start) * MIN; if (it.due && it.due < d) it.due = d + DAY - 1; st.blocks.forEach((b) => { if (b.itemId === it.id && !b.done && !b.started) b.skipped = true; }); C.plan(st, t, 'inc'); } };
      }
      case 'delete_item': { const it = item(op.id); if (!it) return bad('找不到这件事'); return { ok: true, danger: true, text: '删除「' + it.short + '」', run: () => { C.removeItem(st, it.id); } }; }
      case 'complete_item': { const it = item(op.id); if (!it) return bad('找不到这件事'); return { ok: true, text: '标记「' + it.short + '」已完成', run: () => { it.status = 'done'; st.blocks.forEach((b) => { if (b.itemId === it.id && !b.done) { b.skipped = true; } }); } }; }
      case 'add_away': {
        const a = pd(op.from), b = pd(op.to || op.from); if (a == null || b == null) return bad('缺少日期');
        return { ok: true, text: (op.label || '休假') + ':' + fmtD(a) + (a === b ? '' : ' 到 ' + fmtD(b)) + ',这些天不排任务', run: () => { C.addAway(st, a, b, op.label || '休假', t); } };
      }
      case 'remove_away': { const o = (st.settings.off || []).find((x) => x.id === String(op.id || '').replace(/^o:/, '')); if (!o) return bad('找不到这条休假'); return { ok: true, text: '取消「' + o.label + '」(' + fmtD(o.from) + ')', run: () => { C.removeAway(st, o.id, t); } }; }
      case 'add_zone': {
        const d = days(op.dow)[0], c = clock(op.start, op.end); if (d == null || !c || !c.b || c.b - c.a < 60) return bad('缺少星期或至少 1 小时的时段');
        return { ok: true, text: '深度工作保护区:' + WD[d] + ' ' + fmtM(c.a) + '–' + fmtM(c.b), run: () => { (st.settings.zones = st.settings.zones || []).push({ dow: d, start: c.a, end: c.b }); } };
      }
      default: return bad('不支持的操作');
    }
  }

  /* ---------- 预览确认 ---------- */
  let cur = null;       // 当前待确认的计划
  function termStartFrom(P, st, t, manual) {
    const tm = P.term || {}, t0 = C.dayStart(t);
    if (manual && manual.date) return C.weekStart(manual.date);
    if (manual && manual.week) return C.addDays(C.weekStart(t0), -(manual.week - 1) * 7);
    const m = pd(tm.week1_monday); if (m != null) return C.weekStart(m);
    if (+tm.current_week >= 1) return C.addDays(C.weekStart(t0), -(+tm.current_week - 1) * 7);
    return null;
  }
  function showPlan(p, ctxInfo) {
    const st = A.st, t = now(), P = { needTerm: false, term: p.term };
    const items = p.ops.map((op) => build(op, P, st, t));
    cur = { p, items, P, ctxInfo };
    const good = items.filter((x) => x.ok), bad = items.filter((x) => !x.ok);
    const termGuess = termStartFrom(p, st, t), haveTerm = !!st.settings.term;
    const termRow = P.needTerm && !haveTerm ? '<div class="card" style="margin-bottom:10px"><b>课表需要知道学期周次</b><div class="small muted">' + (termGuess ? '识别到第 1 周的周一是 ' + fmtD(termGuess) + '。' : '图片和说明里没有写第几周。') + '可以改:</div>' +
      '<div class="row" style="gap:8px;margin-top:8px"><input type="date" id="agTermDate" value="' + (termGuess ? A.dateVal(termGuess) : '') + '" style="flex:1.4"><input type="number" id="agTermWeek" min="1" max="30" placeholder="或:今天是第几周" style="flex:1"><input type="number" id="agTermTotal" min="1" max="40" value="' + (p.term && +p.term.weeks ? +p.term.weeks : 18) + '" style="width:76px" aria-label="总周数"></div><div class="small faint" style="margin-top:6px">留空则忽略「第几周 / 单双周」,课程每周都上。</div></div>' : '';
    const sum = p.summary ? '<div class="lead">' + esc(p.summary) + '</div>' : '';
    if (p.answer && !good.length) { A.sheet('<h3>助手</h3>' + sum + '<div class="card" style="white-space:pre-wrap;line-height:1.65">' + esc(p.answer) + '</div><button class="btn" style="width:100%;margin-top:12px" data-act="close">好</button>'); return; }
    if (p.clarify && !good.length) { A.sheet('<h3>需要再确认一下</h3><div class="lead">' + esc(p.clarify) + '</div><input type="text" id="agReply" placeholder="直接回答就行" autocomplete="off"><div class="row" style="gap:8px;margin-top:12px"><button class="btn pri grow" data-act="ag-reply">继续</button><button class="btn ghost" data-act="close">算了</button></div>'); const i = $('#agReply'); i && i.focus(); return; }
    if (!good.length) { A.sheet('<h3>没有可执行的修改</h3><div class="lead">' + esc(p.summary || '模型没有给出可执行的操作。') + '</div>' + (bad.length ? '<div class="small muted">' + bad.map((x) => esc(x.text)).join('<br>') + '</div>' : '') + '<div class="small muted" style="margin-top:8px">可以换个说法,例如写清楚是哪一天、哪一门课。</div><button class="btn" style="width:100%;margin-top:12px" data-act="close">好</button>'); return; }
    A.sheet('<h3>我理解的是</h3>' + sum + (p.clarify ? '<div class="tag-note">' + esc(p.clarify) + '</div>' : '') + termRow +
      '<div class="small muted" style="margin:4px 6px 6px">将进行 ' + good.length + ' 项修改。可以取消勾选,应用后可一键撤销。</div>' +
      items.map((x, i) => x.ok ? '<label class="card row" style="gap:12px;margin-top:8px"><input type="checkbox" data-agop="' + i + '" checked><span class="grow">' + (x.danger ? '<span class="chip" style="min-height:22px;padding:0 8px;margin-right:6px">删除</span>' : '') + esc(x.text) + '</span></label>' : '').join('') +
      (bad.length ? '<div class="small faint" style="margin:10px 6px 0">已忽略 ' + bad.length + ' 项:' + bad.map((x) => esc(x.text)).join(';') + '</div>' : '') +
      '<div class="row" style="gap:8px;margin-top:14px"><button class="btn pri grow" data-act="ag-apply">应用修改</button><button class="btn ghost" data-act="close">取消</button></div>');
  }

  function apply() {
    if (!cur) return; const { items, P, p } = cur; const picks = [...document.querySelectorAll('[data-agop]')]; const chosen = picks.length ? picks.filter((c) => c.checked).map((c) => +c.dataset.agop) : items.map((x, i) => (x.ok ? i : -1)).filter((i) => i >= 0);
    if (!chosen.length) { A.toast('没有选中任何修改。'); return; }
    const t = now(); let manual = null;
    const ed = $('#agTermDate'), ew = $('#agTermWeek'), et = $('#agTermTotal');
    if (ed || ew) manual = { date: ed && ed.value ? A.parseDateVal(ed.value) : null, week: ew && +ew.value > 0 ? +ew.value : 0, weeks: et && +et.value > 0 ? +et.value : 0 };
    A.closeSheet(); let n = 0;
    A.mutate(() => {
      const st = A.st;
      if (P.needTerm && !st.settings.term) {
        const ts = termStartFrom(p, st, t, manual && (manual.date || manual.week) ? manual : null);
        if (ts != null) st.settings.term = { start: ts, weeks: (manual && manual.weeks) || +(p.term || {}).weeks || 18 };
      }
      chosen.forEach((i) => { try { items[i].run(); n++; } catch (e) { /* 单项失败不影响其他 */ } });
      C.plan(st, t, 'inc');
    }, '已应用 ' + n + ' 项修改。点「撤销」可以恢复。');
    cur = null;
  }

  /* ---------- 入口 ---------- */
  async function run(text, files, hint, again) {
    if (!L.ready()) { A.llmSettings('先接入大模型,助手才能理解你的话。'); return; }
    const c = L.getCfg();
    if (files && files.length && !c.consent) { A._agentPending = { text, files, hint }; A.sheet('<h3>图片会发给你配置的模型</h3><div class="lead">识别需要把图片(已压缩)发送到你配置的服务商。时序自己没有服务器。</div><button class="btn pri" style="width:100%" data-act="ag-consent">明白了,继续</button><button class="btn ghost" style="width:100%;margin-top:6px" data-act="close">取消</button>'); return; }
    A.busy('正在理解你的需求…', hint === 'timetable' ? '转录课表' : '读取日程并判断要改什么');
    try {
      const images = []; for (const f of files || []) images.push(await L.prepImage(f));
      const full = again ? again.text + '\n(用户补充回答:' + text + ')' : text;
      const p = hint === 'timetable' ? await ttPlan(full, images) : await plan(full, images, hint); cur = null; A._agentLast = { text: full, files, hint };
      showPlan(p, { text: full, files, hint });
    } catch (e) { if (A._cancelled) return; A.sheet('<h3>没能处理</h3><div class="lead">' + esc(e.message) + '</div><div class="row" style="gap:8px;margin-top:8px"><button class="btn" data-act="llm-open">检查大模型设置</button><button class="btn ghost" data-act="close">关闭</button></div>'); }
  }
  A.agent = (text, files, hint) => run((text || '').trim(), files, hint);

  const SAMPLES = ['高数 周一 8:00-9:40 周三 10:00-11:40 教二301 1-16周', '下周三的高数调到周四下午两点', '这周五的实验课取消', '5 月 6 号到 8 号我出差', '把写方案的截止日改到下周一', '以后高数都改到周二周四上午', '下周一到周三不要排会议'];
  A.agentHelp = () => A.sheet('<h3>让助手来调整</h3><div class="lead">用一句话说你想怎么改。助手会读你现有的日程,先告诉你它打算怎么改,你确认后才会执行。</div><div class="suggest">' + SAMPLES.map((s) => '<button class="chip" data-act="ag-sample" data-q="' + esc(s) + '">' + esc(s) + '</button>').join('') + '</div><div class="small muted" style="margin-top:12px">也可以附上截图,例如老师发的调课通知:先点图片按钮添加,再写「按这个通知调课」。</div>');
  A.ttSheet = () => {
    A._ttFiles = [];
    const T = A.st.settings.term, wn = T ? C.weekNo(A.st, now()) : null;
    A.sheet('<h3>导入课表 / 固定周程</h3><div class="lead">拍照或截图你的课表(可多张),助手会识别每门课的时间、教室和周次,生成每周自动出现的固定安排。法定节假日会自动停课,调课、放假之后用一句话告诉助手即可。</div>' +
      '<button class="btn" style="width:100%" data-act="tt-pick">选择课表图片</button><div id="ttInfo" class="small muted" style="margin:6px 6px 0">还没有选择图片(也可以只写文字)</div>' +
      '<label class="field">补充说明(可选)</label><textarea id="ttText" rows="3" placeholder="例如:第 1 周是 9 月 7 日,共 18 周;带 * 的是单周课;我是计算机 2 班"></textarea>' +
      (T ? '<div class="small faint" style="margin:6px 6px 0">已设置学期:第 1 周从 ' + fmtD(T.start) + ' 开始,现在是第 ' + wn + ' 周。</div>' : '') +
      '<button class="btn pri" style="width:100%;margin-top:14px" data-act="tt-go">识别并生成预览</button>');
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return; const a = el.dataset.act;
    if (a === 'agent') {
      const inp = $('#capIn'), text = inp ? inp.value.trim() : '', files = (A.pending || []).map((p) => p.file);
      if (!text && !files.length) { A.agentHelp(); return; }
      if (inp) inp.value = ''; A._capText = ''; if (A.clearPending) A.clearPending(); run(text, files);
    } else if (a === 'ag-sample') { A.closeSheet(); const i = $('#capIn'); if (i) { i.value = el.dataset.q; A._capText = el.dataset.q; i.focus(); } }
    else if (a === 'ag-apply') apply();
    else if (a === 'ag-reply') { const v = ($('#agReply') || {}).value; if (v && v.trim() && A._agentLast) run(v.trim(), A._agentLast.files, A._agentLast.hint, { text: A._agentLast.text }); }
    else if (a === 'ag-consent') { const c = L.getCfg(); c.consent = true; L.setCfg(c); const p = A._agentPending; A._agentPending = null; if (p) run(p.text, p.files, p.hint); }
    else if (a === 'tt-open') A.ttSheet();
    else if (a === 'tt-pick') { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true; inp.onchange = () => { A._ttFiles = [...inp.files].filter((f) => /^image\//.test(f.type)).slice(0, 4); const i = $('#ttInfo'); if (i) i.textContent = '已选择 ' + A._ttFiles.length + ' 张图片'; }; inp.click(); }
    else if (a === 'tt-go') { const tx = ($('#ttText') || {}).value || '', fs = A._ttFiles || []; if (!tx.trim() && !fs.length) { A.toast('请选择课表图片,或者写下课表内容。'); return; } run(tx.trim() || '请导入这份课表。', fs, 'timetable'); }
  });

  /* 自动路由:一看就是「调整」的话直接交给助手;其他仍走原来的录入流程 */
  const ADJ = /调课|调到|改到|改成|换到|挪到|移到|推迟|延期|延后|提前到|取消|不上|停课|休课|补课|放假|请假|休息一|删除|删掉|去掉|不用了|不去了|别排|不要排|重新安排|腾出|空出|课表|学期|第[一二三四五六七八九十\d]+周|单周|双周|以后都|之后都/;
  const STRICT = /调课|调到|改到|改成|换到|挪到|移到|推迟|延期|延后|取消|不上|停课|休课|补课|放假|请假|删除|删掉|去掉|不用了|不去了|别排|不要排/;
  const baseCapture = A.capture;
  A.capture = function (text, source) {
    text = (text || '').trim();
    if (text && source !== 'llm' && source !== 'agent' && !(A.pending && A.pending.length) && !STRICT.test(text)) {   // 直接写课表:不联网也能录
      const cs = C.parseRoutineText(text);
      if (cs.length && (C.ROUTINE_HINT.test(text) || cs.length >= 2 || cs.some((c) => c.slots.length >= 2 || c.slots[0].days.length >= 2 || c.weeks.length || c.parity !== 'all'))) { const i = $('#capIn'); if (i) i.value = ''; A._capText = ''; return showRoutineText(cs); }
    }
    const c = L.getCfg();
    if (text && source !== 'llm' && source !== 'agent' && L.ready(c) && c.textMode !== 'off' && ADJ.test(text)) {
      const files = (A.pending || []).map((p) => p.file); if (A.clearPending) A.clearPending();
      const i = $('#capIn'); if (i) i.value = ''; A._capText = '';
      return run(text, files, files.length && /课表|课程表/.test(text) ? 'timetable' : undefined);
    }
    return baseCapture(text, source);
  };
  A.Agent = { ttSystem, ttPlan, expandRoutine, showRoutineText, ctxText, systemPrompt, plan, build, ADJ, run, termStartFrom };
})(window);
