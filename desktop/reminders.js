// 熊寶系統 Windows 版：提醒通知（和手機版同樣的規則）
const DAY = 86400000, TZ = 8 * 3600000, HORIZON = 3 * DAY, MISS = 30 * 60000;
const ICON = { '機票搶票': '🎫', '生日紀念': '🎂', '節日': '🎉', '繳費': '💳', '證件': '🪪', '保險': '🛡️', '車輛保養': '🔧', '稅務': '🧾', '醫療': '🏥', '預約': '📌', '其他': '📎' };

const str = v => v == null ? '' : String(v).trim();
const pad = n => (n < 10 ? '0' : '') + n;
function ymd(v) { const m = str(v).match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/); return m ? [+m[1], +m[2], +m[3]] : null; }
function hm(v) { const m = str(v).match(/(\d{1,2})\s*[:：]\s*(\d{2})/); return m ? [+m[1], +m[2]] : [9, 0]; }
const at = (d, t) => Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]) - TZ;
function addMonths(d, n) { const x = new Date(Date.UTC(d[0], d[1] - 1 + n, d[2])); return [x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()]; }
const md = d => d[1] + '/' + d[2];

// 重要資訊提醒：日期欄位展開成每一天（YYYY/MM/DD）
// 單日｜民國年（2～3 位數加 1911）｜多個單日（「、」「+」「，」空格分開）｜期間（「-」「至」「到」）｜期間後加「週一、週四」只取那幾個星期
// 日期後面的 (一) 只是註記；單日後面寫星期不算條件；期間前後顛倒自動對調
// 花火節（類別含花火／煙火，或標題含施放／花火／煙火）：加的單日落在「期間＋星期」裡 → 改期（拿掉期間裡最近的一場）
function remFireRow(r) { return /花火|煙火/.test(String((r && r['類別']) || '')) || /施放|花火|煙火/.test(String((r && r['標題']) || '')); }
function remDateSpec(text, fire) {
  var s = String(text == null ? '' : text);
  var re = /(\d{2,4})\s*[\/\-.年]\s*(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})\s*日?/g, toks = [], m;
  var key = function (t) { var x = new Date(t); return x.getUTCFullYear() + '/' + ('0' + (x.getUTCMonth() + 1)).slice(-2) + '/' + ('0' + x.getUTCDate()).slice(-2); };
  while ((m = re.exec(s))) {
    var y = Number(m[1]); if (y < 1000) y += 1911;
    var mo = Number(m[2]), d = Number(m[3]), b = m.index + m[0].length;
    var note = s.slice(b).match(/^\s*[（(][^）)]{0,8}[）)]/);
    if (note) { b += note[0].length; re.lastIndex = b; }
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) toks.push({ t: Date.UTC(y, mo - 1, d), a: m.index, b: b });
  }
  var WD = { '日': 0, '天': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 }, segs = [];
  for (var i = 0; i < toks.length; i++) {
    var nx = toks[i + 1];
    if (nx && /^\s*[-－–—~～至到]\s*$/.test(s.slice(toks[i].b, nx.a))) {
      var tail = s.slice(nx.b, toks[i + 2] ? toks[i + 2].a : s.length), wd = {}, wl = [], w, wr = /(?:週|周|星期|禮拜)\s*([日天一二三四五六])/g;
      while ((w = wr.exec(tail))) { if (!wd[WD[w[1]]]) wl.push(WD[w[1]]); wd[WD[w[1]]] = 1; }
      var a = Math.min(toks[i].t, nx.t), bb = Math.max(toks[i].t, nx.t), days = [];
      for (var t = a, n = 0; t <= bb && n < 1500; t += 86400000, n++) if (!wl.length || wd[new Date(t).getUTCDay()]) days.push(key(t));
      segs.push({ type: 'range', a: key(a), b: key(bb), wd: wl.length ? wl.sort(function (x, y) { return (x || 7) - (y || 7); }) : null, days: days });
      i++;
    } else segs.push({ type: 'single', d: key(toks[i].t) });
  }
  if (fire) segs.forEach(function (g) {
    if (g.type !== 'single') return;
    var r = null;
    segs.forEach(function (x) { if (!r && x.type === 'range' && x.wd && x.a <= g.d && g.d <= x.b) r = x; });
    if (!r || !r.days.length) return;
    if (r.days.indexOf(g.d) >= 0) { g.dup = true; return; }
    var gt = Date.parse(g.d.replace(/\//g, '-') + 'T00:00:00Z'), best = 0;
    r.days.forEach(function (d, k) { if (Math.abs(Date.parse(d.replace(/\//g, '-') + 'T00:00:00Z') - gt) < Math.abs(Date.parse(r.days[best].replace(/\//g, '-') + 'T00:00:00Z') - gt)) best = k; });
    r.days.splice(best, 1);
  });
  var out = {};
  segs.forEach(function (g) { if (g.type === 'single') out[g.d] = 1; else g.days.forEach(function (d) { out[d] = 1; }); });
  return { segs: segs, days: Object.keys(out).sort() };
}
function expandRemDates(text, fire) { return remDateSpec(text, fire).days; }

// 算出最近 30 分鐘內到期、還沒跳出的通知
function due(list, now) {
  const out = [];
  (list || []).forEach(r => {
    if (!r || str(r['狀態']) === '已完成') return;
    const ds = expandRemDates(r['提醒日期'], remFireRow(r)).map(ymd);
    if (!ds.length) return;
    const d0 = ds[0];
    const rep = str(r['重複']);
    const step = ds.length > 1 ? 0 : rep === '每月' ? 1 : rep === '每年' ? 12 : 0;   // 多天／區間：每一天各自提醒
    const t = hm(r['時間']);
    const ticket = str(r['類別']) === '機票搶票';
    const lead = Math.max(0, Number(r['提前提醒天數']) || 0);
    const offs = ticket ? [DAY, 3600000, 600000] : (lead ? [lead * DAY, 0] : [0]);
    const title = (ICON[str(r['類別'])] || '🔔') + ' ' + str(r['標題']) + (ticket ? ' 開搶' : '');
    let di = 0, d = d0, guard = 0;
    while (guard++ < 1200) {
      const ev = at(d, t);
      if (ev - now > HORIZON + lead * DAY) break;
      offs.forEach(off => {
        const when = ev - off;
        if (when > now || when < now - MISS) return;
        let body;
        if (ticket) body = off === DAY ? '明天 ' + pad(t[0]) + ':' + pad(t[1]) + ' 開搶' : off === 3600000 ? '1 小時後開搶' : '10 分鐘後開搶';
        else if (off) body = md(d) + '（' + Math.round(off / DAY) + ' 天後）';
        else body = '今天 ' + md(d);
        const extra = str(r['內容']);
        if (extra) body += '・' + extra.replace(/\s+/g, ' ').slice(0, 80);
        out.push({ key: str(r.ID || r['標題']) + '|' + ev + '|' + off, when, title, body });
      });
      if (step) d = addMonths(d, step);
      else if (++di < ds.length) d = ds[di];
      else break;
    }
  });
  return out.sort((a, b) => a.when - b.when);
}

module.exports = { due };
