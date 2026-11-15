// 时序 Chrono · Windows 桌面版入口(Electron)。界面与网页版完全相同,数据只存在本机。
const { app, BrowserWindow, Menu, shell, session, nativeTheme } = require('electron');
const path = require('path'), fs = require('fs');

app.setAppUserModelId('org.chrono.desktop');                 // Windows 通知需要
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const stateFile = () => path.join(app.getPath('userData'), 'window.json');
const loadState = () => { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch (e) { return {}; } };
let win = null;

function create() {
  const s = loadState();
  win = new BrowserWindow({
    width: s.w || 1180, height: s.h || 820, x: s.x, y: s.y, minWidth: 380, minHeight: 560,
    title: '时序 Chrono', icon: path.join(__dirname, 'app', 'icons', 'icon-512.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0C111B' : '#EDF0F6', show: false, autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  if (s.max) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  // 外部链接用系统浏览器打开,应用内不跳转到别的网站
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  const save = () => { if (!win || win.isDestroyed()) return; const b = win.getNormalBounds(); try { fs.writeFileSync(stateFile(), JSON.stringify({ x: b.x, y: b.y, w: b.width, h: b.height, max: win.isMaximized() })); } catch (e) { /* */ } };
  win.on('close', save); win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  // 本地页面直接请求大模型、节假日等接口时,放开跨域限制(桌面版不需要本地代理)。只放开响应头,不改页面内容。
  session.defaultSession.webRequest.onHeadersReceived((d, cb) => {
    if (/^https?:/.test(d.url)) {
      const h = {}; Object.keys(d.responseHeaders || {}).forEach((k) => { if (!/^access-control-/i.test(k)) h[k] = d.responseHeaders[k]; });
      h['Access-Control-Allow-Origin'] = ['*']; h['Access-Control-Allow-Headers'] = ['*']; h['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, OPTIONS'];
      return cb({ responseHeaders: h, statusLine: d.method === 'OPTIONS' ? 'HTTP/1.1 200 OK' : d.statusLine });
    }
    cb({ responseHeaders: d.responseHeaders });
  });
  // 通知权限:本应用自己的页面允许
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(['notifications', 'media', 'clipboard-sanitized-write'].includes(perm)));
  create();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) create(); });
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
