'use strict';
// 讀取電腦上其他視窗的位置、前景程式，以及推動視窗。
// 只在 Windows 上啟用；任何一步失敗都只會讓桌寵少掉視窗互動，不會中斷程式。

const log = require('./log');

let api = null;

function load() {
  if (api !== null) return api;
  api = false;
  if (process.platform !== 'win32') return api;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');
    const dwmapi = koffi.load('dwmapi.dll');

    const RECT = koffi.struct('BB_RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
    const MONITORINFO = koffi.struct('BB_MONITORINFO', {
      cbSize: 'uint32_t', rcMonitor: RECT, rcWork: RECT, dwFlags: 'uint32_t'
    });
    const EnumProc = koffi.proto('bool __stdcall BB_EnumProc(intptr_t hwnd, intptr_t lParam)');

    api = {
      koffi, EnumProc,
      EnumWindows: user32.func('bool __stdcall EnumWindows(BB_EnumProc *cb, intptr_t lParam)'),
      IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(intptr_t hwnd)'),
      IsIconic: user32.func('bool __stdcall IsIconic(intptr_t hwnd)'),
      IsZoomed: user32.func('bool __stdcall IsZoomed(intptr_t hwnd)'),
      GetWindowRect: user32.func('bool __stdcall GetWindowRect(intptr_t hwnd, _Out_ BB_RECT *rect)'),
      GetWindowLongPtrW: user32.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t hwnd, int index)'),
      GetWindowTextW: user32.func('int __stdcall GetWindowTextW(intptr_t hwnd, _Out_ uint8_t *buf, int max)'),
      GetClassNameW: user32.func('int __stdcall GetClassNameW(intptr_t hwnd, _Out_ uint8_t *buf, int max)'),
      GetForegroundWindow: user32.func('intptr_t __stdcall GetForegroundWindow()'),
      GetWindowThreadProcessId: user32.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t hwnd, _Out_ uint32_t *pid)'),
      MonitorFromWindow: user32.func('intptr_t __stdcall MonitorFromWindow(intptr_t hwnd, uint32_t flags)'),
      GetMonitorInfoW: user32.func('bool __stdcall GetMonitorInfoW(intptr_t mon, _Inout_ BB_MONITORINFO *info)'),
      SetWindowPos: user32.func('bool __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int cx, int cy, uint32_t flags)'),
      OpenProcess: kernel32.func('intptr_t __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)'),
      QueryFullProcessImageNameW: kernel32.func('bool __stdcall QueryFullProcessImageNameW(intptr_t proc, uint32_t flags, _Out_ uint8_t *buf, _Inout_ uint32_t *size)'),
      CloseHandle: kernel32.func('bool __stdcall CloseHandle(intptr_t h)'),
      DwmGetWindowAttribute: dwmapi.func('int32_t __stdcall DwmGetWindowAttribute(intptr_t hwnd, uint32_t attr, _Out_ uint8_t *buf, uint32_t size)')
    };
  } catch (e) {
    log('視窗互動無法啟用', e);
    api = false;
  }
  return api;
}

const GWL_EXSTYLE = -20;
const WS_EX_TOOLWINDOW = 0x00000080, WS_EX_NOACTIVATE = 0x08000000, WS_EX_TRANSPARENT = 0x00000020;
const SKIP_CLASSES = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd',
  'Windows.UI.Core.CoreWindow', 'ApplicationFrameTitleBarWindow', 'TopLevelWindowForOverflowXamlIsland',
  'XamlExplorerHostIslandWindow', 'NotifyIconOverflowWindow']);

function text(fn, hwnd) {
  const buf = Buffer.alloc(1024);
  const n = fn(hwnd, buf, 511);
  return n > 0 ? buf.toString('utf16le', 0, n * 2) : '';
}

function num(v) { return typeof v === 'bigint' ? Number(v) : v; }

