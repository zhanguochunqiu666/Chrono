/* 时序 Chrono · 界面基础设施 + 「今天」+ 捕获回执 + 动作卡 + 专注 */
(function (G) {
  'use strict';
  const C = G.Chrono, { MIN, DAY, DOMAINS, DOMAIN_KEYS } = C;
  const A = (G.A = { st: null, tab: 'today', weekOff: 0, rc: null, focus: null, lastPlan: null });

  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => (A.fakeNow || Date.now());
  const tint = (hex, a) => { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; };
  const KIND = { commit: '承诺块', focus: '专注块', admin: '事务块', free: '留白块' };
  const pw = (p) => (p <= 0 ? 5 : p === 1 ? 4 : p === 2 ? 3 : 2);
  const ICON = {
    today: '<svg viewBox="0 0 24 24"><path d="M12 3v18M8 7h8M7 12h10M8 17h8"/><circle cx="12" cy="12" r="0.1"/></svg>',
    plan: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M9 9.5v11M15 9.5v11"/></svg>',
    life: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 8 8"/><circle cx="12" cy="12" r="3"/></svg>',
    review: '<svg viewBox="0 0 24 24"><path d="M4 19V9M10 19V5M16 19v-7M21 19H3"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  };
  ICON.search = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>';
  Object.assign(A, { $, esc, now, tint, KIND, ICON, pw });
  /* 液态玻璃:0 通透 … 1 磨砂(对应 iOS 27 的透明度滑块) */
  A.applyGlass = () => {
    if (G.matchMedia && G.matchMedia('(prefers-reduced-transparency: reduce)').matches) return;
    const g = Math.max(0, Math.min(1, A.st.settings.glass == null ? 0.5 : A.st.settings.glass)), r = (document.documentElement || {}).style;
    if (!r) return;
    r.setProperty('--ga', (0.3 + 0.58 * g).toFixed(2)); r.setProperty('--gb', Math.round(12 + 22 * g) + 'px');
  };

  /* ---------- 状态变更(统一入口,自带撤销) ---------- */
  A.commit = () => { C.save(A.st); };
  A.mutate = (fn, msg) => {
    const snap = JSON.stringify(A.st); A._lastSnap = snap;
    const r = fn();
    C.save(A.st); A.render();
    if (msg) A.toast(msg, { undo: snap });
    return r;
  };
  A.undo = (snap) => { A.st = JSON.parse(snap); C.save(A.st); A.closeSheet(); A.render(); };

  let tt;
  A.toast = (msg, o) => {
    o = o || {}; const el = $('#toast');
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (o.undo ? '<button data-act="undo">撤销</button>' : '');
    A._undo = o.undo; el.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), o.ms || 5200);
  };

  /* ---------- 底部面板 ---------- */
  /* 面板:已经打开(或正在关闭)时,原地换内容并平滑推进 + 高度过渡,不再「关掉重开」导致闪一下 */
  let closeTimer = null;
  const q1 = (root, s) => (root && root.querySelector ? root.querySelector(s) : null);
  A.sheet = (html, onClose) => {
    const root = $('#sheet-root'), sh = q1(root, '.sheet');
    A._onClose = onClose || null;
    if (sh) {                                                    // 已打开:原地切换
      clearTimeout(closeTimer); const scrim = q1(root, '.scrim'); scrim && scrim.classList.remove('closing');
      const oldH = sh.getBoundingClientRect().height;
      sh.style.transform = ''; sh.style.transition = '';
      sh.innerHTML = '<div class="grab"></div><div class="sc enter">' + html + '</div>';
      sh.scrollTop = 0;
      const newH = sh.getBoundingClientRect().height;
      if (sh.animate && Math.abs(newH - oldH) > 2 && !(G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
        const prevOv = sh.style.overflow; sh.style.overflow = 'hidden';
        sh.animate([{ height: oldH + 'px' }, { height: newH + 'px' }], { duration: 380, easing: 'cubic-bezier(.2,.9,.3,1.05)' }).onfinish = () => { sh.style.overflow = prevOv; };
      }
      return;
    }
    root.innerHTML = '<div class="scrim" data-act="scrim"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><div class="sc">' + html + '</div></div></div>';
  };
  A.closeSheet = (silent) => {
    const root = $('#sheet-root'); if (!root.innerHTML) return;
    const f = A._onClose; A._onClose = null; if (f && !silent) f();
    const scrim = q1(root, '.scrim');
    if (!scrim || (G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches)) { root.innerHTML = ''; return; }
    if (scrim.classList.contains('closing')) return;
    scrim.classList.add('closing'); clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { root.innerHTML = ''; }, 260);
  };
  /* 下拉关闭:按住抓手往下拖,松手超过阈值就收起,否则弹回 */
  (function () {
    let d = null;
    document.addEventListener('pointerdown', (e) => {
      const g = e.target.closest && e.target.closest('.sheet .grab'); if (!g) return;
      const sh = g.closest('.sheet'); d = { sh, y0: e.clientY, dy: 0 }; sh.style.transition = 'none';
    });
    document.addEventListener('pointermove', (e) => { if (!d) return; d.dy = Math.max(0, e.clientY - d.y0); d.sh.style.transform = 'translateY(' + d.dy + 'px)'; });
    const up = () => { if (!d) return; const x = d; d = null; if (x.dy > 110) { x.sh.style.transition = 'transform .25s cubic-bezier(.4,0,1,1)'; x.sh.style.transform = 'translateY(110%)'; setTimeout(() => A.closeSheet(), 180); } else { x.sh.style.transition = 'transform .4s cubic-bezier(.2,.9,.3,1.15)'; x.sh.style.transform = ''; } };
    document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  })();

  /* ---------- 通用计算 ---------- */
  const S = () => A.st.settings;
  A.unplaced = () => A.st.items.filter((i) => i.type === 'task' && i.status === 'planned' && C.placedMin(A.st, i.id) < C.effMin(i) - 1);
  A.overloadDays = () => {
    const st = A.st, t0 = C.dayStart(now()), out = [];
    for (let k = 0; k < 7; k++) {
      const d = C.addDays(t0, k), cap = C.dayCap(S(), d); let need = C.dayLoad(st, d);
      A.unplaced().forEach((it) => { if (it.due && C.dayStart(it.due) === d) need += C.effMin(it) - C.placedMin(st, it.id); });
      if (need > cap + 1) out.push({ day: d, need, cap });
    }
    return out;
  };
  const dayBlocks = (d) => A.st.blocks.filter((b) => b.start >= d && b.start < d + DAY && !b.skipped && b.kind !== 'free').sort((a, b) => a.start - b.start);
  A.dayBlocks = dayBlocks;

  /* ---------- 渲染框架 ---------- */
  const TABS = [['today', '今天', 'today'], ['plan', '计划', 'plan'], ['life', '领域', 'life'], ['review', '回顾', 'review']];
  A.render = () => {
    C.sweepMissed(A.st, now()); A.applyGlass();
    { const t = now(); let need = 0; if (A.tab === 'plan') need = C.addDays(C.weekStart(C.addDays(C.weekStart(t), (A.weekOff || 0) * 7)), 7); else if (A.tab === 'today' && A.viewDay != null) need = A.viewDay + DAY; if (need && C.ensureHorizon(A.st, need, t)) C.save(A.st); }
    document.body.classList.toggle('nocap', A.tab === 'review');
    $('#nav').innerHTML = '<div class="brand">时序<small>CHRONO</small></div>' + TABS.map(([k, n, i]) => '<button data-act="tab" data-v="' + k + '" ' + (A.tab === k ? 'aria-current="page"' : '') + '>' + ICON[i] + '<span>' + n + '</span></button>').join('');
    const R = { today: A.viewToday, plan: A.viewPlan, life: A.viewLife, review: A.viewReview }[A.tab];
    const out = R();
    const vw = $('#view'); if (A._enter && vw && vw.classList) { vw.classList.remove('enter'); void vw.offsetWidth; vw.style.setProperty && vw.style.setProperty('--dx', (A._dir || 0) * 28 + 'px'); vw.classList.add('enter'); } A._enter = false; A._dir = 0;
    /* 只在内容真的变了才写 DOM:定时刷新、同步、切回前台时画面不再重绘闪烁,滚动位置与输入法状态也保持 */
    const put = (sel, html) => { const el = $(sel); if (!el) return; if (el.__h === html && el.innerHTML) return; el.__h = html; el.innerHTML = html; };
    const sy = G.scrollY;
    put('#top', out.top); put('#banners', out.banners || ''); put('#view', out.html);
    if (G.scrollY !== sy && !A._enter) G.scrollTo(0, sy);
    const capHtml = (A.trayHtml ? A.trayHtml() : '') + '<div class="bar"><input id="capIn" type="text" enterkeyhint="send" autocomplete="off" placeholder="说一句话,或粘贴 / 拖入截图" aria-label="录入事项">' +
      '<button class="iconbtn" data-act="img" aria-label="识别截图或照片" title="识别截图 / 照片(也可以直接粘贴或拖入)"><svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/></svg></button>' +
      (A.canVoice() ? '<button class="iconbtn" data-act="mic" id="micBtn" aria-label="语音输入">' + ICON.mic + '</button>' : '') + '<button class="iconbtn" data-act="agent" aria-label="让助手调整日程" title="让助手理解并调整日程(调课、改时间、放假…)"><svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg></button><button class="send" data-act="send">排进去</button></div>';
    const capEl = $('#capture'), capChanged = capEl.__h !== capHtml; if (capChanged) { capEl.__h = capHtml; capEl.innerHTML = capHtml; }
    if (capChanged && A._capText) $('#capIn').value = A._capText;
    if (capChanged && A.drawTray && A.pending && A.pending.length) { const i = $('#capIn'); if (i) i.placeholder = '补一句说明(可不填),然后发送'; const sb = $('#capture').querySelector('.send'); if (sb) sb.textContent = '识别并排入'; }
    if (out.after) out.after();
  };
  const topbar = (title, sub, extra) => '<div><h1>' + title + '</h1>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div><div class="row">' + (extra || '') + '<button class="iconbtn" data-act="search" aria-label="搜索">' + ICON.search + '</button><button class="iconbtn" data-act="settings" aria-label="设置">' + ICON.gear + '</button></div>';
  A.topbar = topbar;

  A.banners = () => {
    let h = '';
    const od = A.overloadDays();
    od.slice(0, 2).forEach((o) => {
      h += '<div class="banner calm"><div class="between row"><div class="grow"><b>' + C.WD[C.dow(o.day)] + '排爆了</b>:需要 ' + C.fmtH(o.need) + ',你只有 ' + C.fmtH(o.cap) + '。<span class="muted">现在做减法,比当天崩溃便宜。</span></div><button class="btn sm" data-act="release" data-d="' + o.day + '">看释放方案</button></div></div>';
    });
    { // 被保护的块与会议/课程重叠:系统不会替你挪,但会明确告诉你
      const t = now(), pins = A.st.blocks.filter((b) => !b.skipped && b.end > t && b.start < t + 14 * DAY && C.isPinned(b) && b.kind !== 'commit');
      const hits = []; pins.forEach((p) => A.st.blocks.forEach((c) => { if (c !== p && !c.skipped && c.kind === 'commit' && c.start < p.end && c.end > p.start && !hits.some((h) => h.p === p)) hits.push({ p, c }); }));
      hits.slice(0, 2).forEach((hh) => { const h2 = '<div class="banner calm"><div class="between row"><div class="grow"><b>冲突</b>:你保护的「' + esc(hh.p.title) + '」(' + C.dayLabel(hh.p.start, t) + ' ' + hmm(hh.p.start) + ')和「' + esc(hh.c.title) + '」时间重叠。系统不会替你挪,请你决定。</div><button class="btn sm" data-act="blk" data-id="' + hh.p.id + '">处理</button></div></div>'; h += h2; });
    }
    const missed = A.st.blocks.filter((b) => b.missed && !b.skipped && b.itemId).length;
    if (missed) h += '<div class="banner"><div class="between row"><div class="grow">有 ' + missed + ' 个块已标记为「待重排」,不用现在管。</div><button class="btn sm" data-act="evening">晚间收尾时处理</button></div></div>';
    const up = A.unplaced().filter((i) => !A.overloadDays().some((o) => i.due && C.dayStart(i.due) === o.day));
    if (up.length) h += '<div class="banner calm"><div class="between row"><div class="grow">「' + esc(up[0].short) + '」' + (up.length > 1 ? '等 ' + up.length + ' 件' : '') + '暂时排不下。</div><button class="btn sm" data-act="conflict" data-id="' + up[0].id + '">看三个选择</button></div></div>';
    return h;
  };

  /* ================= 今天 ================= */
  const hmm = (ts) => C.fmtT(ts);
  function blkHtml(b, d0, ppm, startMin, withSub) {
    const dom = DOMAINS[b.domain] || DOMAINS.work, top = ((b.start - d0) / MIN - startMin) * ppm, h = Math.max(((b.end - b.start) / MIN) * ppm - 2, 22);
    const cls = ['blk', b.kind, b.done ? 'done' : '', b.missed && !b.done ? 'missed' : '', b.locked && b.kind !== 'commit' ? 'locked' : '', (b.start <= now() && now() < b.end && !b.done) ? 'now-on' : ''].join(' ');
    const bg = b.kind === 'focus' ? 'background:' + dom.color : b.kind === 'commit' ? '' : 'background:' + tint(dom.color, 0.17);
    return '<button class="' + cls + '" data-act="blk" data-id="' + b.id + '" data-d="' + d0 + '" style="--c:' + dom.color + ';--pw:' + pw(b.prio == null ? 2 : b.prio) + 'px;top:' + top + 'px;height:' + h + 'px;' + bg + '">' +
      '<span class="t">' + (b.done ? '✓ ' : '') + esc(b.title) + '</span>' + (withSub && h > 40 ? '<span class="s">' + hmm(b.start) + '–' + hmm(b.end) + ' · ' + dom.name + '</span>' : '') + (b.kind !== 'commit' && !b.done && h >= 34 ? '<i class="rz" aria-hidden="true"></i>' : '') + '</button>';
  }
  A.blkHtml = blkHtml;

  /* viewToday 在 today.js 中 */

  /* ================= 块详情 / 执行 ================= */
  A.openBlock = (id) => {
    const st = A.st, b = st.blocks.find((x) => x.id === id); if (!b) return;
    const it = b.itemId ? C.itemOf(st, b.itemId) : null, dom = DOMAINS[b.domain] || DOMAINS.work, t = now();
    const mins = C.bmin(b), over = b.end < t;
    let btns = '';
    if (b.done) btns = '<div class="muted small">已完成,实际 ' + C.fmtDur(b.actual || mins) + '。</div>';
    else if (b.kind === 'commit') btns = '<button class="btn" data-act="done" data-id="' + id + '">标记已完成</button>';
    else btns = '<div class="row" style="flex-wrap:wrap;gap:8px"><button class="btn now" data-act="start" data-id="' + id + '">开始专注</button><button class="btn" data-act="done" data-id="' + id + '">标记完成</button><button class="btn" data-act="postpone" data-id="' + id + '">顺延 30 分钟</button><button class="btn" data-act="skip" data-id="' + id + '">今天不做了</button></div><div class="row" style="margin-top:10px;gap:8px"><span class="small muted">调整时长</span><button class="btn sm" data-act="blk-dur" data-id="' + id + '" data-v="-15">− 15 分</button><button class="btn sm" data-act="blk-dur" data-id="' + id + '" data-v="15">+ 15 分</button><button class="btn sm" data-act="blk-dur" data-id="' + id + '" data-v="30">+ 30 分</button></div><div class="row" style="margin-top:8px;gap:8px"><input type="text" id="bdur" placeholder="自定义时长:50 分钟 / 1.5 小时" autocomplete="off"><button class="btn sm" data-act="blk-dur-set" data-id="' + id + '">设置</button></div><div class="row" style="margin-top:12px;gap:8px"><span class="small muted">起止时间</span><input type="time" id="btA" value="' + A.timeVal(b.start) + '" step="300"><span class="small muted">至</span><input type="time" id="btB" value="' + A.timeVal(b.end) + '" step="300"><button class="btn sm pri" data-act="blk-time-set" data-id="' + id + '">应用</button></div><div class="row" style="margin-top:8px;gap:8px"><span class="small muted">整体平移</span><button class="btn sm" data-act="blk-shift" data-id="' + id + '" data-v="-15">提前 15 分</button><button class="btn sm" data-act="blk-shift" data-id="' + id + '" data-v="15">推后 15 分</button></div>';
    const prot = b.kind !== 'commit' ? '<button class="btn sm" data-act="lock" data-id="' + id + '">' + (b.locked ? '取消「不可侵入」' : '设为「不可侵入」') + '</button>' : '';
    A.sheet('<h3>' + esc(b.title) + '</h3><div class="lead">' + C.dayLabel(b.start, t) + ' ' + hmm(b.start) + '–' + hmm(b.end) + ' · ' + C.fmtDur(mins) + (b.loc ? ' · ' + esc(b.loc) : '') + '</div>' +
      '<div class="chips" style="margin-bottom:12px"><span class="chip"><i class="dot" style="background:' + dom.color + '"></i>' + dom.name + '</span><span class="chip">' + KIND[b.kind] + '</span>' + (it ? '<span class="chip">P' + it.priority + '</span>' : '') + (b.locked && b.kind !== 'commit' ? '<span class="chip">⚓︎ 不可侵入</span>' : '') + (b.habitId ? '<span class="chip">习惯</span>' : '') + (b.missed ? '<span class="chip">待重排</span>' : '') + '</div>' +
      '<div class="card" style="margin-bottom:12px"><div class="small muted">为什么排在这里</div><div>' + esc(b.why || '最近的合适空档') + '</div></div>' + btns +
      '<div class="row between" style="margin-top:14px;gap:8px;flex-wrap:wrap">' + (it ? '<button class="btn sm" data-act="edit-item" data-id="' + it.id + '">编辑</button>' : '') + prot + '<button class="btn sm warn" data-act="del-blk" data-id="' + id + '">' + (it ? '删除这件事' : '取消这一次') + '</button></div>');
  };

  A.startBlock = (id) => {
    A.closeSheet();
    A.mutate(() => C.startBlock(A.st, id));
    A.openFocus(id);
  };
  A.postponeBlock = (id) => {
    A.closeSheet();
    const res = A.mutate(() => C.postpone(A.st, id, 30, now()));
    if (!res) return;
    if (res.to) A.toast('推到 ' + hmm(res.to) + (C.sameDay(res.to, now()) ? '' : '(' + C.dayLabel(res.to, now()) + ')') + (res.diff ? '。其余 ' + res.diff.kept + ' 个块未改动' : ''), { undo: A._lastSnap });
    else A.toast('今天已经没有合适的空档,这一次先放掉。');
    if (res.repeat >= 3) A.intervene(res.itemId);
  };
  A.intervene = (itemId) => {
    const it = C.itemOf(A.st, itemId); if (!it) return;
    A.sheet('<h3>这件事连续推了 ' + it.postponed + ' 次</h3><div class="lead">是太难、太大,还是其实不重要?选一条路,系统来配合。</div>' +
      '<button class="opt" data-act="iv" data-k="shrink" data-id="' + itemId + '"><b>拆小</b><span>只排一个 25 分钟的「第一步」,做完再说</span></button>' +
      '<button class="opt" data-act="iv" data-k="lower" data-id="' + itemId + '"><b>降低标准</b><span>时长减半,做到「够用」就算完成</span></button>' +
      '<button class="opt" data-act="iv" data-k="drop" data-id="' + itemId + '"><b>直接删掉</b><span>它可能本来就不重要</span></button>');
  };
  A.skipBlock = (id) => {
    A.closeSheet();
    A.mutate(() => C.skipToday(A.st, id, now()), '好,今天不做了。已为它找明天以后的位置。');
  };
  A.completeBlock = (id, actual) => {
    A.closeSheet();
    const r = A.mutate(() => C.markDone(A.st, id, actual, now()));
    if (!r) return;
    if (r.finished && r.item && r.item.type === 'task' && r.item.statedMin) {
      const ratio = r.item.actual / r.item.statedMin;
      A.toast('完成。实际 ' + C.fmtDur(r.item.actual) + (ratio > 1.15 ? ',比你说的长 ' + Math.round((ratio - 1) * 100) + '%,估时模型已记下' : ratio < 0.85 ? ',比预估短,已记下' : ',和预估基本一致'), { undo: A._lastSnap });
    } else A.toast('已完成');
  };

  /* 专注计时 */
  A.canWake = () => !!(navigator.wakeLock);
  A.openFocus = (id) => {
    const b = A.st.blocks.find((x) => x.id === id); if (!b) return;
    A.focus = { id, t0: b.startedAt || now() };
    const el = $('#focus'); el.hidden = false;
    document.body.style.overflow = 'hidden';
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then((w) => (A._wake = w)).catch(() => {}); } catch (e) { /* */ }
    const tick = () => {
      if (!A.focus) return;
      const bb = A.st.blocks.find((x) => x.id === A.focus.id); if (!bb) return A.closeFocus();
      const planned = C.bmin(bb) * 60, el2 = Math.round((now() - A.focus.t0) / 1000), left = planned - el2, ab = Math.abs(left);
      const f = (n) => (n < 10 ? '0' : '') + n, h = Math.floor(ab / 3600), m = Math.floor((ab % 3600) / 60), s2 = ab % 60;
      $('#focus').innerHTML = '<div class="sub">专注中 · 通知静音</div><div class="t">' + esc(bb.title) + '</div><div class="clock">' + (left < 0 ? '+' : '') + (h ? h + ':' + f(m) : f(m)) + ':' + f(s2) + '</div>' +
        '<div class="sub">' + (left < 0 ? '已超出计划 ' + C.fmtDur(Math.ceil(ab / 60)) : '计划 ' + C.fmtDur(planned / 60)) + '</div>' +
        '<div class="row" style="margin-top:26px;gap:12px"><button class="btn" data-act="focus-close">先停一下</button><button class="btn fin" data-act="focus-done">完成</button></div>';
    };
    tick(); clearInterval(A._ft); A._ft = setInterval(tick, 1000);
  };
  A.closeFocus = () => {
    clearInterval(A._ft); A.focus = null; $('#focus').hidden = true; document.body.style.overflow = '';
    try { A._wake && A._wake.release(); } catch (e) { /* */ } A._wake = null; A.render();
  };
  A.finishFocus = () => {
    const f = A.focus; if (!f) return;
    const b = A.st.blocks.find((x) => x.id === f.id); const planned = C.bmin(b), el = Math.max(1, Math.round((now() - f.t0) / MIN));
    const fin = (actual) => { A.closeFocus(); A.completeBlock(f.id, actual); };
    if (el > planned * 1.2 && planned >= 15) {
      A.closeFocus(); A.focus = null;
      A.sheet('<h3>多花了 ' + C.fmtDur(el - planned) + '</h3><div class="lead">是估少了,还是被打断了?一个问题,两个选项。</div>' +
        '<button class="opt" data-act="over" data-id="' + f.id + '" data-v="' + el + '"><b>估少了</b><span>计入你的估时模型,以后同类事项会自动放宽</span></button>' +
        '<button class="opt" data-act="over" data-id="' + f.id + '" data-v="' + planned + '"><b>被打断了</b><span>按计划时长记录,不影响估时模型</span></button>');
    } else fin(el < 5 && planned >= 15 ? planned : el);
  };

  /* ================= 捕获与回执卡 ================= */
  A.canVoice = () => !!(G.SpeechRecognition || G.webkitSpeechRecognition);
  A.toggleMic = () => {
    const SR = G.SpeechRecognition || G.webkitSpeechRecognition; if (!SR) return;
    const btn = $('#micBtn');
    if (A._rec) { A._rec.stop(); return; }
    const r = (A._rec = new SR()); r.lang = 'zh-CN'; r.interimResults = true; r.continuous = false;
    btn.classList.add('rec');
    r.onresult = (e) => { let t = ''; for (const x of e.results) t += x[0].transcript; $('#capIn').value = t; A._capText = t; };
    r.onend = () => { A._rec = null; const b = $('#micBtn'); b && b.classList.remove('rec'); const v = $('#capIn').value.trim(); if (v) A.capture(v); };
    r.onerror = () => { A.toast('语音没听清,可以直接打字。'); };
    r.start();
  };

  A.capture = (text, source) => {
    text = (text || '').trim(); if (!text) return;
    const r = C.parse(text, A.st, now());
    if (!r.items.length && !r.habits.length && !r.aways.length) { A.toast('没读出事项。试试:「周五下午三点和张总过方案,一小时」'); return; }
    r.items.forEach((d) => { d.source = source || 'text'; });
    A.rc = { text, cards: r.items.map((d) => ({ kind: 'item', d, state: 'pending', edit: false, field: null, edits: 0 })).concat(r.habits.map((h) => ({ kind: 'habit', h, state: 'pending', edits: 0 }))).concat(r.aways.map((a) => ({ kind: 'away', a, state: 'pending', edits: 0 }))) };
    A._capText = ''; const inp = $('#capIn'); if (inp) inp.value = '';
    A.drawReceipt();
  };

  const DURS = [[15, '15 分'], [30, '30 分'], [45, '45 分'], [60, '1 小时'], [90, '1.5 小时'], [120, '2 小时'], [180, '3 小时'], [240, '4 小时']];
  const dayChips = (cur) => [['0', '今天'], ['1', '明天'], ['2', '后天'], ['we', '周末'], ['wk', '本周内'], ['nx', '下周内'], ['no', '没有截止']].map(([k, n]) => '<button class="chip" data-act="rc-set" data-f="day" data-v="' + k + '">' + n + '</button>').join('');
  function cardHtml(c, i) {
    const t = now();
    if (c.kind === 'away') {
      const a = c.a, same = a.from === a.to;
      return '<div class="rc ' + (c.state !== 'pending' ? 'done' : '') + '"><div class="ttl">' + esc(a.label) + '</div><div class="line">' + C.dayLabel(a.from, t) + (same ? '' : ' 到 ' + C.dayLabel(a.to, t)) + ' ｜ 这些天不排任务</div>' +
        '<div class="chips"><span class="chip">不可用日</span></div>' + (c.state === 'pending' ? '<div class="btns"><button class="btn pri" data-act="rc-ok" data-i="' + i + '">就这样</button><button class="btn" data-act="rc-park" data-i="' + i + '">不用了</button></div>' : '<div class="small muted" style="margin-top:8px">' + (c.state === 'ok' ? '✓ 已标记' : '已跳过') + '</div>') + '</div>';
    }
    if (c.kind === 'habit') {
      const h = c.h, dn = C.habitLabel(h).replace(/ \d\d:\d\d$/, '');
      return '<div class="rc ' + (c.state !== 'pending' ? 'done' : '') + '"><div class="ttl">' + esc(h.title) + '</div><div class="line">周期 · ' + dn + (h.time != null ? ' ' + C.fmtM(h.time) : '') + ' · ' + C.fmtDur(h.dur) + ' · 自动占位</div>' +
        '<div class="chips"><span class="chip"><i class="dot" style="background:' + DOMAINS[h.domain].color + '"></i>' + DOMAINS[h.domain].name + '</span><span class="chip">' + (h.kind === 'commit' ? '承诺块' : '习惯块') + '</span></div>' +
        (c.state === 'pending' ? '<div class="btns"><button class="btn pri" data-act="rc-ok" data-i="' + i + '">就这样</button><button class="btn" data-act="rc-park" data-i="' + i + '">先放着</button></div>' : '<div class="small muted" style="margin-top:8px">' + (c.state === 'ok' ? '✓ 已加入周期' : '已跳过') + '</div>') + '</div>';
    }
    const d = c.d, L = C.receiptLine(d, t), dom = DOMAINS[d.domain];
    const chip = (f, label, extra) => '<button class="chip" data-act="rc-field" data-i="' + i + '" data-f="' + f + '"' + (c.field === f ? ' aria-pressed="true"' : '') + '>' + label + (c.edit ? ' ✎' : '') + (extra || '') + '</button>';
    const learned = d.src === 'learned' ? '<div class="small muted" style="margin-top:6px">按你过去的速度,「' + C.fmtDur(d.learnedFrom) + '」估为 ' + C.fmtDur(d.estMin) + '</div>' : d.src === 'history' ? '<div class="small muted" style="margin-top:6px">按你做过的同类事项估时</div>' : '';
    let ed = '';
    if (c.field === 'dur') ed = '<div class="chips">' + DURS.map(([m, n]) => '<button class="chip" data-act="rc-set" data-i="' + i + '" data-f="dur" data-v="' + m + '">' + n + '</button>').join('') + '</div><div class="row" style="margin-top:8px;gap:8px"><input type="text" id="rcDur' + i + '" placeholder="自定义:50 分钟 / 1.5 小时 / 1:20" autocomplete="off"><button class="btn sm pri" data-act="rc-dur" data-i="' + i + '">好</button></div>';
    if (c.field === 'when') ed = d.type === 'event'
      ? '<div class="row" style="gap:8px"><input type="date" id="rcDate' + i + '" value="' + dateVal(d.start) + '"><input type="time" id="rcTime' + i + '" value="' + timeVal(d.start) + '"><button class="btn sm pri" data-act="rc-when" data-i="' + i + '">好</button></div>'
      : '<div class="chips">' + dayChips() .replace(/data-act="rc-set"/g, 'data-act="rc-set" data-i="' + i + '"') + '</div><div class="row" style="margin-top:8px;gap:8px"><input type="date" id="rcDate' + i + '" value="' + (d.due ? dateVal(d.due) : '') + '"><button class="btn sm pri" data-act="rc-due" data-i="' + i + '">按这天截止</button></div>';
    if (c.field === 'dom') ed = '<div class="chips">' + DOMAIN_KEYS.map((k) => '<button class="chip" data-act="rc-set" data-i="' + i + '" data-f="dom" data-v="' + k + '"><i class="dot" style="background:' + DOMAINS[k].color + '"></i>' + DOMAINS[k].name + '</button>').join('') + '</div>';
    if (c.field === 'pri') ed = '<div class="chips">' + [[0, 'P0 今天必须'], [1, 'P1 重要'], [2, 'P2 一般'], [3, 'P3 有空再说']].map(([p, n]) => '<button class="chip" data-act="rc-set" data-i="' + i + '" data-f="pri" data-v="' + p + '">' + n + '</button>').join('') + '</div>';
    const ask = c.state === 'pending' && d.askDue && d.type === 'task' && !d.due
      ? '<div class="ask">这个必须今天做完,还是这周都行?<div class="chips" style="margin-top:8px"><button class="chip" data-act="rc-set" data-i="' + i + '" data-f="day" data-v="0">今天</button><button class="chip" data-act="rc-set" data-i="' + i + '" data-f="day" data-v="wk">这周都行</button><button class="chip" data-act="rc-set" data-i="' + i + '" data-f="day" data-v="no">不急</button></div></div>' : '';
    return '<div class="rc ' + (c.state !== 'pending' ? 'done' : '') + (c.edit ? ' editing' : '') + '"><div class="ttl">' + esc(d.short) + (d.status === 'inbox' ? ' <span class="chip">待澄清</span>' : '') + '</div>' +
      '<div class="line">' + L.parts.join(' ｜ ') + (L.lead ? ' ｜ 会提前 ' + (L.lead >= 1440 ? Math.round(L.lead / 1440) + ' 天' : L.lead + ' 分钟') + '提醒你' : '') + '</div>' +
      '<div class="chips">' + chip('when', d.type === 'event' ? C.dayLabel(d.start, t) + ' ' + hmm(d.start) : d.type === 'deadline' ? C.dayLabel(d.due, t) : d.due ? C.dayLabel(d.due, t) + '前' : '本周内') +
      (d.type === 'deadline' ? '' : chip('dur', C.fmtDur(d.estMin))) + chip('dom', '<i class="dot" style="background:' + dom.color + '"></i>' + dom.name) + chip('pri', 'P' + d.priority) + '</div>' + learned +
      (ed ? '<div class="editor">' + ed + '</div>' : '') + ask +
      (c.state === 'pending' ? '<div class="btns"><button class="btn pri" data-act="rc-ok" data-i="' + i + '">就这样</button><button class="btn" data-act="rc-edit" data-i="' + i + '">改一下</button><button class="btn" data-act="rc-park" data-i="' + i + '">先放着</button></div>'
        : '<div class="small muted" style="margin-top:8px">' + (c.state === 'ok' ? '✓ 已确认' : '已放进收件箱') + '</div>') + '</div>';
  }
  const p2 = C.p2;
  const dateVal = (ts) => { const d = new Date(ts); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
  const timeVal = (ts) => { const d = new Date(ts); return p2(d.getHours()) + ':' + p2(d.getMinutes()); };
  const parseDateVal = (v) => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
  A.dateVal = dateVal; A.timeVal = timeVal; A.parseDateVal = parseDateVal;

  A.drawReceipt = () => {
    const rc = A.rc; if (!rc) return;
    const pend = rc.cards.filter((c) => c.state === 'pending').length;
    A.sheet('<h3>读到 ' + rc.cards.length + ' 项</h3><div class="lead">只需确认或修正。点任一标签,只改那一项。</div>' + (rc.note ? '<div class="tag-note">' + esc(rc.note) + '</div>' : '') +
      (pend > 1 ? '<button class="btn pri" style="width:100%;margin-bottom:10px" data-act="rc-all">全部就这样</button>' : '') +
      rc.cards.map(cardHtml).join(''), () => A.finishReceipt(true));
  };

  A.setCard = (i, f, v) => {
    const c = A.rc.cards[i], d = c.d; if (!d) return; const t = now(), t0 = C.dayStart(t);
    if (f === 'dur') {
      v = +v; d.statedMin = v; d.estMin = v; d.conf = 0.9; d.src = 'stated'; d.learnedFrom = 0; d.splittable = d.type === 'task' && (d.energy === 'deep' || v >= 120);
      if (d.type === 'event') d.end = d.start + v * MIN;
    } else if (f === 'dom') { d.domain = v; d.energy = C.energyOf(d.short); }
    else if (f === 'pri') d.priority = +v;
    else if (f === 'day') {
      d.askDue = false; delete d.notBefore;
      const ws = C.weekStart(t0);
      if (v === 'no') { delete d.due; delete d.asap; }
      else if (v === 'wk') { d.due = C.addDays(ws, 7) - 1; }
      else if (v === 'nx') { d.notBefore = C.addDays(ws, 7); d.due = C.addDays(ws, 14) - 1; }
      else if (v === 'we') { d.notBefore = C.addDays(ws, 5); d.due = C.addDays(ws, 7) - 1; }
      else { d.due = C.addDays(t0, +v) + DAY - 1; if (v === '0') d.notBefore = t0; }
    }
    c.edits++; c.field = null;
  };

  A.finishReceipt = (viaClose) => {
    const rc = A.rc; if (!rc) return; A.rc = null;
    const parked = rc.cards.filter((c) => c.state === 'pending').length;
    const ok = rc.cards.filter((c) => c.state === 'ok' || c.state === 'parked' || c.state === 'pending');
    if (!ok.length) return;
    let res = null, added = [], habitN = 0, awayN = 0, aw = null;
    A.mutate(() => {
      const st = A.st, items = [];
      st.stats.edits = st.stats.edits || { n: 0, total: 0 };
      ok.forEach((c) => {
        st.stats.edits.total++; if (c.edits) st.stats.edits.n++;
        if (c.kind === 'away') { if (c.state === 'ok') { aw = C.addAway(st, c.a.from, c.a.to, c.a.label, now()); awayN++; } return; }
        if (c.kind === 'habit') { if (c.state === 'ok') { C.addHabit(st, c.h, now()); habitN++; } return; }
        if (c.state !== 'ok') c.d.status = 'inbox';
        if (c.d.status === 'inbox' && c.d.type === 'event') { c.d.status = 'inbox'; }
        items.push(c.d);
      });
      added = C.addItems(st, items, now());
      // 事件被放进收件箱时不占位:addItems 只对非 inbox 事件建块
      res = C.plan(st, now(), 'inc');
      A.lastPlan = res;
    });
    const placedN = added.filter((i) => i.status !== 'inbox').length, inboxN = added.length - placedN;
    let msg = [];
    if (placedN || habitN) msg.push('已排入日程' + (res.diff.changed ? ',调整了 ' + res.diff.changed + ' 个已有块,其余 ' + res.diff.kept + ' 个未改动' : (res.diff.kept ? ',其余 ' + res.diff.kept + ' 个块未改动' : '')));
    if (awayN) msg.push('已标记不可用日' + (aw && aw.moved ? ',' + aw.moved + ' 个块已让位重排' : ''));
    if (inboxN) msg.push(inboxN + ' 项在收件箱');
    if (A.st.settings.aiOn === false && placedN) msg = ['自动排程已关闭:事项在「计划」页的待安排池,可手动放置'];
    if (msg.length) A.toast(msg.join(';'), { undo: A._lastSnap });
    if (res.conflicts.length) setTimeout(() => A.conflictSheet(res.conflicts[0].itemId), 250);
  };

  /* ================= 冲突消解 ================= */
  A.conflictSheet = (itemId) => {
    const it = C.itemOf(A.st, itemId); if (!it) return;
    const opts = C.conflictOptions(A.st, itemId, now());
    const need = C.effMin(it) - C.placedMin(A.st, itemId);
    A.sheet('<h3>「' + esc(it.short) + '」暂时排不下</h3><div class="lead">还差 ' + C.fmtDur(need) + '。不是你的问题,是排程的问题。下面三个选择各自有代价:</div>' +
      (opts.length ? opts.map((o) => '<button class="opt" data-act="opt" data-id="' + itemId + '" data-k="' + o.kind + '"><b>' + esc(o.label) + '</b><span>' + esc(o.note) + '</span></button>').join('') : '<div class="muted">当前没有可行的自动方案。</div>') +
      '<button class="opt" data-act="opt" data-id="' + itemId + '" data-k="drop"><b>放弃这件事</b><span>从日程中移除,不留红色债务</span></button>' +
      '<button class="btn ghost" style="width:100%;margin-top:6px" data-act="close">先放着</button>');
  };
  A.releaseSheet = (d) => {
    d = +d; const st = A.st, t = now();
    const bl = st.blocks.filter((b) => b.start >= d && b.start < d + DAY && !b.skipped && b.itemId && b.kind !== 'commit' && !b.locked && !b.done && b.end > t)
      .sort((a, b) => (b.prio - a.prio) || (C.bmin(b) - C.bmin(a)));
    const un = A.unplaced().filter((i) => i.due && C.dayStart(i.due) === d);
    A.sheet('<h3>' + C.WD[C.dow(d)] + '的释放方案</h3><div class="lead">挑几件挪到别的天,或直接放掉。越早做减法越轻松。</div>' +
      un.map((i) => '<button class="opt" data-act="conflict" data-id="' + i.id + '"><b>「' + esc(i.short) + '」排不下</b><span>看三个选择</span></button>').join('') +
      (bl.length ? bl.map((b) => '<div class="card row between" style="margin-top:8px"><div class="grow"><b>' + esc(b.title) + '</b><div class="small muted">' + hmm(b.start) + ' · ' + C.fmtDur(C.bmin(b)) + ' · P' + b.prio + '</div></div><button class="btn sm" data-act="skip" data-id="' + b.id + '">挪走</button></div>').join('') : (un.length ? '' : '<div class="empty">这天没有可自动挪动的块(会议等承诺块需要你自己决定)。</div>')));
  };

  Object.assign(A, { cardHtml, hmm });
})(window);
