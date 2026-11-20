/* 时序 Chrono · 「今天」页:日期条 + 下一件事(英雄卡)+ 时间轴 */
(function (G) {
  'use strict';
  const C = G.Chrono, A = G.A, { MIN, DAY, DOMAINS } = C;
  const { $, esc, now, hmm, KIND, ICON } = A;
  const S = () => A.st.settings;
  const fmtMD = (ts) => { const d = C.date(ts); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; };
  const MONTH = (ts) => C.date(ts).getFullYear() + ' 年 ' + (C.date(ts).getMonth() + 1) + ' 月';

  A.viewDay = null;   // null = 今天

  function ring(done, total) {
    const R = 17, circ = 2 * Math.PI * R, p = total ? done / total : 0;
    return '<svg class="donering" viewBox="0 0 44 44" role="img" aria-label="今日完成 ' + done + ' / ' + total + '"><circle cx="22" cy="22" r="' + R + '" fill="none" stroke="var(--rule)" stroke-width="4"/>' +
      '<circle cx="22" cy="22" r="' + R + '" fill="none" stroke="var(--now)" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + (circ * p) + ' ' + circ + '" transform="rotate(-90 22 22)"/>' +
      '<text x="22" y="26" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)">' + done + '</text></svg>';
  }

  const hol = (d) => (C.Holiday ? C.Holiday.tag(d) : null);
  function strip(d0, t) {
    const real0 = C.dayStart(t), ws = C.weekStart(d0), s = S();
    let h = '<div class="strip glass" role="tablist" aria-label="选择日期"><button class="sn" data-act="day-nav" data-v="-7" aria-label="上一周">‹</button>';
    for (let k = 0; k < 7; k++) {
      const d = C.addDays(ws, k), load = C.dayLoad(A.st, d), cap = C.dayCap(s, d), p = Math.min(1, load / Math.max(1, cap));
      h += '<button class="sd' + (d === d0 ? ' on' : '') + (d === real0 ? ' td' : '') + (C.isOff(s, d) ? ' away' : '') + (A.dayBlocks(d).length ? ' has' : '') + '"' + (hol(d) ? ' title="' + hol(d).long + '"' : '') + ' role="tab" aria-selected="' + (d === d0) + '" data-act="day" data-d="' + d + '"><span class="w">' + C.WD[k].slice(1) + '</span><span class="n">' + C.date(d).getDate() + '</span>' + (hol(d) ? '<em class="hb ' + hol(d).cls + '">' + hol(d).text + '</em>' : '') + '<i class="ld ' + (load > cap ? 'over' : '') + '"><b style="height:' + Math.round(p * 100) + '%"></b></i></button>';
    }
    return h + '<button class="sn" data-act="day-nav" data-v="7" aria-label="下一周">›</button></div>';
  }

  function hero(nxt, t) {
    const dom = DOMAINS[nxt.domain] || DOMAINS.work, mins = C.bmin(nxt), starting = nxt.start <= t, until = Math.round((nxt.start - t) / MIN);
    const tag = nxt.started ? '进行中' : starting ? '现在' : until < 60 ? until + ' 分钟后' : '下一件';
    const isCommit = nxt.kind === 'commit' || nxt.prepFor;
    const prog = starting ? Math.max(0, Math.min(1, (t - nxt.start) / (nxt.end - nxt.start))) : 0;
    const left = starting ? Math.max(0, Math.round((nxt.end - t) / MIN)) : 0;
    const acts = isCommit
      ? '<button class="btn lt" data-act="done" data-id="' + nxt.id + '">已完成</button><button class="btn ol" data-act="blk" data-id="' + nxt.id + '" data-d="' + C.dayStart(t) + '">详情</button>'
      : nxt.started ? '<button class="btn lt" data-act="focus" data-id="' + nxt.id + '">继续专注</button><button class="btn ol" data-act="done" data-id="' + nxt.id + '">完成</button>'
        : '<button class="btn lt" data-act="start" data-id="' + nxt.id + '">开始</button><button class="btn ol" data-act="postpone" data-id="' + nxt.id + '">顺延 30 分钟</button><button class="btn tx" data-act="skip" data-id="' + nxt.id + '">今天不做了</button>';
    return '<section class="hero" style="--c:' + dom.color + '"><div class="hk"><span class="pill">' + tag + '</span><span class="hd"><i class="dot" style="background:' + dom.color + '"></i>' + dom.name + ' · ' + KIND[nxt.kind] + '</span></div>' +
      '<div class="ht">' + esc(nxt.title) + '</div><div class="hm"><b>' + hmm(nxt.start) + '</b> – ' + hmm(nxt.end) + '<span>' + C.fmtDur(mins) + (nxt.loc ? ' · ' + esc(nxt.loc) : '') + '</span></div>' +
      (starting ? '<div class="prog"><i style="width:' + Math.round(prog * 100) + '%"></i></div><div class="hs">还剩 ' + C.fmtDur(left) + '</div>' : '') +
      (nxt.why ? '<div class="hw">' + esc(nxt.why) + '</div>' : '') + '<div class="acts">' + acts + '</div></section>';
  }

  A.viewToday = () => {
    const st = A.st, t = now(), s = S(), real0 = C.dayStart(t), d0 = A.viewDay == null ? real0 : A.viewDay, isToday = d0 === real0;
    const bl = A.dayBlocks(d0), done = bl.filter((b) => b.done).length;
    const pending = isToday ? bl.filter((b) => !b.done && !b.missed && b.end > t) : [];
    const cur = pending.find((b) => b.start <= t && t < b.end), nxt = cur || pending.find((b) => b.start > t);
    const heaviest = pending.filter((b) => b.itemId && b.kind !== 'commit').sort((a, b) => (a.prio - b.prio) || (C.bmin(b) - C.bmin(a)))[0];

    let html = strip(d0, t);
    const ht = hol(d0);
    if (ht) html += '<div class="banner' + (ht.cls === 'work' ? ' calm' : '') + '">' + (ht.cls === 'off' ? '<b>' + ht.long + '</b>。' + (s.holidayAvoid !== false ? '工作类事项不会排到这天。' : '') : '<b>' + ht.long + '</b>。这天按工作日处理。') + '</div>';
    if (isToday && A.ltHtml) html += A.ltHtml();
    if (isToday) {
      html += nxt ? hero(nxt, t) : '<section class="card empty"><b>' + (bl.length ? '今天到这里' : '今天是空的') + '</b>' + (bl.length ? '剩下的时间留给你。点「晚间收尾」看看明天。' : '在下方说一句话、粘贴一张截图,系统替你排。') + '</section>';
      const rest = pending.filter((b) => b !== nxt).slice(0, 4);
      if (rest.length) html += '<div class="upnext glass">' + rest.map((b) => '<button class="it" data-act="blk" data-id="' + b.id + '" style="--c:' + (DOMAINS[b.domain] || DOMAINS.work).color + '"><span class="tm">' + hmm(b.start) + '</span><i class="bar"></i><span class="tt">' + esc(b.title) + '</span><span class="du">' + C.fmtDur(C.bmin(b)) + '</span></button>').join('') + '</div>';
      const inbox = st.items.filter((i) => i.status === 'inbox').length;
      html += '<div class="rituals"><button class="btn sm" data-act="morning">晨间 60 秒</button><button class="btn sm" data-act="evening">' + (C.date(t).getHours() >= 17 ? '晚间收尾' : '晚间 60 秒') + '</button>' + (inbox ? '<button class="btn sm" data-act="tab" data-v="plan">收件箱 ' + inbox + '</button>' : '') + '</div>';
    } else {
      const load = C.dayLoad(st, d0), cap = C.dayCap(s, d0);
      html += '<section class="card sumday"><div class="row between"><div><div class="num" style="font-size:20px">' + (bl.length ? bl.length + ' 个块' : '这天还没有安排') + '</div><div class="small muted">已排 ' + C.fmtH(load) + ' / 可承载 ' + C.fmtH(cap) + (load > cap ? ' · 超出了' : '') + '</div></div><button class="btn sm" data-act="day" data-d="' + real0 + '">回到今天</button></div></section>';
    }

    const dls = st.items.filter((i) => i.type === 'deadline' && i.status === 'planned' && i.due >= d0 && i.due < C.addDays(d0, 3)).sort((a, b) => a.due - b.due || String(a.id).localeCompare(String(b.id)));
    if (dls.length) html += '<div class="deadlines">' + dls.map((i) => '<span class="dlchip" style="--c:' + DOMAINS[i.domain].color + '">' + C.dayLabel(i.due, t) + '到期 · ' + esc(i.short) + ' <button class="chip" style="min-height:22px;padding:0 8px" data-act="dl-done" data-id="' + i.id + '">已处理</button></span>').join('') + '</div>';

    // 时间轴
    const [a, z] = A.timelineRange(d0, 1, C.bounds(s, d0)), ppm = 1.1, H = (z - a) * ppm;
    let grid = '';
    for (let m = Math.ceil(a / 60) * 60; m <= z; m += 60) { const y = (m - a) * ppm; grid += '<div class="hl" style="top:' + y + 'px"></div><div class="hr" style="top:' + y + 'px">' + C.fmtM(m) + '</div>'; }
    if (s.lunchOn) grid += '<div class="lunch" style="top:' + ((s.lunch[0] - a) * ppm) + 'px;height:' + ((s.lunch[1] - s.lunch[0]) * ppm - 2) + 'px">午休 · 留白</div>';
    if (C.commuteOn(s, d0)) {
      grid += '<div class="lunch" style="top:' + ((C.bounds(s, d0)[0] - a) * ppm) + 'px;height:' + (s.commute.am * ppm - 2) + 'px">通勤</div><div class="lunch" style="top:' + ((s.commute.pmAt - a) * ppm) + 'px;height:' + (s.commute.pm * ppm - 2) + 'px">通勤</div>';
    }
    if (C.isOff(s, d0)) grid += '<div class="lunch away" style="top:0;height:' + (H - 2) + 'px">' + esc(((s.off || []).find((o) => d0 >= o.from && d0 <= o.to) || {}).label || '休假') + ' · 不排任务</div>';
    grid += A.timelineHtml(d0, ppm, a, true);
    const nm = C.minuteOfDay(t);
    if (isToday && nm >= a && nm <= z) grid += '<div class="nowline" style="top:' + ((nm - a) * ppm) + 'px"><span>' + hmm(t) + '</span></div>';
    html += '<h2>时间轴<span class="aux">块的高度与时长成正比 · 点一下看「为什么排在这里」</span></h2><div class="tl"><div class="tl-grid" data-col="' + d0 + '" data-a="' + a + '" data-z="' + z + '" data-ppm="' + ppm + '" style="height:' + H + 'px">' + grid + '</div></div>';
    if (!bl.length) html += '<div class="empty" style="padding-top:18px">时间轴空着。录入后,每一块都会告诉你为什么排在那里。</div>';

    const wdn = C.WD[C.dow(d0)];
    const top = '<div class="datehead"><div class="bigday">' + C.date(d0).getDate() + '</div><div class="dm"><div class="dw">' + wdn + (isToday ? ' · 今天' : '') + '</div><div class="ym">' + MONTH(d0) + (st.settings.term && C.weekNo(st, d0) >= 1 ? ' · 第 ' + C.weekNo(st, d0) + ' 周' : '') + (ht ? ' · ' + ht.name + (ht.cls === 'off' ? '(放假)' : '(补班)') : '') + '</div></div></div>' +
      '<div class="row">' + A.timeZoneButton() + ring(done, bl.length) + '<button class="iconbtn" data-act="search" aria-label="搜索">' + ICON.search + '</button><button class="iconbtn" data-act="settings" aria-label="设置">' + ICON.gear + '</button></div>';
    const sub = isToday ? (pending.length ? '还剩 ' + pending.length + ' 件事' + (heaviest ? ',最重的是「' + esc(heaviest.title) + '」' : '') : (bl.length ? done === bl.length ? '今天的安排都完成了' : '今日时段已结束 · 完成 ' + done + ' / ' + bl.length : '')) : '';
    return { top: top + (sub ? '' : ''), banners: A.banners(), after: () => A.initDrag && A.initDrag(), html: (sub ? '<div class="subline">' + sub + '</div>' : '') + html };
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    if (el.dataset.act === 'day') { const d = +el.dataset.d, cur0 = A.viewDay == null ? C.dayStart(now()) : A.viewDay; A._dir = Math.sign(d - cur0); A._enter = d !== cur0; A.viewDay = d === C.dayStart(now()) ? null : d; A.render(); }
    else if (el.dataset.act === 'day-nav') { const base = A.viewDay == null ? C.dayStart(now()) : A.viewDay; A._dir = Math.sign(+el.dataset.v); A._enter = true; A.viewDay = C.addDays(base, +el.dataset.v); if (A.viewDay === C.dayStart(now())) A.viewDay = null; A.render(); }
  });
})(window);
