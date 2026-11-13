'use strict';
// 熊寶桌寵（併入熊寶系統電腦版）：由熊寶系統主程式啟動，共用右下角小圖示
// 動作圖第一次使用時下載到使用者資料夾，之後不用再下載
const { app, BrowserWindow, ipcMain, screen, powerMonitor, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('./log');
const calendar = require('./calendar');
const win32 = require('./win32');
const activity = require('./activity');
const { Bear, W } = require('./brain');

process.on('uncaughtException', e => log('未預期的錯誤', e));
process.on('unhandledRejection', e => log('未處理的錯誤', e));

// 程式內的畫面與動作圖都由 bearbao:// 提供（同一來源，才能讀取動作圖的像素）
// 這兩行要在程式準備好之前執行，由熊寶系統主程式一載入就呼叫
function register() {
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  protocol.registerSchemesAsPrivileged([{ scheme: 'bearbao', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
}
const ROOT = path.join(__dirname, '..');
const gifs = require('./gifs');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.gif': 'image/gif', '.png': 'image/png', '.json': 'application/json' };
function serve(req) {
  const u = new URL(req.url);
  const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
  // 動作圖放在使用者資料夾（第一次使用時下載），其他檔案在程式裡
  const GIF = 'assets/pack/gifs/';
  const base = rel.startsWith(GIF) ? gifs.dir() : ROOT;
  const file = path.normalize(path.join(base, rel.startsWith(GIF) ? rel.slice(GIF.length) : rel));
  if (!file.startsWith(base + path.sep) || !(rel.startsWith('src/') || rel.startsWith('assets/'))) {
    return new Response('', { status: 404 });
  }
  return fs.promises.readFile(file).then(
    buf => new Response(buf, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' } }),
    () => new Response('', { status: 404 })
  );
}

const bears = new Set();
let mainBear = null;
let hidden = false;
let started = false;
let fullscreenOn = false;

// ---------- 其他視窗的位置 ----------
let windows = [];           // 由上而下，座標為邏輯像素
let windowMap = new Map();
const nudgeAcc = new Map();

function ownPids() {
  const s = new Set([process.pid]);
  try { for (const m of app.getAppMetrics()) s.add(m.pid); } catch (_) { /* 忽略 */ }
  return s;
}

function toDip(r) {
  const rect = { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top };
  try { return screen.screenToDipRect(null, rect); } catch (_) { return rect; }
}

function pollWindows() {
  if (!win32.available() || hidden) return;
  const list = win32.listWindows(ownPids()).map(w => ({ hwnd: w.hwnd, zoomed: w.zoomed, rect: toDip(w.rect) }));
  windows = list;
  windowMap = new Map(list.map(w => [w.hwnd, w]));
}

const contains = (r, x, y) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;

function occluded(w, x, y) {
  const i = windows.indexOf(w);
  for (let j = 0; j < (i < 0 ? windows.length : i); j++) if (contains(windows[j].rect, x, y)) return true;
  return false;
}

// ---------- 給熊寶用的世界 ----------
// 季節或節日服裝要每個動作都有圖才換上，否則全程穿原本的衣服
const clipsLib = require('./clips');
function currentOutfit() {
  const o = process.env.BEARBAO_TEST_OUTFIT || calendar.outfit();   // 測試用：指定服裝
  return clipsLib.outfitComplete(o) ? o : 'default';
}
let outfitNow = currentOutfit();
const world = {
  displayAt(x, y) { return screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) }); },
  deskArea: () => screen.getPrimaryDisplay().workArea,
  outfit: () => outfitNow,
  timeOfDay: () => calendar.timeOfDay(),
  cursor: () => screen.getCursorScreenPoint(),
  bearCount: () => bears.size,
  windowById: id => windowMap.get(id) || null,
  occluded: (w, x, y) => occluded(w, x, y),
  landingWindow(fx, prevFy, fy, wa) {
    let best = null;
    for (const w of windows) {
      const r = w.rect;
      if (w.zoomed || r.width < 140 || r.y < wa.y + 60 || r.y > wa.y + wa.height - 20) continue;
      if (fx < r.x + 15 || fx > r.x + r.width - 15) continue;
      if (!(prevFy <= r.y + 1 && fy >= r.y)) continue;
      if (occluded(w, fx, r.y - 4)) continue;
      if (!best || r.y < best.rect.y) best = w;
    }
    return best;
  },
  sideObstacle(prevFront, newFront, facing, footY) {
    for (const w of windows) {
      const r = w.rect;
      if (w.zoomed || r.y + r.height < footY - 30 || r.y > footY - 160) continue;
      const wa = screen.getDisplayNearestPoint({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y) }).workArea;
      if (r.y < wa.y + 60) continue;
      const edge = facing > 0 ? r.x : r.x + r.width;
      if (facing > 0 ? (prevFront < edge && newFront >= edge) : (prevFront > edge && newFront <= edge)) return w;
    }
    return null;
  },
  nudge(w, dxDip) {
    const sf = screen.getDisplayNearestPoint({ x: Math.round(w.rect.x), y: Math.round(w.rect.y) }).scaleFactor || 1;
    let acc = (nudgeAcc.get(w.hwnd) || 0) + dxDip * sf;
    const px = Math.trunc(acc);
    acc -= px;
    nudgeAcc.set(w.hwnd, acc);
    if (px && !win32.nudgeWindow(w.hwnd, px)) return false;
    w.rect = { ...w.rect, x: w.rect.x + dxDip };
    return true;
  },
  send(bear, channel, data) {
    const h = handles.get(bear);
    if (!h) return;
    if (!h.ready) { h.queue.push([channel, data]); return; }
    if (!h.win.isDestroyed()) h.win.webContents.send(channel, data);
  },
  later(bear, ms, fn) {
    setTimeout(() => { if (bears.has(bear)) { try { fn(); } catch (e) { log('延後動作失敗', e); } } }, ms);
  },
  canSplit: () => !desk && bears.size < 2 && Date.now() - lastSplit >= SPLIT_COOLDOWN,
  split(bear) {
    if (!world.canSplit()) return bear.idle();
    lastSplit = Date.now();
    bear.effect('exclamation');
    bear.anim('jump', () => bear.idle());
    // 從本尊旁邊的同一個地面出現（不從半空掉下來），離開一點不和本尊重疊
    const a = bear.wa(), side = bear.fx - a.x > a.x + a.width - bear.fx ? -1 : 1;
    const c = createBear({ clone: true, fx: bear.fx + side * 110, fy: bear.fy, facing: side });
    c.vx = side * 60;
  }
};

// 分身：一小時最多一次（以前沒有冷卻，看起來像無限複製）
const SPLIT_COOLDOWN = 60 * 60000;
let lastSplit = Date.now();

// ---------- 熊寶視窗 ----------
const handles = new Map();
const clips = clipsLib;

function createBear(opts = {}) {
  const win = new BrowserWindow({
    width: W, height: W, useContentSize: true, show: false, frame: false, transparent: true,
    backgroundColor: '#00000000', resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, focusable: false, hasShadow: false,
    title: '熊寶桌寵',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false, spellcheck: false }
  });
  const h = { win, ready: false, queue: [], bear: null };
  const bear = new Bear(world, opts);
  h.bear = bear;
  handles.set(bear, h);
  bears.add(bear);
  bear.startFall(0);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true);   // 平常點穿；游標碰到熊寶時由主程式切成可以抓
  const p = bear.windowPos();
  win.setBounds({ x: p.x, y: p.y, width: W, height: W });
  win.loadURL('bearbao://app/src/pet.html');
  win.webContents.on('did-finish-load', () => {
    h.ready = true;
    for (const [c, d] of h.queue) win.webContents.send(c, d);
    h.queue = [];
    if (!hidden) win.showInactive();
  });
  // 畫面程序結束或沒有回應：重新載入，不讓熊寶卡住
  const recover = why => {
    log('熊寶畫面重新載入', why);
    if (win.isDestroyed()) return;
    h.ready = false; h.mask = null;
    if (bear.cur) h.queue.push(['clip', { url: clips.fileUrl(clips.get(bear.cur.id)), mirror: bear.cur.mirror, token: ++bear.token }]);
    try { win.webContents.reload(); } catch (_) { /* 略過 */ }
  };
  win.webContents.on('render-process-gone', (_e, d) => recover(d.reason));
  win.on('unresponsive', () => recover('沒有回應'));
  win.on('closed', () => { bears.delete(bear); handles.delete(bear); if (bear === mainBear) mainBear = null; });
  if (bear.clone) world.later(bear, bear.lifeMs, () => removeClone(bear));
  return bear;
}

