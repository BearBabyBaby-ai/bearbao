// 熊寶桌寵（獨立版）：熊寶在桌面走動；工作模式只能查詢，交給熊寶系統網頁版處理
// 熊寶系統網頁版的查詢功能更新後，這裡打開就是最新的，不用重新安裝
const { app, BrowserWindow, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const pet = require('./pet/src/index');

pet.register();

const URL_HOME = 'https://bearbabybaby-ai.github.io/bearbao/';
let tray = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(start);
}

/* ── 工作模式：在背景開熊寶系統網頁版處理（只查詢，不寫入熊寶系統） ── */
let helper = null;
const hasCmd = w => w.webContents.executeJavaScript('typeof window.BearCmd === "object" && typeof window.BearCmd.run === "function"').catch(() => false);
const onSystem = w => w && !w.isDestroyed() && !w.webContents.isLoading() && w.webContents.getURL().startsWith(URL_HOME);
async function systemPage() {
  if (onSystem(helper) && await hasCmd(helper)) return helper;
  if (!helper || helper.isDestroyed()) {
    helper = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'system-preload.js') } });
    helper.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  }
  if (!onSystem(helper)) { try { await helper.loadURL(URL_HOME); } catch (_) { /* 下面再判斷 */ } }
  for (let i = 0; i < 40; i++) {
    if (onSystem(helper) && await hasCmd(helper)) return helper;
    await new Promise(r => setTimeout(r, 250));
  }
  return null;
}
async function askSystem(text) {
  const w = await systemPage();
  if (!w) return '連不上熊寶系統，請確認網路後再試一次';
  return w.webContents.executeJavaScript(`window.BearCmd.run(${JSON.stringify(text)}, { query: true })`, true);
}

/* ── 右下角小圖示 ── */
function iconImage() {
  return nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
}
/* 動作圖第一次下載時顯示進度 */
function petLabel() {
  const st = pet.status();
  if (!pet.ready()) {
    if (st.phase === 'download') return `熊寶下載中 ${st.pct}%`;
    if (st.phase === 'retry') return '熊寶下載失敗，稍後自動重試';
    return '熊寶準備中…';
  }
  return pet.isHidden() ? '顯示熊寶' : '隱藏熊寶';
}
function menu() {
  return Menu.buildFromTemplate([
    { label: petLabel(), enabled: pet.ready(), click: () => pet.setHidden(!pet.isHidden()) },
    { label: '熊寶工作模式', type: 'checkbox', checked: pet.isDesk(), enabled: pet.ready(), click: item => pet.setDesk(item.checked) },
    { type: 'separator' },
    { label: '結束熊寶桌寵', click: () => app.quit() }
  ]);
}
function refreshTray() {
  if (!tray) return;
  tray.setContextMenu(menu());
  tray.setToolTip(pet.ready() ? '熊寶桌寵' : '熊寶桌寵・' + petLabel());
}

function start() {
  Menu.setApplicationMenu(null);
  app.setAppUserModelId('io.github.bearbabybaby_ai.bearbaopet');

  tray = new Tray(iconImage().resize({ width: 16, height: 16 }));
  tray.on('click', () => { if (pet.ready()) pet.setHidden(!pet.isHidden()); });
  refreshTray();

  let lastPct = -1;
  pet.start({ ask: askSystem, onChange: st => {
    if (st && st.phase === 'download' && st.pct === lastPct) return;
    if (st) lastPct = st.pct;
    refreshTray();
  } });
}

app.on('before-quit', () => { if (helper && !helper.isDestroyed()) helper.destroy(); });
app.on('window-all-closed', () => {});
