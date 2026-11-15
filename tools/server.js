// 时序 Chrono 本地服务:静态文件 + 大模型代理(解决浏览器跨域)。  node tools/server.js [端口]
// 只依赖 Node 自带模块。代理只转发到 https/http 的大模型接口,并且只监听本机/局域网。
const http = require('http'), https = require('https'), fs = require('fs'), path = require('path'), os = require('os'), { URL } = require('url');
const root = path.join(__dirname, '..'), PORT = +process.argv[2] || 8765;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8' };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/proxy') {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    const target = req.headers['x-target-url'];
    let t; try { t = new URL(target); if (!/^https?:$/.test(t.protocol)) throw 0; } catch (e) { res.writeHead(400, CORS); return res.end('bad x-target-url'); }
    const h = Object.assign({}, req.headers); ['host', 'origin', 'referer', 'x-target-url', 'content-length', 'connection'].forEach((k) => delete h[k]);
    const chunks = []; req.on('data', (c) => chunks.push(c)).on('end', () => {
      const body = Buffer.concat(chunks); h['content-length'] = body.length;
      const lib = t.protocol === 'https:' ? https : http;
      const pr = lib.request({ hostname: t.hostname, port: t.port || (t.protocol === 'https:' ? 443 : 80), path: t.pathname + t.search, method: 'POST', headers: h, timeout: 120000 }, (r) => {
        const oh = Object.assign({}, r.headers, CORS); delete oh['content-encoding']; res.writeHead(r.statusCode, oh); r.pipe(res);
      });
      pr.on('error', (e) => { res.writeHead(502, CORS); res.end('proxy error: ' + e.message); });
      pr.on('timeout', () => pr.destroy(new Error('timeout')));
      pr.end(body);
    });
    return;
  }
  if (u.pathname === '/sync-code') {                                   // 本机自动配对:只对本机回环地址应答
    const ra = req.socket.remoteAddress || '', H = { ...CORS, 'content-type': 'application/json' };
    if (!/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(ra)) { res.writeHead(403, H); return res.end('{"error":"local only"}'); }
    if (req.method === 'OPTIONS') { res.writeHead(204, H); return res.end(); }
    const dir0 = path.join(__dirname, 'sync-data'), f0 = path.join(dir0, '.code'); let code;
    try { code = fs.readFileSync(f0, 'utf8').trim(); } catch (e) { const al = 'abcdefghjkmnpqrstuvwxyz23456789'; code = [...require('crypto').randomBytes(18)].map((x) => al[x % al.length]).join(''); fs.mkdirSync(dir0, { recursive: true }); fs.writeFileSync(f0, code); }
    res.writeHead(200, H); return res.end(JSON.stringify({ code }));
  }
  const sm = u.pathname.match(/^\/sync\/([a-f0-9]{64})$/);
  if (sm || u.pathname.startsWith('/sync/')) {                      // 同步:只存密文,协议与 sync-worker.js 一致
    const H = { ...CORS, 'access-control-allow-methods': 'GET, PUT, DELETE, OPTIONS', 'content-type': 'application/json' };
    if (req.method === 'OPTIONS') { res.writeHead(204, H); return res.end(); }
    if (!sm) { res.writeHead(404, H); return res.end('{"error":"not found"}'); }
    const dir = path.join(__dirname, 'sync-data'), file = path.join(dir, sm[1] + '.json');
    const cur = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; } };
    if (req.method === 'GET') { const v = cur(); res.writeHead(v ? 200 : 404, H); return res.end(JSON.stringify(v || { error: 'empty' })); }
    if (req.method === 'DELETE') { try { fs.unlinkSync(file); } catch (e) { /* */ } res.writeHead(200, H); return res.end('{"ok":true}'); }
    if (req.method === 'PUT') {
      const chunks = []; let size = 0;
      req.on('data', (c) => { size += c.length; if (size > 20 * 1024 * 1024) req.destroy(); else chunks.push(c); }).on('end', () => {
        let b; try { b = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { res.writeHead(400, H); return res.end('{"error":"bad body"}'); }
        if (!b || typeof b.blob !== 'string') { res.writeHead(400, H); return res.end('{"error":"bad body"}'); }
        const v = cur(), rev = v ? v.rev : 0;
        if ((b.rev || 0) !== rev) { res.writeHead(409, H); return res.end(JSON.stringify({ error: 'conflict', rev })); }
        fs.mkdirSync(dir, { recursive: true }); const next = { rev: rev + 1, blob: b.blob, t: Date.now() };
        fs.writeFileSync(file, JSON.stringify(next)); res.writeHead(200, H); res.end(JSON.stringify({ rev: next.rev }));
      });
      return;
    }
    res.writeHead(405, H); return res.end('{"error":"method"}');
  }
  let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
  const f = path.normalize(path.join(root, p));
  if (!f.startsWith(root) || /[\\/](tests|tools|node_modules|\.git|sync-data)[\\/]/.test(f)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log('\n  时序 Chrono 已启动:  http://localhost:' + PORT);
  Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).forEach((n) => console.log('  手机同一 Wi-Fi 下:   http://' + n.address + ':' + PORT));
  console.log('  大模型代理地址:      http://localhost:' + PORT + '/proxy   (填到 设置 → 大模型 → 本地代理)\n  按 Ctrl+C 停止。\n');
});