function removeClone(bear) {
  const h = handles.get(bear);
  if (!h) return;
  if (bear.mode !== 'fullscreen') bear.anim('jump', () => bear.idle());
  world.later(bear, 500, () => world.send(bear, 'fade', true));
  setTimeout(() => { if (!h.win.isDestroyed()) h.win.close(); }, 2200);
}

function bearOf(sender) {
  for (const [bear, h] of handles) if (!h.win.isDestroyed() && h.win.webContents === sender) return bear;
  return null;
}

// ---------- 游標有沒有碰到熊寶：由主程式統一判斷 ----------
// 每隻熊寶的畫面把目前畫格縮成 48×48 的輪廓傳過來；主程式依游標位置找出最上層碰到的那一隻，
// 只有那一隻接收滑鼠，其他都點穿。不依賴系統轉送滑鼠移動，分身重疊時也抓得起來。
const MASK = 48;
ipcMain.on('mask', (e, bits) => {
  const b = bearOf(e.sender);
  const h = b && handles.get(b);
  if (h && bits && bits.length === MASK * MASK) h.mask = bits;
});
ipcMain.on('press', (e, on) => {
  const b = bearOf(e.sender);
  const h = b && handles.get(b);
  if (h) h.pressed = !!on;
});

function touching(h, cur) {
  if (!h.mask || h.win.isDestroyed() || !h.win.isVisible()) return false;
  const b = h.win.getBounds();
  if (cur.x < b.x || cur.y < b.y || cur.x >= b.x + b.width || cur.y >= b.y + b.height) return false;
  const cx = Math.floor((cur.x - b.x) / b.width * MASK), cy = Math.floor((cur.y - b.y) / b.height * MASK);
  for (let y = Math.max(0, cy - 1); y <= Math.min(MASK - 1, cy + 1); y++) {
    for (let x = Math.max(0, cx - 1); x <= Math.min(MASK - 1, cx + 1); x++) if (h.mask[y * MASK + x]) return true;
  }
  return false;
}

