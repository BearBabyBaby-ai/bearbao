'use strict';
// 熊寶動作圖：第一次使用時下載一次（約 230 MB），之後直接用電腦裡的
// 下載點在熊寶系統的 GitHub 發布區；沒網路或下載失敗，5 分鐘後再試
const { app, net } = require('electron');
const fs = require('fs');
const path = require('path');
const log = require('./log');
const clips = require('./clips');
const manifest = clips.manifest;   // 和播放用的是同一份（更新後兩邊一起變）

const VERSION = 'v1';
const DL_URL = `https://github.com/BearBabyBaby-ai/bearbao/releases/download/pet-gifs-${VERSION}/bearbao-pet-gifs.zip`;
const RETRY_MS = 5 * 60000;
// 之後新增的動作圖不重新下載整包，只補缺少的那幾個
const ONE_URL = name => `https://raw.githubusercontent.com/BearBabyBaby-ai/bearbao/pet-assets/gifs/${encodeURIComponent(name)}`;
const FEW = 40;
const LIST_URL = 'https://raw.githubusercontent.com/BearBabyBaby-ai/bearbao/pet-assets/manifest.json';
const listFile = () => path.join(root(), 'manifest.json');

// 動作清單：先用上次下載的，再到下載點看有沒有更新（新增動作圖不用重新安裝）
async function refreshList() {
  try { if (fs.existsSync(listFile())) clips.update(JSON.parse(fs.readFileSync(listFile(), 'utf8'))); } catch (_) { /* 用程式內建的 */ }
  try {
    const res = await Promise.race([net.fetch(LIST_URL), new Promise((_, no) => setTimeout(() => no(new Error('逾時')), 8000))]);
    if (!res.ok) return;
    const text = await res.text();
    if (clips.update(JSON.parse(text))) { fs.mkdirSync(root(), { recursive: true }); fs.writeFileSync(listFile(), text); }
  } catch (_) { /* 沒網路就用現有的 */ }
}

const root = () => path.join(app.getPath('userData'), 'pet-gifs');
const dir = () => path.join(root(), 'gifs');
const mark = () => path.join(root(), 'version.txt');

let state = { phase: 'check', pct: 0 };
const status = () => state;

// 清單裡缺少的動作圖
function missing() {
  return manifest.animations.map(a => path.basename(a.file)).filter(n => !fs.existsSync(path.join(dir(), n)));
}
// 清單裡每個動作圖都在，才算準備好
function complete() {
  try { return fs.existsSync(mark()) && missing().length === 0; } catch (_) { return false; }
}

// 只補缺少的幾個動作圖
async function fetchFew(names, onState) {
  fs.mkdirSync(dir(), { recursive: true });
  let done = 0;
  for (const n of names) {
    const res = await net.fetch(ONE_URL(n));
    if (!res.ok) throw new Error('下載失敗 ' + n + ' ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.slice(0, 3).toString() !== 'GIF') throw new Error('不是動作圖 ' + n);
    fs.writeFileSync(path.join(dir(), n + '.part'), buf);
    fs.renameSync(path.join(dir(), n + '.part'), path.join(dir(), n));
    state = { phase: 'download', pct: Math.floor(++done / names.length * 100) }; onState(state);
  }
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
  await refreshList();
  if (complete()) { state = { phase: 'ready', pct: 100 }; return true; }
  for (;;) {
    try {
      const lack = fs.existsSync(mark()) ? missing() : null;
      if (lack && lack.length && lack.length <= FEW) await fetchFew(lack, onState);
      else await download(onState);
      const rest = missing();
      if (rest.length && rest.length <= FEW) await fetchFew(rest, onState);   // 整包之後才新增的
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
