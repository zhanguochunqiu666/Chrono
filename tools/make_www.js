// 生成 www/ 目录,供 Capacitor(iOS/Android 原生壳)使用:  node tools/make_www.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
['index.html', 'style.css', 'core.js', 'holiday.js', 'parse.js', 'sched.js', 'app.js', 'views.js', 'today.js', 'llm.js', 'sync.js', 'longterm.js', 'remote.js', 'agent.js', 'boot.js', 'manifest.json', 'sw.js'].forEach((f) => fs.copyFileSync(path.join(root, f), path.join(out, f)));
fs.readdirSync(path.join(root, 'icons')).forEach((f) => fs.copyFileSync(path.join(root, 'icons', f), path.join(out, 'icons', f)));
console.log('www/ 已生成');
