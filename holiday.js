/* 时序 Chrono · 法定节假日(中国大陆)
   数据:内置 2026、2027 年国务院办公厅放假安排(含调休补班);其他年份联网自动补充并缓存。
   - 2026:国办发明电〔2025〕 通知,2025-11 发布
   - 2027:国办发明电〔2026〕10 号,2026-11-05 发布
   联网来源:holiday-cn 开源数据(整理自国务院通知),raw.githubusercontent.com 与 jsDelivr 双源回退;失败时静默使用内置数据。 */
(function (G) {
  'use strict';
  const C = G.Chrono || (G.Chrono = {});
  const DAY = 86400000, KEY = 'chrono.holidays';

  // [名称, [[放假起,止]...], [调休上班日...]]   (MM-DD)
  const BUILTIN = {
    2026: [
      ['元旦', [['01-01', '01-03']], ['01-04']],
      ['春节', [['02-15', '02-23']], ['02-14', '02-28']],
      ['清明节', [['04-04', '04-06']], []],
      ['劳动节', [['05-01', '05-05']], ['05-09']],
      ['端午节', [['06-19', '06-21']], []],
      ['中秋节', [['09-25', '09-27']], []],
      ['国庆节', [['10-01', '10-07']], ['09-20', '10-10']],
    ],
    2027: [
      ['元旦', [['01-01', '01-03']], []],
      ['春节', [['02-05', '02-13']], ['01-31', '02-14']],
      ['清明节', [['04-03', '04-05']], []],
      ['劳动节', [['05-01', '05-05']], ['05-08']],
      ['端午节', [['06-09', '06-09']], []],
      ['中秋节', [['09-15', '09-15']], []],
      ['国庆节', [['10-01', '10-07']], ['09-26', '10-09']],
    ],
  };

  const pad = (n) => (n < 10 ? '0' : '') + n;
  const ymd = (ts) => { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const dow = (ts) => (new Date(ts).getDay() + 6) % 7;
  const day0 = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

  let table = {};                 // 'YYYY-MM-DD' -> {name, off, src}
  let cache = {};                 // 年份 -> {ts, days:[[date,name,off]]}
  try { cache = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { cache = {}; }

  function fromBuiltin(y) {
    const out = [];
    (BUILTIN[y] || []).forEach(([name, ranges, works]) => {
      ranges.forEach(([a, b]) => { for (let t = new Date(y + '-' + a + 'T00:00:00').getTime(), e = new Date(y + '-' + b + 'T00:00:00').getTime(); t <= e; t += DAY) out.push([ymd(t), name, 1]); });
      works.forEach((w) => out.push([y + '-' + w, name, 0]));
    });
    return out;
  }
  function rebuild() {
    table = {};
    const years = new Set(Object.keys(BUILTIN).map(Number).concat(Object.keys(cache).map(Number)));
    years.forEach((y) => {
      const online = cache[y] && cache[y].days && cache[y].days.length ? cache[y].days : null;
      (online || fromBuiltin(y)).forEach(([d, name, off]) => { table[d] = { name, off: !!off, src: online ? 'online' : 'builtin' }; });
    });
  }
  rebuild();

  /* 没有官方数据的年份:只估计三个固定日期的节日,并标注「预估」 */
  function estimate(ts) {
    const d = new Date(ts), m = d.getMonth() + 1, dd = d.getDate();
    if (m === 1 && dd === 1) return { name: '元旦', off: true, est: true };
    if (m === 5 && dd === 1) return { name: '劳动节', off: true, est: true };
    if (m === 10 && dd >= 1 && dd <= 3) return { name: '国庆节', off: true, est: true };
    return null;
  }
  const hasYear = (y) => Object.keys(table).some((k) => k.startsWith(y + '-'));

  /* kind: holiday 法定放假 | makeup 调休上班 | weekend 普通周末 | work 普通工作日 */
  function info(ts) {
    const k = ymd(ts), e = table[k] || (hasYear(new Date(ts).getFullYear()) ? null : estimate(ts));
    if (e) return { kind: e.off ? 'holiday' : 'makeup', name: e.name, est: !!e.est };
    return { kind: dow(ts) >= 5 ? 'weekend' : 'work', name: '' };
  }
  const isRest = (ts) => { const k = info(ts).kind; return k === 'holiday' || k === 'weekend'; };

  /* 界面标签 */
  function tag(ts) {
    const i = info(ts);
    if (i.kind === 'holiday') return { text: '休', name: i.name, long: i.name + (i.est ? '(预估)' : '') + '放假', cls: 'off' };
    if (i.kind === 'makeup') return { text: '班', name: i.name, long: i.name + '调休上班', cls: 'work' };
    return null;
  }

  /* 未来 n 天内的假期,合并成连续段,供大模型上下文与提示使用 */
  function upcoming(ts, n) {
    const out = []; let cur = null;
    for (let i = 0; i < n; i++) {
      const t = day0(ts) + i * DAY, inf = info(t);
      if (inf.kind === 'holiday' || inf.kind === 'makeup') {
        if (cur && cur.name === inf.name && cur.kind === inf.kind && t - cur.end <= DAY) cur.end = t; else { cur = { name: inf.name, kind: inf.kind, start: t, end: t }; out.push(cur); }
      }
    }
    return out;
  }

  /* 联网更新(7 天一次);失败不影响使用 */
  async function fetchYear(y) {
    const urls = ['https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/' + y + '.json', 'https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/' + y + '.json'];
    for (const u of urls) {
      try {
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 7000);
        const r = await fetch(u, { signal: ctl.signal }); clearTimeout(to);
        if (!r.ok) continue; const j = await r.json();
        const days = (j.days || []).filter((x) => x && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && x.date.startsWith(y + '-')).map((x) => [x.date, x.name, x.isOffDay ? 1 : 0]);
        if (days.length) return days;
      } catch (e) { /* 换下一个源 */ }
    }
    return null;
  }
  async function refresh(force) {
    if (!G.fetch || (typeof navigator !== 'undefined' && navigator.onLine === false)) return false;
    const y = new Date().getFullYear(); let changed = false;
    for (const yr of [y, y + 1]) {
      const c = cache[yr]; if (!force && c && Date.now() - c.ts < 7 * DAY) continue;
      const days = await fetchYear(yr);
      if (days) { const same = c && JSON.stringify(c.days) === JSON.stringify(days); cache[yr] = { ts: Date.now(), days }; if (!same) changed = true; }
      else if (!BUILTIN[yr] && !c) { /* 暂无数据:下次再试 */ }
    }
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* */ }
    if (changed) { rebuild(); if (G.A && G.A.st) { try { G.A.render(); } catch (e) { /* */ } } }
    return changed;
  }

  C.Holiday = { info, isRest, tag, upcoming, refresh, ymd, _rebuild: rebuild, _table: () => table, BUILTIN };
  if (typeof document !== 'undefined') setTimeout(() => { refresh(false); }, 4000);
  if (typeof module !== 'undefined') module.exports = C.Holiday;
})(typeof window !== 'undefined' ? window : globalThis);
