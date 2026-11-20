/* 时序 Chrono · 理解:中文口语 → 结构化事项(规则解析 + 个人偏好学习) */
(function (G) {
  'use strict';
  const C = G.Chrono || (G.Chrono = {});
  const { MIN, DAY, dayStart, addDays, weekStart, dow } = C;

  const NUM = '[0-9]+(?:\\.[0-9]+)?|[零〇一二两三四五六七八九十]+';
  const CN = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  function cn(s) {
    if (/^[0-9]+(\.[0-9]+)?$/.test(s)) return parseFloat(s);
    if (s === '十') return 10;
    const i = s.indexOf('十');
    if (i >= 0) {
      const a = i === 0 ? 1 : CN[s[0]];
      const b = i === s.length - 1 ? 0 : CN[s[i + 1]];
      return a * 10 + (b || 0);
    }
    if (s.length === 1) return CN[s];
    return NaN;
  }
  const WDI = { 一: 0, 二: 1, 三: 2, 四: 3, 五: 4, 六: 5, 日: 6, 天: 6 };

  /* ---------- 日期 ---------- */
  function parseDate(s, now) {
    const t0 = dayStart(now); let m;
    const day = (ts, str, o) => Object.assign({ ts: dayStart(ts), str }, o || {});
    if ((m = s.match(/大后天/))) return day(addDays(t0, 3), m[0]);
    if ((m = s.match(/后天/))) return day(addDays(t0, 2), m[0]);
    if ((m = s.match(/明[天日早晚]/))) return day(addDays(t0, 1), m[0]);
    if ((m = s.match(/今[天日早晚]/))) return day(t0, m[0]);
    if ((m = s.match(/周末/))) {
      const w = dow(t0), sat = w >= 5 ? addDays(t0, -(w - 5)) : addDays(weekStart(t0), 5);
      return day(Math.max(sat, t0), m[0], { range: [Math.max(sat, t0), addDays(weekStart(t0), 6)] });
    }
    if ((m = s.match(/(下|这|本)?(?:个)?(?:周|星期|礼拜)([一二三四五六日天])/))) {
      const base = weekStart(t0), w = WDI[m[2]];
      let ts = addDays(base, w + (m[1] === '下' ? 7 : 0));
      if (!m[1] && ts < t0) ts = addDays(ts, 7);
      return day(ts, m[0]);
    }
    if ((m = s.match(new RegExp('(' + NUM + ')月(' + NUM + ')[日号]?')))) {
      const mo = cn(m[1]) - 1, d = cn(m[2]), y = C.date(now).getFullYear();
      let dt = C.makeDate(y, mo, d); if (dayStart(dt.getTime()) < t0) dt = C.makeDate(y + 1, mo, d);
      return day(dt.getTime(), m[0]);
    }
    if ((m = s.match(/月底|月末/))) {
      const n = C.date(now); return day(C.makeDate(n.getFullYear(), n.getMonth() + 1, 0).getTime(), m[0], { soft: true });
    }
    if ((m = s.match(new RegExp('(' + NUM + ')[号日]')))) {
      const n = C.date(now), d = cn(m[1]); let dt = C.makeDate(n.getFullYear(), n.getMonth(), d);
      if (dayStart(dt.getTime()) < t0) dt = C.makeDate(n.getFullYear(), n.getMonth() + 1, d);
      return day(dt.getTime(), m[0]);
    }
    if ((m = s.match(/下(?:个)?周/))) {
      const mon = addDays(weekStart(t0), 7);
      return day(mon, m[0], { range: [mon, addDays(mon, 6)], soft: true });
    }
    if ((m = s.match(/这周|本周|这个星期/))) {
      return day(t0, m[0], { range: [t0, addDays(weekStart(t0), 6)], soft: true });
    }
    return null;
  }

  /* ---------- 钟点 ---------- */
  const PERIOD = /(早上|早晨|清晨|明早|今早|上午|中午|下午|傍晚|晚上|今晚|明晚|夜里)/;
  const TRE = new RegExp('(早上|早晨|清晨|上午|中午|下午|傍晚|晚上|夜里)?\\s*(' + NUM + ')\\s*(?:点钟|点|时|:|：)\\s*(半|一刻|(?:' + NUM + ')\\s*分?)?');
  function periodOf(s) {
    const m = s.match(PERIOD); if (!m) return null;
    const p = m[1];
    if (/早/.test(p) || p === '清晨') return 'am0';
    if (p === '上午') return 'am';
    if (p === '中午') return 'noon';
    if (p === '下午' || p === '傍晚') return 'pm';
    return 'eve';
  }
  const PWIN = { am0: [8 * 60, 10 * 60], am: [9 * 60, 12 * 60], noon: [12 * 60, 14 * 60], pm: [14 * 60, 18 * 60], eve: [19 * 60, 22 * 60] };
  function parseClock(s, period) {
    const m = s.match(TRE); if (!m) return null;
    const hRaw = m[2];
    if (hRaw === '一' && !m[1] && /点/.test(m[0])) return null;   // “一点水果”
    let h = cn(hRaw); if (isNaN(h) || h > 24) return null;
    let mi = 0;
    if (m[3]) mi = m[3] === '半' ? 30 : m[3] === '一刻' ? 15 : cn(m[3].replace(/分/, '').trim()) || 0;
    const p = m[1] ? periodOf(m[1]) : period;
    if (p === 'noon') { if (h < 11) h += 12; }
    else if (p === 'pm' || p === 'eve') { if (h < 12) h += 12; }
    else if (!p && h >= 1 && h <= 6) h += 12;
    return { min: h * 60 + mi, str: m[0] };
  }

  /* ---------- 时长 / 提前量 ---------- */
  function parseLead(s) {
    const m = s.match(new RegExp('提前\\s*(半个?小时|半个?钟头|(' + NUM + ')\\s*个?\\s*(小时|钟头|分钟|天))\\s*(?:提醒我?|做准备|准备)?'));
    if (!m) return null;
    let min = 30;
    if (!/^半/.test(m[1])) { const n = cn(m[2]); min = m[3] === '分钟' ? n : m[3] === '天' ? n * 1440 : n * 60; }
    return { min, str: m[0] };
  }
  function parseDur(s) {
    let m;
    if ((m = s.match(new RegExp('(' + NUM + ')\\s*个半(?:小时|钟头)')))) return { min: (cn(m[1]) + 0.5) * 60, str: m[0] };
    if ((m = s.match(new RegExp('(' + NUM + ')\\s*个?(?:小时|钟头)')))) return { min: cn(m[1]) * 60, str: m[0] };
    if ((m = s.match(/半个?(?:小时|钟头)/))) return { min: 30, str: m[0] };
    if ((m = s.match(new RegExp('(' + NUM + ')\\s*分钟')))) return { min: cn(m[1]), str: m[0] };
    if ((m = s.match(/一刻钟/))) return { min: 15, str: m[0] };
    return null;
  }

  /* ---------- 语义规则 ---------- */
  const DOMAIN_KW = [
    ['health', /医院|体检|跑步|健身|运动|游泳|瑜伽|复诊|吃药|疫苗|看病|牙|拉伸|散步|睡眠|门诊/],
    ['relation', /家长|爸|妈|父母|家人|生日|聚餐|约会|朋友|孩子|带娃|老婆|老公|女朋友|男朋友|同学|纪念日|送礼|礼物|探望|吃饭/],
    ['study', /学习|课|复习|读书|看书|论文|考试|背单词|刷题|练习|网课|备考|听讲座|讲座|英语/],
    ['finance', /还款|信用卡|报销|账单|缴费|交费|保险|理财|对账|发票|税|转账|房租|续费/],
    ['home', /打扫|洗衣|换床单|家务|滤芯|买菜|做饭|收拾|整理房间|快递|维修|垃圾|物业|拖地|买|超市|水果/],
    ['work', /会|方案|汇报|报告|客户|总|邮件|项目|周报|评审|PPT|需求|合同|复盘|面试|工作|开发|代码|上线|碰头|过方案/],
  ];
  const DEEP = /写|设计|方案|策划|论文|分析|决策|思考|代码|开发|研究|复盘|规划|报告|编程|备课/;
  const LOW = /报销|整理|填表|缴费|交费|还款|信用卡|快递|打扫|洗|买|订|转账|发票|对账|归档|打印|取|寄|拖地|倒垃圾|续费/;
  const MEET = /会|碰头|见面|见|约|面试|看诊|门诊|聚餐|吃饭|接|送|课|讲座|航班|飞|演出|电影|体检|疫苗|探望|聊|过方案|沟通|汇报/;
  const PAYDL = /还款|还信用卡|信用卡|缴费|交费|续费|账单|到期|截止|房租/;

  function domainOf(t) {
    let best = null, bs = 0;
    DOMAIN_KW.forEach(([k, re]) => { const n = (t.match(new RegExp(re.source, 'g')) || []).length; if (n > bs) { bs = n; best = k; } });
    return best || 'work';
  }
  function energyOf(t) { return LOW.test(t) ? 'low' : DEEP.test(t) ? 'deep' : 'mid'; }
  function ctxOf(t) {
    if (/电话|打给|致电|联系/.test(t)) return 'phone';
    if (/医院|体检|疫苗|超市|银行|买|取|寄|外出|去|接|送/.test(t)) return 'out';
    if (/打扫|洗衣|做饭|家务|换床单|拖地/.test(t)) return 'home';
    if (/写|代码|邮件|方案|报告|报销|PPT|论文|设计|填表|在线/.test(t)) return 'pc';
    return '';
  }
  const PRIORS = [
    [/打电话|电话/, 15], [/邮件|回复/, 20], [/报销|整理|填表|发票/, 30], [/体检/, 120], [/疫苗/, 120],
    [/看病|门诊|复诊/, 120], [/聚餐|吃饭/, 120], [/健身|运动|跑步|游泳|瑜伽/, 60], [/周报/, 60],
    [/方案|报告|论文|设计/, 180], [/会|碰头|沟通|聊|汇报|评审/, 60], [/复习/, 45], [/读书|看书|学习/, 45],
    [/打扫|洗衣|换床单/, 45], [/买菜/, 45],
  ];
  function priorMin(t, energy) {
    for (const [re, m] of PRIORS) if (re.test(t)) return m;
    return energy === 'deep' ? 90 : energy === 'low' ? 30 : 45;
  }
  const keyOf = (domain, energy) => domain + '/' + energy;

  /* 估时:历史数据优先,其次通用先验;用户自己说的时长按个人偏差修正 */
  function estimate(st, domain, energy, stated, isEvent, title) {
    if (isEvent && stated) return { min: stated, conf: 0.95, src: 'stated' };
    if (stated) {
      const r = st.stats.ratio[domain];
      let mult = (st.settings.estMult || {})[domain] || 1;
      if (r && r.n >= 3) mult = Math.max(mult, Math.min(2.5, Math.max(0.8, r.sum / r.n)));
      if (mult > 1.08 && !isEvent) return { min: Math.ceil(stated * mult / 5) * 5, conf: 0.8, src: 'learned', stated };
      return { min: stated, conf: 0.9, src: 'stated' };
    }
    const d = st.stats.dur[keyOf(domain, energy)];
    if (d && d.n >= 2) return { min: Math.round(d.sum / d.n / 5) * 5, conf: 0.7, src: 'history' };
    return { min: priorMin(title, energy), conf: 0.4, src: 'prior' };
  }

  function cleanTitle(s) {
    s = s.replace(/[，,。；;！!？?、\s]+/g, ' ').trim();
    for (let i = 0; i < 4; i++) {
      s = s.replace(/^(还有|另外|然后|再就是|最后|以及|并且|而且|记得|别忘了|务必|一定要|一定|必须|麻烦|帮我|我要|我得|需要|尽快|紧急|马上|立刻|要|得|把|将|在|于|就|再|也|先|的|和我|给我)\s*/, '');
      s = s.replace(/^[的在于要得]+(?=\S)/, '');
    }
    return s.replace(/(一下|吧|啊|呀)$/, '').trim();
  }

  /* ---------- 习惯 / 周期 ---------- */
  function parseHabit(seg, st, now) {
    let m, days = null, perWeek = 0;
    let text = seg; let monthDay = 0, every = 0, text2 = null;
    if ((m = text.match(new RegExp('每隔?\\s*(' + NUM + ')\\s*天'))) && cn(m[1]) >= 2) every = cn(m[1]);
    else if ((m = text.match(new RegExp('每个?月(?:的)?\\s*(' + NUM + ')\\s*[号日]'))) && cn(m[1]) >= 1 && cn(m[1]) <= 31) monthDay = cn(m[1]);
    else if (/每个?月(?:底|末)/.test(text)) monthDay = 31;
    if (every || monthDay) days = [];
    else if (/每(?:个)?工作日|工作日每天/.test(text)) days = [0, 1, 2, 3, 4];
    else if (/每[天日]/.test(text)) days = [0, 1, 2, 3, 4, 5, 6];
    else if ((m = text.match(new RegExp('每周\\s*(' + NUM + ')\\s*次')))) perWeek = cn(m[1]);
    else if ((m = text.match(/每周(?:的)?([一二三四五六日天](?:[、,和及]?[一二三四五六日天])*)/))) {
      days = [...m[1].replace(/[、,和及]/g, '')].map((c) => WDI[c]);
    } else if (/每(?:一)?(?:个)?(?:周|星期|礼拜)|(?:一|每)周(?:都)?要|每周都/.test(text)) { perWeek = 1; const mm = text.match(new RegExp('(' + NUM + ')\\s*次')); if (mm && cn(mm[1]) >= 1 && cn(mm[1]) <= 7) { perWeek = cn(mm[1]); text2 = text.replace(mm[0], ' '); } }     // 「每周都要写周报」:不限星期,由系统逐周自动安排
    else return null;
    if (every || monthDay) days = null;
    if (text2) text = text2;
    const per = periodOf(text), clk = parseClock(text.replace(/每周[一二三四五六日天、,和及]+/g, ''), per);
    const dur = parseDur(text);
    let t = text;
    [new RegExp('每隔?\\s*(?:' + NUM + ')\\s*天'), new RegExp('每个?月(?:的)?\\s*(?:' + NUM + ')\\s*[号日]'), /每个?月(?:底|末)/, /每(?:个)?工作日|工作日每天/, /每[天日]/, new RegExp('每周\\s*(?:' + NUM + ')\\s*次'), /每周(?:的)?[一二三四五六日天](?:[、,和及]?[一二三四五六日天])*/, /每(?:一)?(?:个)?(?:周|星期|礼拜)(?:都)?(?:要|得|需要)?/, PERIOD]
      .forEach((re) => { t = t.replace(re, ' '); });
    if (clk) t = t.replace(clk.str, ' ');
    if (dur) t = t.replace(dur.str, ' ');
    const title = cleanTitle(t) || '例行事项';
    const domain = domainOf(title), energy = energyOf(title);
    const meet = /会$|例会|周会|晨会/.test(title);
    const pref = per === 'am0' || per === 'am' ? 'morning' : per === 'noon' ? 'noon' : per === 'eve' || per === 'pm' ? 'evening' : 'any';
    return {
      id: null, title, domain, energy, days, perWeek, time: clk ? clk.min : null, dur: dur ? dur.min : (meet ? 60 : priorMin(title, energy) > 60 ? 60 : priorMin(title, energy)),
      pref, kind: meet && clk ? 'commit' : 'habit', skipLeft: 1, raw: seg, monthDay, every,
    };
  }

  /* ---------- 主入口 ---------- */
  /* 自定义时长:「50」(按分钟)「90分钟」「1.5小时」「1小时20分」「1:30」「一个半小时」「2h」 */
  C.parseDurText = (s) => {
    s = String(s == null ? '' : s).trim().toLowerCase().replace(/：/g, ':').replace(/\s+/g, '');
    if (!s) return null;
    let m, total = 0;
    if ((m = s.match(/^(\d+):(\d{1,2})$/))) total = +m[1] * 60 + +m[2];
    else if (/^\d+(\.\d+)?$/.test(s)) total = +s;
    else {
      const H = s.match(new RegExp('(' + NUM + ')(个半)?(?:个)?(?:小时|钟头|hrs|hr|h)')), Mi = s.match(new RegExp('(' + NUM + ')(?:分钟|分|min|m)(?![a-z])'));
      if (/^半(?:个)?(?:小时|钟头)$/.test(s)) total = 30;
      else if (!H && !Mi) return null;
      else { if (H) total += cn(H[1]) * 60 + (H[2] ? 30 : 0); if (Mi) total += cn(Mi[1]); if (isNaN(total)) return null; }
    }
    total = Math.round(total);
    return total >= 1 && total <= 1440 ? total : null;
  };

  C.habitLabel = (h) => (h.monthDay ? (h.monthDay >= 31 ? '每月底' : '每月 ' + h.monthDay + ' 号') : h.every ? '每 ' + h.every + ' 天' : h.days ? (h.days.length === 7 ? '每天' : h.days.length === 5 && h.days[4] === 4 ? '工作日' : '每周' + h.days.map((d) => C.WD[d].slice(1)).join('、')) : '每周 ' + h.perWeek + ' 次') + (h.time != null ? ' ' + C.fmtM(h.time) : '');

  /* 休假 / 出差 / 请假:「下周三到周五出差」「明天请假」 */
  function parseAway(seg, now) {
    let m = seg.match(/^(.*?)(?:从)?([^到至]+?)(?:到|至)([^出请休旅放培]+?)(?:去|的)?(出差|请假|休假|旅游|旅行|出游|放假|培训)/);
    if (m) {
      const a = parseDate(m[2], now), b = parseDate(m[3], now);
      if (a && b) { let to = b.ts; if (to < a.ts) to = addDays(to, 7); return { from: a.ts, to, label: m[4] }; }
    }
    m = seg.match(/^(.*?)(今天|明天|后天|周[一二三四五六日天]|下周[一二三四五六日天]|\d+月\d+[日号])(?:一天|全天)?(请假|休假|出差|放假)/);
    if (m) { const a = parseDate(m[2], now); if (a) return { from: a.ts, to: a.ts, label: m[3] }; }
    return null;
  }

  function parse(text, st, now) {
    now = now || Date.now();
    const segs = String(text).split(/[，,。；;！!\n]+/).map((x) => x.trim()).filter(Boolean);
    const drafts = [], habits = [], aways = []; let lastKind = '';
    segs.forEach((seg0) => {
      let seg = seg0.replace(/^(还有|另外|然后|再就是|最后|以及)/, '').replace(/^每次\s*/, '');
      const aw = parseAway(seg, now);
      if (aw) { aways.push(aw); return; }
      const h = parseHabit(seg, st, now);
      if (h) { habits.push(h); lastKind = 'habit'; return; }

      const period = periodOf(seg);
      const asap = /尽快|越快越好|马上|立刻/.test(seg);
      let urgent = /紧急|务必|必须|一定要|一定|重要|关键/.test(seg);
      const low = /有空|有时间再|不急|随便|以后再说/.test(seg);
      const lead = parseLead(seg); if (lead) seg = seg.replace(lead.str, ' ');
      const wantPrep = !!(lead && /准备/.test(lead.str));
      const travelM = seg.match(new RegExp('(?:路上|车程|通勤|路程)\\s*(' + NUM + ')\\s*(分钟|小时|个小时)'));
      let travel = 0; if (travelM) { const n = cn(travelM[1]); travel = travelM[2] === '分钟' ? n : n * 60; seg = seg.replace(travelM[0], ' '); }
      const afterM = seg.match(/(?:等|待|做完|完成)(.{1,12}?)(?:之后|以后|后)再/); // 「等方案做完之后再…」→ 依赖线索,交给编辑面板确认
      void afterM;
      const dur = parseDur(seg); if (dur) seg = seg.replace(dur.str, ' ');
      let date = parseDate(seg, now); if (date) seg = seg.replace(date.str, ' ');
      const before = /(之前|以前|以内|之内|前)/.test(seg) && !!date;
      if (before) seg = seg.replace(/(之前|以前|以内|之内|前)/, ' ');
      const clk = parseClock(seg, period); if (clk) seg = seg.replace(clk.str, ' ');
      if (period) seg = seg.replace(PERIOD, ' ');
      seg = seg.replace(/下个月|这个月|本月/, ' ');
      const title = cleanTitle(seg);

      // 纯修饰片段(只有时长/提前量等)并入上一条
      const prev = drafts[drafts.length - 1];
      if (lastKind === 'habit' && title.length < 2 && dur) { habits[habits.length - 1].dur = dur.min; return; }
      if (prev && /^(很|比较)?(紧急|重要|务必|不急|有空再说|尽快)$/.test(title)) {
        prev.priority = /不急|有空/.test(title) ? 3 : 1; return;
      }
      if ((title.length < 2 || /^提前/.test(seg0)) && prev) {
        if (dur && !prev.statedMin) {
          const est = estimate(st, prev.domain, prev.energy, dur.min, prev.type === 'event', prev.title);
          prev.statedMin = dur.min; prev.estMin = est.min; prev.conf = est.conf; prev.src = est.src; prev.learnedFrom = est.stated || 0;
          if (prev.type === 'event') prev.end = prev.start + prev.estMin * MIN;
          if (prev.type === 'task') { prev.splittable = prev.energy === 'deep' || prev.estMin >= 120; prev.askDue = false; if (!prev.due && !prev.asap) prev.askDue = prev.estMin >= 60; }
        }
        if (lead) prev.lead = lead.min;
        if (prev.type === 'event') { if (wantPrep) prev.prep = Math.min(120, lead.min); if (travel) prev.travel = travel; }
        if (date && !prev.date) { prev.date = date; }
        if (clk && prev.type === 'event' && !prev.hasClock) { prev.hasClock = true; prev.start = C.atMinute(prev.start, clk.min); prev.end = prev.start + prev.estMin * MIN; }
        return;
      }
      if (title.length < 1) return;

      const domain = domainOf(title), energy = energyOf(title);
      const d = {
        id: null, raw: seg0, title, short: title.length > 12 ? title.slice(0, 12) : title,
        domain, energy, ctx: ctxOf(title), priority: urgent ? 1 : low ? 3 : 2,
        status: 'planned', flex: 'move', lead: lead ? lead.min : 0, date,
        postponed: 0, actual: 0, createdAt: now, source: 'text',
      };
      if (/看展|逛街|有空/.test(title)) d.flex = 'drop';

      // 类型判定
      const isDeadline = PAYDL.test(title) && !before && !dur && !clk;
      if (isDeadline) {
        d.type = 'deadline'; d.estMin = 0; d.conf = 0.9; d.src = 'stated';
        d.due = date ? C.dayEnd(date.ts) : addDays(dayStart(now), 7) - 1;
        if (!d.lead) d.lead = domain === 'finance' ? 2 * 1440 : 1440;
        d.status = 'planned';
      } else if (clk && !before) {
        d.type = 'event'; d.flex = 'fixed'; d.hasClock = true;
        const est = estimate(st, domain, energy, dur ? dur.min : 0, true, title);
        d.statedMin = dur ? dur.min : 0; d.estMin = est.min || (/聚餐|吃饭|疫苗|体检|看病/.test(title) ? 120 : 60); d.conf = est.conf; d.src = est.src;
        const base = date ? date.ts : (clk.min <= (now - dayStart(now)) / MIN ? addDays(dayStart(now), 1) : dayStart(now));
        d.start = C.atMinute(base, clk.min); d.end = d.start + d.estMin * MIN;
        d.date = d.date || { ts: base };
        if (wantPrep) d.prep = Math.min(120, lead.min);
        if (travel) d.travel = travel;
      } else {
        d.type = 'task';
        const est = estimate(st, domain, energy, dur ? dur.min : 0, false, title);
        d.statedMin = dur ? dur.min : 0; d.estMin = est.min; d.conf = est.conf; d.src = est.src; d.learnedFrom = est.stated || 0;
        d.splittable = energy === 'deep' || est.min >= 120;
        if (/体检|疫苗|看病|门诊|复诊/.test(title)) d.splittable = false;
        d.minChunk = 60;
        if (date) {
          if (before) { d.due = C.dayEnd(date.ts); }
          else if (date.range) { d.notBefore = date.range[0]; d.due = C.dayEnd(date.range[1]); }
          else { d.notBefore = date.ts; d.due = C.dayEnd(date.ts); }
          if (date.soft && !date.range && before === false) { delete d.notBefore; }
        } else if (asap) { d.asap = true; }
        if (period && !clk) d.win = PWIN[period];
        if (!date && !asap && d.estMin >= 60) d.askDue = true;
      }
      if (title.length < 2 && d.type !== 'event') { d.status = 'inbox'; d.unclear = true; }
      if (/找个时间|有空聊聊|看看吧|考虑一下/.test(seg0)) { d.status = 'inbox'; d.unclear = true; }
      drafts.push(d); lastKind = 'item';
    });
    drafts.forEach((d) => { delete d.date; });
    return { items: drafts, habits, aways };
  }

  /* 回执卡的一句话 */
  function receiptLine(d, now) {
    const D = C.DOMAINS[d.domain].name, P = 'P' + d.priority;
    const en = { deep: '深度', mid: '中等', low: '机械' }[d.energy];
    const parts = [];
    if (d.type === 'event') parts.push(C.dayLabel(d.start, now) + ' ' + C.fmtT(d.start) + '–' + C.fmtT(d.end));
    else if (d.type === 'deadline') parts.push(C.dayLabel(d.due, now) + '到期');
    else {
      parts.push(d.due ? C.dayLabel(d.due, now) + '前' : (d.asap ? '尽快' : '本周内'));
      parts.push(C.fmtDur(d.estMin));
    }
    if (d.loc) parts.push(d.loc);
    return { parts, tags: [D + (d.type === 'deadline' ? '' : ' · ' + en), P], lead: d.lead };
  }

  /* ---------- 课表文字解析(不依赖大模型) ----------
     「高数 周一 8:00-9:40 周三 10:00-11:40 教二301 1-16周」
     「每周一三 下午2点到3点40 大学物理实验 实验楼B2 单周」
     一门课每周有多个不同时间 → 每个时间一个 slot;相同时间的多个星期合并成 days。 */
  C.parseWeeksText = (s) => {
    s = String(s || ''); let parity = 'all';
    if (/单周|[\(（]\s*单\s*[\)）]/.test(s) && !/双周/.test(s)) parity = 'odd';
    else if (/双周|[\(（]\s*双\s*[\)）]/.test(s) && !/单周/.test(s)) parity = 'even';
    const m = s.match(/(?:第)?\s*(\d+(?:\s*[-~—–到至]\s*\d+)?(?:\s*[,，、]\s*\d+(?:\s*[-~—–到至]\s*\d+)?)*)\s*周/);
    return { weeks: m ? C.parseWeeks(m[1].replace(/[—–到至]/g, '-')) : [], parity, text: m ? m[0] : '' };
  };
  const WDC = '一二三四五六日天', WDX = { 一: 0, 二: 1, 三: 2, 四: 3, 五: 4, 六: 5, 日: 6, 天: 6 };
  const TT = '(\\d{1,2})(?:[:：点时]\\s*(\\d{1,2})?)?', PP = '(上午|下午|晚上|早上|中午)?';
  const SLOT_RE = () => new RegExp('((?:周|星期|礼拜)[' + WDC + '](?:[、,，和及与/]?(?:周|星期|礼拜)?[' + WDC + '])*)\\s*' + PP + '\\s*' + TT + '\\s*[-~—–到至]\\s*' + PP + '\\s*' + TT, 'g');
  const toMin = (h, m, per) => { h = +h; m = m ? +m : 0; if ((per === '下午' || per === '晚上') && h < 12) h += 12; else if (per === '中午' && h < 11) h += 12; else if (!per && h >= 1 && h <= 6) h += 12; return h * 60 + m; };
  const LOC_RE = /[A-Za-z]?[^\s,，;；周第@在]{0,6}?(?:教学楼|实验楼|实验室|机房|教[一二三四五六七八九十]*\d+|[楼馆厅室])[A-Za-z0-9\-]*\d*/;
  C.parseRoutineText = (text) => {
    const out = [];
    String(text || '').split(/[\n;；]+/).map((x) => x.trim()).filter(Boolean).forEach((entry) => {
      const slots = []; let rest = entry;
      entry.replace(SLOT_RE(), (all, dstr, p1, h1, m1, p2, h2, m2) => {
        const days = [...new Set([...dstr].filter((c) => WDC.includes(c)).map((c) => WDX[c]))].sort();
        const a = toMin(h1, m1, p1); let b = toMin(h2, m2, p2 || p1); if (b <= a && b < 12 * 60) b += 12 * 60;
        if (days.length && b > a && b - a <= 8 * 60) slots.push({ days, start: a, end: b });
        rest = rest.replace(all, ' '); return all;
      });
      if (!slots.length) return;
      const wk = C.parseWeeksText(rest); if (wk.text) rest = rest.replace(wk.text, ' ');
      rest = rest.replace(/单周|双周|[\(（][单双][\)）]/g, ' ');
      const lm = rest.match(LOC_RE); let loc = ''; if (lm && lm[0].length <= 14) { loc = lm[0].trim(); rest = rest.replace(lm[0], ' '); }
      const title = rest.replace(/每个?(?:周|星期)|每逢|上课|课程表|课表|固定|重复|周期|学期|(^|\s)每(?=\s|$)|[@在的有上去,，、。:：]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24);
      out.push({ title, slots, loc, weeks: wk.weeks, parity: wk.parity });
    });
    return out.filter((c) => c.title);
  };
  C.ROUTINE_HINT = /每个?(?:周|星期)|每逢|上课|课表|课程表|固定|周期|重复|学期|节课/;

  Object.assign(C, { parse, receiptLine, estimate, keyOf, cn, domainOf, energyOf, ctxOf });
  if (typeof module !== 'undefined') module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
