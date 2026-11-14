'use strict';

// 時段：與熊寶系統相同
//   清晨 05:00–07:00、白天 07:00–17:00、傍晚 17:00–19:00、晚上 19:00–05:00
function timeOfDay(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 5 && h < 7) return 'dawn';
  if (h >= 7 && h < 17) return 'day';
  if (h >= 17 && h < 19) return 'dusk';
  return 'night';
}

function season(d = new Date()) {
  const m = d.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

const lunarFmt = new Intl.DateTimeFormat('en-u-ca-chinese', { month: 'numeric', day: 'numeric' });

function lunar(d = new Date()) {
  let month = 0, day = 0, leap = false;
  for (const p of lunarFmt.formatToParts(d)) {
    if (p.type === 'month') { month = parseInt(p.value, 10); leap = /bis/.test(p.value); }
    if (p.type === 'day') day = parseInt(p.value, 10);
  }
  return { month, day, leap };
}

// 節日：春節（正月初一至初五）、元宵（正月十五）、端午（五月初五）、中秋（八月十五）、聖誕（12/24–12/25）
function festival(d = new Date()) {
  const m = d.getMonth() + 1, day = d.getDate();
  if (m === 12 && (day === 24 || day === 25)) return 'christmas';
  try {
    const l = lunar(d);
    if (l.leap) return null;
    if (l.month === 1 && l.day >= 1 && l.day <= 5) return 'lunar_new_year';
    if (l.month === 1 && l.day === 15) return 'lantern';
    if (l.month === 5 && l.day === 5) return 'dragon_boat';
    if (l.month === 8 && l.day === 15) return 'mid_autumn';
  } catch (_) { /* 沒有農曆資料時只依季節 */ }
  return null;
}

function outfit(d = new Date()) {
  return festival(d) || season(d);
}

module.exports = { timeOfDay, season, festival, outfit, lunar };
