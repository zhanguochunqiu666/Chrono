/* 时序 Chrono · 多设备同步
   设计:本地优先 + 端到端加密 + 逐条合并。
   - 设备上用「同步码」派生密钥(PBKDF2 → AES-GCM)加密整份数据,服务器只保存一团密文,看不到任何日程内容。
   - 房间号也由同步码单向派生,服务器不知道同步码本身。
   - 合并粒度是「一条事项 / 一个块 / 一个习惯」:谁后改谁生效;删除用墓碑记录,不会被旧设备复活。
   - 两台设备同时给同一件事各排了一遍,合并后自动去重,只保留最新的那一份。 */
(function (G) {
  'use strict';
  const C = G.Chrono, A = G.A, { MIN, DAY } = C;
  const $ = A.$, esc = A.esc;
  const COLL = ['items', 'habits', 'blocks', 'longterm'];
  const KEY = 'chrono.sync';
  const TOMB_KEEP = 30 * DAY;

  /* ---------- 纯函数:收集 / 合并 / 应用(便于测试) ---------- */
  function hash(o) {                       // cyrb53
    const s = JSON.stringify(o); let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  /* 把本机状态整理成「带更新时间」的记录。ver 记录每条的上次哈希与更新时间。 */
  function collect(st, ver, t) {
    const ents = Object.fromEntries(COLL.map((k) => [k, {}])), single = {};
    COLL.forEach((k) => {
      const v = (ver[k] = ver[k] || {}), seen = new Set();
      (st[k] || []).forEach((r) => {
        seen.add(r.id); const h = hash(r);
        if (!v[r.id] || v[r.id].del || v[r.id].h !== h) v[r.id] = { h, u: t };
        ents[k][r.id] = { u: v[r.id].u, d: r };
      });
      Object.keys(v).forEach((id) => {
        if (seen.has(id)) return;
        if (!v[id].del) v[id] = { del: true, u: t };
        if (t - v[id].u > TOMB_KEEP) { delete v[id]; return; }
        ents[k][id] = { u: v[id].u, del: true };
      });
    });
    const sv = (ver.single = ver.single || {});
    const pristine = !Object.keys(sv).length && !(st.items || []).length && !(st.habits || []).length && !(st.blocks || []).length;   // 全新设备首次加入:不用默认设置覆盖云端
    ['settings', 'stats'].forEach((k) => {
      const h = hash(st[k]); if (!sv[k] || sv[k].h !== h) sv[k] = { h, u: pristine ? 0 : t };
      single[k] = { u: sv[k].u, d: st[k] };
    });
    return { ents, single };
  }

  /* 合并:返回应用后的集合,以及哪些来自远端 / 哪些需要推送 */
  function merge(local, remote) {
    const out = { ents: Object.fromEntries(COLL.map((k) => [k, {}])), single: {}, fromRemote: 0, needPush: false };
    COLL.forEach((k) => {
      const L = local.ents[k] || {}, R = (remote && remote.ents && remote.ents[k]) || {};
      new Set(Object.keys(L).concat(Object.keys(R))).forEach((id) => {
        const l = L[id], r = R[id]; let pick;
        if (!l) pick = r; else if (!r) pick = l; else pick = r.u > l.u ? r : l;
        out.ents[k][id] = pick;
        if (pick === r && pick !== l) { if (!l || l.u !== r.u) out.fromRemote++; }
        if (pick === l && (!r || r.u < l.u)) out.needPush = true;
      });
    });
    ['settings', 'stats'].forEach((k) => {
      const l = local.single[k], r = remote && remote.single && remote.single[k];
      if (!r) { out.single[k] = l; out.needPush = true; return; }
      if (k === 'stats') { out.single[k] = { u: Math.max(l.u, r.u), d: mergeStats(l.d, r.d) }; if (hash(out.single[k].d) !== hash(r.d)) out.needPush = true; if (hash(out.single[k].d) !== hash(l.d)) out.fromRemote++; return; }
      out.single[k] = r.u > l.u ? r : l; if (r.u > l.u) out.fromRemote++; if (l.u > r.u) out.needPush = true;
    });
    return out;
  }
  function mergeStats(a, b) {          // 学到的估时数据:每个键取样本更多的一方
    const o = JSON.parse(JSON.stringify(a || {}));
    ['ratio', 'dur'].forEach((f) => { o[f] = o[f] || {}; Object.keys((b && b[f]) || {}).forEach((k) => { if (!o[f][k] || b[f][k].n > o[f][k].n) o[f][k] = b[f][k]; }); });
    ['energyDone', 'energyAll'].forEach((f) => { o[f] = o[f] || {}; Object.keys((b && b[f]) || {}).forEach((k) => { o[f][k] = Math.max(o[f][k] || 0, b[f][k]); }); });
    if (b && b.edits && (!o.edits || b.edits.total > o.edits.total)) o.edits = b.edits;
    return o;
  }

  /* 把合并结果写回状态,同时刷新 ver;随后去重 */
  function apply(st, merged, ver) {
    COLL.forEach((k) => {
      const v = (ver[k] = ver[k] || {}), arr = [];
      Object.keys(merged.ents[k]).forEach((id) => {
        const p = merged.ents[k][id];
        if (p.del) { v[id] = { del: true, u: p.u }; return; }
        arr.push(p.d); v[id] = { h: hash(p.d), u: p.u };
      });
      st[k] = arr;
    });
    const sv = (ver.single = ver.single || {});
    ['settings', 'stats'].forEach((k) => { st[k] = merged.single[k].d; sv[k] = { h: hash(st[k]), u: merged.single[k].u }; });
    return dedupe(st, ver);
  }

  /* 两台设备各自给同一件事排了一遍 → 只留最新的一份 */
  function dedupe(st, ver) {
    let n = 0; const skip = (b) => { b.skipped = true; ver.blocks[b.id] = { h: hash(b), u: Date.now() }; n++; };
    const live = st.blocks.filter((b) => !b.skipped && !b.done && !b.started && b.kind !== 'commit' && !b.locked);
    const byItem = {}, byKey = {};
    live.forEach((b) => { if (b.hkey) (byKey[b.hkey] = byKey[b.hkey] || []).push(b); else if (b.itemId) (byItem[b.itemId] = byItem[b.itemId] || []).push(b); });
    Object.keys(byKey).forEach((k) => { const g = byKey[k].sort((a, b) => ((ver.blocks[b.id] || {}).u || 0) - ((ver.blocks[a.id] || {}).u || 0)); g.slice(1).forEach(skip); });
    Object.keys(byItem).forEach((id) => {
      const it = C.itemOf(st, id); if (!it) return; const need = C.effMin(it);
      const done = st.blocks.filter((b) => b.itemId === id && b.done).reduce((a, b) => a + C.bmin(b), 0);
      let got = done; const g = byItem[id].sort((a, b) => ((ver.blocks[b.id] || {}).u || 0) - ((ver.blocks[a.id] || {}).u || 0));
      g.forEach((b) => { if (got >= need - 1) skip(b); else got += C.bmin(b); });
    });
    // 已丢弃的块超过 3 天就清掉,避免无限增长
    const cut = Date.now() - 3 * DAY, before = st.blocks.length;
    st.blocks = st.blocks.filter((b) => !(b.skipped && b.end < cut));
    if (st.log && st.log.length > 400) st.log = st.log.slice(-400);
    return n + (before - st.blocks.length);
  }

  /* ---------- 加密 ---------- */
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = (buf) => { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
  const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
  const subtle = () => (G.crypto && G.crypto.subtle) || null;
  const normCode = (c) => String(c || '').trim().toLowerCase().replace(/[\s-]+/g, '');
  const keyCache = {};
  async function derive(code) {
    code = normCode(code); if (keyCache[code]) return keyCache[code];
    const s = subtle(); if (!s) throw new Error('需要 https 或 localhost 环境才能加密同步。');
    keyCache[code] = (async () => {
      const base = await s.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
      const key = await s.deriveKey({ name: 'PBKDF2', salt: enc.encode('chrono-sync-v1:key'), iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const room = hex(await s.deriveBits({ name: 'PBKDF2', salt: enc.encode('chrono-sync-v1:room'), iterations: 150000, hash: 'SHA-256' }, base, 256));
      return { key, room };
    })();
    return keyCache[code];
  }
  async function seal(code, obj) {
    const { key } = await derive(code), iv = G.crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
    const all = new Uint8Array(12 + ct.byteLength); all.set(iv, 0); all.set(new Uint8Array(ct), 12); return b64(all);
  }
  async function open(code, blob) {
    const { key } = await derive(code), all = unb64(blob);
    try { return JSON.parse(dec.decode(await subtle().decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, key, all.slice(12)))); }
    catch (e) { throw new Error('同步码不对,或云端数据已损坏。'); }
  }
  const genCode = () => { const a = G.crypto.getRandomValues(new Uint8Array(10)), al = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; a.forEach((x, i) => { s += al[x % al.length]; if (i % 4 === 3 && i < 9) s += '-'; }); return s + [...G.crypto.getRandomValues(new Uint8Array(4))].map((x) => al[x % al.length]).join(''); };

  /* ---------- 配置 ---------- */
  const DEF = () => ({ on: false, server: '', code: '', rev: 0, ver: {}, last: 0, status: null });
  const getCfg = () => { try { return Object.assign(DEF(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return DEF(); } };
  const setCfg = (c) => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* */ } };

  /* ---------- 网络 ---------- */
  async function http(c, method, room, body) {
    const url = c.server.replace(/\/+$/, '') + '/' + room; let res;
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 12000), lc = A.Remote && A.Remote.lic();
    try { res = await fetch(url, { method, headers: Object.assign({ 'content-type': 'application/json' }, lc ? { 'x-license': lc.code } : {}), body: body ? JSON.stringify(body) : undefined, signal: ctl.signal }); }
    catch (e) { throw new Error(e && e.name === 'AbortError' ? '同步超时(12 秒无响应)。请检查网络,或服务器地址是否正确。' : '连不上同步服务器。请检查服务器地址(必须是 https://…/sync)和网络。'); }
    finally { clearTimeout(to); }
    let j = null; try { j = await res.json(); } catch (e) { /* */ }
    return { status: res.status, j: j || {} };
  }

  /* 把状态码翻译成能照着做的提示 */
  function hint(code) {
    if (code === 405 || code === 403 || code === 501) return '同步失败(' + code + '):这个地址只是网页站点,没有同步服务。请把「服务器地址」改成同步服务的地址(Worker 地址 + /sync),或按《部署到Cloudflare.md》重新部署带云函数的版本。';
    if (code === 500) return '同步失败(500):服务器还没绑定存储。请在 Cloudflare 里给它添加名为 CHRONO 的 KV 绑定,然后重新部署。';
    if (code === 402) return '同步失败(402):这个同步服务需要有效的授权码。请到 设置 → 账号与授权 输入。';
    if (code === 503) return '同步服务正在维护,请稍后再试。本地使用不受影响。';
    if (code === 404) return '同步失败(404):服务器地址不对,应以 /sync 结尾。';
    return '同步服务器返回错误(' + code + ')。';
  }
  let busy = false, busyAt = 0, timer = null;
  async function run(manual) {
    const c = getCfg(); if (!c.on || !A.st) { if (manual) A.toast('同步还没有开启。请先点「开启同步」并填好服务器地址和同步码。'); return { skipped: true }; }
    if (busy && manual && Date.now() - busyAt > 20000) busy = false;            // 上一次卡死了:强制解除
    if (busy) { if (manual) A.toast('正在同步中,请稍等…'); return { skipped: true }; } busy = true; busyAt = Date.now();
    try {
      const { room } = await derive(c.code), t = Date.now(); let pulled = 0, pushed = false;
      for (let attempt = 0; attempt < 4; attempt++) {
        const g = await http(c, 'GET', room);
        if (g.status !== 200 && g.status !== 404) throw new Error(hint(g.status));
        const remote = g.status === 200 && g.j.blob ? await open(c.code, g.j.blob) : null, rev = g.status === 200 ? g.j.rev : 0;
        const local = collect(A.st, c.ver, t), merged = merge(local, remote);
        const changed = apply(A.st, merged, c.ver); pulled = merged.fromRemote;
        /* 大模型配置(含密钥)一起同步:同样端到端加密,后改者生效;空配置不会覆盖已有的 */
        let llmPush = false;
        if (A.LLM) {
          const lc = A.LLM.getCfg(), lh = hash(lc);
          if (c.llmH !== lh) { c.llmH = lh; c.llmU = lc.key || lc.model !== 'claude-sonnet-4-5' ? t : 0; }
          const rl = remote && remote.llm;
          if (rl && rl.d && (rl.u || 0) > (c.llmU || 0) && hash(rl.d) !== lh) { A.LLM.setCfg(Object.assign({}, rl.d, { consent: lc.consent || rl.d.consent })); c.llmH = hash(A.LLM.getCfg()); c.llmU = rl.u; pulled++; }
          else if (!rl || (c.llmU || 0) > (rl.u || 0)) llmPush = !!(c.llmU);
        }
        if (merged.fromRemote || changed) { C.save.__raw ? C.save.__raw(A.st) : C.save(A.st); }
        if (merged.needPush || changed || !remote || llmPush) {
          const payload = { v: 1, t, dev: c.dev || '', ents: merged.ents, single: merged.single, log: (A.st.log || []).slice(-300), meta: {}, llm: A.LLM && c.llmU ? { u: c.llmU, d: A.LLM.getCfg() } : (remote && remote.llm) || undefined };
          const p = await http(c, 'PUT', room, { rev, blob: await seal(c.code, payload) });
          if (p.status === 409) continue;
          if (p.status !== 200) throw new Error(p.status === 413 ? '数据太大,服务器拒绝了。可先导出备份并清理旧数据。' : hint(p.status));
          c.rev = p.j.rev; pushed = true;
        } else c.rev = rev;
        break;
      }
      c.last = Date.now(); c.status = { ok: true, t: c.last, pulled, pushed }; setCfg(c);
      if (pulled) { A.render(); if (manual) A.toast('已同步:收到 ' + pulled + ' 处更新' + (pushed ? ',并上传了本机改动' : '') + '。'); }
      else if (manual) A.toast(pushed ? '已同步:本机改动已上传。' : '已是最新。');
      return { pulled, pushed };
    } catch (e) {
      c.status = { ok: false, t: Date.now(), msg: e.message }; setCfg(c);
      if (manual && !c.auto) A.toast(e.message, { ms: 7000 }); else if (manual) A.toast('本机同步服务没有启动。双击 启动.bat 后会自动同步。', { ms: 5000 });
      return { error: e.message };
    } finally { busy = false; }
  }
  const schedule = (ms) => { if (!getCfg().on) return; clearTimeout(timer); timer = setTimeout(() => run(false), ms || 4000); };

  /* 任何一次保存之后,过几秒自动同步(合并写回时用原始 save,避免循环) */
  const rawSave = C.save; const wrapped = function (st) { rawSave(st); schedule(4000); }; wrapped.__raw = rawSave; C.save = wrapped;

  /* ---------- 界面 ---------- */
  const when = (t) => { const d = Math.round((Date.now() - t) / 1000); return d < 10 ? '刚刚' : d < 60 ? d + ' 秒前' : d < 3600 ? Math.round(d / 60) + ' 分钟前' : d < 86400 ? Math.round(d / 3600) + ' 小时前' : Math.round(d / 86400) + ' 天前'; };
  function innerHtml() {
    const c = getCfg();
    if (!c.on) return '<div class="small muted">在手机、电脑、平板之间保持日程一致。内容先在设备上加密再上传,服务器看不到你的日程。</div><button class="btn sm" style="margin-top:10px" data-act="sync-open">开启同步</button>';
    const s = c.status;
    return '<div class="card" style="margin-top:6px"><div class="row between"><div class="grow"><b>' + (s && !s.ok ? (c.auto ? '本机服务未启动(启动后自动恢复)' : '同步出错') : (c.auto ? '已开启 · 本机自动同步' : '已开启')) + '</b><div class="small muted">' + (s ? (s.ok ? '上次同步 ' + when(s.t) : esc(s.msg)) : '尚未同步') + '</div></div><button class="btn sm" data-act="sync-now">立即同步</button></div>' +
      '<div class="small faint" style="margin-top:8px;word-break:break-all">服务器:' + esc(c.server) + '<br>同步码:<b id="syncCode">' + esc(c.code) + '</b> <button class="chip" data-act="sync-copy">复制</button></div>' +
      '<div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn sm" data-act="sync-open">修改</button><button class="btn sm ghost" data-act="sync-off">关闭同步</button><button class="btn sm warn" data-act="sync-wipe">清除云端数据</button></div></div>';
  }
  const settingsHtml = () => '<div id="syncBox">' + innerHtml() + '</div>';
  /* 只刷新同步那一块,不重开面板:不会重新滑入,也不会把滚动位置顶回开头 */
  const refreshBox = () => { const b = $('#syncBox'); if (b) b.innerHTML = innerHtml(); };
  function setupSheet(msg, fill) {
    const c = getCfg(), srv = (fill && fill.server) || c.server || (/^https?:/.test(location.protocol) ? location.origin + '/sync' : '');
    A.sheet('<h3>多设备同步</h3><div class="lead">' + esc(msg || '第一台设备:点「生成同步码」,记下它。其他设备:填同样的服务器地址和同步码即可。') + '</div>' +
      '<label class="field">同步服务器地址</label><input type="text" id="syServer" value="' + esc(srv) + '" placeholder="https://你的域名/sync" autocapitalize="off" spellcheck="false">' +
      '<label class="field">同步码(也是加密密钥,请保管好;丢失后云端数据无法恢复)</label><div class="row"><input type="text" id="syCode" value="' + esc((fill && fill.code) || c.code) + '" placeholder="xxxx-xxxx-xxxxxx" autocapitalize="off" spellcheck="false"><button class="btn sm" data-act="sync-gen">生成</button></div>' +
      '<button class="btn pri" style="width:100%;margin-top:14px" data-act="sync-go">开启并立即同步</button>' +
      '<div class="small faint" style="margin-top:10px">没有服务器?在电脑上运行 tools/server.js(局域网内同步),或把 tools/sync-worker.js 部署到 Cloudflare Workers(免费,手机在外面也能同步)。详见使用说明第十节。</div>');
  }
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return; const a = el.dataset.act;
    if (a === 'sync-open') { A.closeSheet(); setupSheet(); }
    else if (a === 'sync-gen') { $('#syCode').value = genCode(); }
    else if (a === 'sync-go') {
      const server = $('#syServer').value.trim(), code = normCode($('#syCode').value);
      if (!/^https?:\/\//.test(server)) { A.toast('请填写同步服务器地址(以 http:// 或 https:// 开头)。'); return; }
      if (code.length < 12) { A.toast('同步码太短。点「生成」得到一个安全的同步码。'); return; }
      const old = getCfg(), same = old.server === server && normCode(old.code) === code;
      const c = Object.assign(DEF(), same ? old : {}, { on: true, server, code, dev: old.dev || genCode().slice(0, 9) });
      setCfg(c); A.closeSheet(); A.toast('正在同步…'); run(true).then(() => { if (!subtle()) A.toast('当前页面不是安全环境,无法加密。请用 https 或 localhost 打开。'); });
    } else if (a === 'sync-now') { A.toast('正在同步…', { ms: 15000 });
      if (el.disabled) return; el.disabled = true; const old = el.textContent; el.textContent = '同步中…';
      run(true).then(() => { refreshBox(); }, () => { refreshBox(); });
    } else if (a === 'sync-off') { const c = getCfg(); c.on = false; c.autoOff = true; setCfg(c); refreshBox(); A.toast('已关闭同步。本机数据保留,云端数据没有删除。'); }
    else if (a === 'sync-copy') { const c = getCfg(); (navigator.clipboard ? navigator.clipboard.writeText(c.code) : Promise.reject()).then(() => A.toast('已复制同步码。'), () => A.toast('复制失败,请手动选中。')); }
    else if (a === 'sync-wipe') {
      if (!A._swArm) { A._swArm = true; el.textContent = '再点一次确认'; setTimeout(() => { A._swArm = false; if (el.isConnected) el.textContent = '清除云端数据'; }, 4000); return; }
      A._swArm = false; const c = getCfg();
      derive(c.code).then(({ room }) => http(c, 'DELETE', room)).then((r) => { c.on = false; c.rev = 0; c.ver = {}; setCfg(c); refreshBox(); A.toast(r.status === 200 ? '云端数据已清除,同步已关闭。' : '清除失败(' + r.status + ')。'); }).catch((er) => A.toast(er.message));
    }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(800); });
  G.addEventListener('online', () => schedule(800));
  setInterval(() => schedule(100), 90000);
  setTimeout(() => schedule(100), 1800);

  /* 本机自动配对:用 启动.bat / node tools/server.js 打开的页面,与直接双击的单文件版,通过本机服务自动连上同一个加密同步房间。
     只向本机 localhost 询问同步码,服务端只对本机回环地址应答。 */
  async function autoPair() {
    const c = getCfg(); if (c.on || c.autoOff) return;
    const bases = /^https?:$/.test(location.protocol) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? [location.origin] : ['http://localhost:8765', 'http://127.0.0.1:8765'];
    for (const b of bases) {
      try {
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 1500);
        const r = await fetch(b + '/sync-code', { signal: ctl.signal }); clearTimeout(to);
        if (!r.ok) continue; const j = await r.json(); if (!j.code || j.code.length < 12) continue;
        if (!(G.crypto && G.crypto.subtle)) return;
        setCfg(Object.assign(DEF(), { on: true, auto: true, server: b + '/sync', code: j.code, dev: genCode().slice(0, 9) }));
        run(false).then((x) => { if (x && x.pulled) A.toast('已与本机另一个版本自动同步:收到 ' + x.pulled + ' 处更新。'); });
        return;
      } catch (e) { /* 本机服务没开:不打扰 */ }
    }
  }
  setTimeout(autoPair, 2500); setInterval(autoPair, 120000);

  A.Sync = { autoPair, run, settingsHtml, getCfg, setCfg, genCode, _collect: collect, _merge: merge, _apply: apply, _seal: seal, _open: open, _derive: derive, _hash: hash, _dedupe: dedupe };
})(window);
