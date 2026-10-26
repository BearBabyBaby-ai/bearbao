// 熊寶系統：背景檢查重要資訊提醒，排定手機通知（約每 15 分鐘由系統執行一次）
var DAY = 86400000, TZ = 8 * 3600000, HORIZON = 35 * DAY, MAX = 60, FETCH_EVERY = 3 * 3600000;
var ICON = { '機票搶票': '🎫', '生日紀念': '🎂', '節日': '🎉', '繳費': '💳', '證件': '🪪', '保險': '🛡️', '車輛保養': '🔧', '稅務': '🧾', '醫療': '🏥', '預約': '📌', '其他': '📎' };

function kvGet(k) { try { var r = CapacitorKV.get(k); return r && r.value ? r.value : ''; } catch (e) { return ''; } }
function kvSet(k, v) { try { CapacitorKV.set(k, v); } catch (e) {} }
function str(v) { return v == null ? '' : String(v).trim(); }
function pad(n) { return (n < 10 ? '0' : '') + n; }

// 日期 → [年, 月, 日]
function ymd(v) {
  var m = str(v).match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function hm(v) {
  var m = str(v).match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
  return m ? [Number(m[1]), Number(m[2])] : [9, 0];
}
// 台北時間 → 時間戳
function at(d, t) { return Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]) - TZ; }
// 時間戳 → 手機排程用的台北時間字串
function wall(ms) {
  var x = new Date(ms + TZ);
  return x.getUTCFullYear() + '-' + pad(x.getUTCMonth() + 1) + '-' + pad(x.getUTCDate()) + 'T' + pad(x.getUTCHours()) + ':' + pad(x.getUTCMinutes()) + ':00.000Z';
}
function addMonths(d, n) {
  var x = new Date(Date.UTC(d[0], d[1] - 1 + n, d[2]));
  return [x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()];
}
function hash(s) {
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  h = Math.abs(h) % 2000000000;
  return h < 5000 ? h + 5000 : h;
}
function md(d) { return d[1] + '/' + d[2]; }

// 依提醒資料算出未來要跳出的通知
function build(list, now) {
  var out = [];
  (list || []).forEach(function (r) {
    if (!r || str(r['狀態']) === '已完成') return;
    var d0 = ymd(r['提醒日期']);
    if (!d0) return;
    var rep = str(r['重複']);
    var step = rep === '每月' ? 1 : rep === '每年' ? 12 : 0;
    var t = hm(r['時間']);
    var ticket = str(r['類別']) === '機票搶票';
    var lead = Math.max(0, Number(r['提前提醒天數']) || 0);
    var offs = ticket ? [DAY, 3600000, 600000] : (lead ? [lead * DAY, 0] : [0]);
    var title = (ICON[str(r['類別'])] || '🔔') + ' ' + str(r['標題']) + (ticket ? ' 開搶' : '');
    var d = d0, guard = 0;
    while (guard++ < 400) {
      var ev = at(d, t);
      if (ev - now > HORIZON + lead * DAY) break;
      offs.forEach(function (off) {
        var when = ev - off;
        if (when <= now + 30000 || when - now > HORIZON) return;
        var body;
        if (ticket) body = off === DAY ? '明天 ' + pad(t[0]) + ':' + pad(t[1]) + ' 開搶' : off === 3600000 ? '1 小時後開搶' : '10 分鐘後開搶';
        else if (off) body = md(d) + '（' + Math.round(off / DAY) + ' 天後）';
        else body = '今天 ' + md(d);
        var extra = str(r['內容']);
        if (extra) body += '・' + extra.replace(/\s+/g, ' ').slice(0, 80);
        out.push({ key: str(r.ID || r['標題']) + '|' + ev + '|' + off, when: when, title: title, body: body });
      });
      if (!step) break;
      d = addMonths(d, step);
    }
  });
  out.sort(function (a, b) { return a.when - b.when; });
  return out.slice(0, MAX);
}

function schedule(list) {
  var now = Date.now();
  var items = build(list, now);
  var notes = items.map(function (it) {
    return { id: hash(it.key), title: it.title, body: it.body, scheduleAt: wall(it.when), autoCancel: true, smallIcon: 'ic_stat_bear' };
  });
  // 已刪除或已完成的提醒：把原本排好的通知移到很久以後，等於取消
  var prev = {};
  try { prev = JSON.parse(kvGet('xb.scheduled') || '{}'); } catch (e) { prev = {}; }
  var keep = {};
  notes.forEach(function (n) { keep[n.id] = 1; });
  var cancel = [];
  Object.keys(prev).forEach(function (id) {
    if (!keep[id] && prev[id] > now) cancel.push({ id: Number(id), title: '', body: '', scheduleAt: '2099-01-01T00:00:00.000Z', smallIcon: 'ic_stat_bear' });
  });
  var all = notes.concat(cancel);
  if (all.length) CapacitorNotifications.schedule(all);
  var saved = {};
  items.forEach(function (it, i) { saved[notes[i].id] = it.when; });
  kvSet('xb.scheduled', JSON.stringify(saved));
  return notes.length;
}

function fetchReminders() {
  var url = kvGet('xb.url'), token = kvGet('xb.token');
  if (!url || !token) return Promise.resolve(null);
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'bootstrap', token: token }) })
    .then(function (res) { return res.json(); })
    .then(function (out) {
      if (!out || !out.ok || !out.data || !out.data.reminders) return null;
      var list = out.data.reminders;
      kvSet('xb.reminders', JSON.stringify(list));
      kvSet('xb.fetched', String(Date.now()));
      return list;
    })
    .catch(function () { return null; });
}

function cached() {
  try { return JSON.parse(kvGet('xb.reminders') || 'null'); } catch (e) { return null; }
}

// App 開著時把連線設定交給背景
addEventListener('setConnection', function (resolve, reject, args) {
  try {
    if (args && args.url) kvSet('xb.url', str(args.url));
    if (args && args.token) kvSet('xb.token', str(args.token));
    resolve({ ok: true });
  } catch (e) { resolve({ ok: false }); }
});

// 檢查提醒並排定通知：App 開著時直接帶入最新資料；背景執行時每 3 小時向雲端取一次，其餘用上次的資料
addEventListener('checkReminders', function (resolve, reject, args) {
  try {
    if (args && args.reminders) {
      kvSet('xb.reminders', JSON.stringify(args.reminders));
      kvSet('xb.fetched', String(Date.now()));
      resolve({ count: schedule(args.reminders) });
      return;
    }
    var last = Number(kvGet('xb.fetched')) || 0;
    var p = Date.now() - last > FETCH_EVERY ? fetchReminders() : Promise.resolve(null);
    p.then(function (list) {
      try { resolve({ count: schedule(list || cached() || []) }); } catch (e) { resolve({ count: 0 }); }
    });
  } catch (e) { resolve({ count: 0 }); }
});
