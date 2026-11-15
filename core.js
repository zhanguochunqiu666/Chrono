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
  const dayStart = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const addDays = (ts, n) => { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); };
  const weekStart = (ts) => { const d = new Date(dayStart(ts)); const w = (d.getDay() + 6) % 7; return addDays(d.getTime(), -w); };
  const dow = (ts) => (new Date(ts).getDay() + 6) % 7;   // 周一=0
  const WD = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const p2 = (n) => (n < 10 ? '0' : '') + n;
  const fmtT = (ts) => { const d = new Date(ts); return p2(d.getHours()) + ':' + p2(d.getMinutes()); };
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
    const diff = Math.round((dayStart(ts) - dayStart(now)) / DAY);
    if (diff === 0) return '今天'; if (diff === 1) return '明天'; if (diff === 2) return '后天'; if (diff === -1) return '昨天';
    const d = new Date(ts); return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WD[dow(ts)];
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
    mem = st;
    try { G.localStorage && G.localStorage.setItem(KEY, JSON.stringify(st)); saveFailed = false; }
    catch (e) { if (!saveFailed) { saveFailed = true; if (G.A && G.A.toast) G.A.toast('保存失败:浏览器存储空间不足或被禁用。请在设置里导出 JSON 备份,并清理旧数据。', { ms: 9000 }); } }
  }
  function wipe() { mem = null; try { G.localStorage && G.localStorage.removeItem(KEY); } catch (e) { /* */ } }

  /* ---------- 查询 ---------- */
  const itemOf = (st, id) => st.items.find((i) => i.id === id);
  const blocksOn = (st, d) => st.blocks.filter((b) => b.start >= d && b.start < d + DAY).sort((a, b) => a.start - b.start);
  const blockMin = (b) => (b.end - b.start) / MIN;

  /* 周内各领域的投入(完成+已排,不含已漏做/跳过) */
  function domainWeek(st, ws) {
    const out = {}; DOMAIN_KEYS.forEach((k) => (out[k] = { done: 0, plan: 0 }));
    st.blocks.forEach((b) => {
      if (b.start < ws || b.start >= ws + 7 * DAY || b.missed || b.skipped || b.kind === 'free') return;
      const o = out[b.domain]; if (!o) return;
      const m = blockMin(b);
      if (b.done) o.done += (b.actual || m); else o.plan += m;
    });
    return out;
  }

  G.Chrono = Object.assign(G.Chrono || {}, {
    MIN, DAY, DOMAINS, DOMAIN_KEYS, WD, fresh, load, save, wipe, DEFAULT_SETTINGS,
    dayStart, addDays, weekStart, dow, fmtT, fmtM, fmtDur, fmtH, sameDay, dayLabel, ceil15, uid, p2,
    itemOf, blocksOn, blockMin, domainWeek,
  });
  if (typeof module !== 'undefined') module.exports = G.Chrono;
})(typeof window !== 'undefined' ? window : globalThis);