function physRect(a, hwnd) {
  // 優先用看得到的外框（不含隱形邊框）
  try {
    const b = Buffer.alloc(16);
    if (a.DwmGetWindowAttribute(hwnd, 9, b, 16) === 0) {
      return { left: b.readInt32LE(0), top: b.readInt32LE(4), right: b.readInt32LE(8), bottom: b.readInt32LE(12) };
    }
  } catch (_) { /* 改用一般外框 */ }
  const r = {};
  a.GetWindowRect(hwnd, r);
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

function cloaked(a, hwnd) {
  try {
    const b = Buffer.alloc(4);
    if (a.DwmGetWindowAttribute(hwnd, 14, b, 4) === 0) return b.readUInt32LE(0) !== 0;
  } catch (_) { /* 無法判斷就當作可見 */ }
  return false;
}

function pidOf(a, hwnd) {
  const out = [0];
  a.GetWindowThreadProcessId(hwnd, out);
  return out[0];
}

// 由上而下（Z 順序）列出可見的一般視窗，座標為實體像素
// 只列出目前專注（最前面、正在使用）的那個視窗，熊寶只會站上、攀爬、推動這個視窗。
// 其他視窗、看不見的透明視窗（畫面疊加層、錄影、輸入法）都不當成地面或牆。
function listWindows(ownPids) {
  const a = load();
  if (!a) return [];
  const result = [];
  let fgHwnd = 0;
  try { fgHwnd = num(a.GetForegroundWindow()); } catch (_) { /* 略過 */ }
  if (!fgHwnd) return [];
  let cb = null;
  try {
    cb = a.koffi.register((hwnd) => {
      try {
        hwnd = num(hwnd);
        if (hwnd !== fgHwnd) return true;
        if (!a.IsWindowVisible(hwnd) || a.IsIconic(hwnd)) return true;
        if (ownPids.has(pidOf(a, hwnd))) return true;
        const ex = num(a.GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
        if (ex & (WS_EX_TOOLWINDOW | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE)) return true;
        if (cloaked(a, hwnd)) return true;
        const cls = text(a.GetClassNameW, hwnd);
        if (SKIP_CLASSES.has(cls)) return true;
        if (!text(a.GetWindowTextW, hwnd)) return true;
        const r = physRect(a, hwnd);
        if (r.right - r.left < 60 || r.bottom - r.top < 40) return true;
        result.push({ hwnd, rect: r, zoomed: !!a.IsZoomed(hwnd), noActivate: !!(ex & WS_EX_NOACTIVATE) });
      } catch (_) { /* 略過這個視窗 */ }
      return true;
    }, a.koffi.pointer(a.EnumProc));
    a.EnumWindows(cb, 0);
  } catch (e) {
    log('列出視窗失敗', e);
  } finally {
    if (cb) try { a.koffi.unregister(cb); } catch (_) { /* 忽略 */ }
  }
  return result;
}

function exePath(a, pid) {
  let h = 0;
  try {
    h = num(a.OpenProcess(0x1000, false, pid));
    if (!h) return '';
    const buf = Buffer.alloc(2048);
    const size = [1000];
    if (!a.QueryFullProcessImageNameW(h, 0, buf, size)) return '';
    return buf.toString('utf16le', 0, size[0] * 2);
  } catch (_) {
    return '';
  } finally {
    if (h) try { a.CloseHandle(h); } catch (_) { /* 忽略 */ }
  }
}

// 目前前景視窗：程式名稱、標題、是否全螢幕
function foreground(ownPids) {
  const a = load();
  if (!a) return null;
  try {
    const hwnd = num(a.GetForegroundWindow());
    if (!hwnd) return null;
    const pid = pidOf(a, hwnd);
    if (ownPids.has(pid)) return { own: true };
    const cls = text(a.GetClassNameW, hwnd);
    const title = text(a.GetWindowTextW, hwnd);
    const exe = (exePath(a, pid).split('\\').pop() || '').toLowerCase();
    const r = {};
    a.GetWindowRect(hwnd, r);
    const mon = num(a.MonitorFromWindow(hwnd, 2));
    const info = { cbSize: 40 };
    let full = false;
    if (mon && a.GetMonitorInfoW(mon, info)) {
      const m = info.rcMonitor;
      // 只認真正的全螢幕（遊戲、影片、瀏覽器按 F11）：剛好蓋滿整個螢幕，而且不是「放到最大」的視窗。
      // 放到最大的視窗（瀏覽器、程式編輯器）外框會超出螢幕幾點，以前會被誤認成全螢幕，熊寶就跑去角落睡、抓不起來。
      const covers = r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom;
      const exact = r.left >= m.left - 1 && r.top >= m.top - 1 && r.right <= m.right + 1 && r.bottom <= m.bottom + 1;
      full = covers && exact && !a.IsZoomed(hwnd) && !SKIP_CLASSES.has(cls);
    }
    return { hwnd, pid, exe, title, cls, fullscreen: full };
  } catch (e) {
    log('讀取前景視窗失敗', e);
    return null;
  }
}

// 把視窗往左右推 dx 實體像素（不搶焦點、不改變上下順序）
function nudgeWindow(hwnd, dx) {
  const a = load();
  if (!a || !dx) return false;
  try {
    const r = {};
    if (!a.GetWindowRect(hwnd, r)) return false;
    return !!a.SetWindowPos(hwnd, 0, r.left + dx, r.top, 0, 0, 0x0001 | 0x0004 | 0x0010);
  } catch (e) {
    log('推視窗失敗', e);
    return false;
  }
}

module.exports = { available: () => !!load(), listWindows, foreground, nudgeWindow };
