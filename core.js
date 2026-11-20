/* 时序 Chrono · 核心:常量、时间工具、数据层(本地优先) */
(function (G) {
  'use strict';
  const MIN = 60000, DAY = 86400000;

  const DOMAINS = {
    work:     { name: '工作', color: '#3E5C9A' },
    health:   { name: '健康', color: '#3F8F6B' },
    relation: { name: '关系', color: '#C2576F' },
    study:    { name: '学习', color: '#7B5EA7' },
    finance:  { name: '财务', color: '#B8862F' },
    home:     { name: '家务', color: '#3E8E91' },
  };
  const DOMAIN_KEYS = Object.keys(DOMAINS);

  const DEFAULT_SETTINGS = () => ({
    timeZone: 'system',                       // 显示与新事项使用的时区
    dayStart: 8 * 60, dayEnd: 22 * 60,        // 可用时段(分钟)
    wknd: { on: false, start: 9 * 60, end: 22 * 60 },          // 周末使用不同的可用时段
    commute: { on: false, am: 30, pm: 30, pmAt: 18 * 60 },     // 工作日通勤(硬约束)
    maxChunk: 90,
    term: null,                                                // 学期 {start: 第1周周一的时间戳, weeks: 总周数};课表的周次/单双周依赖它
    ltRemind: { on: true, time: 9 * 60, evening: false },      // 长期事项的持续提醒
    holidayAvoid: true,                                        // 法定节假日不排工作类事项
    off: [],                                                   // 休假 / 出差等不可用日 [{from,to,label}]
    glass: 0.5,                                                // 液态玻璃:0 通透 … 1 磨砂
    lunch: [12 * 60, 13 * 60], lunchOn: true,
    peak: [9 * 60, 12 * 60],                  // 高精力时段
    buffer: 15, endBuffer: 30,
    freeRatio: 0.25,                          // 默认留白,不可为 0
    aiOn: true,                               // 关闭后退化成普通日历
    notify: true,
    estMult: {},                              // 洞察"一键应用"写入的估时修正
    zones: [],                                // 深度工作保护区 [{dow,start,end}]
    quotas: {                                 // 周预算/下限/上限(分钟)
      work:     { b: 2400, lo: 0,   hi: 3000 },
      health:   { b: 300,  lo: 180, hi: 600 },
      relation: { b: 600,  lo: 300, hi: 900 },
      study:    { b: 240,  lo: 120, hi: 480 },
      finance:  { b: 60,   lo: 0,   hi: 180 },
      home:     { b: 180,  lo: 60,  hi: 420 },
    },
  });

  const fresh = () => ({
    v: 1, settings: DEFAULT_SETTINGS(),
    items: [], blocks: [], habits: [], longterm: [],
    stats: { ratio: {}, dur: {}, energyDone: {}, energyAll: {} },
    log: [],            // {t, kind, ...} 回写与重排记录
    meta: { lastOpenDay: 0, onboarded: false, seq: 1 },
  });

  /* ---------- 时间工具 ---------- */
  let zoneOverride = null;
  const formatters = new Map(), partCache = new Map(), validZones = new Map();
  let deviceZone = null, zoneCheckedAt = 0;
  const systemTimeZone = () => { if (!deviceZone || Date.now() - zoneCheckedAt > 60000) { deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; zoneCheckedAt = Date.now(); } return deviceZone; };
  function validTimeZone(zone) { if (!validZones.has(zone)) { try { new Intl.DateTimeFormat('en', { timeZone: zone }); validZones.set(zone, true); } catch (_) { validZones.set(zone, false); } } return validZones.get(zone); }
  const resolveTimeZone = (zone) => !zone || zone === 'system' || !validTimeZone(zone) ? systemTimeZone() : zone;
  const selectedTimeZone = () => resolveTimeZone(G.A && G.A.st && G.A.st.settings.timeZone);
  const timeZone = () => zoneOverride || selectedTimeZone();
  function withTimeZone(zone, fn) { const previous = zoneOverride; zoneOverride = resolveTimeZone(zone); try { return fn(); } finally { zoneOverride = previous; } }
  function parts(ts, zone = timeZone()) {
    const key = zone + ':' + Math.floor(ts / 1000); if (partCache.has(key)) return partCache.get(key);
    if (!formatters.has(zone)) formatters.set(zone, new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }));
    const p = {}; formatters.get(zone).formatToParts(new Date(ts)).forEach((v) => { if (v.type !== 'literal') p[v.type] = +v.value; });
    if (partCache.size > 12000) partCache.clear(); partCache.set(key, p); return p;
  }
  const wallStamp = (p) => Date.UTC(p.year, p.month - 1, p.day, p.hour || 0, p.minute || 0, p.second || 0);
  function fromParts(y, mo, d, h = 0, mi = 0, sec = 0, ms = 0, zone = timeZone()) {
    const wall = Date.UTC(y, mo, d, h, mi, sec, ms);
    // 两侧的偏移覆盖夏令时切换。重复时刻取第一次;不存在的时刻向后顺延。
    const offsets = [...new Set([-36, 0, 36].map((n) => { const t = wall + n * 3600000; return wallStamp(parts(t, zone)) - Math.floor(t / 1000) * 1000; }))];
    const choices = offsets.map((offset) => wall - offset).sort((a, b) => a - b);
    const exact = choices.find((t) => wallStamp(parts(t, zone)) === Math.floor(wall / 1000) * 1000);
    if (exact != null) return exact;
    return choices.find((t) => wallStamp(parts(t, zone)) >= Math.floor(wall / 1000) * 1000) ?? choices[choices.length - 1];
  }
  // 仅用于读取日历字段,时间戳始终保留真实时刻,不修改原生 Date。
  function date(ts = Date.now(), zone = timeZone()) {
    const p = parts(ts, zone);
    return { getFullYear: () => p.year, getMonth: () => p.month - 1, getDate: () => p.day, getHours: () => p.hour, getMinutes: () => p.minute,
      getDay: () => new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(), getTime: () => ts };
  }
  const makeDate = (...args) => date(fromParts(...args));
  const dayStart = (ts) => { const p = parts(ts); return fromParts(p.year, p.month - 1, p.day); };
  const addDays = (ts, n) => { const p = parts(ts); return fromParts(p.year, p.month - 1, p.day + n, p.hour, p.minute, p.second, ((ts % 1000) + 1000) % 1000); };
  const calendarDiff = (a, b) => Math.round((wallStamp({ ...parts(a), hour: 0, minute: 0, second: 0 }) - wallStamp({ ...parts(b), hour: 0, minute: 0, second: 0 })) / DAY);
  const dow = (ts) => (date(ts).getDay() + 6) % 7;   // 周一=0
  const weekStart = (ts) => addDays(dayStart(ts), -dow(ts));
  const atMinute = (ts, m) => { const p = parts(ts); return fromParts(p.year, p.month - 1, p.day, 0, m); };
  const minuteOfDay = (ts) => { const p = parts(ts); return p.hour * 60 + p.minute + p.second / 60; };
  const dayEnd = (ts) => addDays(dayStart(ts), 1) - 1;
  const dateVal = (ts, zone = timeZone()) => { const p = parts(ts, zone); return p.year + '-' + p2(p.month) + '-' + p2(p.day); };
  function parseDateTime(value, zone = timeZone()) {
    const m = String(value || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate() || +(m[4] || 0) > 23 || +(m[5] || 0) > 59 || +(m[6] || 0) > 59) return null;
    return fromParts(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), 0, resolveTimeZone(zone));
  }
  const compareBlocks = (a, b) => a.start - b.start || a.end - b.end || String(a.id || '').localeCompare(String(b.id || ''));
  // 旧记录的 anchor / hkey 是创建地午夜。优先保留已知时区,避免用接收设备的显示时区重解释它。
  function inferTimeZone(midnight, preferred) {
    const fallback = resolveTimeZone(preferred);
    if (!Number.isFinite(midnight)) return fallback;
    const isMidnight = (zone) => { const p = parts(midnight, zone); return p.hour === 0 && p.minute === 0 && p.second === 0; };
    if (isMidnight(fallback)) return fallback;
    const common = ['UTC', 'Asia/Shanghai', 'Asia/Tokyo', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Yangon', 'Asia/Kabul', 'Asia/Tehran', 'Australia/Darwin', 'Australia/Adelaide', 'Australia/Lord_Howe', 'Pacific/Chatham', 'America/St_Johns', 'Pacific/Marquesas'];
    for (let offset = -12; offset <= 14; offset++) common.push(offset === 0 ? 'UTC' : 'Etc/GMT' + (offset > 0 ? '-' : '+') + Math.abs(offset));
    return common.find((z) => validTimeZone(z) && isMidnight(z)) || fallback;
  }
  function initTimeZones(st) {
    const zone = resolveTimeZone(st.settings.timeZone), old = st.meta.timeZone || zone;
    let changed = 0;
    (st.habits || []).forEach((h) => { if (!h.timeZone || h.timeZone === 'system' || !validTimeZone(h.timeZone)) { h.timeZone = inferTimeZone(h.anchor, old); changed++; } });
    if (st.settings.term && !st.settings.term.timeZone) { st.settings.term.timeZone = inferTimeZone(st.settings.term.start, old); changed++; }
    (st.settings.off || []).forEach((o) => { if (!o.timeZone) { o.timeZone = inferTimeZone(o.from, old); changed++; } });
    st.meta.timeZone = zone;
    return changed;
  }
  function changeTimeZone(st, zone) {
    if (zone !== 'system' && !validTimeZone(zone)) return false;
    initTimeZones(st); st.settings.timeZone = zone; st.meta.timeZone = resolveTimeZone(zone); return true;
  }
  const WD = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const p2 = (n) => (n < 10 ? '0' : '') + n;
  const fmtT = (ts) => { const d = date(ts); return p2(d.getHours()) + ':' + p2(d.getMinutes()); };
  const fmtM = (m) => p2(Math.floor(m / 60)) + ':' + p2(m % 60);
  const fmtDur = (m) => {
    m = Math.round(m);
    if (m < 60) return m + ' 分钟';
    const h = Math.floor(m / 60), r = m % 60;
    return r ? h + ' 小时 ' + r + ' 分' : h + ' 小时';
  };
  const fmtH = (m) => (Math.round(m / 6) / 10).toString().replace(/\.0$/, '') + ' 小时';
  const sameDay = (a, b) => dayStart(a) === dayStart(b);
  const dayLabel = (ts, now) => {
    const diff = calendarDiff(ts, now);
    if (diff === 0) return '今天'; if (diff === 1) return '明天'; if (diff === 2) return '后天'; if (diff === -1) return '昨天';
    const d = date(ts); return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WD[dow(ts)];
  };
  const ceil15 = (ts) => Math.ceil(ts / (15 * MIN)) * (15 * MIN);
  const uid = (st, p) => (p || 'x') + (st.meta.seq++).toString(36) + Math.random().toString(36).slice(2, 5);

  /* ---------- 持久化(localStorage,失败时退回内存) ---------- */
  const KEY = 'chrono.v1';
  let mem = null, saveFailed = false;
  function load() {
    try {
      const raw = G.localStorage && G.localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw), f = fresh();
        s.settings = Object.assign(f.settings, s.settings || {});
        s.settings.wknd = Object.assign(f.settings.wknd, (s.settings || {}).wknd || {});
        s.settings.commute = Object.assign(f.settings.commute, (s.settings || {}).commute || {});
        s.settings.quotas = Object.assign(f.settings.quotas, (s.settings || {}).quotas || {});
        s.stats = Object.assign(f.stats, s.stats || {});
        s.meta = Object.assign(f.meta, s.meta || {});
        return Object.assign(f, s);
      }
    } catch (e) { /* ignore */ }
    return mem || fresh();
  }
  function save(st) {
    st.blocks.sort(compareBlocks);
    mem = st;
    try { G.localStorage && G.localStorage.setItem(KEY, JSON.stringify(st)); saveFailed = false; }
    catch (e) { if (!saveFailed) { saveFailed = true; if (G.A && G.A.toast) G.A.toast('保存失败:浏览器存储空间不足或被禁用。请在设置里导出 JSON 备份,并清理旧数据。', { ms: 9000 }); } }
  }
  function wipe() { mem = null; try { G.localStorage && G.localStorage.removeItem(KEY); } catch (e) { /* */ } }

  /* ---------- 查询 ---------- */
  const itemOf = (st, id) => st.items.find((i) => i.id === id);
  const blocksOn = (st, d) => st.blocks.filter((b) => b.end > d && b.start < addDays(d, 1)).sort(compareBlocks);
  const blockMin = (b) => (b.end - b.start) / MIN;

  /* 周内各领域的投入(完成+已排,不含已漏做/跳过) */
  function domainWeek(st, ws) {
    const out = {}; DOMAIN_KEYS.forEach((k) => (out[k] = { done: 0, plan: 0 }));
    st.blocks.forEach((b) => {
      if (b.start < ws || b.start >= addDays(ws, 7) || b.missed || b.skipped || b.kind === 'free') return;
      const o = out[b.domain]; if (!o) return;
      const m = blockMin(b);
      if (b.done) o.done += (b.actual || m); else o.plan += m;
    });
    return out;
  }

  G.Chrono = Object.assign(G.Chrono || {}, {
    MIN, DAY, DOMAINS, DOMAIN_KEYS, WD, fresh, load, save, wipe, DEFAULT_SETTINGS,
    systemTimeZone, validTimeZone, resolveTimeZone, selectedTimeZone, timeZone, withTimeZone, parts, fromParts, date, makeDate, dateVal, parseDateTime, atMinute, minuteOfDay, dayEnd, calendarDiff, compareBlocks, initTimeZones, changeTimeZone, inferTimeZone,
    dayStart, addDays, weekStart, dow, fmtT, fmtM, fmtDur, fmtH, sameDay, dayLabel, ceil15, uid, p2,
    itemOf, blocksOn, blockMin, domainWeek,
  });
  if (typeof module !== 'undefined') module.exports = G.Chrono;
})(typeof window !== 'undefined' ? window : globalThis);