function updateHits(cur) {
  // 後出現的在上層；被抓著或按住的那一隻優先
  const list = [...bears].reverse();
  let target = list.find(b => { const h = handles.get(b); return h && (b.mode === 'drag' || h.pressed); }) || null;
  if (!target && !fullscreenOn) target = list.find(b => { const h = handles.get(b); return h && b.mode !== 'fullscreen' && touching(h, cur); }) || null;
  for (const b of list) {
    const h = handles.get(b);
    if (!h || h.win.isDestroyed()) continue;
    const on = b === target;
    if (h.interactive === on) continue;
    h.interactive = on;
    h.win.setIgnoreMouseEvents(!on);
    if (process.env.BEARBAO_DEBUG) log(on ? '游標碰到熊寶，可以抓' : '游標離開熊寶，恢復點穿');
    if (h.ready) h.win.webContents.send('hover', on);
  }
}
ipcMain.on('drag-start', e => bearOf(e.sender)?.onDragStart());
ipcMain.on('drag-end', e => bearOf(e.sender)?.onDragEnd());
ipcMain.on('click', e => {
  const b = bearOf(e.sender);
  if (!b) return;
  b.onClick();
  if (desk && b === mainBear) showChat(true);   // 工作模式：點熊寶就到對話框打字
});
ipcMain.on('pet', e => bearOf(e.sender)?.onPet());

// ---------- 主迴圈 ----------
let last = Date.now();
function loop() {
  const now = Date.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (hidden) return;
  const cur = screen.getCursorScreenPoint();
  for (const bear of bears) {
    try {
      bear.tick(dt);
      const h = handles.get(bear);
      if (!h || h.win.isDestroyed()) continue;
      const p = bear.windowPos();
      const [x, y] = h.win.getPosition();
      if (x !== p.x || y !== p.y) h.win.setPosition(p.x, p.y);
    } catch (e) {
      log('熊寶動作失敗', e);
      try { bear.startFall(0); } catch (_) { /* 忽略 */ }
    }
  }
  try { updateHits(cur); } catch (e) { log('判斷游標失敗', e); }
}

