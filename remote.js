/* 时序 Chrono · 云服务连接(可选)
   只在你把应用部署到自己的网址(或手动填了云服务地址)时才会联网:读取公告 / 最低版本 / 维护状态,校验授权码。
   本地使用、没有部署后台时,这个文件什么都不会做。不会上传任何事项内容。 */
(function (G) {
  'use strict';
  const C = G.Chrono, A = G.A, { $, esc, now } = A;
  const VERSION = '1.5.2', REPO = '';                         // REPO:填上你的 GitHub 地址,设置页会显示「源代码」链接(AGPL 建议)
  const LS = (k, v) => { try { if (v === undefined) return G.localStorage.getItem(k); if (v === null) G.localStorage.removeItem(k); else G.localStorage.setItem(k, v); } catch (e) { /* */ } return null; };
  const cmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0 ? -1 : 1; } return 0; };
  const base = () => { const o = (G.location && /^https?:$/.test(location.protocol) && !/^(localhost|127\.|\[::1\])/.test(location.hostname)) ? location.origin : (LS('chrono.cloud') || ''); return String(o).replace(/\/+$/, ''); };
  const device = () => { let d = LS('chrono.dev'); if (!d) { d = [...G.crypto.getRandomValues(new Uint8Array(10))].map((x) => x.toString(16).padStart(2, '0')).join(''); LS('chrono.dev', d); } return d; };
  const lic = () => { try { return JSON.parse(LS('chrono.license') || 'null'); } catch (e) { return null; } };
  const R = (A.Remote = { cfg: null, VERSION, base, lic, cmp });

  async function load() {
    const b = base(); if (!b || !G.fetch) return;
    try { const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 6000); const r = await fetch(b + '/api/config', { signal: ctl.signal }); clearTimeout(to); if (!r.ok) return; R.cfg = await r.json(); try { A.render(); } catch (e) { /* */ } } catch (e) { /* 离线或没有后台:忽略 */ }
  }

  /* 顶部提示:公告 / 需要更新 / 维护中 */
  const baseBanners = A.banners;
  A.banners = () => {
    let h = baseBanners(); const c = R.cfg; if (!c) return h;
    if (c.maintenance) h = '<div class="banner calm"><b>服务维护中</b>:' + esc(c.maintenanceText || '同步暂不可用,本地使用不受影响。') + '</div>' + h;
    if (c.minVersion && cmp(VERSION, c.minVersion) < 0) h = '<div class="banner calm"><div class="between row"><div class="grow"><b>有新版本</b>:请刷新页面更新(当前 ' + VERSION + ',需要 ' + esc(c.minVersion) + ' 以上)。</div><button class="btn sm" data-act="reload">刷新</button></div></div>' + h;
    if (c.announcement && String(LS('chrono.ann')) !== String(c.announcement.id)) h = '<div class="banner' + (c.announcement.level === 'warn' ? ' calm' : '') + '"><div class="between row"><div class="grow">' + esc(c.announcement.text) + '</div><button class="btn sm ghost" data-act="ann-x" aria-label="关闭公告">关闭</button></div></div>' + h;
    return h;
  };

  /* 设置页「账号与授权」 */
  R.html = () => {
    const b = base(), l = lic(), c = R.cfg;
    const st = l ? '已激活 · ' + (l.plan || 'pro') + (l.expires ? ' · 到期 ' + new Date(l.expires).toLocaleDateString('zh-CN') : ' · 永久') : (c && c.requireLicense ? '托管的同步与 AI 代理需要授权码' : '未激活(自建或免费使用无需授权码)');
    return '<div class="small muted">' + esc(st) + '</div>' +
      (b ? '' : '<label class="field">云服务地址(部署后台的网址,可留空)</label><input type="text" id="rmBase" value="' + esc(LS('chrono.cloud') || '') + '" placeholder="https://你的域名" autocapitalize="off" spellcheck="false">') +
      '<div class="row" style="gap:8px;margin-top:8px"><input type="text" id="rmCode" placeholder="XXXX-XXXX-XXXX-XXXX" value="' + esc(l ? l.code : '') + '" autocapitalize="characters" spellcheck="false"><button class="btn sm pri" data-act="lic-verify">验证</button>' + (l ? '<button class="btn sm ghost" data-act="lic-clear">移除</button>' : '') + '</div>' +
      '<div class="small faint" style="margin-top:8px">版本 ' + VERSION + ' · 开源协议 AGPL-3.0' + (REPO ? ' · <a href="' + esc(REPO) + '" target="_blank" rel="noopener">源代码</a>' : '') + '</div>';
  };

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return; const a = el.dataset.act;
    if (a === 'reload') { try { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); const rs = await navigator.serviceWorker.getRegistrations(); rs.forEach((r) => r.unregister()); } catch (er) { /* */ } location.reload(); }
    else if (a === 'ann-x') { if (R.cfg && R.cfg.announcement) LS('chrono.ann', String(R.cfg.announcement.id)); A.render(); }
    else if (a === 'lic-clear') { LS('chrono.license', null); A.settings(); A.toast('已移除授权码。'); }
    else if (a === 'lic-verify') {
      const inp = $('#rmBase'); if (inp && inp.value.trim()) LS('chrono.cloud', inp.value.trim());
      const code = ($('#rmCode') || {}).value || '', b = base(); if (!b) { A.toast('请先填写云服务地址。'); return; } if (!code.trim()) { A.toast('请输入授权码。'); return; }
      A.toast('正在验证…', { ms: 12000 });
      try {
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10000);
        const r = await fetch(b + '/api/license/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, device: device() }), signal: ctl.signal }); clearTimeout(to);
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.ok) { LS('chrono.license', JSON.stringify({ code: code.trim().toUpperCase(), plan: j.plan, expires: j.expires, checked: Date.now() })); A.settings(); A.toast('授权码有效,已激活。'); }
        else A.toast(j.message || (r.status === 404 ? '这个地址上没有后台服务。' : '验证失败(' + r.status + ')。'), { ms: 6000 });
      } catch (er) { A.toast(er.name === 'AbortError' ? '验证超时,请检查网络。' : '连不上云服务,请检查地址。', { ms: 6000 }); }
    }
  });
  setTimeout(load, 1500); setInterval(load, 30 * 60 * 1000);
})(window);
