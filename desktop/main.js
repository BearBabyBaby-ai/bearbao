// 熊寶系統 Windows 版：直接開啟線上的熊寶系統，網頁更新後打開就是最新版，不用重新安裝
const { app, BrowserWindow, shell, session, Menu, screen, Tray, Notification, nativeImage, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { due } = require('./reminders');

const URL_HOME = 'https://bearbabybaby-ai.github.io/bearbao/';
const SITE = 'https://bearbabybaby-ai.github.io';
const HIDDEN = process.argv.includes('--hidden');   // 開機自動啟動時先縮在右下角
let win = null, tray = null, quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWin());
  app.whenReady().then(start);
}

const dataFile = name => path.join(app.getPath('userData'), name);
function readJson(name, def) { try { return JSON.parse(fs.readFileSync(dataFile(name), 'utf8')); } catch (_) { return def; } }
function writeJson(name, v) { try { fs.writeFileSync(dataFile(name), JSON.stringify(v)); } catch (_) {} }

/* 記住視窗大小與位置 */
function loadState() {
  const st = readJson('window2.json', null);
  if (st) return st;
  /* 預設寬一點：寬 1600、高 900，螢幕不夠大就用螢幕可用範圍 */
  const wa = screen.getPrimaryDisplay().workAreaSize;
  return { width: Math.min(1600, wa.width), height: Math.min(900, wa.height) };
}
function saveState() {
  if (!win || win.isDestroyed()) return;
  writeJson('window2.json', { ...win.getNormalBounds(), max: win.isMaximized() });
}

function showWin(view) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (view) win.webContents.send('xb-open', view);
}

function iconImage() {
  return nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
}

/* ── 提醒通知 ── */
let rem = readJson('reminders.json', { url: '', token: '', list: [], fetched: 0 });
let fired = readJson('fired.json', {});

ipcMain.on('xb-reminders', (e, d) => {
  if (!d) return;
  if (d.url) rem.url = String(d.url);
  if (d.token) rem.token = String(d.token);
  if (Array.isArray(d.reminders)) { rem.list = d.reminders; rem.fetched = Date.now(); }
  writeJson('reminders.json', rem);
  checkDue();
});

/* 每 30 分鐘向雲端取一次最新提醒（在電腦或手機修改試算表也會跟著更新） */
async function fetchReminders() {
  if (!rem.url || !rem.token) return;
  if (Date.now() - (rem.fetched || 0) < 30 * 60000) return;
  try {
    const res = await fetch(rem.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'bootstrap', token: rem.token }) });
    const out = await res.json();
    if (out && out.ok && out.data && Array.isArray(out.data.reminders)) {
      rem.list = out.data.reminders;
      rem.fetched = Date.now();
      writeJson('reminders.json', rem);
    }
  } catch (_) {}
}

function checkDue() {
  if (!Notification.isSupported()) return;
  const now = Date.now();
  let changed = false;
  due(rem.list, now).forEach(it => {
    if (fired[it.key]) return;
    fired[it.key] = it.when;
    changed = true;
    const n = new Notification({ title: it.title, body: it.body, icon: iconImage() });
    n.on('click', () => showWin('calendar'));
    n.show();
  });
  /* 清掉兩天前的紀錄 */
  Object.keys(fired).forEach(k => { if (fired[k] < now - 2 * 86400000) { delete fired[k]; changed = true; } });
  if (changed) writeJson('fired.json', fired);
}

async function tick() {
  await fetchReminders();
  checkDue();
}

/* ── 右下角小圖示 ── */
function autoStartOn() {
  return app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin;
}
function setAutoStart(on) {
  app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] });
}
function buildTray() {
  tray = new Tray(iconImage().resize({ width: 16, height: 16 }));
  tray.setToolTip('熊寶系統');
  const menu = () => Menu.buildFromTemplate([
    { label: '開啟熊寶系統', click: () => showWin() },
    { label: '開機自動啟動', type: 'checkbox', checked: autoStartOn(), click: item => { setAutoStart(item.checked); tray.setContextMenu(menu()); } },
    { type: 'separator' },
    { label: '結束熊寶系統', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu());
  tray.on('click', () => showWin());
}

function start() {
  Menu.setApplicationMenu(null);
  app.setAppUserModelId('io.github.bearbabybaby_ai.bearbao');

  /* 第一次執行時預設開機自動啟動，之後依右下角選單的設定 */
  const prefs = readJson('prefs.json', {});
  if (!prefs.autoStartSet) { setAutoStart(true); writeJson('prefs.json', { ...prefs, autoStartSet: true }); }

  /* 相機（拍發票）、通知直接允許 */
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(['media', 'notifications', 'clipboard-sanitized-write', 'fullscreen'].includes(permission));
  });

  const st = loadState();
  win = new BrowserWindow({
    x: st.x, y: st.y, width: st.width || 1600, height: st.height || 900,
    minWidth: 380, minHeight: 600,
    title: '熊寶系統',
    icon: iconImage(),
    backgroundColor: '#fef8e4',
    autoHideMenuBar: true,
    show: !HIDDEN,
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.js') }
  });
  if (st.max && !HIDDEN) win.maximize();

  /* 按關閉時縮到右下角繼續提醒，要結束請在右下角小圖示按右鍵 */
  win.on('close', e => {
    saveState();
    if (!quitting) { e.preventDefault(); win.hide(); }
  });

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
  buildTray();

  tick();
  setInterval(tick, 60000);
}

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => {});