// ---------- 全螢幕、工作同步 ----------
let fsCount = 0, workKind = null, workSince = 0, workMissing = 0;
function pollForeground() {
  if (!win32.available() || !mainBear) return;
  const fg = win32.foreground(ownPids());
  const isFull = !!fg?.fullscreen;
  fsCount = isFull ? Math.max(1, fsCount + 1) : Math.min(-1, fsCount - 1);
  if (!fullscreenOn && fsCount >= 2) { log('進入全螢幕，熊寶去角落睡覺：' + (fg.exe || fg.cls) + '｜' + fg.title); setFullscreen(true); }
  else if (fullscreenOn && fsCount <= -2) setFullscreen(false);
  if (fullscreenOn) return;

  const idle = powerMonitor.getSystemIdleTime();
  const kind = idle < 90 ? activity.classify(fg) : null;
  if (fg?.own) return;
  if (kind) {
    workMissing = 0;
    if (kind !== workKind) { workKind = kind; workSince = Date.now(); }
    if (Date.now() - workSince >= 4000 && mainBear.workKind !== kind) mainBear.work(kind);
  } else if (mainBear.workKind) {
    if (++workMissing >= 8) { workKind = null; mainBear.stopWork(); }
  } else {
    workKind = null;
  }
}

function setFullscreen(on) {
  fullscreenOn = on;
  if (desk) { if (on) hideChat(); else showChat(false); }
  for (const bear of [...bears]) {
    const h = handles.get(bear);
    if (!h || h.win.isDestroyed()) continue;
    if (bear.clone) { if (on) removeClone(bear); continue; }   // 分身也是跳一下慢慢淡出，不瞬間消失
    if (on) {
      h.win.setAlwaysOnTop(false);
      bear.workKind = null;
      bear.enterFullscreen();
    } else {
      h.win.setAlwaysOnTop(true, 'screen-saver');
      bear.exitFullscreen();
    }
  }
}

// ---------- 提醒與離開 ----------
let sinceDrink = 0, continuous = 0, lastLate = 0;
function everyMinute() {
  const o = currentOutfit();
  if (o !== outfitNow) { outfitNow = o; for (const b of bears) b.refreshOutfit(); }
  if (!mainBear || hidden || fullscreenOn) return;
  const idle = powerMonitor.getSystemIdleTime();
  if (idle < 60) { sinceDrink++; continuous++; }
  if (idle >= 300) continuous = 0;
  const h = new Date().getHours();
  if (continuous >= 50) { if (mainBear.notice('休息一下眼睛吧')) continuous = 0; }
  else if (sinceDrink >= 60) { if (mainBear.notice('喝口水吧！')) sinceDrink = 0; }
  else if ((h >= 23 || h < 4) && idle < 60 && Date.now() - lastLate > 3600000) {
    if (mainBear.notice('很晚了，早點休息喔')) lastLate = Date.now();
  }
}

function checkAway() {
  if (!mainBear || fullscreenOn) return;
  const idle = powerMonitor.getSystemIdleTime();
  mainBear.setAway(idle >= 600);
}

// ---------- 工作模式：熊寶固定在右下角，旁邊有小對話框 ----------
// 對話框輸入的文字交給熊寶系統處理（查分海、記帳），把回覆顯示在對話框
let desk = false, chatWin = null, askFn = null;
const deskFile = () => path.join(app.getPath('userData'), 'pet-desk.json');
const CHAT = { w: 330, h: 320 };

function chatBounds() {
  const a = screen.getPrimaryDisplay().workArea;
  return { x: Math.round(a.x + a.width - 160 - CHAT.w), y: Math.round(a.y + a.height - CHAT.h - 6), width: CHAT.w, height: CHAT.h };
}

function makeChat() {
  if (chatWin && !chatWin.isDestroyed()) return chatWin;
  chatWin = new BrowserWindow({
    ...chatBounds(), show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, title: '熊寶工作模式',
    webPreferences: { preload: path.join(__dirname, 'desk-preload.js'), spellcheck: false }
  });
  chatWin.setAlwaysOnTop(true, 'screen-saver');
  chatWin.loadURL('bearbao://app/src/desk.html');
  chatWin.on('closed', () => { chatWin = null; });
  return chatWin;
}

function showChat(focus) {
  if (!desk || hidden || fullscreenOn) return;
  const w = makeChat();
  w.setBounds(chatBounds());
  const go = () => {
    if (w.isDestroyed()) return;
    if (focus) { w.show(); w.focus(); w.webContents.send('desk-focus'); } else w.showInactive();
  };
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', go); else go();
}
function hideChat() { if (chatWin && !chatWin.isDestroyed()) chatWin.hide(); }

