'use strict';
// 錯誤紀錄寫到使用者資料夾的 log.txt，方便日後排查
const fs = require('fs');
const path = require('path');

let file = null;
function target() {
  if (file) return file;
  try {
    const { app } = require('electron');
    file = path.join(app.getPath('userData'), 'log.txt');
  } catch (_) {
    file = '';
  }
  return file;
}

module.exports = function log(msg, err) {
  const line = `[${new Date().toISOString()}] ${msg}${err ? ' ' + (err.stack || err) : ''}\n`;
  try {
    const f = target();
    if (f) {
      try { if (fs.statSync(f).size > 512 * 1024) fs.writeFileSync(f, ''); } catch (_) { /* 檔案還不存在 */ }
      fs.appendFileSync(f, line);
    }
  } catch (_) { /* 無法寫入就略過 */ }
  if (process.env.BEARBAO_DEBUG) process.stdout.write(line);
};
