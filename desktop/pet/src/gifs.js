'use strict';
// 熊寶動作圖：第一次使用時下載一次（約 230 MB），之後直接用電腦裡的
// 下載點在熊寶系統的 GitHub 發布區；沒網路或下載失敗，5 分鐘後再試
const { app, net } = require('electron');
const fs = require('fs');
const path = require('path');
const log = require('./log');
const manifest = require('../assets/pack/manifest.json');

const VERSION = 'v1';
const DL_URL = `https://github.com/BearBabyBaby-ai/bearbao/releases/download/pet-gifs-${VERSION}/bearbao-pet-gifs.zip`;
const RETRY_MS = 5 * 60000;

const root = () => path.join(app.getPath('userData'), 'pet-gifs');
const dir = () => path.join(root(), 'gifs');
const mark = () => path.join(root(), 'version.txt');

let state = { phase: 'check', pct: 0 };
const status = () => state;

// 清單裡每個動作圖都在，才算準備好
function complete() {
  try {
    if (fs.readFileSync(mark(), 'utf8').trim() !== VERSION) return false;
    return manifest.animations.every(a => fs.existsSync(path.join(dir(), path.basename(a.file))));
  } catch (_) { return false; }
}

async function download(onState) {
  const tmp = path.join(root(), 'download.zip');
  fs.mkdirSync(root(), { recursive: true });
  const res = await net.fetch(DL_URL, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error('下載失敗 ' + res.status);
  const total = Number(res.headers.get('content-length')) || 0;
  let got = 0, lastPct = -1;
  const out = fs.createWriteStream(tmp);
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      if (!out.write(Buffer.from(value))) await new Promise(r => out.once('drain', r));
      const pct = total ? Math.floor(got / total * 100) : 0;
      if (pct !== lastPct) { lastPct = pct; state = { phase: 'download', pct }; onState(state); }
    }
  } finally {
    await new Promise(r => out.end(r));
  }
  if (total && got !== total) throw new Error('下載不完整');
  state = { phase: 'unpack', pct: 100 }; onState(state);
  const extract = require('extract-zip');
  fs.rmSync(dir(), { recursive: true, force: true });
  await extract(tmp, { dir: root() });   // 壓縮檔裡是 gifs/ 資料夾
  fs.rmSync(tmp, { force: true });
  fs.writeFileSync(mark(), VERSION);
}

// 準備動作圖；回傳 true 表示可以讓熊寶出現
async function ensure(onState = () => {}) {
  if (complete()) { state = { phase: 'ready', pct: 100 }; return true; }
  for (;;) {
    try {
      await download(onState);
      if (complete()) { state = { phase: 'ready', pct: 100 }; onState(state); return true; }
      throw new Error('動作圖不齊全');
    } catch (e) {
      log('熊寶動作圖下載失敗', e);
      state = { phase: 'retry', pct: 0 }; onState(state);
      await new Promise(r => setTimeout(r, RETRY_MS));
    }
  }
}

module.exports = { ensure, status, dir };
