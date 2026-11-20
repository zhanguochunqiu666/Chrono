/* 时序 Chrono · 长期事项
   一直要做、没有截止日、不适合排进某个时间块的事(坚持英语、联系老朋友、整理照片……)。
   - 常驻在「今天」页最上方,一打开就能看到,但从不自动进入日程。
   - 持续、温和的提醒:按你设的间隔,每天固定时间合并成一条通知;没做不会变红、不累计「欠债」。
   - 点「做了」只记一次;点「明天再说」只是今天不再提示。 */
(function (G) {
  'use strict';
  const C = G.Chrono, A = G.A, { DAY, DOMAINS, DOMAIN_KEYS } = C;
  const { $, esc, now } = A;
  const S = () => A.st.settings;
  const day0 = C.dayStart;

  /* ---------- 数据与规则(纯函数,便于测试) ---------- */
  const list = (st) => (st.longterm = st.longterm || []);
  function nextDue(h) { return h.lastDone ? C.addDays(day0(h.lastDone), h.every || 1) : day0(h.createdAt || 0); }
  function isDue(h, t) { return !h.paused && day0(t) >= nextDue(h) && !(h.snoozeUntil && h.snoozeUntil > t); }
  const dueList = (st, t) => list(st).filter((h) => isDue(h, t));
  const doneInDays = (h, t, n) => (h.log || []).filter((x) => x > C.addDays(day0(t), -(n - 1))).length;
  function add(st, d, t) {
    const h = { id: C.uid(st, 'l'), title: String(d.title).trim().slice(0, 40), note: String(d.note || '').slice(0, 120), domain: DOMAINS[d.domain] ? d.domain : C.domainOf(d.title), every: Math.max(1, Math.min(365, Math.round(+d.every || 1))), createdAt: t, lastDone: 0, snoozeUntil: 0, log: [], paused: false };
    list(st).push(h); return h;
  }
  function done(st, id, t) { const h = list(st).find((x) => x.id === id); if (!h) return null; h.lastDone = t; h.snoozeUntil = 0; h.log = (h.log || []).concat([t]).slice(-120); return h; }
  function snooze(st, id, t) { const h = list(st).find((x) => x.id === id); if (!h) return null; h.snoozeUntil = C.addDays(day0(t), 1); return h; }
  const remove = (st, id) => { st.longterm = list(st).filter((x) => x.id !== id); };

  /* 自然语言:「长期坚持背英语,每天提醒我」「一直要联系老朋友,每两周」 */
  const LT_RE = /长期|一直(?:都)?(?:要|得|在)|常驻|只(?:要)?提醒|不用排进?日程|不要排进?日程|别排进?日程|持续提醒/;
  function parseLongTerm(text) {
    text = String(text || '').trim(); if (!LT_RE.test(text)) return null;
    let every = 1, t = text;
    const m1 = t.match(/每(?:隔)?\s*([0-9一二两三四五六七八九十]+)\s*天/), m2 = t.match(/每(?:隔)?\s*([0-9一二两三四五六七八九十]+)?\s*(?:个)?(周|星期)/), m3 = /每(?:个)?月/.test(t), m4 = /每天|每日/.test(t);
    if (m1) { every = Math.max(1, C.cn(m1[1]) || 1); t = t.replace(m1[0], ' '); }
    else if (m2) { every = 7 * (m2[1] ? (C.cn(m2[1]) || 1) : 1); t = t.replace(m2[0], ' '); }
    else if (m3) { every = 30; t = t.replace(/每(?:个)?月/, ' '); }
    else if (m4) { every = 1; t = t.replace(/每天|每日/, ' '); }
    t = t.replace(/长期(?:任务|事项|要做|坚持)?|一直(?:都)?(?:要|得|在)?|常驻|持续提醒(?:我)?|(?:只|仅)(?:要)?提醒(?:我)?|(?:不用|不要|别)排(?:进)?日程|提醒我?|[,，。;；:：]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return null; return { title: t, every };
  }

  /* ---------- 今天页顶部卡片 ---------- */
  const sub = (h, t) => {
    const wk = doneInDays(h, t, 7), tail = wk ? ' · 近 7 天做了 ' + wk + ' 次' : '';
    if (h.paused) return '已暂停';
    if (isDue(h, t)) return (h.lastDone ? Math.max(1, Math.round((day0(t) - day0(h.lastDone)) / DAY)) + ' 天前做过' : '还没开始') + tail;
    if (h.snoozeUntil && h.snoozeUntil > t) return '今天先不提醒了' + tail;
    return '下次提醒 ' + C.dayLabel(nextDue(h), t) + tail;
  };
  A.ltHtml = () => {
    const st = A.st, t = now(), L = list(st);
    if (!L.length) return S().ltHint === false ? '' : '<section class="lt glass"><div class="lt-h"><b>长期事项</b><button class="btn sm" data-act="lt-add">添加</button></div><div class="small muted">一直要做、不想排进日程的事,放在这里,每天固定时间温和提醒你。<button class="chip" style="min-height:24px;margin-left:6px" data-act="lt-hide">不再显示这段</button></div></section>';
    const ord = L.slice().sort((a, b) => (isDue(b, t) - isDue(a, t)) || (a.createdAt - b.createdAt)), open = A._ltOpen, shown = open ? ord : ord.slice(0, 4), nDue = ord.filter((h) => isDue(h, t)).length;
    return '<section class="lt glass"><div class="lt-h"><b>长期事项</b><span class="small muted grow">' + (nDue ? nDue + ' 件在等你,不急' : '今天都不需要提醒') + '</span><button class="btn sm" data-act="lt-add">添加</button></div>' +
      shown.map((h) => { const due = isDue(h, t), dm = DOMAINS[h.domain] || DOMAINS.work; return '<div class="lt-r' + (due ? ' due' : '') + '" style="--c:' + dm.color + '"><i class="bar"></i><button class="lt-t" data-act="lt-edit" data-id="' + h.id + '"><span class="tt">' + esc(h.title) + '</span><span class="su">' + esc(sub(h, t)) + (h.note ? ' · ' + esc(h.note) : '') + '</span></button>' + (due ? '<button class="btn sm pri" data-act="lt-done" data-id="' + h.id + '">做了</button><button class="btn sm ghost" data-act="lt-snooze" data-id="' + h.id + '" title="今天不再提醒">明天</button>' : '<button class="btn sm" data-act="lt-done" data-id="' + h.id + '">做了</button>') + '</div>'; }).join('') +
      (ord.length > 4 ? '<button class="btn sm ghost" style="width:100%;margin-top:4px" data-act="lt-more">' + (open ? '收起' : '查看全部 ' + ord.length + ' 项') + '</button>' : '') + '</section>';
  };

  /* ---------- 添加 / 编辑面板 ---------- */
  A.ltSheet = (id, pre) => {
    const h = id ? list(A.st).find((x) => x.id === id) : null, d = h || Object.assign({ title: '', note: '', every: 1, domain: 'study' }, pre || {});
    A.sheet('<h3>' + (h ? '编辑长期事项' : '添加长期事项') + '</h3><div class="lead">不会出现在日程里,只在「今天」页顶部持续提醒你。没做也不会变红、不会累计。</div>' +
      '<label class="field">事项</label><input type="text" id="ltTitle" value="' + esc(d.title) + '" placeholder="例如:背英语单词 / 联系一下老朋友">' +
      '<label class="field">备注(可选)</label><input type="text" id="ltNote" value="' + esc(d.note || '') + '" placeholder="例如:每次 15 分钟就好">' +
      '<label class="field">多久提醒一次(天)</label><input type="number" id="ltEvery" min="1" max="365" value="' + d.every + '"><div class="chips" style="margin-top:8px">' + [[1, '每天'], [2, '隔天'], [3, '每 3 天'], [7, '每周'], [14, '每两周'], [30, '每月']].map(([n, l]) => '<button class="chip" data-act="lt-every" data-v="' + n + '">' + l + '</button>').join('') + '</div>' +
      '<label class="field">领域</label><select id="ltDom">' + DOMAIN_KEYS.map((k) => '<option value="' + k + '" ' + (d.domain === k ? 'selected' : '') + '>' + DOMAINS[k].name + '</option>').join('') + '</select>' +
      '<button class="btn pri" style="width:100%;margin-top:14px" data-act="lt-save" data-id="' + (id || '') + '">' + (h ? '保存' : '添加') + '</button>' +
      (h ? '<div class="row" style="gap:8px;margin-top:6px"><button class="btn ghost grow" data-act="lt-pause" data-id="' + id + '">' + (h.paused ? '恢复提醒' : '暂停提醒') + '</button><button class="btn ghost warn grow" data-act="lt-del" data-id="' + id + '">删除</button></div>' : ''));
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return; const a = el.dataset.act, st = A.st, t = now(), id = el.dataset.id;
    if (a === 'lt-add') A.ltSheet(null);
    else if (a === 'lt-edit') A.ltSheet(id);
    else if (a === 'lt-every') { const i = $('#ltEvery'); if (i) i.value = el.dataset.v; }
    else if (a === 'lt-more') { A._ltOpen = !A._ltOpen; A.render(); }
    else if (a === 'lt-hide') A.mutate(() => { S().ltHint = false; });
    else if (a === 'lt-done') A.mutate(() => done(st, id, t), '记下了。想做的时候做,没做也没关系。');
    else if (a === 'lt-snooze') A.mutate(() => snooze(st, id, t), '好,今天不再提醒这一项。');
    else if (a === 'lt-save') {
      const title = $('#ltTitle').value.trim(); if (!title) { A.toast('请填写事项名称。'); return; }
      const d = { title, note: $('#ltNote').value.trim(), every: +$('#ltEvery').value || 1, domain: $('#ltDom').value };
      A.closeSheet(); A.mutate(() => { if (id) { const h = list(st).find((x) => x.id === id); if (h) Object.assign(h, { title: d.title.slice(0, 40), note: d.note.slice(0, 120), every: Math.max(1, Math.min(365, Math.round(d.every))), domain: d.domain }); } else add(st, d, t); }, id ? '已保存。' : '已添加,在「今天」页顶部可以看到。');
    } else if (a === 'lt-pause') { A.closeSheet(); A.mutate(() => { const h = list(st).find((x) => x.id === id); if (h) h.paused = !h.paused; }); }
    else if (a === 'lt-del') { A.closeSheet(); A.mutate(() => remove(st, id), '已删除。'); }
  });

  /* 自然语言入口:交给面板预填,由你确认 */
  const base = A.capture;
  A.capture = function (text, source) {
    const p = source !== 'llm' && source !== 'agent' && !(A.pending && A.pending.length) ? parseLongTerm(text) : null;
    if (p) { const i = $('#capIn'); if (i) i.value = ''; A._capText = ''; return A.ltSheet(null, p); }
    return base(text, source);
  };

  /* ---------- 持续提醒:每天固定时间合并成一条;晚间可选再提醒一次 ---------- */
  function ltRemind() {
    if (!A.st || !A.notify) return; const s = S(), cfg = s.ltRemind || { on: true, time: 540, evening: false }; if (!cfg.on || (A.focus)) return;
    const t = now(), d = day0(t), mins = C.minuteOfDay(t), due = dueList(A.st, t); if (!due.length) return;
    const body = due.slice(0, 3).map((h) => h.title).join('、') + (due.length > 3 ? ' 等 ' + due.length + ' 件' : '');
    if (mins >= cfg.time) A.notify('lt:' + d, '长期事项:' + due.length + ' 件在等你', body + '。不急,想做时做。', null, false);
    if (cfg.evening && mins >= 20 * 60) A.notify('lt2:' + d, '今天还有长期事项没动', body, null, false);
  }
  setInterval(ltRemind, 60000); setTimeout(ltRemind, 5000);

  A.Long = { remind: ltRemind, isDue, dueList, nextDue, add, done, snooze, remove, parseLongTerm, list, sub };
})(window);
