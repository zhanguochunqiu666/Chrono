// 生成 deploy/ 目录:网页本体 + Cloudflare Pages Functions(多设备同步 + 大模型代理)
// 用法: node tools/make_deploy.js     然后把 deploy 文件夹整个拖进 Cloudflare Pages 即可
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'deploy');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
['index.html', 'style.css', 'core.js', 'holiday.js', 'parse.js', 'sched.js', 'app.js', 'views.js', 'today.js', 'llm.js', 'sync.js', 'longterm.js', 'remote.js', 'agent.js', 'boot.js', 'manifest.json', 'sw.js'].forEach((f) => fs.copyFileSync(path.join(root, f), path.join(out, f)));
fs.readdirSync(path.join(root, 'icons')).forEach((f) => fs.copyFileSync(path.join(root, 'icons', f), path.join(out, 'icons', f)));

fs.writeFileSync(path.join(out, '_headers'), `/sw.js\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n/*.js\n  Cache-Control: no-cache\n/manifest.json\n  Content-Type: application/manifest+json\n/admin/*\n  X-Robots-Tag: noindex\n  Cache-Control: no-store\n`);

// 云函数与管理后台:来自 cloud/ 目录的真实源文件
const copyDir = (from, to) => { fs.mkdirSync(to, { recursive: true }); fs.readdirSync(from, { withFileTypes: true }).forEach((e) => { const f = path.join(from, e.name), t = path.join(to, e.name); e.isDirectory() ? copyDir(f, t) : fs.copyFileSync(f, t); }); };
copyDir(path.join(root, 'cloud', 'functions'), path.join(out, 'functions'));
copyDir(path.join(root, 'cloud', 'admin'), path.join(out, 'admin'));
console.log('deploy/ 已生成');
