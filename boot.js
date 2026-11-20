/* 时序 Chrono · 启动、事件分发、提醒、Service Worker */
(function (G) {
  'use strict';
  const C = G.Chrono, A = G.A, { MIN, DAY, DOMAINS } = C;
  const { $, esc, now } = A;

  const blockOf = (id) => A.st.blocks.find((b) => b.id === id);

  /* ---------- 统一事件分发 ---------- */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const act = el.dataset.act, id = el.dataset.id, st = A.st;
    if (act === 'scrim') { if (e.target === el) A.closeSheet(); return; }
    if (act === 'blk' && A._dragged) return;
    switch (act) {
      case 'tab': { const order = ['today', 'plan', 'life', 'review']; A._dir = Math.sign(order.indexOf(el.dataset.v) - order.indexOf(A.tab)); A._enter = A.tab !== el.dataset.v; A.tab = el.dataset.v; A.closeSheet(); A.render(); G.scrollTo({ top: 0, behavior: 'smooth' }); break; }
      case 'blk': A.openBlock(id); break;
      case 'start': A.startBlock(id); break;
      case 'done': A.completeBlock(id); break;
      case 'postpone': A.postponeBlock(id); break;
      case 'skip': A.skipBlock(id); break;
      case 'lock': A.mutate(() => { const b = blockOf(id); if (b) { b.locked = !b.locked; b.pin = b.locked; if (!b.locked) b.moved = false; } }); A.openBlock(id); break;
      case 'del-blk': { A.closeSheet(); A.mutate(() => { const b = blockOf(id); if (!b) return; if (b.itemId) C.removeItem(st, b.itemId); else b.skipped = true; }, '已删除'); break; }
      case 'focus': A.openFocus(id); break;
      case 'focus-close': A.closeFocus(); break;
      case 'focus-done': A.finishFocus(); break;
      case 'over': A.closeSheet(); A.completeBlock(id, +el.dataset.v); break;
      case 'iv': {
        A.closeSheet();
        A.mutate(() => {
          const it = C.itemOf(st, id); if (!it) return; const k = el.dataset.k;
          st.blocks = st.blocks.filter((b) => !(b.itemId === id && !b.done));
          if (k === 'drop') { it.status = 'dropped'; return; }
          it.postponed = 0; it.splittable = false; it.conf = 0.9; delete it.hold;
          if (k === 'shrink') { it.estMin = 25; it.statedMin = 25; it.short = it.short.slice(0, 9) + '·第一步'; } else { it.estMin = Math.max(15, Math.round(it.estMin / 2 / 5) * 5); it.statedMin = it.estMin; }
          C.plan(st, now(), 'inc');
        }, el.dataset.k === 'drop' ? '已删掉。' : '已调整,重新排好了。');
        break;
      }
      case 'undo': if (A._undo) A.undo(A._undo); $('#toast').classList.remove('show'); break;
      case 'close': A.closeSheet(); break;
      case 'settings': A.settings(); break;
      case 'morning': A.morning(); break;
      case 'evening': A.evening(); break;
      case 'ritual': A.ritual(0); break;
      case 'rit': {
        const v = +el.dataset.v, n = A.RS.n;
        if (n === 3 && v === 1) {
          const picks = [...document.querySelectorAll('[data-pick]:checked')].map((x) => A._ritIns[+x.dataset.pick]).filter(Boolean);
          if (picks.length) A.mutate(() => { A.st.meta.undoInsight = JSON.stringify({ settings: A.st.settings, habits: A.st.habits }); picks.forEach((p) => C.applyInsight(A.st, p.action, now())); }, '已应用 ' + picks.length + ' 条调整');
          A.ritual(4); break;
        }
        if (n === 4 && v === 1) {
          const texts = [...document.querySelectorAll('.rt')].map((x) => x.value.trim()).filter(Boolean);
          A.closeSheet();
          if (texts.length) {
            A.mutate(() => {
              texts.forEach((tx) => { const r = C.parse(tx, A.st, now()); r.items.forEach((d) => { d.priority = 1; C.addItems(A.st, [d], now()); }); });
              A.lastPlan = C.plan(A.st, now(), 'inc');
            }, '下周的重点已排进日程');
            if (A.lastPlan.conflicts.length) setTimeout(() => A.conflictSheet(A.lastPlan.conflicts[0].itemId), 250);
          } else A.toast('周回顾完成。');
          break;
        }
        A.ritual(Math.max(0, Math.min(4, n + v))); break;
      }
      case 'send': { const v = $('#capIn').value; A.capture(v); break; }
      case 'mic': A.toggleMic(); break;
      case 'rc-ok': { A.rc.cards[+el.dataset.i].state = 'ok'; afterCard(); break; }
      case 'rc-park': { A.rc.cards[+el.dataset.i].state = 'parked'; afterCard(); break; }
      case 'rc-all': A.rc.cards.forEach((c) => { if (c.state === 'pending') c.state = 'ok'; }); A.closeSheet(); break;
      case 'rc-edit': { const c = A.rc.cards[+el.dataset.i]; c.edit = !c.edit; A.drawReceipt(); break; }
      case 'rc-field': { const c = A.rc.cards[+el.dataset.i]; c.field = c.field === el.dataset.f ? null : el.dataset.f; A.drawReceipt(); break; }
      case 'rc-set': A.setCard(+el.dataset.i, el.dataset.f, el.dataset.v); A.drawReceipt(); break;
      case 'rc-when': {
        const i = +el.dataset.i, c = A.rc.cards[i], d = c.d, dv = $('#rcDate' + i).value, tv = $('#rcTime' + i).value;
        if (dv && tv) { const [h, m] = tv.split(':').map(Number); d.start = C.atMinute(A.parseDateVal(dv), h * 60 + m); d.end = d.start + d.estMin * MIN; c.edits++; }
        c.field = null; A.drawReceipt(); break;
      }
      case 'rc-due': {
        const i = +el.dataset.i, c = A.rc.cards[i], dv = $('#rcDate' + i).value;
        if (dv) { c.d.due = C.dayEnd(A.parseDateVal(dv)); delete c.d.notBefore; c.d.askDue = false; c.edits++; }
        c.field = null; A.drawReceipt(); break;
      }
      case 'opt': {
        A.closeSheet(); let r;
        A.mutate(() => { r = C.applyOption(st, id, el.dataset.k, now()); }, el.dataset.k === 'drop' ? '已放弃' : '已调整并重新落位' + (r ? '' : ''));
        if (r && r.conflicts.length && el.dataset.k !== 'drop') setTimeout(() => A.conflictSheet(r.conflicts[0].itemId), 250);
        break;
      }
      case 'conflict': A.closeSheet(); A.conflictSheet(id); break;
      case 'release': A.releaseSheet(el.dataset.d); break;
      case 'dl-done': A.mutate(() => { const it = C.itemOf(st, id); if (it) it.status = 'done'; }, '已处理'); break;
      case 'week': A._dir = +el.dataset.v || 0; A._enter = true; A.weekOff = el.dataset.v === '0' ? 0 : A.weekOff + +el.dataset.v; A.render(); break;
      case 'replan': A.replan(); break;
      case 'replan-go': {
        A.closeSheet(); let r;
        A.mutate(() => { r = C.plan(st, now(), 'full'); A.lastPlan = r; }, null);
        A.toast('已重新排程:动了 ' + r.diff.changed + ' 个块,其余 ' + r.diff.kept + ' 个未改动(已开始、已锁定的不会动)', { undo: A._lastSnap });
        if (r.conflicts.length) setTimeout(() => A.conflictSheet(r.conflicts[0].itemId), 300);
        break;
      }
      case 'ics': A.download('时序-日程.ics', 'text/calendar;charset=utf-8', C.toICS(st)); A.toast('已导出。用系统日历打开即可,每个块都带提醒。'); break;
      case 'csv': A.download('时序-时间账本.csv', 'text/csv;charset=utf-8', C.toCSV(st)); break;
      case 'json': A.download('时序-全量数据.json', 'application/json', JSON.stringify(st, null, 1)); break;
      case 'import': {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
        inp.onchange = () => { const f = inp.files[0]; if (!f) return; f.text().then((tx) => { try { const o = JSON.parse(tx); if (!o || o.v !== 1 || !Array.isArray(o.items) || !Array.isArray(o.blocks)) throw 0; A.mutate(() => { A.st = Object.assign(C.fresh(), o); }, '已导入'); A.closeSheet(); } catch (er) { A.toast('这不是时序导出的 JSON 文件。'); } }); };
        inp.click(); break;
      }
      case 'wipe':
        if (!A._wipeArm) { A._wipeArm = true; el.textContent = '再点一次确认,不可恢复'; setTimeout(() => { A._wipeArm = false; if (el.isConnected) el.textContent = '一键删除全部数据'; }, 4000); }
        else { A._wipeArm = false; C.wipe(); A.st = C.fresh(); C.save(A.st); A.closeSheet(); A.render(); A.toast('已删除全部数据。'); }
        break;
      case 'install': if (A._installEvt) { A._installEvt.prompt(); A._installEvt = null; } break;
      case 'quota': {
        const k = el.dataset.k, q = A.st.settings.quotas[k], h = (m) => Math.round(m / 6) / 10;
        A.sheet('<h3>' + DOMAINS[k].name + ' · 每周时间预算</h3><div class="lead">下限是不被工作挤占的保底;超过上限会提示失衡。排程时它们是约束,不是事后统计。</div>' +
          '<label class="field">周预算(小时)</label><input type="number" step="0.5" min="0" id="qb" value="' + h(q.b) + '"><label class="field">下限(小时)</label><input type="number" step="0.5" min="0" id="ql" value="' + h(q.lo) + '"><label class="field">上限(小时)</label><input type="number" step="0.5" min="0" id="qh" value="' + h(q.hi) + '">' +
          '<button class="btn pri" style="width:100%;margin-top:14px" data-act="quota-save" data-k="' + k + '">保存</button>'); break;
      }
      case 'quota-save': {
        const k = el.dataset.k, g = (i) => Math.max(0, Math.round(parseFloat($(i).value || '0') * 60));
        A.mutate(() => { const q = A.st.settings.quotas[k]; q.b = g('#qb'); q.lo = Math.min(g('#ql'), q.b || 1e9); q.hi = Math.max(g('#qh'), q.b); }, '已保存');
        A.closeSheet(); break;
      }
      case 'topup': {
        let r; const k = el.dataset.k, m = +el.dataset.m;
        A.mutate(() => { r = C.topUp(st, k, m, now()); });
        const b = A.st.blocks.find((x) => x.itemId === r.item.id && !x.skipped);
        A.toast(b ? '已把 ' + C.fmtDur(m) + DOMAINS[k].name + '时间排在 ' + C.dayLabel(b.start, now()) + ' ' + A.hmm(b.start) : '本周已经排不下了,看看「待安排池」。', { undo: A._lastSnap });
        break;
      }
      case 'hab-pause': A.mutate(() => { const h = st.habits.find((x) => x.id === id); if (h) { h.paused = !h.paused; if (h.paused) st.blocks = st.blocks.filter((b) => !(b.habitId === id && !b.done && b.start > now())); else C.plan(st, now(), 'inc'); } }); break;
      case 'hab-del': A.mutate(() => { st.habits = st.habits.filter((x) => x.id !== id); st.blocks = st.blocks.filter((b) => !(b.habitId === id && !b.done)); }, '已删除这个习惯'); break;
      case 'inbox-go': { const v = ($('#ib' + id) || {}).value || ''; A.promoteInbox(id, v.trim()); break; }
      case 'inbox-del': A.mutate(() => C.removeItem(st, id), '已删除'); break;
      case 'manual': A.manualSheet(id); break;
      case 'manual-ok': {
        const v = $('#manDt').value; if (!v) break; const ts = C.parseDateTime(v), it = C.itemOf(st, id); if (ts == null) { A.toast('请选择有效的日期和时间。'); break; }
        A.closeSheet();
        A.mutate(() => { const need = Math.max(15, C.effMin(it) - C.placedMin(st, id)); st.blocks.push({ id: C.uid(st, 'b'), itemId: id, title: it.short, domain: it.domain, kind: it.energy === 'deep' ? 'focus' : 'admin', start: ts, end: ts + need * MIN, locked: true, ctx: it.ctx, prio: it.priority, why: '你手动安排在这里,系统不会再动它' }); }, '已放好');
        break;
      }
      case 'ev-res': { const k = el.dataset.k; A.mutate(() => { C.resolveMissed(st, id, k, now()); C.plan(st, now(), 'inc'); }); A.evening(); break; }
      case 'star': {
        const b = blockOf(id); if (!b) break;
        const n = st.blocks.filter((x) => x.star && C.sameDay(x.start, b.start)).length;
        if (!b.star && n >= 3) { A.toast('最多三个重点。'); break; }
        A.mutate(() => { b.star = !b.star; const it = C.itemOf(st, b.itemId); if (it) { if (b.star) { it.prevPri = it.priority; it.priority = Math.min(it.priority, 1); b.prio = it.priority; } else if (it.prevPri != null) { it.priority = it.prevPri; b.prio = it.priority; } } });
        A.evening(); break;
      }
      case 'apply': A.applyInsightIdx(+el.dataset.i); break;
      case 'undo-insight': A.undoInsight(); break;
      default: break;
    }
  });
  function afterCard() {
    const left = A.rc.cards.filter((c) => c.state === 'pending').length;
    if (!left) { A.closeSheet(); } else A.drawReceipt();
  }

  document.addEventListener('change', (e) => {
    const t = e.target; if (!t.dataset || !t.dataset.set) return;
    A.setSetting(t.dataset.set, t.type === 'checkbox' ? t.checked : t.value);
    if (t.dataset.set === 'wknd' || t.dataset.set === 'commute' || t.dataset.set === 'lunchOn' || t.dataset.set === 'ltOn') A.settings();
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'capIn') A._capText = e.target.value; if (e.target.dataset && e.target.dataset.set === 'glass') { A.st.settings.glass = +e.target.value; A.applyGlass(); } });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'capIn' && !e.isComposing) { e.preventDefault(); A.capture(e.target.value); }
    if (e.key === 'Escape') { if (A.focus) return; A.closeSheet(); }
  });

  /* ---------- 提醒:预告 / 临近 / 启动 ---------- */
  const MAXPUSH = 8;
  A.notify = (key, title, body, blockId, withActions) => {
    const st = A.st, m = st.meta, today = C.dayStart(now());
    m.notified = m.notified || {}; if (m.notified[key]) return; m.notified[key] = now();
    const ks = Object.keys(m.notified); if (ks.length > 400) ks.sort((a, b) => m.notified[a] - m.notified[b]).slice(0, 200).forEach((k) => delete m.notified[k]);
    if (!m.nCount || m.nCount.day !== today) m.nCount = { day: today, n: 0 };
    if (m.nCount.n >= MAXPUSH) return;       // 每天主动推送不超过 8 次
    m.nCount.n++; C.save(st);
    A.toast(title + (body ? ' · ' + body : ''), { ms: 8000 });
    if (navigator.vibrate) navigator.vibrate(30);
    if (G.Notification && Notification.permission === 'granted') {
      const opts = { body, tag: key, data: { blockId }, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', renotify: false };
      if (withActions) opts.actions = [{ action: 'start', title: '开始' }, { action: 'postpone', title: '顺延 30 分钟' }, { action: 'skip', title: '今天不做了' }];
      const send = () => navigator.serviceWorker && navigator.serviceWorker.getRegistration().then((r) => (r ? r.showNotification(title, opts) : new Notification(title, { body })));
      try { send(); } catch (e) { try { new Notification(title, { body }); } catch (e2) { /* */ } }
    }
  };
  A.checkReminders = () => {
    const st = A.st, s = st.settings, t = now(); if (!s.notify || A.focus) return;
    const d0 = C.dayStart(t);
    st.blocks.slice().sort(C.compareBlocks).forEach((b) => {
      if (b.skipped || b.done || b.missed || b.kind === 'free' || b.started) return;
      const it = b.itemId ? C.itemOf(st, b.itemId) : null, lead = it && it.lead && it.lead < 1440 ? it.lead : 15;
      const toStart = (b.start - t) / MIN;
      if (toStart <= 0 && toStart > -3) A.notify('s:' + b.id, '现在:' + b.title, C.fmtDur(C.bmin(b)) + ' · ' + (b.why || ''), b.id, b.kind !== 'commit');
      else if (toStart > 0 && toStart <= lead) A.notify('n:' + b.id, lead + ' 分钟后:' + b.title, A.hmm(b.start) + ' 开始', b.id, false);
    });
    st.items.forEach((i) => {
      if (i.type !== 'deadline' || i.status !== 'planned') return;
      const at = i.due - (i.lead || 1440) * MIN; if (t >= at && t < i.due) A.notify('d:' + i.id, '快到期:' + i.short, C.dayLabel(i.due, t) + '到期', null, false);
    });
    if (C.date(t).getHours() >= 21) {
      const tm = C.addDays(d0, 1), bl = A.dayBlocks(tm).filter((b) => b.itemId || b.kind === 'commit');
      if (bl.length) { const hv = bl.slice().sort((a, b) => (a.prio - b.prio) || (C.bmin(b) - C.bmin(a)))[0]; A.notify('pre:' + tm, '明天有 ' + bl.length + ' 件事', '最重的是 ' + A.hmm(hv.start) + ' 的「' + hv.title + '」', null, false); }
    }
  };
  A.handleAct = (act, id) => {
    const b = id ? blockOf(id) : null;
    if (act === 'start' && b) A.startBlock(id);
    else if (act === 'postpone' && b) A.postponeBlock(id);
    else if (act === 'skip' && b) A.skipBlock(id);
    else if (b) A.openBlock(id);
  };

  /* ---------- 启动 ---------- */
  function welcome() {
    A.sheet('<h3>时序</h3><div class="lead">你只说「要做什么」,它排出「几点几分做」。</div>' +
      '<div class="card"><b>零字段</b><div class="small muted">不用填表。系统推断,你只做「确认」或「修正」。</div></div>' +
      '<div class="card"><b>不制造焦虑</b><div class="small muted">没做完是排程的问题。没有红色逾期,没有连续失败。</div></div>' +
      '<div class="card"><b>可解释</b><div class="small muted">点任何一个块,都会告诉你为什么排在那里。</div></div>' +
      '<button class="btn now" style="width:100%;margin-top:12px" data-act="try">试一句:周四前把方案给张总,周三下午三点碰个头…</button>' +
      '<button class="btn ghost" style="width:100%;margin-top:6px" data-act="close">我自己来</button>');
  }
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act="try"]'); if (!el) return;
    A.closeSheet(); A.capture('周四前把方案给张总,周三下午三点碰个头,周末记得带娃去打疫苗,还有这周五要还信用卡。');
  });

  function boot() {
    A.st = C.load(); C.initTimeZones(A.st);
    if (C.repairMoved(A.st)) C.save(A.st);
    if (A.st.items.length || A.st.habits.length) { C.plan(A.st, Date.now(), 'inc'); C.save(A.st); }     // 启动时整理一次:让位给硬约束、清掉已有的重叠
    const t = now(), d0 = C.dayStart(t);
    // 每天第一次打开:把昨天漏掉的事重新找位置(增量,不动已有安排)
    if (A.st.meta.lastOpenDay !== d0) {
      C.sweepMissed(A.st, t);
      A.st.blocks.forEach((b) => { if (b.missed && !b.skipped && b.itemId && b.start < d0) { /* 保留给晚间收尾处理 */ } });
      if (A.st.items.length) C.plan(A.st, t, 'inc');
      A.st.meta.lastOpenDay = d0; C.save(A.st);
    }
    const h = location.hash.replace('#', '');
    if (['today', 'plan', 'life', 'review'].includes(h)) A.tab = h;
    A.render();
    A.st.meta.onboarded = true;   // 不再自动弹出欢迎页;介绍放在「设置」里

    // 分享入口(Android / 桌面 Chrome 的「分享到时序」)
    const q = new URLSearchParams(location.search), shared = [q.get('title'), q.get('text'), q.get('url')].filter(Boolean).join(' ');
    if (shared) { history.replaceState(null, '', location.pathname); setTimeout(() => A.capture(shared, 'share'), 300); }
    if (q.get('shared') === '1' && G.caches) {
      history.replaceState(null, '', location.pathname);
      caches.open('chrono-share').then(async (c) => {
        const keys = await c.keys(), files = [], meta = await c.match('share-meta').then((r) => (r ? r.json() : {})).catch(() => ({}));
        for (const k of keys) if (/shared-img-/.test(k.url)) { const r = await c.match(k), b = await r.blob(); files.push(new File([b], 'shared.jpg', { type: b.type })); await c.delete(k); }
        await c.delete('share-meta');
        const txt = [meta.title, meta.text, meta.url].filter(Boolean).join(' ');
        if (files.length && A.LLM) A.LLM.captureImages(files, txt); else if (txt) A.capture(txt, 'share');
      });
    }
    const m = location.hash.match(/act=(\w+)&b=([\w]*)/); if (m) { setTimeout(() => A.handleAct(m[1], m[2]), 400); history.replaceState(null, '', location.pathname); }

    setInterval(() => {
      A.checkReminders();
      const idle = !$('#sheet-root').innerHTML && !A.focus && !(document.activeElement && document.activeElement.id === 'capIn' && $('#capIn').value);
      if (idle && (A.tab === 'today' || A.tab === 'plan') && !document.querySelector('.blk.drag')) A.render();
    }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { A.checkReminders(); if (!$('#sheet-root').innerHTML && !A.focus) A.render(); } });
    A.checkReminders();

    G.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); A._installEvt = e; });
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
      navigator.serviceWorker.addEventListener('message', (ev) => { if (ev.data && ev.data.chrono) A.handleAct(ev.data.act, ev.data.blockId); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
