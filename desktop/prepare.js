// 把网页文件复制到 desktop/app,并准备图标。npm run prepare-app
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), app = path.join(__dirname, 'app'), build = path.join(__dirname, 'build');
fs.rmSync(app, { recursive: true, force: true }); fs.mkdirSync(path.join(app, 'icons'), { recursive: true }); fs.mkdirSync(build, { recursive: true });
['index.html', 'style.css', 'core.js', 'holiday.js', 'parse.js', 'sched.js', 'app.js', 'views.js', 'today.js', 'llm.js', 'sync.js', 'longterm.js', 'remote.js', 'agent.js', 'boot.js', 'manifest.json'].forEach((f) => fs.copyFileSync(path.join(root, f), path.join(app, f)));
fs.readdirSync(path.join(root, 'icons')).filter((f) => /\.png$|\.svg$/.test(f)).forEach((f) => fs.copyFileSync(path.join(root, 'icons', f), path.join(app, 'icons', f)));
fs.copyFileSync(path.join(root, 'icons', 'chrono.ico'), path.join(build, 'icon.ico'));
console.log('desktop/app 已准备好');
