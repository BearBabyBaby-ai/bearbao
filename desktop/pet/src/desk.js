'use strict';
(() => {
  const log = document.getElementById('log');
  const form = document.getElementById('form');
  const input = document.getElementById('input');
  const send = document.getElementById('send');

  function bubble(who) {
    const d = document.createElement('div');
    d.className = 'msg ' + who;
    log.appendChild(d);
    while (log.children.length > 40) log.firstChild.remove();
    return d;
  }
  const scroll = () => { log.scrollTop = log.scrollHeight; };
  function add(text, who) {
    const d = bubble(who);
    d.textContent = text;
    scroll();
    return d;
  }

  // 下載：跳出另存新檔（預設放在「下載」資料夾）；TXT 用 UTF-8（含 BOM）與 Windows 換行，和熊熊綜合系統的批次生圖一樣
  async function saveFile(btn, name, data) {
    const label = btn.textContent;
    btn.disabled = true;
    try {
      const where = await window.desk.save(String(name).replace(/[\\/:*?"<>|]+/g, '_'), data);
      if (where) { btn.textContent = '✅ 已儲存'; setTimeout(() => { btn.textContent = label; }, 3000); }
    } catch (_) { btn.textContent = '⚠️ 儲存失敗'; setTimeout(() => { btn.textContent = label; }, 3000); }
    btn.disabled = false;
  }
  const txtData = content => '\uFEFF' + String(content).replace(/^\uFEFF/, '').replace(/\r?\n/g, '\r\n');

  // 熊寶系統的回覆：純文字，或是 { blocks, files }
  function show(reply) {
    if (typeof reply === 'string' || !reply || !Array.isArray(reply.blocks)) return add(String(reply || '熊寶系統沒有回覆，請再試一次'), 'bear');
    const d = bubble('bear rich');
    for (const b of reply.blocks) {
      const el = document.createElement(b.type === 'link' ? 'a' : 'div');
      el.className = 'b-' + b.type;
      el.textContent = b.text;
      if (b.type === 'link') { el.href = b.url; el.addEventListener('click', e => { e.preventDefault(); window.open(b.url); }); }
      d.appendChild(el);
    }
    if (Array.isArray(reply.files) && reply.files.length) {
      const row = document.createElement('div');
      row.className = 'files';
      for (const f of reply.files) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = f.label;
        btn.addEventListener('click', () => saveFile(btn, f.name, txtData(f.content)));
        row.appendChild(btn);
      }
      d.appendChild(row);
    }
    scroll();
  }

  // ---------- 免稅卡（航班卡）：例如「11/16 高雄 AE361 10:00」 ----------
  // 底圖與座標沿用「航班卡產生器」
  const CARD = {
    size: 220, minSize: 100, checkSize: 250, color: '#000000',
    family: '"微軟正黑體", "Microsoft JhengHei", "PingFang TC", Arial, sans-serif',
    check: { airport: { x: 305, y: 2530 }, port: { x: 300, y: 3585 } },
    text: { date: { x: 1100, y: 4420 }, flight: { x: 2550, y: 4420 }, time: { x: 1100, y: 4960 }, dest: { x: 2550, y: 4960 } },
    rightRatio: 0.97, rightPadding: 10
  };
  const PORT_DEST = '嘉義布袋港';
  const DEST_RULES = [
    { keys: ['台中', '臺中'], value: '台中清泉崗' },
    { keys: ['台北', '臺北'], value: '台北松山' },
    { keys: ['臺南'], value: '台南' },
    { keys: ['高雄'], value: '高雄小港', transport: 'airport' },
    { keys: ['嘉義', '布袋', '布袋港'], value: PORT_DEST, transport: 'port' }
  ];
  const AIRLINES = { B7: '立榮航空', AE: '華信航空' };
  const pad2 = n => String(n).padStart(2, '0');

  function parseCard(text) {
    const s = text.replace(/^免稅卡\s*/, '').trim();
    const tokens = s.split(/\s+/);
    let date = '', time = '', flight = '', transport = '';
    const rest = [];
    for (const t of tokens) {
      let m;
      if (!date && (m = t.match(/^(?:\d{4}[\/\-.])?(\d{1,2})[\/\-.](\d{1,2})$/))) date = `${pad2(m[1])}/${pad2(m[2])}`;
      else if (!time && (m = t.match(/^(\d{1,2})[:：](\d{2})$/))) time = `${pad2(m[1])}:${m[2]}`;
      else if (!flight && (m = t.toUpperCase().match(/^(B7|AE|DA)-?(\d{2,4})$/))) { flight = `${m[1]}-${m[2]}`; transport = 'airport'; }
      else rest.push(t);
    }
    if (!date || !time) return null;
    if (!flight) {
      // 沒有航班代號：當成船班，第一個不是地名的當船名
      if (!rest.length) return null;
      transport = 'port';
      const idx = rest.findIndex(t => !/港|嘉義|布袋|高雄|台南|臺南|台中|臺中|台北|臺北/.test(t));
      flight = idx >= 0 ? rest.splice(idx, 1)[0] : rest.shift();
    }
    let dest = rest.join(' ');
    const rule = DEST_RULES.find(r => r.keys.includes(dest) && (!r.transport || r.transport === transport));
    if (rule) dest = rule.value;
    if (!dest && transport === 'port') dest = PORT_DEST;
    return { date, time, flight, dest, transport };
  }

  // 底圖：照「航班卡產生器」原本的方式，從 Google Drive 載入（先用可匯出 JPG 的方式，失敗再改為僅顯示）
  const BG_FILE_ID = '1dJADWzapJZLBWNMiTBY9Xi5WjKwmcUxh';
  // Drive 縮圖網址會先轉址，轉址那一步沒有跨網域許可，所以先直接讀轉址後的同一張圖（可匯出 JPG）
  const BG_URLS = [
    `https://lh3.googleusercontent.com/d/${BG_FILE_ID}=w10000`,
    `https://drive.google.com/thumbnail?id=${BG_FILE_ID}&sz=w10000`,
    `https://drive.google.com/uc?export=view&id=${BG_FILE_ID}`
  ];
  function loadImage(url, useCORS) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      if (useCORS) image.crossOrigin = 'anonymous';
      image.referrerPolicy = 'no-referrer';
      const timer = setTimeout(() => { image.onload = image.onerror = null; image.src = ''; reject(new Error('timeout')); }, 20000);
      image.onload = () => { clearTimeout(timer); image.naturalWidth ? resolve(image) : reject(new Error('invalid')); };
      image.onerror = () => { clearTimeout(timer); reject(new Error('error')); };
      image.src = url;
    });
  }
  let bg = null;
  function background() {
    if (bg) return bg;
    bg = (async () => {
      for (const useCORS of [true, false]) {
        for (const url of BG_URLS) {
          try { const img = await loadImage(url, useCORS); img.exportable = useCORS; return img; } catch (_) { /* 換下一個 */ }
        }
      }
      throw new Error('免稅卡底圖載入失敗，請確認網路，以及 Drive 圖片已開放「知道連結的任何人」檢視');
    })();
    bg.catch(() => { bg = null; });
    return bg;
  }

  function destRight(ctx, canvas) {
    const fallback = Math.round(canvas.width * CARD.rightRatio) - CARD.rightPadding;
    const startX = CARD.text.dest.x, width = canvas.width - startX;
    if (width <= 0) return fallback;
    try {
      const edges = [0.25, 0.4, 0.55].map(r => Math.round(CARD.text.dest.y - CARD.size * r)).map(y => {
        const data = ctx.getImageData(startX, y, width, 1).data;
        for (let i = 0; i < width; i++) {
          const p = i * 4;
          if (data[p] < 200 || data[p + 1] < 200 || data[p + 2] < 200) return startX + i;
        }
        return canvas.width;
      }).sort((a, b) => a - b);
      const limit = edges[1] - CARD.rightPadding;
      return limit > startX ? limit : fallback;
    } catch (_) { return fallback; }
  }

  async function drawCard(c) {
    const img = await background();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const right = destRight(ctx, canvas);
    const font = size => `bold ${size}px ${CARD.family}`;
    const pos = CARD.text;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = CARD.color;
    const chk = CARD.check[c.transport];
    if (chk) { ctx.font = `bold ${CARD.checkSize}px Arial`; ctx.fillText('✔', chk.x, chk.y); }
    ctx.font = font(CARD.size);
    ctx.fillText(c.date, pos.date.x, pos.date.y);
    ctx.fillText(c.time, pos.time.x, pos.time.y);
    const airline = c.transport === 'airport' ? AIRLINES[c.flight.slice(0, 2)] : '';
    if (airline) { ctx.fillText(airline, pos.flight.x, pos.flight.y - 120); ctx.fillText(c.flight, pos.flight.x, pos.flight.y + 140); }
    else ctx.fillText(c.flight, pos.flight.x, pos.flight.y);
    if (c.dest) {
      let s = CARD.size;
      const ink = t => { const m = ctx.measureText(t); return m.actualBoundingBoxRight > 0 ? m.actualBoundingBoxRight : m.width; };
      ctx.font = font(s);
      while (s > CARD.minSize && pos.dest.x + ink(c.dest) > right) { s -= 5; ctx.font = font(s); }
      ctx.fillText(c.dest, pos.dest.x, pos.dest.y);
    }
    canvas.exportable = img.exportable;
    return canvas;
  }

  async function dutyFree(c) {
    const d = bubble('bear rich');
    const title = document.createElement('div');
    title.className = 'b-title';
    title.textContent = '免稅卡';
    const info = document.createElement('div');
    info.className = 'b-text';
    info.textContent = [`離境日期：${c.date}`, `${c.transport === 'port' ? '船班' : '航班'}：${c.flight}`, `離境時間：${c.time}`, `目的地：${c.dest || '（未填）'}`].join('\n');
    d.append(title, info);
    scroll();
    let canvas;
    try { canvas = await drawCard(c); } catch (e) { info.textContent += '\n⚠️ ' + e.message; return; }
    const prev = document.createElement('img');
    prev.className = 'card';
    const small = document.createElement('canvas');
    small.width = 280; small.height = Math.round(canvas.height * 280 / canvas.width);
    small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
    prev.src = small.toDataURL('image/jpeg', 0.9);
    if (!canvas.exportable) info.textContent += '\n⚠️ 底圖只能顯示、無法匯出 JPG，請確認 Drive 圖片已開放「知道連結的任何人」檢視';
    const row = document.createElement('div');
    row.className = 'files';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '⬇ 下載免稅卡 JPG';
    const name = `免稅航班卡_${c.date.replace(/\//g, '')}_${c.flight}.jpg`;
    btn.addEventListener('click', () => canvas.toBlob(async b => { if (b) saveFile(btn, name, new Uint8Array(await b.arrayBuffer())); }, 'image/jpeg', 0.85));
    row.appendChild(btn);
    d.append(prev, row);
    prev.addEventListener('load', scroll);
    scroll();
  }

  add('要查什麼或記什麼，直接打給我：\n2026/11/15 分海\n2026/11/14 宵夜 111\n馬公 午餐推薦\n白沙 景點推薦\n元宵活動\n當前航班\n11/16 高雄 AE361 10:00（免稅卡）', 'bear');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || send.disabled) return;
    add(text, 'me');
    input.value = '';
    send.disabled = true;
    try {
      const card = parseCard(text.replace(/\s+/g, ' '));
      if (card) await dutyFree(card);
      else {
        const wait = add('熊寶處理中…', 'bear wait');
        let reply;
        try { reply = await window.desk.ask(text); } catch (_) { reply = '連不上熊寶系統，請確認網路後再試一次'; }
        wait.remove();
        show(reply);
      }
    } finally {
      send.disabled = false;
      input.focus();
    }
  });

  window.desk.onFocus(() => input.focus());
})();
