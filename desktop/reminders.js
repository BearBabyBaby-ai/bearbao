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

// 算出最近 30 分鐘內到期、還沒跳出的通知
function due(list, now) {
  const out = [];
  (list || []).forEach(r => {
    if (!r || str(r['狀態']) === '已完成') return;
    const d0 = ymd(r['提醒日期']);
    if (!d0) return;
    const rep = str(r['重複']);
    const step = rep === '每月' ? 1 : rep === '每年' ? 12 : 0;
    const t = hm(r['時間']);
    const ticket = str(r['類別']) === '機票搶票';
    const lead = Math.max(0, Number(r['提前提醒天數']) || 0);
    const offs = ticket ? [DAY, 3600000, 600000] : (lead ? [lead * DAY, 0] : [0]);
    const title = (ICON[str(r['類別'])] || '🔔') + ' ' + str(r['標題']) + (ticket ? ' 開搶' : '');
    let d = d0, guard = 0;
    while (guard++ < 400) {
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
      if (!step) break;
      d = addMonths(d, step);
    }
  });
  return out.sort((a, b) => a.when - b.when);
}

module.exports = { due };
