/* 时序 Chrono · 计划 / 领域 / 回顾 / 设置 / 每日仪式 */
(function (G) {
  'use strict';
  const C = G.Chrono, A = G.A, { MIN, DAY, DOMAINS, DOMAIN_KEYS } = C;
  const { $, esc, now, tint, hmm } = A;
  const S = () => A.st.settings;
  const pt2 = (v) => { const m = String(v || '').match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  const fmtMD = (ts) => { const d = new Date(ts); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; };

  A.download = (name, mime, text) => {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  };

  /* ================= 计划 ================= */
  const PPM = 0.72;
  A.viewPlan = () => {
    const st = A.st, t = now(), s = S(), ws = C.addDays(C.weekStart(t), A.weekOff * 7), [a, z] = C.viewRange(s);
    const H = (z - a) * PPM, today = C.dayStart(t);
    let h = '<div class="weekbar"><button class="btn sm" data-act="week" data-v="-1">‹ 上一周</button><button class="btn sm" data-act="week" data-v="0">本周</button><button class="btn sm" data-act="week" data-v="1">下一周 ›</button><span class="grow"></span>' +
      '<button class="btn sm" data-act="replan">重新排程</button><button class="btn sm" data-act="ics">导出到日历</button></div>';
    h += '<div class="legend"><span><i style="background:#3E5C9A"></i>专注块(实色)</span><span><i style="background:' + tint('#3E5C9A', .25) + '"></i>事务块(浅色)</span><span><i style="border:1.5px solid #3E5C9A"></i>承诺块(描边)</span><span><i style="border:1px dashed #8A949D"></i>留白</span><span>左侧细带 = 优先级</span></div>';
    h += '<div class="wk" data-a="' + a + '" data-z="' + z + '" data-ppm="' + PPM + '"><div class="wk-in"><div class="wk-h"></div>';
    for (let k = 0; k < 7; k++) {
      const d = C.addDays(ws, k), load = C.dayLoad(st, d), cap = C.dayCap(s, d), pct = Math.min(100, load / cap * 100);
      h += '<div class="wk-h ' + (d === today ? 'today' : '') + '"><b>' + C.WD[k] + '</b> <span class="faint">' + fmtMD(d).replace('月', '/').replace('日', '') + '</span>' + (C.Holiday && C.Holiday.tag(d) ? ' <em class="hb ' + C.Holiday.tag(d).cls + '" title="' + C.Holiday.tag(d).long + '">' + C.Holiday.tag(d).text + '</em>' : '') + '<div class="bar ' + (load > cap ? 'over' : '') + '" title="' + C.fmtH(load) + ' / ' + C.fmtH(cap) + '"><i style="width:' + pct + '%"></i></div></div>';
    }
    h += '<div class="wk-gut" style="height:' + H + 'px">';
    for (let m = Math.ceil(a / 60) * 60; m <= z; m += 120) h += '<span style="top:' + ((m - a) * PPM) + 'px">' + C.fmtM(m).slice(0, 2) + '</span>';
    h += '</div>';
    for (let k = 0; k < 7; k++) {
      const d = C.addDays(ws, k); let inner = '';
      for (let m = Math.ceil(a / 60) * 60; m <= z; m += 60) inner += '<div class="hl" style="top:' + ((m - a) * PPM) + 'px"></div>';
      if (s.lunchOn) inner += '<div class="lunch" style="top:' + ((s.lunch[0] - a) * PPM) + 'px;height:' + ((s.lunch[1] - s.lunch[0]) * PPM - 2) + 'px"></div>';
      (s.zones || []).filter((zn) => zn.dow === k).forEach((zn) => { inner += '<div style="position:absolute;left:0;right:0;top:' + ((zn.start - a) * PPM) + 'px;height:' + ((zn.end - zn.start) * PPM) + 'px;background:repeating-linear-gradient(135deg,transparent 0 5px,var(--rule2) 5px 6px);pointer-events:none"></div>'; });
      inner += A.dayBlocks(d).map((b) => A.blkHtml(b, d, PPM, a, false)).join('');
      if (d === today) { const nm = (t - d) / MIN; if (nm >= a && nm <= z) inner += '<div class="nowline" style="left:0;top:' + ((nm - a) * PPM) + 'px"></div>'; }
      h += '<div class="wk-col ' + (d === today ? 'today' : '') + (C.isOff(s, d) ? ' away' : '') + '" data-col="' + d + '" style="height:' + H + 'px">' + inner + '</div>';
    }
    h += '</div></div><div class="faint tiny" style="margin:6px 2px">拖动块可手动调整(手机上长按再拖),拖的时候会实时告诉你代价。点一下看「为什么排在这里」。</div>';

    // 待安排池
    const un = A.unplaced();
    h += '<h2>待安排池<span class="aux">' + un.length + ' 件</span></h2>';
    h += un.length ? un.map((i) => '<div class="card row"><div class="grow"><b>' + esc(i.short) + '</b><div class="small muted">还差 ' + C.fmtDur(C.effMin(i) - C.placedMin(st, i.id)) + (i.due ? ' · ' + C.dayLabel(i.due, t) + '前' : '') + '</div></div><button class="btn sm" data-act="conflict" data-id="' + i.id + '">三个选择</button><button class="btn sm" data-act="manual" data-id="' + i.id + '">手动放</button></div>').join('') : '<div class="card muted small">没有排不下的事。</div>';

    // 收件箱
    const inbox = st.items.filter((i) => i.status === 'inbox');
    h += '<h2>收件箱<span class="aux">解析不干净的先放这里,不阻塞任何事</span></h2>';
    h += inbox.length ? inbox.map((i) => '<div class="card"><div class="row between"><div class="grow"><b>' + esc(i.short) + '</b> <span class="chip">待澄清</span><div class="small muted">' + esc(i.raw || '') + '</div></div><button class="btn sm ghost" data-act="inbox-del" data-id="' + i.id + '">删除</button></div>' +
      '<div class="row" style="margin-top:8px;gap:8px"><input type="text" id="ib' + i.id + '" placeholder="补一句,例如:周五下午,一小时"><button class="btn sm pri" data-act="inbox-go" data-id="' + i.id + '">排进日程</button></div></div>').join('') : '<div class="card muted small">收件箱是空的。</div>';

    const sub = fmtMD(ws) + ' – ' + fmtMD(C.addDays(ws, 6));
    return { top: A.topbar('计划', sub), banners: A.banners(), html: h, after: initDrag };
  };

  /* —— 拖拽:实时显示代价(计划页周视图 + 今天页时间轴;长按移动,拖底边改结束时间) —— */
  let D = null, winBound = false;
  function initDrag() {
    const root = $('.wk') || $('.tl-grid'); if (!root) return;
    const isWk = /(^|\s)wk(\s|$)/.test(String(root.className || ''));
    const msgEl = () => { let m = $('.dragmsg'); if (!m) { m = document.createElement('div'); m.className = 'dragmsg'; document.body.appendChild(m); } return m; };
    const cleanMsg = () => { const m = $('.dragmsg'); m && m.remove(); };
    const SNAP = 5;
    const cols = () => (isWk ? [...D.root.querySelectorAll('.wk-col')] : [D.root]);
    const geo = () => ({ a: +D.root.dataset.a, z: +D.root.dataset.z, ppm: +D.root.dataset.ppm });
    const target = (cx, cy) => {
      const cs = cols(); let col = null;
      for (const c of cs) { const r = c.getBoundingClientRect(); if (cx >= r.left && cx < r.right) { col = c; break; } }
      if (!col) col = cs.reduce((best, c) => { const r = c.getBoundingClientRect(); const dd = Math.abs(cx - (r.left + r.right) / 2); return !best || dd < best.dd ? { c, dd } : best; }, null).c;
      const r = col.getBoundingClientRect(), g = geo();
      let min = (cy - r.top - D.grab) / g.ppm + g.a; min = Math.round(min / SNAP) * SNAP;
      min = Math.max(g.a, Math.min(g.z - D.dur, min));
      return { col, day: +col.dataset.col, start: +col.dataset.col + min * MIN, r };
    };
    const begin = (e, el, resize) => {
      const b = A.st.blocks.find((x) => x.id === el.dataset.id); if (!b) return null;
      const rect = el.getBoundingClientRect(), touch = e.pointerType ? e.pointerType !== 'mouse' : true;
      return { root, id: b.id, el, b, x0: e.clientX, y0: e.clientY, grab: e.clientY - rect.top, dur: C.bmin(b), active: false, touch, rect0: rect, resize, scroll0: 0, edge: 0 };
    };
    const activate = () => {
      if (!D || D.active) return;
      if (D.b.kind === 'commit' || D.b.done) { A.toast(D.b.done ? '已完成的块不能拖动。' : '承诺块是别人的时间,不能拖动。'); endDrag(); return; }
      D.active = true; D.el.classList.add('drag'); document.documentElement.classList.add('dragging');
      if (navigator.vibrate) navigator.vibrate(10);
      D.el.style.transition = 'none'; D.sy = window.scrollY; D.autoRaf = requestAnimationFrame(autoScroll);
    };
    const autoScroll = () => {
      if (!D || !D.active) return;
      if (D.edge) { window.scrollBy(0, D.edge); if (D.last) update(D.last.x, D.last.y); }
      D.autoRaf = requestAnimationFrame(autoScroll);
    };
    const update = (cx, cy) => {
      D.last = { x: cx, y: cy };
      const g = geo(), dxs = cx - D.x0, dys = cy - D.y0 + (window.scrollY - D.sy);
      const m = msgEl();
      if (D.resize) {
        const r = (isWk ? D.el.parentNode : D.root).getBoundingClientRect();
        const sMin = (D.b.start - C.dayStart(D.b.start)) / MIN;
        let em = (cy - r.top) / g.ppm + g.a; em = Math.round(em / SNAP) * SNAP; em = Math.max(sMin + 15, Math.min(g.z, em));
        D.newEnd = C.dayStart(D.b.start) + em * MIN;
        D.el.style.height = Math.max((em - sMin) * g.ppm - 2, 22) + 'px';
        const clash = A.st.blocks.find((x) => x.id !== D.b.id && !x.skipped && x.kind !== 'free' && x.start < D.newEnd && x.end > D.b.start);
        m.className = 'dragmsg' + (clash ? ' bad' : ''); m.textContent = hmm(D.b.start) + ' – ' + hmm(D.newEnd) + ' · ' + C.fmtDur(Math.round((D.newEnd - D.b.start) / MIN)) + (clash ? ' · 与「' + clash.title + '」重叠' : '');
      } else {
        D.el.style.transform = 'translate(' + dxs + 'px,' + dys + 'px) scale(1.03)';
        const tg = target(cx, cy), cost = C.dragCost(A.st, D.b, tg.start, now());
        D.tg = tg; D.cost = cost;
        m.className = 'dragmsg' + (cost.ok ? '' : ' bad');
        m.textContent = C.WD[C.dow(tg.day)] + ' ' + hmm(tg.start) + '–' + hmm(tg.start + D.dur * MIN) + ' · ' + (cost.ok ? '没有额外代价' : cost.msgs.join(';'));
      }
      const H = window.innerHeight; D.edge = cy < 110 ? -Math.ceil((110 - cy) / 8) : cy > H - 130 ? Math.ceil((cy - (H - 130)) / 8) : 0;
    };
    function endDrag() { if (!D) return; clearTimeout(D.timer); cancelAnimationFrame(D.autoRaf); document.documentElement.classList.remove('dragging'); D = null; cleanMsg(); }
    const finish = (cancel) => {
      if (!D) return; const d = D; endDrag();
      if (!d.active) return;
      A._dragged = true; setTimeout(() => (A._dragged = false), 400);
      if (cancel) { A.render(); return; }
      if (d.resize) {
        if (d.newEnd && d.newEnd !== d.b.end) {
          const clash = A.st.blocks.find((x) => x.id !== d.b.id && !x.skipped && x.kind !== 'free' && x.start < d.newEnd && x.end > d.b.start);
          A.mutate(() => { d.b.end = d.newEnd; d.b.locked = true; });
          A.toast('已改为 ' + hmm(d.b.start) + '–' + hmm(d.newEnd) + (clash ? ',但与「' + clash.title + '」重叠了' : '') + '。');
        } else A.render();
      } else if (d.tg && d.tg.start !== d.b.start) A.mutate(() => C.moveBlock(A.st, d.id, d.tg.start), '已移到 ' + C.WD[C.dow(d.tg.day)] + ' ' + hmm(d.tg.start) + '。这一块之后不会被自动重排' + (d.cost && d.cost.msgs.length ? '(' + d.cost.msgs.join(';') + ')' : ''));
      else A.render();
    };
    /* 触摸:用 touch 事件驱动(pointer 事件在触摸滚动时会被浏览器取消);鼠标/笔:pointer 事件 */
    const hit = (e) => { const t = e.target; if (!t.closest) return null; const rz = t.closest('.rz'), el = t.closest('.blk'); return el && root.contains(el) ? { el, resize: !!rz } : null; };
    root.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('.blk')) e.preventDefault(); });
    root.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) { endDrag(); return; }
      const h = hit(e); if (!h) return; const t = e.touches[0];
      D = begin({ clientX: t.clientX, clientY: t.clientY, pointerType: 'touch' }, h.el, h.resize); if (!D) return;
      if (h.resize) activate(); else D.timer = setTimeout(activate, 280);
    }, { passive: true });
    root.addEventListener('mousedown', (e) => {
      if (e.button > 0) return; const h = hit(e); if (!h) return;
      D = begin({ clientX: e.clientX, clientY: e.clientY, pointerType: 'mouse' }, h.el, h.resize); if (D && h.resize) activate();
    });
    if (!winBound) {
      winBound = true;
      G.addEventListener('touchmove', (e) => {
        if (!D || !D.touch) return; const t = e.touches[0];
        if (!D.active) { if (Math.hypot(t.clientX - D.x0, t.clientY - D.y0) > 9) endDrag(); return; }
        if (e.cancelable) e.preventDefault(); update(t.clientX, t.clientY);
      }, { passive: false });
      G.addEventListener('touchend', () => { if (D && D.touch) finish(false); });
      G.addEventListener('touchcancel', () => { if (D && D.touch) finish(true); });
      G.addEventListener('mousemove', (e) => {
        if (!D || D.touch) return;
        if (!D.active) { if (Math.hypot(e.clientX - D.x0, e.clientY - D.y0) > 7) activate(); return; }
        e.preventDefault(); update(e.clientX, e.clientY);
      });
      G.addEventListener('mouseup', () => { if (D && !D.touch) finish(false); });
    }
  }

  A.initDrag = initDrag;
  A.promoteInbox = (id, extra) => {
    const it = C.itemOf(A.st, id); if (!it) return;
    A.mutate(() => {
      const text = (it.raw || it.short) + (extra ? ' ' + extra : '');
      const r = C.parse(text, A.st, now()); let d = r.items[0];
      const keep = it.raw; C.removeItem(A.st, id);
      if (!d) d = Object.assign({}, it, { status: 'planned', unclear: false });
      d.status = 'planned'; d.unclear = false; d.raw = keep || text;
      const added = C.addItems(A.st, [d], now());
      A.lastPlan = C.plan(A.st, now(), 'inc');
    }, '已排进日程');
    if (A.lastPlan && A.lastPlan.conflicts.length) setTimeout(() => A.conflictSheet(A.lastPlan.conflicts[0].itemId), 200);
  };
  A.manualSheet = (id) => {
    const it = C.itemOf(A.st, id); if (!it) return;
    const d = new Date(Math.max(now(), C.dayStart(now()) + S().dayStart * MIN)); d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    A.sheet('<h3>手动放置「' + esc(it.short) + '」</h3><div class="lead">你自己选时间,系统不会再动它。</div><input type="datetime-local" id="manDt" value="' + A.dateVal(d.getTime()) + 'T' + A.timeVal(d.getTime()) + '"><button class="btn pri" style="width:100%;margin-top:12px" data-act="manual-ok" data-id="' + id + '">放在这里</button>');
  };

  /* ================= 领域 ================= */
  function ring(k, w, q) {
    const dom = DOMAINS[k], used = w.done + w.plan, R = 46, circ = 2 * Math.PI * R, p = Math.min(1, used / q.b);
    const under = q.lo && used < q.lo, over = q.hi && used > q.hi, sw = over ? 13 : 8, rem = Math.max(0, q.b - used);
    return '<div class="ringc" data-act="quota" data-k="' + k + '" role="button" tabindex="0"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="' + R + '" fill="none" stroke="var(--rule2)" stroke-width="8"/>' +
      (under ? '<circle cx="60" cy="60" r="55" fill="none" stroke="' + dom.color + '" stroke-width="1.6" stroke-dasharray="3 5" opacity=".7"/>' : '') +
      '<circle cx="60" cy="60" r="' + R + '" fill="none" stroke="' + dom.color + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-dasharray="' + (circ * p) + ' ' + circ + '" transform="rotate(-90 60 60)" opacity="' + (under ? .6 : 1) + '"/>' +
      '<text x="60" y="61" text-anchor="middle" font-size="25" font-weight="700" fill="var(--ink)">' + (Math.round(rem / 6) / 10) + '</text><text x="60" y="78" text-anchor="middle" font-size="11" fill="var(--ink3)">小时可用</text></svg>' +
      '<div class="nm"><i class="dot" style="background:' + dom.color + '"></i> ' + dom.name + '</div><div class="st">本周 ' + C.fmtH(used) + ' / 预算 ' + C.fmtH(q.b) + '</div>' +
      (under ? '<div class="gap"><button class="btn sm" data-act="topup" data-k="' + k + '" data-m="' + Math.ceil((q.lo - used) / 15) * 15 + '">补 ' + C.fmtDur(Math.ceil((q.lo - used) / 15) * 15) + '</button></div>' : over ? '<div class="st" style="margin-top:6px">超过上限,有点失衡</div>' : '') + '</div>';
  }
  A.viewLife = () => {
    const st = A.st, t = now(), ws = C.weekStart(t), dw = C.domainWeek(st, ws), q = S().quotas;
    let h = '<div class="rings">' + DOMAIN_KEYS.map((k) => ring(k, dw[k], q[k])).join('') + '</div>';
    h += '<div class="faint tiny" style="margin:8px 2px">环内是本周剩余可用小时。外圈虚线 = 欠配(低于下限);环变粗 = 超过上限。这不是考核,是让你看见。</div>';
    const bi = C.balanceIndex(st, ws, t), w = C.weekStats(st, ws, t);
    let qa = 0, qn = 0; DOMAIN_KEYS.forEach((k) => { if (q[k].lo) { qa += Math.min(1, (dw[k].done + dw[k].plan) / q[k].lo); qn++; } });
    let used = 0; let wm = 0; for (let k = 0; k < 7; k++) wm += C.winMinutes(S(), C.addDays(ws, k)) / 7; Object.keys(w.dayL).forEach((k) => (used += w.dayL[k]));
    const plans = st.log.filter((l) => l.kind === 'plan' && l.total > 0), stab = plans.length ? 1 - plans.reduce((a, l) => a + l.changed / l.total, 0) / plans.length : 1;
    const bar = (n, v) => '<div><span>' + n + '</span><i><b style="width:' + Math.round(Math.max(0, Math.min(1, v)) * 100) + '%"></b></i></div>';
    h += '<h2>生活平衡指数</h2><div class="card score"><div class="big">' + bi + '</div><div class="bars">' + bar('配额达成', qn ? qa / qn : 1) + bar('深度工作', w.deepShare / 0.3) + bar('留白充足', (1 - used / (wm * 7)) / S().freeRatio) + bar('计划稳定', stab) + '</div></div><div class="faint tiny" style="margin:6px 2px">不是 KPI,也不排名。只有连续两周下降时,系统才会说一句「最近有点偏」。</div>';

    // 节律热力图
    const grid = {}; st.blocks.forEach((b) => { if (b.skipped || b.kind === 'free' || b.missed) return; const d = new Date(b.start); const k = C.dow(b.start) + ':' + d.getHours(); grid[k] = (grid[k] || 0) + Math.min(60, C.bmin(b)); });
    let hm = '<div class="heat"><div></div>' + C.WD.map((x) => '<div style="text-align:center">' + x.slice(1) + '</div>').join('');
    const vr = C.viewRange(S());
    for (let hr = Math.floor(vr[0] / 60); hr < Math.ceil(vr[1] / 60); hr++) {
      hm += '<div>' + hr + '</div>';
      for (let d = 0; d < 7; d++) { const v = Math.min(1, (grid[d + ':' + hr] || 0) / 90); hm += '<div class="c" style="background:' + (v ? 'color-mix(in srgb, var(--now) ' + Math.round(14 + v * 70) + '%, var(--rule2))' : '') + '"></div>'; }
    }
    h += '<h2>节律视图<span class="aux">你一天的「形状」</span></h2><div class="card">' + hm + '</div></div>';

    // 习惯
    const T0 = st.settings.term, wn0 = T0 ? C.weekNo(st, t) : null, rts = st.habits.filter((x) => x.routine);
    h += '<h2>固定周程 / 课表<span class="aux">每周自动出现,法定节假日自动停课</span></h2><div class="card">' +
      '<div class="row between" style="margin-bottom:6px"><div class="small muted grow">' + (T0 ? '学期:第 1 周从 ' + fmtMD(T0.start) + ' 起,今天是第 ' + wn0 + ' 周' + (T0.weeks ? '(共 ' + T0.weeks + ' 周)' : '') : '还没设置学期。课表里的「第几周 / 单双周」需要它。') + '</div><button class="btn sm" data-act="term-open">' + (T0 ? '修改' : '设置') + '</button></div>' +
      (rts.length ? (() => {                                  // 同一门课每周有几个时间,就在同一个标题下列出几行
        const by = {}; rts.forEach((x) => { (by[x.title] = by[x.title] || []).push(x); });
        let last = 0; st.blocks.forEach((b) => { if (b.routineId && !b.skipped && b.start > last) last = b.start; });
        return Object.keys(by).map((k) => '<div class="hab" style="align-items:flex-start"><i class="dot" style="background:' + DOMAINS[by[k][0].domain].color + ';margin-top:7px"></i><div class="grow"><b>' + esc(k) + '</b>' + by[k].map((x) => '<div class="row" style="gap:8px;margin-top:4px"><div class="small muted grow">' + esc(C.routineLabel(x)) + ((x.ex || []).length ? ' · ' + x.ex.length + ' 次例外' : '') + (x.paused ? ' · 已暂停' : '') + '</div><button class="btn sm" data-act="rt-open" data-id="' + x.id + '">管理</button></div>').join('') + '</div></div>').join('') +
          (last ? '<div class="small faint" style="margin-top:8px">已生成到 ' + fmtMD(last) + (T0 && T0.weeks ? '(学期共 ' + T0.weeks + ' 周)' : '') + ';翻到更晚的日期会自动补齐。</div>' : '');
      })() : '<div class="muted small">还没有。点下面导入课表,或对助手说「每周一三五 8 点到 9 点40 上高数,教二 301」。</div>') +
      '<div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn sm pri" data-act="tt-open">导入课表(拍照 / 截图)</button><button class="btn sm" data-act="rt-new">手动添加</button></div></div>';
    const hbs = st.habits.filter((x) => !x.routine);
    h += '<h2>习惯与周期<span class="aux">自动占位,优先级高于普通事务</span></h2><div class="card">' +
      (hbs.length ? hbs.map((x) => {
        const dn = C.habitLabel(x);
        return '<div class="hab"><i class="dot" style="background:' + DOMAINS[x.domain].color + '"></i><div class="grow"><b>' + esc(x.title) + '</b><div class="small muted">' + dn + ' · ' + C.fmtDur(x.dur) + (x.paused ? ' · 已暂停' : '') + '</div></div><button class="btn sm" data-act="hab-edit" data-id="' + x.id + '">编辑</button><button class="btn sm ghost" data-act="hab-pause" data-id="' + x.id + '">' + (x.paused ? '恢复' : '暂停') + '</button></div>';
      }).join('') : '<div class="muted small">还没有习惯。在下方输入「每周三次健身,一小时」或「每月 15 号还信用卡」。</div>') + '</div>';
    return { top: A.topbar('生活账本', '六个面,各有各的时间预算'), banners: '', html: h };
  };

  /* ================= 回顾 ================= */
  A.viewReview = () => {
    const st = A.st, t = now(), ws = C.weekStart(t), w = C.weekStats(st, ws, t), ins = C.insights(st, t);
    let h = '';
    if (!S().aiOn) h += '<div class="banner calm">AI 洞察已关闭。系统目前只是一个普通日历。</div>';
    h += '<div class="ins" id="ins">' + ins.map((x, i) => '<section class="card ic"><div class="k">' + esc(x.title) + '</div><div class="tx">' + esc(x.text) + '</div>' + (x.effect ? '<div class="ef">' + esc(x.effect) + '</div>' : '') +
      (x.action ? '<button class="btn pri tail" data-act="apply" data-i="' + i + '">应用</button>' : '') + '</section>').join('') + '</div>';
    h += '<div class="dots" id="dots">' + ins.map((_, i) => '<i class="' + (i ? '' : 'on') + '"></i>').join('') + '</div>';
    h += '<div class="row" style="margin-top:14px;gap:8px"><button class="btn pri" data-act="ritual">开始周回顾(15 分钟)</button><button class="btn" data-act="copy-week">复制本周总结</button>' + (st.meta.undoInsight ? '<button class="btn" data-act="undo-insight">撤销上次应用</button>' : '') + '</div>';

    h += '<h2>问问时序<span class="aux">基于你自己的日程数据回答</span></h2><div class="card"><div class="askcard"><input type="text" id="askIn" placeholder="我为什么这周这么累?" enterkeyhint="send"><button class="btn pri" data-act="ask">问</button></div><div class="suggest">' +
      ['我为什么这周这么累?', '下周哪天最容易排爆?', '我的会议占了多少时间?', '哪些事被我反复推迟了?'].map((q) => '<button class="chip" data-act="ask-q" data-q="' + q + '">' + q + '</button>').join('') + '</div></div>';
    // 北极星
    const rate = w.rate, band = rate == null ? '' : rate < 0.5 ? '偏低:排得太满或估得太乐观' : rate > 0.85 ? '偏高:排得有点松' : rate >= 0.65 ? '健康' : '尚可,继续观察';
    const e = st.stats.edits || { n: 0, total: 0 };
    h += '<h2>周计划执行率<span class="aux">北极星指标,健康值 ≥ 65%</span></h2><div class="card"><div class="row between"><div><span class="num" style="font-size:40px">' + (rate == null ? '—' : Math.round(rate * 100) + '%') + '</span> <span class="muted">' + band + '</span></div><div class="small muted" style="text-align:right">' + w.done + ' / ' + w.total + ' 块<br>回执修改率 ' + (e.total ? Math.round(e.n / e.total * 100) + '%' : '—') + '</div></div></div>';

    h += '<h2>近四周执行率</h2><div class="card"><div class="trend">' + [3, 2, 1, 0].map((k) => { const r2 = C.weekStats(st, C.addDays(ws, -7 * k), t).rate; return '<div class="c"><b>' + (r2 == null ? '—' : Math.round(r2 * 100) + '%') + '</b><i style="height:' + (r2 == null ? 4 : Math.max(4, Math.round(r2 * 60))) + 'px"></i><span>' + (k ? k + ' 周前' : '本周') + '</span></div>'; }).join('') + '</div></div>';
    // 时间账本
    h += '<h2>时间账本<span class="aux">最近 14 天实际投入</span></h2><div class="card">';
    let any = false, rows = '';
    for (let k = 0; k < 14; k++) {
      const d = C.addDays(C.dayStart(t), -k), per = {}; let tot = 0;
      st.blocks.forEach((b) => { if (b.done && b.start >= d && b.start < d + DAY) { const m = b.actual || C.bmin(b); per[b.domain] = (per[b.domain] || 0) + m; tot += m; } });
      if (tot) any = true;
      rows += '<div class="led"><span class="muted">' + (k === 0 ? '今天' : fmtMD(d).replace('月', '/').replace('日', '')) + '</span><div class="stk">' + DOMAIN_KEYS.map((x) => per[x] ? '<i style="width:' + Math.min(100, per[x] / 600 * 100) + '%;background:' + DOMAINS[x].color + '"></i>' : '').join('') + '</div><span class="muted" style="text-align:right">' + (tot ? C.fmtH(tot) : '—') + '</span></div>';
    }
    h += any ? rows : '<div class="muted small">完成第一个块后,这里就会长出你的时间去向。</div>'; h += '</div>';
    return { top: A.topbar('回顾', '看安排,不评判人'), banners: '', html: h, after: () => { const el = $('#ins'); if (el) el.addEventListener('scroll', () => { const i = Math.round(el.scrollLeft / (el.firstChild.offsetWidth + 12)); document.querySelectorAll('#dots i').forEach((d, j) => d.classList.toggle('on', i === j)); }, { passive: true }); } };
  };

  /* ================= 每日仪式 ================= */
  A.morning = () => {
    const t = now(), d0 = C.dayStart(t), bl = A.dayBlocks(d0).filter((b) => !b.done && b.end > t);
    const heavy = bl.filter((b) => b.itemId && b.kind !== 'commit').sort((a, b) => (a.prio - b.prio) || (C.bmin(b) - C.bmin(a)))[0];
    const prep = bl.map((b) => ({ b, it: b.itemId ? C.itemOf(A.st, b.itemId) : null })).filter((x) => x.it && x.it.lead).slice(0, 4);
    A.sheet('<h3>早上好</h3><div class="lead">60 秒,看完就走。</div>' +
      (bl.length ? '<div class="card"><div class="small muted">今天</div><div class="num" style="font-size:22px">' + bl.length + ' 件事</div></div>' +
        (heavy ? '<div class="card"><div class="small muted">最重的一件</div><b>' + esc(heavy.title) + '</b> · ' + hmm(heavy.start) + ' · ' + C.fmtDur(C.bmin(heavy)) + '</div>' : '') +
        '<div class="card"><div class="small muted">第一个块</div><b>' + esc(bl[0].title) + '</b> · ' + hmm(bl[0].start) + '</div>' +
        (prep.length ? '<div class="card"><div class="small muted">需要提前准备</div>' + prep.map((x) => '<div>' + esc(x.b.title) + ' · 提前 ' + (x.it.lead >= 1440 ? Math.round(x.it.lead / 1440) + ' 天' : x.it.lead + ' 分钟') + '</div>').join('') + '</div>' : '') : '<div class="card muted">今天没有安排。想做的事说一句就行。</div>') +
      '<button class="btn pri" style="width:100%;margin-top:12px" data-act="close">开始今天</button>');
  };
  A.evening = () => {
    const t = now(), d0 = C.dayStart(t), all = A.dayBlocks(d0).filter((b) => b.kind !== 'commit');
    const done = all.filter((b) => b.done).length;
    const open = A.st.blocks.filter((b) => !b.done && !b.skipped && b.itemId && b.kind !== 'commit' && (b.missed || (b.start >= d0 && b.start < d0 + DAY && b.end <= t + 3 * 3600e3)) && b.start < d0 + DAY).slice(0, 8);
    const tmr = A.dayBlocks(C.addDays(d0, 1)).filter((b) => b.itemId && b.kind !== 'commit');
    A.sheet('<h3>今天收个尾</h3><div class="lead">完成 ' + done + ' / ' + all.length + ' 件。没做完是排程的问题,不是你的问题。</div>' +
      (open.length ? '<div class="small muted" style="margin-bottom:6px">没做完的 ' + open.length + ' 件,怎么处理?</div>' + open.map((b) => '<div class="card"><b>' + esc(b.title) + '</b> <span class="small muted">' + C.dayLabel(b.start, t) + ' ' + hmm(b.start) + '</span><div class="chips" style="margin-top:8px"><button class="chip" data-act="ev-res" data-id="' + b.id + '" data-k="tomorrow">明天</button><button class="chip" data-act="ev-res" data-id="' + b.id + '" data-k="week">本周内</button><button class="chip" data-act="ev-res" data-id="' + b.id + '" data-k="drop">放弃</button></div></div>').join('') : '<div class="card muted">没有遗留。</div>') +
      '<div class="small muted" style="margin:14px 0 6px">给明天定三个重点(最多选 3 个)</div>' +
      (tmr.length ? '<div class="chips">' + tmr.map((b) => '<button class="chip" data-act="star" data-id="' + b.id + '" aria-pressed="' + (!!b.star) + '">' + esc(b.title) + '</button>').join('') + '</div>' : '<div class="muted small">明天还没有可选的事项。</div>') +
      '<button class="btn pri" style="width:100%;margin-top:14px" data-act="close">好了,晚安</button>');
  };

  const RS = (A.RS = { n: 0, picks: new Set() });
  A.ritual = (n) => {
    RS.n = n == null ? 0 : n; const st = A.st, t = now(), ws = C.weekStart(t), w = C.weekStats(st, ws, t), ins = C.insights(st, t).filter((x) => x.action), dw = C.domainWeek(st, ws), q = S().quotas;
    const steps = ['看结果', '看偏差', '看节奏', '做调整', '定重点']; let body = '';
    if (RS.n === 0) body = '<div class="card"><div class="small muted">本周执行率</div><div class="num" style="font-size:34px">' + (w.rate == null ? '—' : Math.round(w.rate * 100) + '%') + '</div><div class="small muted">' + w.done + ' / ' + w.total + ' 个块</div></div>' +
      '<div class="card">' + DOMAIN_KEYS.map((k) => '<div class="row between" style="padding:3px 0"><span><i class="dot" style="background:' + DOMAINS[k].color + '"></i> ' + DOMAINS[k].name + '</span><span class="muted">' + C.fmtH(dw[k].done + dw[k].plan) + ' / ' + C.fmtH(q[k].b) + '</span></div>').join('') + '</div>';
    if (RS.n === 1) body = w.postponed.length ? w.postponed.map((i) => '<div class="card"><b>' + esc(i.short) + '</b><div class="small muted">被顺延 ' + i.postponed + ' 次。是太难、太大,还是其实不重要?</div></div>').join('') : '<div class="card muted">没有反复被推迟的事。</div>';
    if (RS.n === 2) body = w.worst ? '<div class="card"><div class="small muted">最满的一天</div><div class="num" style="font-size:24px">' + C.WD[C.dow(w.worst.day)] + ' · ' + C.fmtH(w.worst.load) + '</div><div class="small muted">容量 ' + C.fmtH(C.dayCap(S(), w.worst.day)) + '。' + (w.worst.load > C.dayCap(S(), w.worst.day) ? '超出了留白底线,下周提前挪一部分。' : '在可承受范围内。') + '</div></div>' : '<div class="card muted">数据还不够。</div>';
    if (RS.n === 3) body = ins.length ? ins.map((x, i) => '<label class="card row" style="gap:12px"><input type="checkbox" data-pick="' + i + '" ' + (RS.picks.has(x.id) ? 'checked' : '') + ' style="width:20px;height:20px;min-height:0"><span class="grow"><b>' + esc(x.title) + '</b><div class="small muted">' + esc(x.effect) + '</div></span></label>').join('') : '<div class="card muted">这周没有需要改的规则。</div>';
    if (RS.n === 4) body = '<div class="lead">下周最重要的三件事,直接排进日程:</div>' + [0, 1, 2].map((i) => '<input type="text" class="rt" placeholder="第 ' + (i + 1) + ' 件,例如:周三前把预算表做完" style="margin-top:8px">').join('');
    A.sheet('<h3>周回顾 · ' + steps[RS.n] + '</h3><div class="lead">第 ' + (RS.n + 1) + ' / 5 步</div>' + body +
      '<div class="row" style="margin-top:14px;gap:8px">' + (RS.n ? '<button class="btn" data-act="rit" data-v="-1">上一步</button>' : '') + '<span class="grow"></span><button class="btn pri" data-act="rit" data-v="1">' + (RS.n === 4 ? '完成' : '下一步') + '</button></div>');
    A._ritIns = ins;
  };

  /* ================= 设置 ================= */
  A.settings = () => {
    const s = S(), tv = (m) => C.fmtM(m);
    const sw2 = (k, label, sub) => { const on = k === 'wknd' ? s.wknd.on : s.commute.on; return '<div class="switch"><div><b>' + label + '</b><div class="small muted">' + sub + '</div></div><input type="checkbox" data-set="' + k + '" ' + (on ? 'checked' : '') + ' style="width:22px;height:22px;min-height:0"></div>'; };
    const sw = (k, label, sub) => '<div class="switch"><div><b>' + label + '</b><div class="small muted">' + sub + '</div></div><input type="checkbox" data-set="' + k + '" ' + (s[k] ? 'checked' : '') + ' style="width:22px;height:22px;min-height:0"></div>';
    const standalone = G.matchMedia && G.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    A.sheet('<h3>设置</h3><div class="lead">所有数据只存在这台设备上。</div>' +
      '<label class="field">液态玻璃</label><div class="row" style="gap:10px"><span class="small muted">通透</span><input type="range" min="0" max="1" step="0.05" data-set="glass" value="' + (s.glass == null ? 0.5 : s.glass) + '" class="grow" aria-label="玻璃透明度"><span class="small muted">磨砂</span></div>' +
      '<label class="field">起床 / 开始可用</label><input type="time" data-set="dayStart" value="' + tv(s.dayStart) + '">' +
      '<label class="field">睡觉 / 结束可用(睡眠是硬约束)</label><input type="time" data-set="dayEnd" value="' + tv(s.dayEnd) + '">' +
      '<label class="field">高精力时段(深度任务优先排这里)</label><div class="row"><input type="time" data-set="peak0" value="' + tv(s.peak[0]) + '"><input type="time" data-set="peak1" value="' + tv(s.peak[1]) + '"></div>' +
      '<label class="field">默认留白比例(最低 10%,不能为 0)</label><select data-set="freeRatio">' + [0.1, 0.15, 0.2, 0.25, 0.3, 0.4].map((v) => '<option value="' + v + '" ' + (Math.abs(s.freeRatio - v) < 0.001 ? 'selected' : '') + '>' + Math.round(v * 100) + '%</option>').join('') + '</select>' +
      '<label class="field">任务之间的缓冲</label><select data-set="buffer">' + [5, 10, 15, 20, 30].map((v) => '<option value="' + v + '" ' + (s.buffer === v ? 'selected' : '') + '>' + v + ' 分钟</option>').join('') + '</select>' +
      '<div class="switch"><div><b>长期事项的持续提醒</b><div class="small muted">每天固定时间合并成一条通知;没做不会累计</div></div><input type="checkbox" data-set="ltOn" ' + (s.ltRemind && s.ltRemind.on ? 'checked' : '') + '></div>' + (s.ltRemind && s.ltRemind.on ? '<div class="row" style="gap:8px;padding:6px 0"><span class="small muted">提醒时间</span><input type="time" data-set="ltTime" value="' + tv(s.ltRemind.time) + '"><label class="small muted row" style="gap:6px"><input type="checkbox" data-set="ltEve" ' + (s.ltRemind.evening ? 'checked' : '') + '>晚上 8 点再提醒一次</label></div>' : '') +
      sw('holidayAvoid', '法定节假日不排工作事项', '自动标注放假与调休补班;补班日按工作日处理') + sw('lunchOn', '保留午休', (s.lunchOn ? tv(s.lunch[0]) + '–' + tv(s.lunch[1]) : '关闭后这段时间也可以排事项') + ',不排任务') + (s.lunchOn ? '<div class="row" style="gap:8px;padding:8px 0 4px"><span class="small muted">午休从</span><input type="time" data-set="lunchA" value="' + tv(s.lunch[0]) + '"><span class="small muted">到</span><input type="time" data-set="lunchB" value="' + tv(s.lunch[1]) + '"></div>' : '') + sw('aiOn', 'AI 自动排程与洞察', '关闭后退化成普通日历,事项需手动放置') + sw('notify', '到点提醒', '预告 / 15 分钟前 / 准点,每天最多 8 次') +
      sw2('wknd', '周末用不同的可用时段', C.fmtM(s.wknd.start) + '–' + C.fmtM(s.wknd.end)) + (s.wknd.on ? '<div class="row"><input type="time" data-set="wkStart" value="' + tv(s.wknd.start) + '"><input type="time" data-set="wkEnd" value="' + tv(s.wknd.end) + '"></div>' : '') +
      sw2('commute', '工作日通勤(硬约束)', '早 ' + s.commute.am + ' 分钟,晚 ' + s.commute.pm + ' 分钟,不排任务') + (s.commute.on ? '<div class="row"><select data-set="comAm">' + [15, 30, 45, 60, 90].map((v) => '<option value="' + v + '" ' + (s.commute.am === v ? 'selected' : '') + '>早 ' + v + ' 分钟</option>').join('') + '</select><select data-set="comPm">' + [15, 30, 45, 60, 90].map((v) => '<option value="' + v + '" ' + (s.commute.pm === v ? 'selected' : '') + '>晚 ' + v + ' 分钟</option>').join('') + '</select><input type="time" data-set="comPmAt" value="' + tv(s.commute.pmAt) + '"></div>' : '') +
      '<h2 style="margin-top:18px">深度工作保护区</h2>' + ((s.zones || []).length ? s.zones.map((z, i) => '<div class="hab"><div class="grow"><b>' + C.WD[z.dow] + ' ' + C.fmtM(z.start) + '–' + C.fmtM(z.end) + '</b><div class="small muted">这段时间只排深度任务,不排杂事</div></div><button class="btn sm ghost" data-act="zone-del" data-i="' + i + '">删除</button></div>').join('') : '<div class="small muted">还没有。把上午最清醒的整块时间保护起来,杂事就不会挤进来。</div>') +
      '<div class="row" style="margin-top:8px;gap:6px"><select id="zDow" style="flex:1.2">' + C.WD.map((x, i) => '<option value="' + i + '">' + x + '</option>').join('') + '</select><input type="time" id="zA" value="09:00"><input type="time" id="zB" value="12:00"><button class="btn sm" data-act="zone-add">添加</button></div>' +
      '<h2 style="margin-top:18px">休假 / 出差</h2>' + ((s.off || []).length ? s.off.map((o) => '<div class="hab"><div class="grow"><b>' + esc(o.label) + '</b><div class="small muted">' + C.dayLabel(o.from, now()) + (o.from === o.to ? '' : ' 到 ' + C.dayLabel(o.to, now())) + ' · 不排任务</div></div><button class="btn sm ghost" data-act="away-del" data-id="' + o.id + '">删除</button></div>').join('') : '<div class="small muted">也可以直接说「下周三到周五出差」。</div>') +
      '<div class="row" style="margin-top:8px;gap:6px"><select id="aLab" style="flex:1"><option>出差</option><option>请假</option><option>休假</option><option>旅行</option><option>培训</option></select><input type="date" id="aFrom" style="flex:1.3"><input type="date" id="aTo" style="flex:1.3"><button class="btn sm" data-act="away-add">添加</button></div>' +
      '<h2 style="margin-top:18px">大模型</h2><div class="row between"><div class="small muted grow">' + (A.LLM && A.LLM.ready() ? '已接入:' + esc(A.LLM.getCfg().model) + '。可识别截图、增强文字理解、回答追问。' : '还没有接入。接入后可以识别截图、照片和群消息。') + '</div><button class="btn sm" data-act="llm-open">' + (A.LLM && A.LLM.ready() ? '修改' : '去接入') + '</button></div>' +
      '<div class="row" style="margin-top:14px;gap:8px;flex-wrap:wrap"><button class="btn" data-act="replan">按新设置重新排程</button><button class="btn" data-act="morning">晨间 60 秒</button></div>' +
      '<h2 style="margin-top:20px">数据归你</h2><div class="row" style="flex-wrap:wrap;gap:8px"><button class="btn sm" data-act="ics">导出日历 .ics</button><button class="btn sm" data-act="csv">导出 CSV</button><button class="btn sm" data-act="json">导出 JSON</button><button class="btn sm" data-act="import">导入 JSON</button><button class="btn sm" data-act="import-ics">导入 .ics 日程</button><button class="btn sm warn" data-act="wipe">一键删除全部数据</button></div>' +
      '<h2 style="margin-top:20px">多设备同步</h2>' + (A.Sync ? A.Sync.settingsHtml() : '') + '<h2 style="margin-top:20px">账号与授权</h2>' + (A.Remote ? A.Remote.html() : '') + '<h2 style="margin-top:20px">安装到设备</h2><div class="small muted">' + (standalone ? '已作为应用运行。' : (A._installEvt ? '<button class="btn sm now" data-act="install">安装到这台设备</button><br>' : '') + 'iPhone / iPad:用 Safari 打开 → 分享 → 「添加到主屏幕」。Android / 电脑:浏览器菜单 → 「安装应用」。') + '</div>' +
      '<div class="small faint" style="margin-top:14px">时序 Chrono v1.0 · 本地优先 · 无账号 · 无云端</div>');
  };

  A.setSetting = (k, v) => {
    const s = S();
    A.mutate(() => {
      if (k === 'dayStart' || k === 'dayEnd') { const [h, m] = v.split(':').map(Number); const mm = h * 60 + m; if (k === 'dayStart' && mm < s.dayEnd - 360) s.dayStart = mm; if (k === 'dayEnd' && mm > s.dayStart + 360) s.dayEnd = mm; }
      else if (k === 'peak0' || k === 'peak1') { const [h, m] = v.split(':').map(Number); s.peak[k === 'peak0' ? 0 : 1] = h * 60 + m; }
      else if (k === 'lunchA' || k === 'lunchB') {
        const [h, m] = String(v).split(':').map(Number), mm = h * 60 + m; if (isNaN(mm)) return;
        const a = k === 'lunchA' ? mm : s.lunch[0], b = k === 'lunchB' ? mm : s.lunch[1];
        if (b - a < 15 || a < s.dayStart || b > s.dayEnd) { A.toast('午休至少 15 分钟,并且要在可用时段(' + C.fmtM(s.dayStart) + '–' + C.fmtM(s.dayEnd) + ')之内。'); return; }
        s.lunch = [a, b];
        const t = now(), hit = A.st.blocks.some((x) => !x.skipped && !x.done && !x.started && x.kind !== 'commit' && !C.isPinned(x) && x.start >= t && !x.habitId && C.Holiday !== null && [0, 1].length && (() => { const d0 = C.dayStart(x.start), ls = d0 + a * MIN, le = d0 + b * MIN; return x.start < le && x.end > ls; })());
        if (hit) { A.st.blocks.forEach((x) => { if (!x.skipped && !x.done && !x.started && x.kind !== 'commit' && !C.isPinned(x) && x.start >= t && !x.habitId) { const d0 = C.dayStart(x.start); if (x.start < d0 + b * MIN && x.end > d0 + a * MIN) x.skipped = true; } }); C.plan(A.st, t, 'inc'); }
      }
      else if (k === 'ltOn') s.ltRemind = Object.assign({ time: 540, evening: false }, s.ltRemind, { on: !!v });
      else if (k === 'ltEve') s.ltRemind = Object.assign({ time: 540, on: true }, s.ltRemind, { evening: !!v });
      else if (k === 'ltTime') { const [h, m] = String(v).split(':').map(Number); if (!isNaN(h)) s.ltRemind = Object.assign({ on: true, evening: false }, s.ltRemind, { time: h * 60 + m }); }
      else if (k === 'glass') s.glass = +v;
      else if (k === 'wknd') s.wknd.on = !!v;
      else if (k === 'commute') s.commute.on = !!v;
      else if (k === 'wkStart' || k === 'wkEnd') { const [h, m] = v.split(':').map(Number); s.wknd[k === 'wkStart' ? 'start' : 'end'] = h * 60 + m; }
      else if (k === 'comAm') s.commute.am = +v; else if (k === 'comPm') s.commute.pm = +v;
      else if (k === 'comPmAt') { const [h, m] = v.split(':').map(Number); s.commute.pmAt = h * 60 + m; }
      else if (k === 'freeRatio') s.freeRatio = Math.max(0.1, +v);
      else if (k === 'buffer') s.buffer = +v;
      else if (k === 'notify') { s.notify = !!v; if (v && G.Notification && Notification.permission === 'default') Notification.requestPermission(); }
      else s[k] = !!v;
    });
  };

  /* ================= 数据动作 ================= */
  A.applyInsightIdx = (i) => {
    const x = C.insights(A.st, now())[i]; if (!x || !x.action) return;
    A.mutate(() => {
      A.st.meta.undoInsight = JSON.stringify({ settings: A.st.settings, habits: A.st.habits });
      C.applyInsight(A.st, x.action, now());
    }, '已应用:' + x.effect + '。可在「回顾」里撤销。');
  };
  A.undoInsight = () => {
    const u = A.st.meta.undoInsight; if (!u) return;
    A.mutate(() => { const o = JSON.parse(u); A.st.settings = o.settings; A.st.habits = o.habits; A.st.meta.undoInsight = null; A.st.blocks = A.st.blocks.filter((b) => !b.habitId || o.habits.some((h) => h.id === b.habitId)); C.plan(A.st, now(), 'full'); }, '已撤销上次应用');
  };
  A.replan = () => {
    A.sheet('<h3>重新排程?</h3><div class="lead">只会重算「未来、未锁定、未开始」的块。已开始的、你手动拖过的、标了「不可侵入」的都不会动。</div>' +
      '<button class="btn pri" style="width:100%" data-act="replan-go">重新排程</button><button class="btn ghost" style="width:100%;margin-top:6px" data-act="close">取消</button>');
  };

  /* ================= 编辑事项 ================= */
  A.editSheet = (id) => {
    const it = C.itemOf(A.st, id); if (!it) return;
    const t = now(), dv = A.dateVal, tvv = A.timeVal;
    const others = A.st.items.filter((x) => x.id !== id && x.type === 'task' && x.status === 'planned');
    const dur = [15, 30, 45, 60, 90, 120, 180, 240, 360].concat(it.estMin && ![15, 30, 45, 60, 90, 120, 180, 240, 360].includes(it.estMin) ? [it.estMin] : []).sort((a, b) => a - b);
    let f = '<label class="field">名称</label><input type="text" id="edTitle" value="' + esc(it.title) + '">';
    if (it.type === 'event') f += '<label class="field">开始</label><div class="row"><input type="date" id="edDate" value="' + dv(it.start) + '"><input type="time" id="edTime" value="' + tvv(it.start) + '"></div>';
    if (it.type === 'deadline') f += '<label class="field">到期日</label><input type="date" id="edDue" value="' + dv(it.due) + '">';
    if (it.type === 'task') f += '<label class="field">截止日(可留空)</label><input type="date" id="edDue" value="' + (it.due ? dv(it.due) : '') + '">';
    if (it.type !== 'deadline') f += '<label class="field">时长(自己输入)</label><input type="text" id="edDur" value="' + C.fmtDur(it.estMin) + '" inputmode="text" autocomplete="off" placeholder="例如 50 分钟 / 1.5 小时 / 1:20"><div class="chips" style="margin-top:8px">' + [15, 30, 45, 60, 90, 120, 180, 240].map((m) => '<button class="chip" data-act="ed-dur" data-v="' + m + '">' + C.fmtDur(m).replace(' 分钟', ' 分') + '</button>').join('') + '</div><div class="small faint" style="margin:6px 6px 0">直接写就行:50、90 分钟、1.5 小时、1 小时 20 分、1:30。</div>';
    f += '<label class="field">优先级</label><select id="edPri">' + [[0, 'P0 今天必须'], [1, 'P1 重要'], [2, 'P2 一般'], [3, 'P3 有空再说']].map(([p, n]) => '<option value="' + p + '" ' + (it.priority === p ? 'selected' : '') + '>' + n + '</option>').join('') + '</select>';
    f += '<label class="field">领域</label><select id="edDom">' + DOMAIN_KEYS.map((k) => '<option value="' + k + '" ' + (it.domain === k ? 'selected' : '') + '>' + DOMAINS[k].name + '</option>').join('') + '</select>';
    if (it.type === 'task') f += '<label class="field">必须在这件事之后做</label><select id="edAfter"><option value="">没有前置</option>' + others.map((x) => '<option value="' + x.id + '" ' + (it.after === x.id ? 'selected' : '') + '>' + esc(x.short) + '</option>').join('') + '</select>';
    if (it.type === 'event') f += '<label class="field">会前准备</label><select id="edPrep">' + [0, 15, 30, 45, 60, 90].map((m) => '<option value="' + m + '" ' + ((it.prep || 0) === m ? 'selected' : '') + '>' + (m ? m + ' 分钟' : '不需要') + '</option>').join('') + '</select><label class="field">路上时间</label><select id="edTravel">' + [0, 10, 20, 30, 45, 60, 90].map((m) => '<option value="' + m + '" ' + ((it.travel || 0) === m ? 'selected' : '') + '>' + (m ? m + ' 分钟' : '不需要') + '</option>').join('') + '</select><label class="field">地点</label><input type="text" id="edLoc" value="' + esc(it.loc || '') + '">';
    A.sheet('<h3>编辑</h3><div class="lead">只会重排这一件事,其余不动。</div>' + f + '<button class="btn pri" style="width:100%;margin-top:14px" data-act="edit-save" data-id="' + id + '">保存</button><button class="btn ghost warn" style="width:100%;margin-top:4px" data-act="edit-del" data-id="' + id + '">删除这件事</button>');
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    if (el.dataset.act === 'edit-item') { A.closeSheet(); A.editSheet(el.dataset.id); }
    else if (el.dataset.act === 'edit-save') {
      const id = el.dataset.id, it = C.itemOf(A.st, id); if (!it) return; const g = (i) => { const n = $(i); return n ? n.value : null; };
      const patch = { title: (g('#edTitle') || it.title).trim() || it.title, priority: +g('#edPri'), domain: g('#edDom') };
      if (g('#edDur') != null) { const m = C.parseDurText(g('#edDur')); if (m == null) { A.toast('时长没看懂。试试「90 分钟」「1.5 小时」或「1:30」。'); return; } patch.estMin = m; }
      if (it.type === 'event') { const dd = g('#edDate'), tt = g('#edTime'); if (dd && tt) { const [h, m] = tt.split(':').map(Number); patch.start = A.parseDateVal(dd) + (h * 60 + m) * MIN; patch.end = patch.start + (patch.estMin || it.estMin) * MIN; } patch.prep = +g('#edPrep') || 0; patch.travel = +g('#edTravel') || 0; patch.loc = (g('#edLoc') || '').trim(); }
      if (it.type !== 'event') { const du = g('#edDue'); if (du) patch.due = A.parseDateVal(du) + DAY - 1; else if (it.type === 'task') patch.due = null; }
      if (it.type === 'task') patch.after = g('#edAfter') || null;
      A.closeSheet(); let r;
      A.mutate(() => { r = C.editItem(A.st, id, patch, now()); }, '已更新。其余块未改动。');
      if (r && r.conflicts.length) setTimeout(() => A.conflictSheet(r.conflicts[0].itemId), 250);
    } else if (el.dataset.act === 'import-ics') {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.ics,text/calendar';
      inp.onchange = () => { const f = inp.files[0]; if (!f) return; f.text().then((tx) => { const dr = C.fromICS(tx, now()); const ll = A.LLM ? A.LLM.dedupe(dr, A.st) : { keep: dr, dups: [] }; if (!ll.keep.length) { A.toast('没有可导入的新日程(已过期或已存在)。'); return; } A.closeSheet(); A.rc = { text: '.ics', note: ll.dups.length ? ll.dups.length + ' 项已在日程里,已跳过' : '', cards: ll.keep.map((d) => ({ kind: 'item', d, state: 'pending', edit: false, field: null, edits: 0 })) }; A.drawReceipt(); }); };
      inp.click();
    }
  });

  /* ================= 搜索 ================= */
  const stLabel = (i) => ({ done: '已完成', dropped: '已放弃', inbox: '收件箱' }[i.status] || (i.type === 'deadline' ? '到期点' : i.type === 'event' ? '日程' : '待办'));
  function resultsHtml(q) {
    q = (q || '').trim().toLowerCase(); const t = now();
    let list = A.st.items.filter((i) => !q || (i.title + ' ' + (i.raw || '') + ' ' + (i.loc || '')).toLowerCase().includes(q));
    const nextAt = (i) => { if (i.type === 'event') return i.start; const b = A.st.blocks.filter((x) => x.itemId === i.id && !x.skipped && x.end > t).sort((a, c) => a.start - c.start)[0]; return b ? b.start : i.due || 9e15; };
    list = list.sort((a, b) => (a.status === 'done' || a.status === 'dropped') - (b.status === 'done' || b.status === 'dropped') || nextAt(a) - nextAt(b)).slice(0, 30);
    const hab = A.st.habits.filter((h) => q && h.title.toLowerCase().includes(q));
    if (!list.length && !hab.length) return '<div class="empty" style="padding:18px 0">没有找到' + (q ? '「' + esc(q) + '」' : '事项') + '。</div>';
    return list.map((i) => { const at = nextAt(i); return '<button class="opt" data-act="edit-item" data-id="' + i.id + '" style="--c:' + DOMAINS[i.domain].color + '"><b>' + esc(i.short) + '</b><span>' + stLabel(i) + (at < 9e15 ? ' · ' + C.dayLabel(at, t) + (i.type === 'deadline' ? '' : ' ' + hmm(at)) : '') + ' · ' + DOMAINS[i.domain].name + '</span></button>'; }).join('') +
      hab.map((h) => '<div class="opt"><b>' + esc(h.title) + '</b><span>习惯 · ' + C.habitLabel(h) + '</span></div>').join('');
  }
  A.searchSheet = () => { A.sheet('<h3>搜索</h3><input type="search" id="sq" placeholder="事项名称、地点、原话…" autocomplete="off" style="margin:6px 0 10px"><div id="sres">' + resultsHtml('') + '</div>'); const i = $('#sq'); i && i.focus(); };
  document.addEventListener('input', (e) => { if (e.target.id === 'sq') $('#sres').innerHTML = resultsHtml(e.target.value); });

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return; const a = el.dataset.act, st = A.st, S0 = st.settings;
    if (a === 'search') A.searchSheet();
    else if (a === 'blk-dur') {
      const b = st.blocks.find((x) => x.id === el.dataset.id); if (!b) return; const v = +el.dataset.v, nd = Math.max(15, C.bmin(b) + v);
      const ne = b.start + nd * MIN, clash = st.blocks.find((x) => x.id !== b.id && !x.skipped && x.kind !== 'free' && x.start < ne && x.end > b.start);
      A.mutate(() => { b.end = ne; b.locked = true; }); A.openBlock(b.id);
      if (clash) A.toast('现在与「' + clash.title + '」重叠了。');
    } else if (a === 'blk-time-set') {
      const b = st.blocks.find((x) => x.id === el.dataset.id); if (!b) return;
      const sa = pt2(($('#btA') || {}).value), sb = pt2(($('#btB') || {}).value);
      if (sa == null || sb == null) { A.toast('请选择开始和结束时间。'); return; }
      if (sb - sa < 5) { A.toast('结束时间要晚于开始时间(至少 5 分钟)。'); return; }
      const d0 = C.dayStart(b.start), ns = d0 + sa * MIN, ne = d0 + sb * MIN;
      const clash = st.blocks.find((x) => x.id !== b.id && !x.skipped && x.kind !== 'free' && x.start < ne && x.end > ns);
      A.mutate(() => { b.start = ns; b.end = ne; b.locked = true; b.moved = true; b.why = '你手动设定了时间,系统不会再动它'; }); A.openBlock(b.id);
      A.toast(clash ? '已设为 ' + hmm(ns) + '–' + hmm(ne) + ',但与「' + clash.title + '」重叠了。' : '已设为 ' + hmm(ns) + '–' + hmm(ne) + '。');
    } else if (a === 'blk-shift') {
      const b = st.blocks.find((x) => x.id === el.dataset.id); if (!b) return; const v = +el.dataset.v * MIN;
      const clash = st.blocks.find((x) => x.id !== b.id && !x.skipped && x.kind !== 'free' && x.start < b.end + v && x.end > b.start + v);
      A.mutate(() => { b.start += v; b.end += v; b.locked = true; b.moved = true; b.why = '你手动设定了时间,系统不会再动它'; }); A.openBlock(b.id);
      if (clash) A.toast('现在与「' + clash.title + '」重叠了。');
    } else if (a === 'zone-add') {
      const d = +$('#zDow').value, [h1, m1] = $('#zA').value.split(':').map(Number), [h2, m2] = $('#zB').value.split(':').map(Number), s1 = h1 * 60 + m1, e1 = h2 * 60 + m2;
      if (!(e1 - s1 >= 60)) { A.toast('保护区至少 1 小时。'); return; }
      A.mutate(() => { (S0.zones = S0.zones || []).push({ dow: d, start: s1, end: e1 }); }); A.settings();
    } else if (a === 'zone-del') { A.mutate(() => { S0.zones.splice(+el.dataset.i, 1); }); A.settings(); }
    else if (a === 'away-add') {
      const f = $('#aFrom').value, t2 = $('#aTo').value || f; if (!f) { A.toast('请选择开始日期。'); return; }
      let r; A.mutate(() => { r = C.addAway(st, A.parseDateVal(f), A.parseDateVal(t2), $('#aLab').value, now()); }, null); A.settings();
      A.toast('已标记不可用日' + (r.moved ? ',' + r.moved + ' 个块已让位重排' : ''), { undo: A._lastSnap });
    } else if (a === 'away-del') { A.mutate(() => { C.removeAway(st, el.dataset.id, now()); }); A.settings(); }
    else if (a === 'copy-week') {
      const t = now(), ws = C.weekStart(t), w = C.weekStats(st, ws, t), dw = C.domainWeek(st, ws), q = S0.quotas;
      const lines = ['时序 · 本周总结(' + fmtMD(ws) + ' – ' + fmtMD(C.addDays(ws, 6)) + ')', '执行率:' + (w.rate == null ? '暂无' : Math.round(w.rate * 100) + '%(' + w.done + '/' + w.total + ' 个块)'), '平衡指数:' + C.balanceIndex(st, ws, t), '各领域投入 / 预算:'].concat(DOMAIN_KEYS.map((k) => '  ' + DOMAINS[k].name + ' ' + C.fmtH(dw[k].done + dw[k].plan) + ' / ' + C.fmtH(q[k].b)));
      if (w.worst) lines.push('最满的一天:' + C.WD[C.dow(w.worst.day)] + '(' + C.fmtH(w.worst.load) + ')');
      if (w.postponed.length) lines.push('反复顺延:' + w.postponed.map((i) => i.short + '×' + i.postponed).join('、'));
      (navigator.clipboard ? navigator.clipboard.writeText(lines.join('\n')) : Promise.reject()).then(() => A.toast('已复制本周总结。'), () => A.sheet('<h3>本周总结</h3><div class="card" style="white-space:pre-wrap">' + esc(lines.join('\n')) + '</div>'));
    } else if (a === 'edit-del') {
      const id = el.dataset.id; A.closeSheet(); A.mutate(() => C.removeItem(st, id), '已删除');
    }
  });

  /* ================= 自定义时长 ================= */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return; const a = el.dataset.act;
    if (a === 'ed-dur') { const i = $('#edDur'); if (i) i.value = C.fmtDur(+el.dataset.v); }
    else if (a === 'rc-dur') {
      const i = +el.dataset.i, m = C.parseDurText(($('#rcDur' + i) || {}).value);
      if (m == null) { A.toast('时长没看懂。试试「90 分钟」「1.5 小时」或「1:30」。'); return; }
      A.setCard(i, 'dur', m); A.drawReceipt();
    } else if (a === 'blk-dur-set') {
      const b = A.st.blocks.find((x) => x.id === el.dataset.id), m = C.parseDurText(($('#bdur') || {}).value); if (!b) return;
      if (m == null || m < 5) { A.toast('时长没看懂(至少 5 分钟)。试试「50 分钟」「1.5 小时」。'); return; }
      const ne = b.start + m * MIN, clash = A.st.blocks.find((x) => x.id !== b.id && !x.skipped && x.kind !== 'free' && x.start < ne && x.end > b.start);
      A.mutate(() => { b.end = ne; b.locked = true; }); A.openBlock(b.id);
      A.toast(clash ? '已设为 ' + C.fmtDur(m) + ',但与「' + clash.title + '」重叠了。' : '已设为 ' + C.fmtDur(m) + '。');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return; const t = e.target;
    if (t.id === 'edDur') { e.preventDefault(); const b = document.querySelector('[data-act="edit-save"]'); b && b.click && b.click(); }
    else if (/^rcDur\d+$/.test(t.id || '')) { e.preventDefault(); const b = document.querySelector('[data-act="rc-dur"][data-i="' + t.id.slice(5) + '"]'); b && b.click && b.click(); }
    else if (t.id === 'bdur') { e.preventDefault(); const b = document.querySelector('[data-act="blk-dur-set"]'); b && b.click && b.click(); }
  });

  /* ================= 固定周程管理 / 学期 ================= */
  A.routineSheet = (id, pre) => {
    const h = id ? A.st.habits.find((x) => x.id === id) : null, nw = !h;
    const d = h || Object.assign({ title: '', days: [0], time: 8 * 60, dur: 100, weeks: [], parity: 'all', loc: '', skipHoliday: true, ex: [], domain: 'study' }, pre || {});
    const wk = (d.weeks || []).map((r) => (r[0] === r[1] ? r[0] : r[0] + '-' + r[1])).join(',');
    const t = now();
    A.sheet('<h3>' + (nw ? '添加固定周程' : '管理「' + esc(d.title) + '」') + '</h3><div class="lead">每周自动出现的安排,是硬约束(别人的时间),其他事项会绕开它。同一门课每周有几个不同时间,就各加一条同名的。</div>' +
      '<label class="field">名称</label><input type="text" id="rtTitle" value="' + esc(d.title) + '">' +
      '<label class="field">星期</label><div class="chips" id="rtDays">' + C.WD.map((x, i) => '<button class="chip" data-act="rt-day" data-d="' + i + '" aria-pressed="' + (d.days || []).includes(i) + '">' + x.slice(1) + '</button>').join('') + '</div>' +
      '<label class="field">上课 / 下课</label><div class="row"><input type="time" id="rtA" value="' + C.fmtM(d.time) + '"><input type="time" id="rtB" value="' + C.fmtM(d.time + d.dur) + '"></div>' +
      '<label class="field">周次(可选,如 1-8,10-16;需要先设置学期)</label><input type="text" id="rtWk" value="' + wk + '" placeholder="不填 = 整个学期" autocomplete="off">' +
      '<label class="field">单双周</label><select id="rtPar"><option value="all" ' + (d.parity === 'all' ? 'selected' : '') + '>每周</option><option value="odd" ' + (d.parity === 'odd' ? 'selected' : '') + '>仅单周</option><option value="even" ' + (d.parity === 'even' ? 'selected' : '') + '>仅双周</option></select>' +
      '<label class="field">地点</label><input type="text" id="rtLoc" value="' + esc(d.loc || '') + '">' +
      '<div class="switch"><div><b>法定节假日自动停课</b><div class="small muted">放假日不生成;补班日不受影响</div></div><input type="checkbox" id="rtHol" ' + (d.skipHoliday !== false ? 'checked' : '') + '></div>' +
      (!nw && (d.ex || []).length ? '<h2>例外(停课 / 调课)</h2>' + d.ex.slice().sort((a, b) => a.date - b.date).map((e) => '<div class="hab"><div class="grow"><b>' + fmtMD(e.date) + ' ' + C.WD[C.dow(e.date)] + '</b><div class="small muted">' + (e.type === 'cancel' ? '停课' : '调到 ' + fmtMD(e.to.date) + ' ' + C.fmtM(e.to.start) + '–' + C.fmtM(e.to.end)) + (e.reason ? '(' + esc(e.reason) + ')' : '') + '</div></div><button class="btn sm ghost" data-act="rt-ex-del" data-id="' + d.id + '" data-d="' + e.date + '">恢复</button></div>').join('') : '') +
      '<button class="btn pri" style="width:100%;margin-top:14px" data-act="rt-save" data-id="' + (id || '') + '">' + (nw ? '添加' : '保存') + '</button>' +
      (!nw ? '<button class="btn" style="width:100%;margin-top:8px" data-act="rt-clone" data-id="' + id + '">给这门课再加一个上课时间</button><div class="row" style="gap:8px;margin-top:6px"><button class="btn ghost warn grow" data-act="rt-del" data-id="' + id + '">删除这个固定周程</button></div><div class="small faint" style="margin:8px 6px 0">单次停课、调课:直接对助手说「这周五的' + esc(d.title) + '停课」。</div>' : ''));
  };
  A.termSheet = () => {
    const T = A.st.settings.term, t = now();
    A.sheet('<h3>学期设置</h3><div class="lead">课表里的「第几周」「单双周」按它来算。</div><label class="field">第 1 周的周一</label><input type="date" id="tmDate" value="' + (T ? A.dateVal(T.start) : '') + '"><label class="field">或者:今天是第几周</label><input type="number" id="tmWeek" min="1" max="40" placeholder="' + (T ? C.weekNo(A.st, t) : '例如 5') + '"><label class="field">总周数</label><input type="number" id="tmTotal" min="1" max="40" value="' + ((T && T.weeks) || 18) + '">' +
      '<button class="btn pri" style="width:100%;margin-top:14px" data-act="term-save">保存</button>' + (T ? '<button class="btn ghost warn" style="width:100%;margin-top:4px" data-act="term-clear">清除学期设置</button>' : ''));
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return; const a = el.dataset.act, st = A.st, t = now();
    if (a === 'rt-open') { A.routineSheet(el.dataset.id); }
    else if (a === 'rt-new') { A.routineSheet(null); }
    else if (a === 'rt-clone') { const h = st.habits.find((x) => x.id === el.dataset.id); if (h) A.routineSheet(null, { title: h.title, loc: h.loc || '', domain: h.domain, weeks: h.weeks || [], parity: h.parity || 'all', skipHoliday: h.skipHoliday !== false }); }
    else if (a === 'rt-day') { el.setAttribute('aria-pressed', el.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); }
    else if (a === 'rt-save') {
      const days = [...document.querySelectorAll('#rtDays [data-d]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => +b.dataset.d);
      const s1 = pt2($('#rtA').value), e1 = pt2($('#rtB').value), title = $('#rtTitle').value.trim();
      if (!title || !days.length || s1 == null || e1 == null || e1 <= s1) { A.toast('请填写名称、至少一个星期,以及正确的上下课时间。'); return; }
      const wk = C.parseWeeks($('#rtWk').value), par = $('#rtPar').value, loc = $('#rtLoc').value.trim(), hol = $('#rtHol').checked;
      if ((wk.length || par !== 'all') && !st.settings.term) { A.closeSheet(); A.toast('设置周次或单双周前,请先设置学期。'); A.termSheet(); return; }
      const id = el.dataset.id; A.closeSheet();
      A.mutate(() => {
        if (id) { const h = st.habits.find((x) => x.id === id); Object.assign(h, { title, days, time: s1, dur: e1 - s1, weeks: wk, parity: par, loc, skipHoliday: hol }); C.refreshRoutine(st, id, t); }
        else { C.addRoutine(st, { title, days, start: s1, end: e1, weeks: wk, parity: par, loc, skipHoliday: hol }, t); C.plan(st, t, 'inc'); }
      }, id ? '已更新,未来的课已按新规则重排。' : '已添加固定周程。');
    } else if (a === 'rt-del') { const id = el.dataset.id; A.closeSheet(); A.mutate(() => { st.habits = st.habits.filter((x) => x.id !== id); st.blocks = st.blocks.filter((b) => !(b.habitId === id && !b.done)); }, '已删除这个固定周程。'); }
    else if (a === 'rt-ex-del') { const id = el.dataset.id; A.mutate(() => { C.removeRoutineException(st, id, +el.dataset.d, t); }); A.routineSheet(id); }
    else if (a === 'term-open') A.termSheet();
    else if (a === 'term-save') {
      const dv = $('#tmDate').value, wv = +$('#tmWeek').value, tot = +$('#tmTotal').value || 18; let start = null;
      if (dv) start = C.weekStart(A.parseDateVal(dv)); else if (wv >= 1) start = C.addDays(C.weekStart(C.dayStart(t)), -(wv - 1) * 7);
      if (start == null) { A.toast('请填写第 1 周的周一,或今天是第几周。'); return; }
      A.closeSheet(); A.mutate(() => { st.settings.term = { start, weeks: tot }; C.plan(st, t, 'full'); }, '已设置学期。');
    } else if (a === 'term-clear') { A.closeSheet(); A.mutate(() => { st.settings.term = null; C.plan(st, t, 'full'); }, '已清除学期设置。'); }
  });

  /* ================= 编辑习惯 / 周期事项 ================= */
  A.habitSheet = (id) => {
    const h = A.st.habits.find((x) => x.id === id); if (!h) return;
    const mode = h.monthDay ? 'month' : h.every ? 'every' : h.days && h.days.length ? 'days' : 'per';
    const tv = h.time != null ? C.fmtM(h.time) : '';
    A.sheet('<h3>编辑「' + esc(h.title) + '」</h3><div class="lead">改完后,未来已排的会按新设置重新安排,已完成的不受影响。</div>' +
      '<label class="field">名称</label><input type="text" id="hbTitle" value="' + esc(h.title) + '">' +
      '<label class="field">频率</label><select id="hbMode"><option value="per" ' + (mode === 'per' ? 'selected' : '') + '>每周 N 次(系统自动挑日子)</option><option value="days" ' + (mode === 'days' ? 'selected' : '') + '>每周固定星期</option><option value="every" ' + (mode === 'every' ? 'selected' : '') + '>每隔 N 天</option><option value="month" ' + (mode === 'month' ? 'selected' : '') + '>每月某一天</option></select>' +
      '<div id="hbPer"><label class="field">每周几次 / 每隔几天 / 每月几号</label><input type="number" id="hbN" min="1" max="31" value="' + (h.monthDay || h.every || h.perWeek || 1) + '"></div>' +
      '<div id="hbDays"><label class="field">星期</label><div class="chips" id="hbDayChips">' + C.WD.map((x, i) => '<button class="chip" data-act="rt-day" data-d="' + i + '" aria-pressed="' + (!!(h.days && h.days.includes(i))) + '">' + x.slice(1) + '</button>').join('') + '</div></div>' +
      '<label class="field">固定时间(可留空 = 系统自动选时段)</label><input type="time" id="hbTime" value="' + tv + '">' +
      '<label class="field">每次时长(自己输入)</label><input type="text" id="hbDur" value="' + C.fmtDur(h.dur) + '" placeholder="例如 40 分钟 / 1.5 小时">' +
      '<label class="field">偏好时段(没有固定时间时)</label><select id="hbPref">' + [['any', '不限'], ['morning', '上午'], ['noon', '午后'], ['evening', '晚上']].map(([k, n]) => '<option value="' + k + '" ' + (h.pref === k ? 'selected' : '') + '>' + n + '</option>').join('') + '</select>' +
      '<label class="field">领域</label><select id="hbDom">' + DOMAIN_KEYS.map((k) => '<option value="' + k + '" ' + (h.domain === k ? 'selected' : '') + '>' + DOMAINS[k].name + '</option>').join('') + '</select>' +
      '<button class="btn pri" style="width:100%;margin-top:14px" data-act="hab-save" data-id="' + id + '">保存</button>' +
      '<div class="row" style="gap:8px;margin-top:6px"><button class="btn ghost grow" data-act="hab-pause" data-id="' + id + '">' + (h.paused ? '恢复' : '暂停') + '</button><button class="btn ghost warn grow" data-act="hab-del" data-id="' + id + '">删除</button></div>');
    syncHabMode();
  };
  function syncHabMode() { const m = $('#hbMode'); if (!m) return; const v = m.value, p = $('#hbPer'), d = $('#hbDays'); if (p && p.style) p.style.display = v === 'days' ? 'none' : ''; if (d && d.style) d.style.display = v === 'days' ? '' : 'none'; }
  document.addEventListener('change', (e) => { if (e.target.id === 'hbMode') syncHabMode(); });
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return; const a = el.dataset.act, st = A.st, t = now();
    if (a === 'hab-edit') A.habitSheet(el.dataset.id);
    else if (a === 'hab-save') {
      const h = st.habits.find((x) => x.id === el.dataset.id); if (!h) return;
      const title = $('#hbTitle').value.trim(), mode = $('#hbMode').value, n = Math.max(1, Math.min(31, +$('#hbN').value || 1)), dur = C.parseDurText($('#hbDur').value), tm = pt2($('#hbTime').value);
      if (!title) { A.toast('名称不能为空。'); return; }
      if (dur == null) { A.toast('时长没看懂。试试「40 分钟」「1.5 小时」。'); return; }
      const days = [...document.querySelectorAll('#hbDayChips [data-d]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => +b.dataset.d);
      if (mode === 'days' && !days.length) { A.toast('请至少选一个星期。'); return; }
      A.closeSheet();
      A.mutate(() => {
        Object.assign(h, { title, dur, time: tm, pref: $('#hbPref').value, domain: $('#hbDom').value, perWeek: 0, days: null, monthDay: 0, every: 0 });
        if (mode === 'per') h.perWeek = Math.min(7, n); else if (mode === 'days') h.days = days; else if (mode === 'every') { h.every = Math.max(2, n); h.anchor = C.dayStart(t); } else h.monthDay = n;
        st.blocks = st.blocks.filter((b) => !(b.habitId === h.id && !b.done && !b.started && b.start >= t - 60 * MIN));
        C.plan(st, t, 'inc');
      }, '已更新「' + title + '」,未来的安排已按新设置重排。');
    }
  });
})(window);
