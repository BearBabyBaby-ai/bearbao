// 熊寶系統 Windows 版：直接開啟線上的熊寶系統，網頁更新後打開就是最新版，不用重新安裝
const { app, BrowserWindow, shell, session, Menu } = require('electron');
const fs = require('fs');
const path = require('path');

const URL_HOME = 'https://bearbabybaby-ai.github.io/bearbao/';
const SITE = 'https://bearbabybaby-ai.github.io';
let win = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(start);
}

/* 記住視窗大小與位置 */
const stateFile = () => path.join(app.getPath('userData'), 'window.json');
function loadState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch (_) { return { width: 1280, height: 820 }; }
}
function saveState() {
  if (!win || win.isDestroyed()) return;
  try { fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), max: win.isMaximized() })); } catch (_) {}
}

function start() {
  Menu.setApplicationMenu(null);
  app.setAppUserModelId('io.github.bearbabybaby_ai.bearbao');

  /* 相機（拍發票）、通知直接允許 */
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(['media', 'notifications', 'clipboard-sanitized-write', 'fullscreen'].includes(permission));
  });

  const st = loadState();
  win = new BrowserWindow({
    x: st.x, y: st.y, width: st.width || 1280, height: st.height || 820,
    minWidth: 380, minHeight: 600,
    title: '熊寶系統',
    backgroundColor: '#fef8e4',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true }
  });
  if (st.max) win.maximize();
  win.on('close', saveState);

  /* 熊寶系統以外的連結（Google 地圖、導航等）用瀏覽器開啟 */
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(URL_HOME)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(SITE)) { e.preventDefault(); shell.openExternal(url); }
  });

  /* 沒有網路時顯示提示，按一下重試 */
  win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return;
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
      '<body style="font-family:Microsoft JhengHei,sans-serif;background:#fef8e4;display:grid;place-items:center;height:100vh;margin:0">' +
      '<div style="text-align:center"><h2>熊寶系統暫時連不上網路</h2><p>請確認網路後按下面的按鈕重試</p>' +
      `<button onclick="location.href='${URL_HOME}'" style="font-size:18px;padding:10px 24px;border-radius:12px;border:0;background:#0a6fb3;color:#fff;cursor:pointer">重試</button></div></body>`));
  });

  win.loadURL(URL_HOME);
}

app.on('window-all-closed', () => app.quit());
