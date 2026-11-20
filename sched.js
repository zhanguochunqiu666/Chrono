/* 时序 Chrono · 调度引擎:硬约束 → 软约束代价最小化,可解释,稳定 */
(function (G) {
  'use strict';
  const C = G.Chrono || (G.Chrono = {});
  const { MIN, DAY, dayStart, addDays, dow, fmtT, fmtDur, dayLabel, ceil15, uid, DOMAINS, DOMAIN_KEYS } = C;

  const effMin = (it) => Math.ceil(it.estMin * (it.conf < 0.5 ? 1.3 : 1) / 5) * 5;   // 低置信度 ×1.3
  const bmin = (b) => (b.end - b.start) / MIN;
  const live = (b) => !b.skipped;
  /* 被保护(不可侵入)的块:用户点了「不可侵入」、手动拖过、或手动放置的块。自动生成的任何东西都不能压进去 */
  const isPinned = (b) => !!(b.pin || b.moved || (b.locked && !b.habitId && b.kind !== 'commit'));
  const clashHard = (st, s, e, selfId) => st.blocks.some((b) => live(b) && b.id !== selfId && b.start < e && b.end > s && (isPinned(b) || b.kind === 'commit'));

  /* 每天的可用边界:周末可单独设置 */
  const isRestDay = (d) => (C.Holiday ? C.Holiday.isRest(d) : dow(d) >= 5);     // 周末或法定放假(调休补班日算工作日)
  const dayKind = (d) => (C.Holiday ? C.Holiday.info(d).kind : dow(d) >= 5 ? 'weekend' : 'work');
  function bounds(S, d) {
    const we = d != null && isRestDay(d) && S.wknd && S.wknd.on;
    return we ? [S.wknd.start, S.wknd.end] : [S.dayStart, S.dayEnd];
  }
  const isOff = (S, d) => (S.off || []).some((o) => { const key = C.dateVal(d); return key >= C.dateVal(o.from, o.timeZone || C.timeZone()) && key <= C.dateVal(o.to, o.timeZone || C.timeZone()); });
  const commuteOn = (S, d) => !!(S.commute && S.commute.on && d != null && !isRestDay(d));
  function winMinutes(S, d) {
    const [a, z] = bounds(S, d);
    return z - a - S.endBuffer - (S.lunchOn ? S.lunch[1] - S.lunch[0] : 0) - (commuteOn(S, d) ? S.commute.am + S.commute.pm : 0);
  }
  const dayCap = (S, d) => (d != null && isOff(S, d) ? 0 : Math.round(winMinutes(S, d) * (1 - S.freeRatio)));
  function dayLoad(st, d) {
    let m = 0;
    st.blocks.forEach((b) => { if (b.end > d && b.start < addDays(d, 1) && live(b) && !b.missed && b.kind !== 'free') m += (Math.min(b.end, addDays(d, 1)) - Math.max(b.start, d)) / MIN; });
    return m;
  }
  const placedMin = (st, id) => st.blocks.reduce((a, b) => a + (b.itemId === id && live(b) ? bmin(b) : 0), 0);

  /* ---------- 空档 ---------- */
  function gapsOf(st, d, now, ignore) {
    const S = st.settings;
    if (isOff(S, d)) return [];
    const [ba, bz] = bounds(S, d);
    let lo = C.atMinute(d, ba); const hi = C.atMinute(d, bz - S.endBuffer);
    if (dayStart(now) === d) lo = Math.max(lo, ceil15(now));
    if (lo >= hi) return [];
    const occ = [];
    st.blocks.forEach((b) => {
      if (b.end <= d || b.start >= addDays(d, 1) || !live(b) || b.kind === 'free') return;
      if (ignore && ignore(b)) return;
      occ.push({ s: b.start, e: b.end, blk: true });
    });
    if (S.lunchOn) occ.push({ s: C.atMinute(d, S.lunch[0]), e: C.atMinute(d, S.lunch[1]), blk: false });
    if (commuteOn(S, d)) {
      occ.push({ s: C.atMinute(d, ba), e: C.atMinute(d, ba + S.commute.am), blk: false });
      occ.push({ s: C.atMinute(d, S.commute.pmAt), e: C.atMinute(d, S.commute.pmAt + S.commute.pm), blk: false });
    }
    occ.sort((a, b) => a.s - b.s);
    const gaps = []; let cur = lo, curBlk = false;
    for (const iv of occ) {
      if (iv.e <= cur) continue;
      if (iv.s >= hi) break;
      if (iv.s > cur) gaps.push({ s: cur, e: Math.min(iv.s, hi), lb: curBlk, rb: iv.blk });
      cur = Math.max(cur, iv.e); curBlk = iv.blk;
      if (cur >= hi) break;
    }
    if (cur < hi) gaps.push({ s: cur, e: hi, lb: curBlk, rb: false });
    return gaps;
  }

  /* ---------- 选槽(核心打分) ---------- */
  function place(st, it, dur, ctx) {
    const S = st.settings, now = ctx.now, startDay = dayStart(now);
    let first = startDay, last = addDays(startDay, 13);
    if (it.notBefore) first = Math.max(first, dayStart(it.notBefore));
    if (it.due && !it.lateOk) last = Math.max(first, Math.min(last, dayStart(it.due)));
    if (it.due && dayStart(it.due) < startDay) last = first;
    if (it.start == null && it.due && it.lateOk) last = addDays(startDay, 13);
    const buf = S.buffer * MIN;
    const hold = Math.max(it.hold || 0, ctx.minStart || 0);
    if (hold) first = Math.max(first, dayStart(hold));
    let best = null;
    const isDeep = it.energy === 'deep';
    const ign = it.borrow ? (b) => b.habitId && !b.locked && !b.done : null;

    for (let d = first; d <= last; d = addDays(d, 1)) {
      const load = dayLoad(st, d), cap = dayCap(S, d);
      if (load + dur > cap && !ctx.ignoreCap) continue;
      const di = C.calendarDiff(d, startDay);
      const daysLeft = it.due ? C.calendarDiff(it.due, d) : null;
      const w = dow(d);
      const hk = dayKind(d), restPen = it.domain === 'work' && (hk === 'holiday' || hk === 'weekend') ? 45 : 0;
      if (it.domain === 'work' && hk === 'holiday' && S.holidayAvoid !== false && !it.allowHoliday && !(daysLeft != null && daysLeft <= 0)) continue;
      const zones = (S.zones || []).filter((z) => z.dow === w);
      const sameItemToday = st.blocks.some((b) => b.itemId === it.id && live(b) && b.start >= d && b.start < addDays(d, 1));
      for (const g of gapsOf(st, d, now, ign)) {
        let s0 = g.s + (g.lb ? buf : 0);
        if (hold && s0 < hold) s0 = ceil15(hold);
        const e0 = g.e - (g.rb ? buf : 0);
        for (let s = ceil15(s0); s + dur * MIN <= e0; s += 15 * MIN) {
          const sm = C.minuteOfDay(s), em = C.minuteOfDay(s + dur * MIN);
          if (zones.some((z) => !isDeep && sm < z.end && em > z.start)) continue;
          const peakOverlap = Math.max(0, Math.min(em, S.peak[1]) - Math.max(sm, S.peak[0]));
          const inPeak = peakOverlap >= dur * 0.8;
          let cost = 0; const why = [];
          if (isDeep) { cost += inPeak ? 0 : (sm < S.peak[1] + 60 ? 12 : 30); if (inPeak) why.push('这是你精力最好的时段'); }
          else if (it.energy === 'low') { cost += inPeak ? 18 : 0; if (!inPeak) why.push('低谷时段适合处理机械事务'); }
          else cost += inPeak ? 6 : 0;
          cost += load / 60 * 4 + restPen;
          if (it.due) {
            if (daysLeft === 0) { cost += di === 0 ? 0 : 30; }
            else if (daysLeft === 1) cost += 6;
            else cost += di * 1.5;
            if (daysLeft < 0) cost += 60 + (-daysLeft) * 20;
            if (daysLeft > 0) why.push('距截止还有 ' + daysLeft + ' 天,留出返工余量');
            else if (daysLeft === 0) why.push('已是截止当天,排在最早的合适空档');
          } else cost += di * 2;
          if (sameItemToday) cost += 25;
          cost += sm / 60 * 0.6;
          if (it.win) { const inw = sm >= it.win[0] && em <= it.win[1] + 30; cost += inw ? -6 : 25; if (inw) why.push('符合你说的时间段'); }
          if (it.ctx) {
            const near = st.blocks.some((b) => b.ctx === it.ctx && live(b) && Math.abs(b.start - s) < 45 * MIN || b.ctx === it.ctx && live(b) && Math.abs(b.end - s) < 45 * MIN);
            if (near) { cost -= 8; why.push('与同场景事项连排'); }
          }
          if (ctx.soon === it.id) cost += (s - now) / MIN / 4;
          if (!best || cost < best.cost) best = { s, e: s + dur * MIN, cost, why, day: d };
        }
      }
    }
    if (best && !best.why.length) best.why.push(load0(st, best.day) < 120 ? '这天比较空,避免堆在一起' : '最近的合适空档');
    return best;
  }
  const load0 = (st, d) => dayLoad(st, d);

  function chunksFor(st, it, need) {
    const mx = st.settings.maxChunk || 90;
    if (!it.splittable || need <= 120) return [need];
    const n = Math.ceil(need / mx), size = Math.max(60, Math.ceil(need / n / 5) * 5), out = [];
    let left = need;
    while (left > 0) { const c = Math.min(size, left); out.push(c); left -= c; }
    if (out.length > 1 && out[out.length - 1] < 45) out[out.length - 2] += out.pop();
    return out;
  }

  const kindOf = (it) => (it.type === 'event' ? 'commit' : it.energy === 'deep' ? 'focus' : 'admin');

  /* ---------- 习惯生成 ---------- */
  const occurrenceKey = (h, date) => h.id + '@' + date;
  const recurringId = (h, date) => 'b' + h.id + 'd' + date.replace(/-/g, '');
  function occurrenceOf(b, h) {
    if (!h || !b.hkey || b.hkey.includes('#dup')) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(b.occurrenceDate || '')) return b.occurrenceDate;
    const prefix = h.id + '@'; if (!b.hkey.startsWith(prefix)) return null;
    const match = b.hkey.slice(prefix.length).match(/^(\d+)(?:p*|m)$/); if (!match) return null;
    const midnight = +match[1]; if (!Number.isFinite(midnight) || Math.abs(midnight) > 8640000000000000) return null;
    const zone = b.timeZone && b.timeZone !== 'system' && C.validTimeZone(b.timeZone) ? b.timeZone : C.inferTimeZone(midnight, h.timeZone);
    return C.dateVal(midnight, zone);
  }
  // 同一次周期安排的身份是「模板 ID + 原定日历日期」,不随显示时区或调课而变化。
  function repairRecurring(st, versions) {
    let changed = C.initTimeZones(st), duplicates = 0;
    const habits = new Map(st.habits.map((h) => [h.id, h])), groups = new Map();
    st.blocks.forEach((b) => {
      if (b.duplicateOf) { if (!b.skipped) { b.skipped = true; changed++; } return; }
      const h = habits.get(b.habitId || b.routineId), date = occurrenceOf(b, h); if (!date) return;
      if (b.occurrenceDate !== date) { b.occurrenceDate = date; changed++; }
      if (!b.timeZone) { b.timeZone = h.timeZone; changed++; }
      if (/m$/.test(b.hkey)) { b.hkey = b.hkey.slice(0, -1); b.moved = true; b.pin = true; b.locked = true; changed++; }
      if (b.skipped) return;
      const key = occurrenceKey(h, date); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(b);
    });
    const acted = (b) => b.done || b.started ? 3 : b.moved || b.pin || /p+$/.test(b.hkey || '') || /你手动/.test(b.why || '') ? 2 : 0;
    groups.forEach((group) => {
      if (group.length < 2) return;
      const h = habits.get(group[0].habitId || group[0].routineId), date = group[0].occurrenceDate;
      const expected = C.withTimeZone(h.timeZone, () => {
        const d = C.parseDateTime(date), ex = (h.ex || []).find((e) => C.dateVal(e.date) === date);
        return ex && ex.type === 'move' && ex.to ? C.atMinute(ex.to.date, ex.to.start) : h.time == null ? null : C.atMinute(d, h.time);
      });
      group.sort((a, b) => acted(b) - acted(a) || (Number(b.start === expected) - Number(a.start === expected)) || ((versions && versions[b.id] || {}).u || 0) - ((versions && versions[a.id] || {}).u || 0) || String(a.id).localeCompare(String(b.id)));
      const keeper = group[0];
      group.slice(1).forEach((b) => {
        // 两条都被明确操作过且内容不同:保留给用户判断,不猜哪次操作正确。
        if (acted(b) && (b.start !== keeper.start || b.end !== keeper.end || !!b.done !== !!keeper.done || !!b.started !== !!keeper.started || (b.actual || 0) !== (keeper.actual || 0))) return;
        b.skipped = true; b.duplicateOf = keeper.id; duplicates++; changed++;
      });
    });
    return { changed, duplicates };
  }
  function occurrenceSet(st) {
    const habits = new Map(st.habits.map((h) => [h.id, h]));
    return new Set(st.blocks.filter((b) => !b.duplicateOf).map((b) => { const h = habits.get(b.habitId || b.routineId), date = occurrenceOf(b, h); return date ? occurrenceKey(h, date) : null; }).filter(Boolean));
  }
  const HWIN = (S, d) => { const [a, z] = bounds(S, d); return { morning: [a, 11 * 60 + 30], noon: [13 * 60, 15 * 60], evening: [18 * 60, z - S.endBuffer], any: [a, z - S.endBuffer] }; };
  function habitDays(h, ws) {
    if (h.days) return h.days;
    const n = Math.max(1, Math.min(7, h.perWeek || 1));
    return [...Array(n)].map((_, i) => Math.floor((i + 0.5) * 7 / n));
  }
  function genHabits(st, now, res, H) {
    repairRecurring(st);
    H = H || 56;                                   // 周期事项默认往后排 8 周;翻到更远会由 ensureHorizon 补齐
    const S = st.settings, have = occurrenceSet(st);
    st.habits.forEach((h) => C.withTimeZone(h.timeZone || C.timeZone(), () => {
      const t0 = dayStart(now);
      if (h.paused || h.routine) return;
      const keyAt = (d) => occurrenceKey(h, C.dateVal(d));
      const mkAt = (d, s, kind, why) => { const date = C.dateVal(d); st.blocks.push({ id: recurringId(h, date), habitId: h.id, hkey: h.id + '@' + d, occurrenceDate: date, timeZone: h.timeZone || C.timeZone(), title: h.title, domain: h.domain, kind, start: s, end: s + h.dur * MIN, locked: h.time != null, ctx: '', why, prio: 2 }); have.add(keyAt(d)); };
      const findSlot = (d) => {
        const win = HWIN(S, d), [wa, wb] = win[h.pref] || win.any, dur = h.dur, buf = S.buffer * MIN; let best = null;
        if (dayLoad(st, d) + dur > dayCap(S, d)) return null;
        for (const g of gapsOf(st, d, now)) {
          const lo = Math.max(g.s + (g.lb ? buf : 0), C.atMinute(d, wa)), hi = Math.min(g.e - (g.rb ? buf : 0), C.atMinute(d, wb));
          for (let s = ceil15(lo); s + dur * MIN <= hi; s += 15 * MIN) { const c = C.minuteOfDay(s) / 60 * 0.3; if (!best || c < best.c) best = { s, c }; }
        }
        return best && best.s;
      };
      const restBlocked = (d) => h.domain === 'work' && C.Holiday && C.Holiday.info(d).kind === 'holiday';
      if (h.perWeek && !h.days && !h.monthDay && !h.every) {
        /* 「每周 N 次」没有指定星期:逐周挑最空的日子自动落位,某天排满就换一天,而不是跳过 */
        const n = Math.max(1, Math.min(7, h.perWeek));
        for (let w0 = C.weekStart(t0); w0 < addDays(t0, H); w0 = addDays(w0, 7)) {
          const days = []; for (let i = 0; i < 7; i++) { const d = addDays(w0, i); if (d >= t0 && d < addDays(t0, H) && !isOff(S, d) && !restBlocked(d)) days.push(d); }
          let got = days.filter((d) => have.has(keyAt(d))).length;
          const used = new Set(), prefer = (d) => dayLoad(st, d) + (isRestDay(d) ? 240 : 0) + (h.pref === 'any' && dow(d) >= 5 ? 0 : 0);
          while (got < n) {
            const cand = days.filter((d) => !have.has(keyAt(d)) && !used.has(d)).filter((d) => !used.has(addDays(d, -1)) && !used.has(addDays(d, 1)) && !have.has(keyAt(addDays(d, -1))) && !have.has(keyAt(addDays(d, 1))) || n >= 4).sort((a, b) => prefer(a) - prefer(b));
            const pool = cand.length ? cand : days.filter((d) => !have.has(keyAt(d)) && !used.has(d)).sort((a, b) => prefer(a) - prefer(b));
            let placed = false;
            for (const d of pool) {
              used.add(d);
              if (h.time != null) { const s0 = C.atMinute(d, h.time); if (s0 + h.dur * MIN > now && !clashHard(st, s0, s0 + h.dur * MIN)) { mkAt(d, s0, 'admin', '你设定的时间'); placed = true; break; } continue; }
              const s0 = findSlot(d); if (s0) { mkAt(d, s0, 'admin', '每周 ' + n + ' 次:挑了这周比较空的一天,自动排入'); placed = true; break; }
            }
            if (!placed) { res.habitMiss.push({ habit: h, day: w0 }); break; }
            got++;
          }
        }
        return;
      }
      const wdays = h.monthDay || h.every ? null : habitDays(h);
      for (let k = 0; k < H; k++) {
        const d = addDays(t0, k), dd = C.date(d);
        const hit = h.monthDay ? dd.getDate() === Math.min(h.monthDay, C.makeDate(dd.getFullYear(), dd.getMonth() + 1, 0).getDate())
          : h.every ? C.calendarDiff(d, h.anchor || h.createdAt || now) % h.every === 0 : wdays.includes(dow(d));
        if (!hit || isOff(S, d) || have.has(keyAt(d))) continue;
        if (h.time != null) { const s0 = C.atMinute(d, h.time); if (s0 + h.dur * MIN > now && !clashHard(st, s0, s0 + h.dur * MIN)) mkAt(d, s0, h.kind === 'commit' ? 'commit' : 'admin', '这是你设定的固定节律'); continue; }
        const s0 = findSlot(d); if (s0) mkAt(d, s0, 'admin', '习惯提前占位,优先级高于普通事务'); else res.habitMiss.push({ habit: h, day: d });
      }
    }));
  }

  /* ---------- 固定周程 / 课表 ---------- */
  const weekNo = (st, d) => { const T = st.settings.term; return T && T.start ? Math.floor(C.calendarDiff(C.weekStart(d), C.parseDateTime(C.dateVal(T.start, T.timeZone || C.timeZone()))) / 7) + 1 : null; };
  function parseWeeks(v) {                       // "1-8,10-16周" / [[1,8]] → [[1,8],[10,16]]
    if (Array.isArray(v)) return v.filter((r) => Array.isArray(r) && r.length === 2).map((r) => [+r[0], +r[1]]);
    const out = []; String(v || '').replace(/(\d+)\s*[-~到至]\s*(\d+)|(\d+)/g, (m, a, b, c) => { out.push(a ? [+a, +b] : [+c, +c]); return m; }); return out;
  }
  function routineHit(st, h, d) {
    if (h.timeZone && h.timeZone !== C.timeZone()) { const label = C.dateVal(d); return C.withTimeZone(h.timeZone, () => routineHit(st, h, C.parseDateTime(label))); }
    if (!h.days || !h.days.includes(dow(d))) return false;
    if (h.from && d < h.from) return false; if (h.until && d > h.until) return false;
    const n = weekNo(st, d);
    if (n != null) {
      if (n < 1 || (st.settings.term.weeks && n > st.settings.term.weeks)) return false;
      if (h.weeks && h.weeks.length && !h.weeks.some((r) => n >= r[0] && n <= r[1])) return false;
      if (h.parity === 'odd' && n % 2 === 0) return false; if (h.parity === 'even' && n % 2 === 1) return false;
    }
    return true;
  }
  function routineLabel(h) {
    const days = h.days && h.days.length === 7 ? '每天' : h.days && h.days.length === 5 && h.days[4] === 4 ? '工作日' : (h.days || []).map((d) => C.WD[d]).join('、');
    const wk = h.weeks && h.weeks.length ? '第' + h.weeks.map((r) => (r[0] === r[1] ? r[0] : r[0] + '–' + r[1])).join('、') + '周' : '';
    return days + ' ' + fmtM(h.time) + '–' + fmtM(h.time + h.dur) + (h.timeZone && h.timeZone !== C.selectedTimeZone() ? ' · ' + h.timeZone : '') + (wk ? ' · ' + wk : '') + (h.parity === 'odd' ? ' · 单周' : h.parity === 'even' ? ' · 双周' : '') + (h.loc ? ' · ' + h.loc : '');
  }
  const fmtM = (m) => C.p2(Math.floor(m / 60)) + ':' + C.p2(m % 60);
  /* 固定周程一次生成到学期末(至少 20 周),不再只有两周;翻到更远的周时由 ensureHorizon 补齐 */
  function routineHorizon(st, now) {
    const T = st.settings.term, t0 = dayStart(now); let H = 147;
    if (T && T.start && T.weeks) H = Math.max(H, Math.ceil((addDays(T.start, T.weeks * 7) - t0) / DAY) + 7);
    return Math.min(H, 320);
  }
  function genRoutines(st, now, res, H) {
    repairRecurring(st);
    const S = st.settings; H = H || routineHorizon(st, now);
    const have = occurrenceSet(st);
    st.habits.forEach((h) => C.withTimeZone(h.timeZone || C.timeZone(), () => {
      const t0 = dayStart(now);
      if (!h.routine || h.paused) return;
      const mk = (d, s, why) => { const date = C.dateVal(d); st.blocks.push({ id: recurringId(h, date), habitId: h.id, routineId: h.id, hkey: h.id + '@' + d, occurrenceDate: date, timeZone: h.timeZone, title: h.title, domain: h.domain, kind: 'commit', start: s, end: s + h.dur * MIN, locked: true, ctx: '', loc: h.loc || '', why, prio: 2 }); };
      for (let k = 0; k < H; k++) {
        const d = addDays(t0, k), key = occurrenceKey(h, C.dateVal(d)), ex = h.ex && h.ex.length ? h.ex.find((e) => e.date === d) : null;
        if (ex && ex.type === 'cancel') { if (have.has(key)) { st.blocks = st.blocks.filter((b) => !(b.habitId === h.id && occurrenceOf(b, h) === C.dateVal(d) && !b.done && !b.started)); have.delete(key); } continue; }
        if (!routineHit(st, h, d)) continue;
        if (ex && ex.type === 'move') continue;                                   // 原时间不上了,新时间在下面生成
        if (isOff(S, d)) continue;
        if (h.skipHoliday !== false && C.Holiday && C.Holiday.info(d).kind === 'holiday') continue;   // 法定节假日自动停课
        if (have.has(key)) continue;
        const s = C.atMinute(d, h.time); if (s + h.dur * MIN <= now) continue;
        mk(d, s, '固定周程:' + routineLabel(h)); have.add(key);
      }
      (h.ex || []).filter((e) => e.type === 'move' && e.to).forEach((e) => {
        if (e.to.date < t0 || e.to.date >= addDays(t0, H)) return;
        const key = occurrenceKey(h, C.dateVal(e.date)); if (have.has(key)) return;
        const s = C.atMinute(e.to.date, e.to.start), dur = (e.to.end || e.to.start + h.dur) - e.to.start; if (s + dur * MIN <= now) return;
        mk(e.date, s, '调课:原定 ' + C.dayLabel(e.date, now) + ' ' + fmtM(h.time) + (e.reason ? '(' + e.reason + ')' : '')); st.blocks[st.blocks.length - 1].end = s + dur * MIN; have.add(key);
      });
    }));
  }
  /* 兼容旧启动入口:按原定日期修复,不能把同周的其他正常安排当作重复。 */
  function repairMoved(st) {
    return repairRecurring(st).changed;
  }

  /* 查看更远的日期时,把周期事项补生成到那天(幂等);返回是否新增了块 */
  function ensureHorizon(st, untilTs, now) {
    const t0 = dayStart(now), H = Math.ceil((untilTs - t0) / DAY) + 1; if (H <= 14) return false;
    const n0 = st.blocks.length; genRoutines(st, now, {}, Math.min(Math.max(H, routineHorizon(st, now)), 400)); genHabits(st, now, { habitMiss: [] }, Math.min(H, 120));
    return st.blocks.length !== n0;
  }
  /* 按 ID 或「课名 + 日期」找固定周程(模型常常只给课名);一天里有多个时间段的同名课,以那天实际上课的为准 */
  function findRoutine(st, o) {
    const rs = st.habits.filter((h) => h.routine);
    const id = String(o.id || '').replace(/^r:/, ''); const byId = rs.find((h) => h.id === id); if (byId) return byId;
    const name = String(o.title || '').trim(); if (!name) return null;
    const subseq = (a, b) => { let i = 0; for (const ch of b) if (ch === a[i]) i++; return a.length >= 2 && i === a.length; };     // 「高数」→「高等数学」
    let c = rs.filter((h) => h.title === name); if (!c.length) c = rs.filter((h) => h.title.includes(name) || name.includes(h.title));
    if (!c.length) c = rs.filter((h) => subseq(name, h.title) || subseq(h.title, name));
    if (c.length > 1 && o.date != null) { const d = dayStart(o.date), hit = c.filter((h) => routineHit(st, h, d)); if (hit.length) c = hit; }
    return c.length === 1 ? c[0] : (c.length > 1 && o.date == null ? c[0] : (c.length > 1 ? c[0] : null));
  }
  function addRoutine(st, def, now) {
    const h = { title: def.title, domain: def.domain || (C.domainOf ? C.domainOf(def.title) : 'work'), energy: 'mid', days: def.days, perWeek: 0, time: def.start, dur: Math.max(5, def.end - def.start), pref: 'any', kind: 'commit', routine: true,
      weeks: def.weeks || [], parity: def.parity || 'all', loc: def.loc || '', note: def.note || '', skipHoliday: def.skipHoliday !== false, ex: [], from: def.from || 0, until: def.until || 0, skipLeft: 0 };
    return addHabit(st, h, now);
  }
  function refreshRoutine(st, id, now) {          // 改了规则:丢掉它未来未完成的块,按新规则重新生成
    st.blocks = st.blocks.filter((b) => !(b.routineId === id && !b.done && !b.started && b.start >= now - 60 * MIN));
    return plan(st, now, 'inc');
  }
  function routineException(st, id, ex, now) {
    const h = st.habits.find((x) => x.id === id); if (!h) return null;
    ex.date = C.parseDateTime(C.dateVal(ex.date), h.timeZone || C.timeZone());
    if (ex.to) ex.to = { ...ex.to, date: C.parseDateTime(C.dateVal(ex.to.date), h.timeZone || C.timeZone()) };
    h.ex = (h.ex || []).filter((e) => e.date !== ex.date).concat([ex]);
    const date = C.dateVal(ex.date, h.timeZone);
    st.blocks = st.blocks.filter((b) => !(b.habitId === id && occurrenceOf(b, h) === date && !b.done && !b.started));
    return plan(st, now, 'inc');
  }
  function removeRoutineException(st, id, date, now) {
    const h = st.habits.find((x) => x.id === id); if (!h) return null;
    const original = C.withTimeZone(h.timeZone || C.timeZone(), () => dayStart(date));
    h.ex = (h.ex || []).filter((e) => e.date !== original);
    const key = C.dateVal(original, h.timeZone);
    st.blocks = st.blocks.filter((b) => !(b.habitId === id && occurrenceOf(b, h) === key && !b.done && !b.started));
    return plan(st, now, 'inc');
  }

  /* ---------- 增删事项 ---------- */
  function addItems(st, drafts, now) {
    const out = [];
    drafts.forEach((d) => {
      const it = Object.assign({}, d, { id: uid(st, 'i') });
      delete it.date;
      st.items.push(it); out.push(it);
      if (it.type === 'event' && it.status !== 'inbox') {
        st.blocks.push({ id: uid(st, 'b'), itemId: it.id, title: it.short, domain: it.domain, kind: 'commit', start: it.start, end: it.end, locked: true, ctx: it.ctx, loc: it.loc || '', why: '这是别人的时间(承诺块),系统不会移动它', prio: it.priority });
        if (it.prep) st.blocks.push({ id: uid(st, 'b'), itemId: it.id, prepFor: true, title: '准备:' + it.short, domain: it.domain, kind: 'admin', start: it.start - it.prep * MIN, end: it.start, locked: true, ctx: '', why: '你要求会前预留 ' + fmtDur(it.prep) + ' 准备时间', prio: it.priority });
        if (it.travel) st.blocks.push({ id: uid(st, 'b'), itemId: it.id, travelFor: true, title: '路上:' + it.short, domain: it.domain, kind: 'commit', start: it.start - it.travel * MIN - (it.prep ? it.prep * MIN : 0), end: it.start - (it.prep ? it.prep * MIN : 0), locked: true, ctx: 'out', why: '前往' + (it.loc || '目的地') + '的路程,按硬约束处理', prio: it.priority });
      }
    });
    return out;
  }
  function addHabit(st, h, now) {
    h.id = uid(st, 'h'); h.timeZone = h.timeZone || C.timeZone(); h.anchor = dayStart(now); st.habits.push(h); return h;
  }
  /* 编辑已有事项:改完后只重排它自己 */
  function editItem(st, id, patch, now) {
    const it = itemOf(st, id); if (!it) return null;
    Object.assign(it, patch);
    if (patch.title) it.short = patch.title.length > 12 ? patch.title.slice(0, 12) : patch.title;
    if (patch.estMin) { it.statedMin = patch.estMin; it.conf = 0.9; it.src = 'stated'; it.splittable = it.type === 'task' && (it.energy === 'deep' || it.estMin >= 120); }
    if (it.type === 'event') {
      const cb = st.blocks.find((b) => b.itemId === id && b.kind === 'commit' && !b.travelFor);
      st.blocks = st.blocks.filter((b) => !(b.itemId === id && (b.prepFor || b.travelFor)));
      if (cb) { cb.start = it.start; cb.end = it.start + it.estMin * MIN; cb.title = it.short; cb.domain = it.domain; cb.prio = it.priority; it.end = cb.end; }
      if (it.prep) st.blocks.push({ id: uid(st, 'b'), itemId: id, prepFor: true, title: '准备:' + it.short, domain: it.domain, kind: 'admin', start: it.start - it.prep * MIN, end: it.start, locked: true, ctx: '', why: '会前准备', prio: it.priority });
    } else {
      st.blocks.forEach((b) => { if (b.itemId === id && !b.done && !b.started && !b.locked) b.skipped = true; });
      st.blocks.forEach((b) => { if (b.itemId === id) { b.title = it.short; b.domain = it.domain; b.prio = it.priority; } });
      if (it.status === 'inbox' && patch.status == null) it.status = 'planned';
    }
    return plan(st, now, 'inc');
  }
  const itemOf = (st, id) => st.items.find((i) => i.id === id);

  /* 导入 .ics(别人发来的日程、系统日历导出) → 事件草稿 */
  function fromICS(text, now) {
    const lines = String(text).replace(/\r?\n[ \t]/g, '').split(/\r?\n/), out = [];
    let cur = null;
    const pt = (v, prop) => {
      const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/); if (!m) return null;
      const tz = prop.match(/;TZID=(?:"([^"]+)"|([^;]+))/i), zone = m[7] ? 'UTC' : tz ? tz[1] || tz[2] : C.timeZone();
      if (!C.validTimeZone(zone)) return null;
      const value = m[1] + '-' + m[2] + '-' + m[3] + (m[4] == null ? '' : 'T' + m[4] + ':' + m[5] + ':' + (m[6] || '00'));
      const ts = C.parseDateTime(value, m[4] == null ? C.timeZone() : zone);
      return ts == null ? null : { ts, allDay: m[4] == null };
    };
    lines.forEach((ln) => {
      if (ln === 'BEGIN:VEVENT') cur = {}; else if (ln === 'END:VEVENT') { if (cur && cur.s) out.push(cur); cur = null; }
      else if (cur) {
        const i = ln.indexOf(':'); if (i < 0) return; const k = ln.slice(0, i).split(';')[0], v = ln.slice(i + 1);
        if (k === 'SUMMARY') cur.title = v.replace(/\\([,;n\\])/g, (m, c) => (c === 'n' ? ' ' : c));
        else if (k === 'DTSTART') cur.s = pt(v, ln.slice(0, i)); else if (k === 'DTEND') cur.e = pt(v, ln.slice(0, i)); else if (k === 'LOCATION') cur.loc = v.replace(/\\(.)/g, '$1');
      }
    });
    return out.filter((e) => e.title && (e.e ? e.e.ts : e.s.allDay ? addDays(e.s.ts, 1) : e.s.ts + 60 * MIN) > now).sort((a, b) => a.s.ts - b.s.ts).map((e) => {
      const dom = C.domainOf(e.title), en = C.energyOf(e.title), title = e.title;
      const base = { id: null, raw: title, title, short: title.length > 12 ? title.slice(0, 12) : title, domain: dom, energy: en, ctx: '', priority: 2, status: 'planned', flex: 'fixed', lead: 0, postponed: 0, actual: 0, createdAt: now, source: 'ics', loc: e.loc || '', conf: 0.95, src: 'stated' };
      if (e.s.allDay) return Object.assign(base, { type: 'deadline', due: e.e && e.e.ts > e.s.ts ? e.e.ts - 1 : C.dayEnd(e.s.ts), estMin: 0, lead: 1440 });
      const end = e.e && e.e.ts > e.s.ts ? e.e.ts : e.s.ts + 60 * MIN;
      return Object.assign(base, { type: 'event', start: e.s.ts, end, estMin: Math.round((end - e.s.ts) / MIN), hasClock: true, lead: 15 });
    });
  }

  /* 休假 / 出差:这些天不排任务;已排的可移动块让位并重排 */
  function addAway(st, from, to, label, now) {
    from = dayStart(from); to = dayStart(to); if (to < from) { const x = from; from = to; to = x; }
    (st.settings.off = st.settings.off || []).push({ id: uid(st, 'o'), from, to, timeZone: C.timeZone(), label: label || '休假' });
    let moved = 0;
    st.blocks.forEach((b) => { if (b.kind !== 'commit' && !b.locked && !b.done && !b.started && !b.skipped && b.start >= from && b.start < addDays(to, 1)) { b.skipped = true; moved++; } });
    const res = plan(st, now, 'inc'); res.moved = moved; return res;
  }
  function removeAway(st, id, now) { st.settings.off = (st.settings.off || []).filter((o) => o.id !== id); return plan(st, now, 'inc'); }

  function removeItem(st, id) {
    st.items = st.items.filter((i) => i.id !== id);
    st.blocks = st.blocks.filter((b) => b.itemId !== id);
  }

  /* ---------- 主排程 ---------- */
  function sweepMissed(st, now) {
    st.blocks.forEach((b) => {
      if (b.kind === 'commit' || b.done || b.skipped || b.missed || b.started) return;
      if (b.end + 30 * MIN <= now) {
        b.missed = true;
        const bk = bucket(b.start); st.stats.energyAll[bk] = (st.stats.energyAll[bk] || 0) + 1;
      }
    });
  }
  const bucket = (ts) => { const h = C.date(ts).getHours(); return h < 12 ? 'am' : h < 18 ? 'pm' : 'eve'; };

  function snapshot(st, now) {
    const map = {}, per = {};
    st.blocks.filter((b) => b.kind !== 'commit' && live(b) && b.start >= now).sort((a, b) => a.start - b.start).forEach((b) => {
      const k = b.itemId ? b.itemId : b.habitId; per[k] = (per[k] || 0) + 1;
      map[(b.hkey || (b.itemId + '#' + per[k]))] = b.start;
    });
    return map;
  }

  function plan(st, now, mode, opts) {
    opts = opts || {};
    repairRecurring(st);
    const res = { conflicts: [], habitMiss: [], displaced: [], overload: [], diff: { changed: 0, kept: 0 }, placed: 0 };
    if (!st.settings.aiOn) return res;
    sweepMissed(st, now);
    const before = snapshot(st, now);
    if (mode === 'full') {
      st.blocks = st.blocks.filter((b) => !(b.kind !== 'commit' && !b.locked && !b.done && !b.started && !b.missed && b.start >= now));
    }
    genHabits(st, now, res); genRoutines(st, now, res, routineHorizon(st, now));
    // 硬约束(会议、课程、固定时间的习惯)压住的、没有被保护的普通块:让位,稍后重新落位
    {
      const isHard = (b) => live(b) && (b.kind === 'commit' || (b.habitId && b.locked));
      const hards = st.blocks.filter(isHard), bf = st.settings.buffer * MIN;
      st.blocks.forEach((b) => {
        if (isHard(b) || isPinned(b) || b.done || b.started || b.skipped || b.start < now) return;
        if (hards.some((c) => c.start - (c.kind === 'commit' ? bf : 0) < b.end && c.end + (c.kind === 'commit' ? bf : 0) > b.start)) b.skipped = true;
      });
    }

    const todo = st.items.filter((i) => i.type === 'task' && i.status === 'planned');
    todo.sort((a, b) => (a.priority - b.priority) || ((a.due || 9e15) - (b.due || 9e15)) || (effMin(b) - effMin(a)));
    // 依赖:前置事项先落位
    const ordered = [], seen = new Set();
    const visit = (it) => { if (seen.has(it.id)) return; seen.add(it.id); const p = it.after && todo.find((x) => x.id === it.after); if (p) visit(p); ordered.push(it); };
    todo.forEach(visit);
    ordered.forEach((it) => {
      const need = effMin(it) - placedMin(st, it.id);
      if (need <= 0) return;
      let minStart = 0;
      if (it.after) {
        const pred = C.itemOf(st, it.after);
        if (pred && pred.status !== 'done' && pred.status !== 'dropped') {
          const pb = st.blocks.filter((b) => b.itemId === pred.id && live(b));
          if (!pb.length || placedMin(st, pred.id) < effMin(pred) - 1) { res.conflicts.push({ itemId: it.id, title: it.short, min: need, due: it.due, waiting: pred.short }); return; }
          minStart = Math.max.apply(null, pb.map((b) => b.end)) + st.settings.buffer * MIN;
        }
      }
      const chunks = chunksFor(st, it, need);
      let failed = 0;
      chunks.forEach((dur) => {
        const slot = place(st, it, dur, { now, soon: opts.soon, minStart });
        if (!slot) { failed += dur; return; }
        if (it.borrow) {
          st.blocks = st.blocks.filter((b) => {
            const hit = b.habitId && !b.locked && !b.done && b.start < slot.e && b.end > slot.s;
            if (hit) res.displaced.push({ title: b.title, domain: b.domain, min: bmin(b), start: b.start });
            return !hit;
          });
        }
        st.blocks.push({ id: uid(st, 'b'), itemId: it.id, title: it.short, domain: it.domain, kind: kindOf(it), start: slot.s, end: slot.e, ctx: it.ctx, prio: it.priority, why: slot.why.slice(0, 2).join(',且'), cost: Math.round(slot.cost) });
        res.placed++;
      });
      if (it.hold && failed === 0) delete it.hold;
      if (failed) res.conflicts.push({ itemId: it.id, title: it.short, min: failed, due: it.due });
    });

    const after = snapshot(st, now);
    let changed = 0, kept = 0;
    Object.keys(before).forEach((k) => { if (after[k] === before[k]) kept++; else changed++; });
    res.diff = { changed, kept };
    if (mode === 'full' || changed) st.log.push({ t: now, kind: 'plan', mode, changed, total: changed + kept });

    // 过载预警:提前告知
    const t0 = dayStart(now);
    for (let k = 0; k < 14; k++) {
      const d = addDays(t0, k), cap = dayCap(st.settings, d); let need = dayLoad(st, d);
      res.conflicts.forEach((c) => { const it = C.itemOf(st, c.itemId); const ld = it && it.due ? dayStart(it.due) : null; if (ld === d) need += c.min; });
      if (need > cap) res.overload.push({ day: d, need, cap });
    }
    return res;
  }

  /* ---------- 冲突消解:三个可比较的选项 ---------- */
  const clone = (st) => JSON.parse(JSON.stringify(st));
  function conflictOptions(st, itemId, now) {
    const it = C.itemOf(st, itemId); if (!it) return [];
    const out = [];
    const probe = (mut) => {
      const s2 = clone(st); const i2 = C.itemOf(s2, itemId); mut(i2, s2);
      const r = plan(s2, now, 'inc');
      const bl = s2.blocks.filter((b) => b.itemId === itemId && !b.skipped).sort((a, b) => a.start - b.start);
      const ok = !r.conflicts.some((c) => c.itemId === itemId) && bl.length;
      return { ok, r, bl, s2, i2 };
    };
    const p1 = probe((i) => { i.lateOk = true; });
    if (p1.ok) {
      const last = p1.bl[p1.bl.length - 1].start, dl = it.due ? Math.round((dayStart(it.due) - dayStart(last)) / DAY) : null;
      out.push({ kind: 'postpone', label: '延期「' + it.short + '」到' + dayLabel(last, now), note: dl == null ? '没有硬截止,安全' : dl >= 0 ? '距截止还有 ' + dl + ' 天,安全' : '会超过截止 ' + (-dl) + ' 天' });
    }
    const p2 = probe((i) => { i.estMin = Math.max(30, Math.round(i.estMin * 0.67 / 5) * 5); i.conf = 1; });
    if (p2.ok) out.push({ kind: 'shorten', label: '把「' + it.short + '」压缩到 ' + fmtDur(p2.i2.estMin), note: '有 40% 概率做不完' });
    const p3 = probe((i) => { i.borrow = true; });
    if (p3.ok && p3.r.displaced.length) {
      const d = p3.r.displaced[0], m = p3.r.displaced.reduce((a, x) => a + x.min, 0);
      out.push({ kind: 'borrow', label: '挪用' + dayLabel(d.start, now) + '的「' + d.title + '」时段', note: '本周' + DOMAINS[d.domain].name + '配额将缺 ' + fmtDur(m) });
    }
    return out;
  }
  function applyOption(st, itemId, kind, now) {
    const it = C.itemOf(st, itemId); if (!it) return null;
    if (kind === 'postpone') it.lateOk = true;
    else if (kind === 'shorten') { it.estMin = Math.max(30, Math.round(it.estMin * 0.67 / 5) * 5); it.conf = 1; }
    else if (kind === 'borrow') it.borrow = true;
    else if (kind === 'drop') it.status = 'dropped';
    return plan(st, now, 'inc');
  }

  /* ---------- 执行 ---------- */
  function startBlock(st, id) { const b = st.blocks.find((x) => x.id === id); if (b) { b.started = true; b.locked = true; b.startedAt = Date.now(); } return b; }

  function markDone(st, id, actualMin, now) {
    const b = st.blocks.find((x) => x.id === id); if (!b) return null;
    b.done = true; b.actual = actualMin || bmin(b); b.missed = false;
    const bk = bucket(b.start);
    st.stats.energyAll[bk] = (st.stats.energyAll[bk] || 0) + 1; st.stats.energyDone[bk] = (st.stats.energyDone[bk] || 0) + 1;
    const it = b.itemId ? C.itemOf(st, b.itemId) : null;
    let finished = false, over = false;
    if (it) {
      it.actual = (it.actual || 0) + b.actual;
      const mine = st.blocks.filter((x) => x.itemId === it.id && live(x));
      if (mine.every((x) => x.done) && placedMin(st, it.id) >= effMin(it) - 1) {
        it.status = 'done'; finished = true;
        if (it.type === 'task') {
          const k = C.keyOf(it.domain, it.energy);
          const d = st.stats.dur[k] || (st.stats.dur[k] = { n: 0, sum: 0 }); d.n++; d.sum += it.actual;
          const base = it.statedMin || it.estMin;
          if (base > 0) { const r = st.stats.ratio[it.domain] || (st.stats.ratio[it.domain] = { n: 0, sum: 0 }); r.n++; r.sum += it.actual / base; }
        }
      }
      over = b.actual > bmin(b) * 1.2;
    }
    st.log.push({ t: now, kind: 'done', block: id, item: it && it.id, actual: b.actual, planned: bmin(b), domain: b.domain });
    return { block: b, item: it, finished, over };
  }

  function postpone(st, id, mins, now) {
    const b = st.blocks.find((x) => x.id === id); if (!b) return null;
    const it = b.itemId ? C.itemOf(st, b.itemId) : null;
    const old = b.start; b.skipped = true;
    if (!it) { // 习惯:尝试今天晚些时候
      const dur = bmin(b); const nb = Object.assign({}, b, { skipped: false, id: uid(st, 'b') });
      const slot = placeHabitAfter(st, b, now + mins * MIN, now);
      if (slot) { nb.start = slot; nb.end = slot + dur * MIN; nb.hkey = b.hkey + 'p'; st.blocks.push(nb); return { to: slot, repeat: 0 }; }
      return { to: null, repeat: 0 };
    }
    it.postponed = (it.postponed || 0) + 1;
    it.hold = now + mins * MIN;
    const r = plan(st, now, 'inc', { soon: it.id });
    const nb = st.blocks.filter((x) => x.itemId === it.id && live(x) && x.start >= now).sort((a, c) => a.start - c.start)[0];
    return { to: nb ? nb.start : null, repeat: it.postponed, diff: r.diff, conflicts: r.conflicts, itemId: it.id };
  }
  function placeHabitAfter(st, b, after, now) {
    const d = dayStart(after); const dur = bmin(b), buf = st.settings.buffer * MIN; let best = null;
    for (const g of gapsOf(st, d, after)) {
      const lo = g.s + (g.lb ? buf : 0), hi = g.e - (g.rb ? buf : 0);
      const s = ceil15(Math.max(lo, after)); if (s + dur * MIN <= hi && (!best || s < best)) best = s;
    }
    return best;
  }
  function skipToday(st, id, now) {
    const b = st.blocks.find((x) => x.id === id); if (!b) return null;
    b.skipped = true;
    const it = b.itemId ? C.itemOf(st, b.itemId) : null;
    if (it) { it.postponed = (it.postponed || 0) + 1; it.notBefore = addDays(dayStart(now), 1); return plan(st, now, 'inc'); }
    return null;
  }
  function resolveMissed(st, id, how, now) {
    const b = st.blocks.find((x) => x.id === id); if (!b) return;
    b.skipped = true; b.missed = false;
    const it = b.itemId ? C.itemOf(st, b.itemId) : null; if (!it) return;
    if (how === 'drop') { it.status = 'dropped'; return; }
    it.postponed = (it.postponed || 0) + 1;
    it.notBefore = how === 'tomorrow' ? addDays(dayStart(now), 1) : null;
    if (how === 'week') delete it.notBefore;
  }

  /* 手动拖拽:允许任意移动,实时显示代价 */
  function dragCost(st, b, newStart, now) {
    const dur = bmin(b), ns = newStart, ne = ns + dur * MIN, d = dayStart(ns);
    const cap = dayCap(st.settings, d);
    let load = dayLoad(st, d); if (dayStart(b.start) === d && live(b)) load -= dur;
    const over = Math.max(0, load + dur - cap);
    const clash = st.blocks.find((x) => x.id !== b.id && live(x) && x.start < ne && x.end > ns && x.kind !== 'free');
    const S = st.settings, sm = C.minuteOfDay(ns);
    const it = b.itemId ? C.itemOf(st, b.itemId) : null;
    const late = it && it.due && ne > it.due + 1 ? Math.ceil((ne - it.due) / DAY) : 0;
    const msgs = [];
    if (clash) msgs.push('与「' + clash.title + '」时间重叠');
    if (over > 0) msgs.push('这样会让' + C.WD[dow(d)] + '超出 ' + C.fmtH(over));
    if (late) msgs.push('已超过截止');
    if (!clash && !over && b.kind === 'focus' && !(sm >= S.peak[0] && sm + dur <= S.peak[1] + 30)) msgs.push('不在你的高精力时段');
    return { over, clash: !!clash, msgs, ok: !msgs.length };
  }
  function moveBlock(st, id, newStart) {
    const b = st.blocks.find((x) => x.id === id); if (!b) return;
    const dur = b.end - b.start; b.start = newStart; b.end = newStart + dur; b.locked = true; b.why = '你手动安排在这里,系统不会再动它';
    b.moved = true;                                  // 保留原 hkey:系统据此知道「这一次已经安排过了」,不会在原位置再生成一份
  }

  /* ---------- 复盘与洞察 ---------- */
  function weekStats(st, ws, now) {
    const we = addDays(ws, 7); let total = 0, done = 0, deep = 0, task = 0, focusLens = [];
    const per = {}; DOMAIN_KEYS.forEach((k) => (per[k] = { done: 0, plan: 0 }));
    const dayL = {};
    st.blocks.forEach((b) => {
      if (b.start < ws || b.start >= we || b.skipped || b.kind === 'free') return;
      const m = bmin(b); dayL[dayStart(b.start)] = (dayL[dayStart(b.start)] || 0) + m;
      if (b.kind !== 'commit') {
        if (b.end <= now || b.done) { total++; if (b.done) done++; }
        task += m; if (b.kind === 'focus') { deep += m; focusLens.push(m); }
      }
      if (b.done) per[b.domain].done += b.actual || m; else if (!b.missed) per[b.domain].plan += m;
    });
    let worst = null; Object.keys(dayL).forEach((k) => { if (!worst || dayL[k] > worst.load) worst = { day: +k, load: dayL[k] }; });
    const rate = total ? done / total : null;
    const postponed = st.items.filter((i) => (i.postponed || 0) >= 1 && i.status === 'planned').sort((a, b) => b.postponed - a.postponed).slice(0, 3);
    return { total, done, rate, per, worst, deepShare: task ? deep / task : 0, focusAvg: focusLens.length ? focusLens.reduce((a, b) => a + b, 0) / focusLens.length : 0, focusN: focusLens.length, postponed, dayL };
  }

  function balanceIndex(st, ws, now) {
    const S = st.settings, w = weekStats(st, ws, now);
    let q = 0, n = 0;
    DOMAIN_KEYS.forEach((k) => { const Q = S.quotas[k]; if (!Q.lo) return; const got = w.per[k].done + w.per[k].plan; q += Math.min(1, got / Q.lo); n++; });
    const quota = n ? q / n : 1;
    const deep = Math.min(1, w.deepShare / 0.3);
    let used = 0; Object.keys(w.dayL).forEach((k) => (used += w.dayL[k]));
    let wmTot = 0; for (let k = 0; k < 7; k++) wmTot += winMinutes(S, addDays(ws, k));
    const free = Math.min(1, (1 - used / wmTot) / S.freeRatio);
    const plans = st.log.filter((l) => l.kind === 'plan' && l.t >= addDays(ws, -7) && l.total > 0);
    const stab = plans.length ? 1 - plans.reduce((a, l) => a + l.changed / l.total, 0) / plans.length : 1;
    return Math.round(100 * (quota * 0.3 + deep * 0.25 + Math.max(0, free) * 0.25 + stab * 0.2));
  }

  function insights(st, now) {
    const out = [], S = st.settings; if (!S.aiOn) return out;
    const ws = C.weekStart(now), w = weekStats(st, ws, now);
    // 估时偏差
    DOMAIN_KEYS.forEach((k) => {
      const r = st.stats.ratio[k];
      if (r && r.n >= 3 && r.sum / r.n > 1.2) {
        const avg = r.sum / r.n, pct = Math.round((avg - 1) * 100);
        out.push({ id: 'est-' + k, title: '估时偏差', text: '你估 1 小时的「' + DOMAINS[k].name + '」事项,平均实际做了 ' + avg.toFixed(1) + ' 小时。',
          effect: '把' + DOMAINS[k].name + '类估时自动上调 ' + pct + '%,下周生效', action: { type: 'estMult', domain: k, val: Math.round(avg * 100) / 100 } });
      }
    });
    // 精力曲线
    const A = st.stats.energyAll, D = st.stats.energyDone;
    if ((A.am || 0) >= 4 && (A.pm || 0) >= 4) {
      const ra = D.am / A.am, rp = D.pm / A.pm;
      if (rp > 0 && ra / rp >= 1.5) out.push({ id: 'energy', title: '精力曲线', text: '你上午的完成率比下午高 ' + (ra / rp).toFixed(1) + ' 倍。', effect: '把周三 9:00–12:00 设为深度工作保护区,本周可多出约 3 小时连续专注', action: { type: 'zone', dow: 2, start: 540, end: 720 } });
    }
    // 领域失衡
    DOMAIN_KEYS.forEach((k) => {
      const Q = S.quotas[k]; if (!Q.lo) return;
      const cur = w.per[k].done + w.per[k].plan, prev = C.domainWeek(st, addDays(ws, -7))[k]; const pv = prev.done + prev.plan;
      if (cur < Q.lo * 0.5 && pv > 0 && pv < Q.lo * 0.5) out.push({ id: 'dom-' + k, title: '领域失衡', text: '连续 2 周「' + DOMAINS[k].name + '」投入低于下限的 50%。', effect: '新增一个每周 2 次、每次 45 分钟的「' + DOMAINS[k].name + '」习惯块', action: { type: 'habit', domain: k, title: DOMAINS[k].name + '时间', perWeek: 2, dur: 45 } });
    });
    // 碎片化
    if (w.focusN >= 4 && w.focusAvg < 60) out.push({ id: 'frag', title: '碎片化', text: '你的深度工作平均被切成 ' + Math.round(w.focusAvg) + ' 分钟一段,低于有效阈值。', effect: '把可拆事项的单块上限提高到 120 分钟', action: { type: 'chunk', val: 120 } });
    // 会议侵蚀
    let meet = 0; st.blocks.forEach((b) => { if (b.kind === 'commit' && b.domain === 'work' && b.start >= ws && b.start < addDays(ws, 7) && !b.skipped) meet += bmin(b); });
    if (meet >= 480) out.push({ id: 'meet', title: '会议侵蚀', text: '本周会议共 ' + C.fmtH(meet) + ',占据了大部分整块时间。', effect: '把周四 9:00–12:00 设为不可预约的深度工作保护区', action: { type: 'zone', dow: 3, start: 540, end: 720 } });
    // 周总结永远有
    out.push({ id: 'week', title: '本周概览', text: w.total ? '本周已到点的 ' + w.total + ' 个块里,按计划完成了 ' + w.done + ' 个(' + Math.round(w.rate * 100) + '%)。' : '本周还没有到点的计划块,先排几件事再来看。',
      effect: w.rate == null ? null : (w.rate < 0.5 ? '低于 50%:大概率排得太满或估得太乐观,系统会放大估时并加宽缓冲' : w.rate > 0.85 ? '高于 85%:排得有点松,可以放进更重要但不紧急的事' : '处在健康区间(65% 左右最理想)'), action: null });
    return out;
  }
  function applyInsight(st, a, now) {
    const S = st.settings;
    if (a.type === 'estMult') S.estMult[a.domain] = a.val;
    else if (a.type === 'zone') { if (!S.zones.some((z) => z.dow === a.dow)) S.zones.push({ dow: a.dow, start: a.start, end: a.end }); }
    else if (a.type === 'chunk') S.maxChunk = a.val;
    else if (a.type === 'habit') addHabit(st, { title: a.title, domain: a.domain, energy: 'low', days: null, perWeek: a.perWeek, time: null, dur: a.dur, pref: 'any', kind: 'habit', skipLeft: 1 }, now);
    st.log.push({ t: now, kind: 'insight', a });
    return plan(st, now, 'full');
  }

  /* 在配额不足的领域补一个块 */
  function topUp(st, domain, min, now) {
    const [it] = addItems(st, [{ title: DOMAINS[domain].name + '时间', short: DOMAINS[domain].name + '时间', type: 'task', domain, energy: 'low', ctx: '', priority: 2, status: 'planned', flex: 'move', lead: 0, estMin: min, statedMin: min, conf: 0.9, src: 'stated', splittable: false, postponed: 0, actual: 0, createdAt: now, notBefore: dayStart(now), due: addDays(C.weekStart(now), 7) - 1 }], now);
    return { item: it, res: plan(st, now, 'inc') };
  }

  /* ---------- ICS 导出(接入系统日历,带提醒) ---------- */
  const esc = (s) => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const icsT = (ts) => new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  function toICS(st) {
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Chrono//时序//CN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:时序 Chrono'];
    const stamp = icsT(Date.now());
    st.blocks.filter((b) => live(b) && !b.missed && b.kind !== 'free').sort(C.compareBlocks).forEach((b) => {
      const it = b.itemId ? C.itemOf(st, b.itemId) : null;
      L.push('BEGIN:VEVENT', 'UID:' + b.id + '@chrono', 'DTSTAMP:' + stamp, 'DTSTART:' + icsT(b.start), 'DTEND:' + icsT(b.end),
        'SUMMARY:' + esc(b.title), 'DESCRIPTION:' + esc((DOMAINS[b.domain] ? DOMAINS[b.domain].name : '') + ' · ' + (b.why || '')),
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(b.title), 'TRIGGER:-PT' + (it && it.lead && it.lead < 1440 ? it.lead : 15) + 'M', 'END:VALARM', 'END:VEVENT');
    });
    st.items.filter((i) => i.type === 'deadline' && i.status === 'planned').forEach((i) => {
      const d = dayStart(i.due), n = addDays(d, 1);
      const ds = (t) => { const x = C.date(t); return x.getFullYear() + C.p2(x.getMonth() + 1) + C.p2(x.getDate()); };
      L.push('BEGIN:VEVENT', 'UID:' + i.id + '@chrono', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + ds(d), 'DTEND;VALUE=DATE:' + ds(n), 'SUMMARY:' + esc('到期:' + i.short),
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(i.short), 'TRIGGER:-PT' + Math.round((i.lead || 1440) / 1) + 'M', 'END:VALARM', 'END:VEVENT');
    });
    (st.settings.off || []).forEach((o) => {
      const ds = (t) => { const x = C.date(t); return x.getFullYear() + C.p2(x.getMonth() + 1) + C.p2(x.getDate()); };
      L.push('BEGIN:VEVENT', 'UID:' + o.id + '@chrono', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + ds(o.from), 'DTEND;VALUE=DATE:' + ds(addDays(o.to, 1)), 'SUMMARY:' + esc(o.label), 'END:VEVENT');
    });
    L.push('END:VCALENDAR'); return L.join('\r\n');
  }

  function toCSV(st) {
    const rows = [['日期', '开始', '结束', '标题', '领域', '类型', '计划分钟', '实际分钟', '状态']];
    st.blocks.slice().sort((a, b) => a.start - b.start).forEach((b) => {
      const d = C.date(b.start);
      rows.push([d.getFullYear() + '-' + C.p2(d.getMonth() + 1) + '-' + C.p2(d.getDate()), fmtT(b.start), fmtT(b.end), b.title, DOMAINS[b.domain] ? DOMAINS[b.domain].name : '', b.kind, bmin(b), b.actual || '', b.done ? '完成' : b.skipped ? '取消' : b.missed ? '漏做' : '计划']);
    });
    return '﻿' + rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
  }

  const viewRange = (S) => { const w = S.wknd && S.wknd.on; return [Math.min(S.dayStart, w ? S.wknd.start : 1e9), Math.max(S.dayEnd, w ? S.wknd.end : 0)]; };
  Object.assign(C, { isPinned, clashHard, repairMoved, repairRecurring, occurrenceOf, routineHorizon, genRoutines, genHabits, ensureHorizon, findRoutine, weekNo, parseWeeks, routineHit, routineLabel, addRoutine, refreshRoutine, routineException, removeRoutineException, isRestDay, dayKind, commuteOn, isOff, addAway, removeAway, bounds, viewRange, editItem, fromICS, effMin, dayCap, dayLoad, placedMin, gapsOf, place, plan, addItems, addHabit, removeItem, conflictOptions, applyOption, startBlock, markDone, postpone, skipToday, resolveMissed, dragCost, moveBlock, weekStats, balanceIndex, insights, applyInsight, topUp, toICS, toCSV, sweepMissed, winMinutes, bmin });
  if (typeof module !== 'undefined') module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