function setDesk(on, save = true) {
  desk = !!on;
  if (save) { try { fs.writeFileSync(deskFile(), JSON.stringify({ on: desk })); } catch (_) { /* 略過 */ } }
  if (!started) return;
  if (desk) {
    for (const b of [...bears]) if (b.clone) removeClone(b);
    mainBear?.setDesk(true);
    showChat(false);
  } else {
    mainBear?.setDesk(false);
    if (chatWin && !chatWin.isDestroyed()) chatWin.close();
  }
  if (onChange) onChange();
}

ipcMain.handle('desk-ask', async (_e, text) => {
  if (!askFn) return '熊寶系統還沒準備好，請稍後再試';
  try { return String(await askFn(String(text || '')) || '熊寶系統沒有回覆，請再試一次'); }
  catch (e) { log('工作模式處理失敗', e); return '連不上熊寶系統，請確認網路後再試一次'; }
});

// ---------- 系統匣 ----------
function setHidden(v) {
  hidden = v;
  if (desk) { if (v) hideChat(); else showChat(false); }
  for (const [, h] of handles) {
    if (h.win.isDestroyed()) continue;
    if (v) h.win.hide(); else h.win.showInactive();
  }
  if (onChange) onChange();
}

let onChange = null;
// 由熊寶系統主程式呼叫：動作圖準備好（沒有就先下載）才讓熊寶出現
function start(opts = {}) {
  onChange = opts.onChange || null;
  askFn = opts.ask || null;
  try { desk = !!JSON.parse(fs.readFileSync(deskFile(), 'utf8')).on; } catch (_) { desk = false; }
  protocol.handle('bearbao', serve);
  gifs.ensure(state => { if (onChange) onChange(state); }).then(ok => { if (ok) begin(); });
}

function begin() {
  if (started) return;
  started = true;
  mainBear = createBear();
  if (desk) { mainBear.setDesk(true); showChat(false); }
  if (onChange) onChange();

  setInterval(loop, 33);
  setInterval(() => { try { pollWindows(); } catch (e) { log('視窗輪詢失敗', e); } }, 400);
  setInterval(() => { try { pollForeground(); } catch (e) { log('前景輪詢失敗', e); } }, 1000);
  setInterval(() => { try { checkAway(); } catch (e) { log('離開偵測失敗', e); } }, 15000);
  setInterval(() => { try { everyMinute(); } catch (e) { log('定時提醒失敗', e); } }, 60000);

  if (process.env.BEARBAO_DEBUG) {
    setInterval(() => {
      const fg = win32.foreground(ownPids());
      log(`視窗互動=${win32.available()} 視窗數=${windows.length} 前景=${fg ? JSON.stringify({ exe: fg.exe, title: fg.title, full: fg.fullscreen, kind: activity.classify(fg) }) : '無'} ` +
        [...bears].map(b => `${b.mode}/${b.cur?.id}/(${Math.round(b.fx)},${Math.round(b.fy)})/${b.surface?.type || '-'}`).join(' ') +
        ' 視窗=' + windows.slice(0, 4).map(w => `${w.hwnd}:${Math.round(w.rect.x)},${Math.round(w.rect.y)},${Math.round(w.rect.width)}x${Math.round(w.rect.height)}${w.zoomed ? 'Z' : ''}`).join(' '));
    }, 3000);
  }

  const settle = b => { if (desk && b === mainBear && b.mode !== 'fullscreen') b.placeDesk(); else if (b.mode !== 'drag') b.startFall(0); };
  screen.on('display-removed', () => { for (const b of bears) settle(b); if (desk && chatWin && !chatWin.isDestroyed()) chatWin.setBounds(chatBounds()); });
  screen.on('display-metrics-changed', () => {
    for (const b of bears) if (b.surface?.type === 'floor') b.clampX();
    if (desk) { if (mainBear && mainBear.mode !== 'fullscreen') mainBear.placeDesk(); if (chatWin && !chatWin.isDestroyed()) chatWin.setBounds(chatBounds()); }
  });
  powerMonitor.on('resume', () => { for (const b of bears) settle(b); });
}

module.exports = {
  register, start,
  ready: () => started,
  isHidden: () => hidden,
  setHidden,
  isDesk: () => desk,
  setDesk,
  status: () => gifs.status()
};
