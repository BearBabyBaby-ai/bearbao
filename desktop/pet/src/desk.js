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

  // ---------- 表格（分海、潮汐）：資料置中、依種類分底色；點表格存成圖片 ----------
  const TINT = {
    '緩慢分海': ['#e6efff', '#2563eb'], '緩慢合海': ['#fde8ea', '#e11d2e'],
    '滿潮': ['#fdecec', '#c62828'], '乾潮': ['#e8f1fb', '#1565c0'],
    '安全通行': ['#e7f6ec', '#1b7a3d'], '日出／日沒': ['#fff6dc', '#9a6700'],
    '池西岩瀑建議觀賞': ['#fff3c4', '#8a6400']
  };
  const HEAD_BG = '#f6e7cf', GROUP_BG = '#efdcbc', LABEL_BG = '#fbf3e4', LINE = '#e2cba6', INK = '#573d2a';
  // 每一格的底色與字色：潮汐表依欄（滿潮、乾潮），分海表依列（項目名稱）
  const tintOf = label => TINT[String(label).replace(/^\d{2}\/\d{2}\s*/, '')];
  function cellTint(head, row, c) {
    // 日期區段潮汐（橫向）：地點、潮別兩欄是項目欄，底色依潮別（滿潮、乾潮、池西岩瀑建議觀賞）
    if (head[1] === '潮別') return c < 2 ? [LABEL_BG, INK] : (TINT[row[1]] || TINT[row[0] + row[1]] || ['#ffffff', INK]);
    if (c === 0) return [LABEL_BG, INK];
    const byCol = TINT[head[c]];
    if (byCol && head.includes('地點')) return byCol;
    return TINT[row[0]] || ['#ffffff', INK];
  }
  function tableEl(b, title) {
    const t = document.createElement('table');
    t.className = 'b-table';
    t.title = '點一下複製成圖片';
    const tr = (cells, isHead, row) => {
      const r = document.createElement('tr');
      cells.forEach((v, i) => {
        const c = document.createElement(isHead || i === 0 ? 'th' : 'td');
        c.textContent = v;
        if (!isHead) { const [bg, fg] = cellTint(b.head || [], row, i); c.style.background = bg; c.style.color = fg; }
        r.appendChild(c);
      });
      return r;
    };
    if (Array.isArray(b.head)) t.appendChild(tr(b.head, true));
    const span = Math.max((b.head || []).length - 1, 1);
    const spanRow = (label, value) => {
      const r = document.createElement('tr');
      const th = document.createElement('th'); th.textContent = label;
      const td = document.createElement('td'); td.textContent = value; td.colSpan = span;
      const [bg, fg] = tintOf(label) || ['#ffffff', INK];
      td.style.background = bg; td.style.color = fg;
      r.append(th, td); return r;
    };
    // 每一列：一般資料、日期分組列（整列）、跨整列的資料（池西岩瀑、尚無資訊）
    (b.rows || []).forEach(row => {
      if (row && row.group) {
        const r = document.createElement('tr');
        const th = document.createElement('th'); th.textContent = row.group; th.colSpan = span + 1; th.className = 'grp';
        r.appendChild(th); t.appendChild(r);
      } else if (row && row.span) t.appendChild(spanRow(...row.span));
      else t.appendChild(tr(row, false, row));
    });
    // 表格下方跨整列的資料
    (b.foot || []).forEach(([label, value]) => t.appendChild(spanRow(label, value)));
    t.addEventListener('click', () => saveTableImage(b, title, hint));
    const hint = document.createElement('div');
    hint.className = 'b-hint';
    hint.textContent = '📷 點表格複製成圖片';
    return [t, hint];
  }
  // 把表格畫成圖片（2 倍解析度），標題在上方
  function tableCanvas(b, title) {
    const S = 2, FONT = '"Microsoft JhengHei", "微軟正黑體", "PingFang TC", sans-serif';
    const head = b.head || [];
    // 全部列：一般資料（陣列）、日期分組列 {group}、跨整列資料 {span}；表格下方的 foot 也是跨整列
    const body = [...(b.rows || []), ...(b.foot || []).map(f => ({ span: f }))];
    const plain = body.filter(Array.isArray);
    const all = [head, ...plain];
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    const fontOf = bold => `${bold ? 'bold ' : ''}${15 * S}px ${FONT}`;
    const LH = 22 * S, PADX = 14 * S, PADY = 8 * S, M = 16 * S, TITLE = 26 * S;
    const lines = v => String(v ?? '').split('\n');
    const textW = (v, bold) => { ctx.font = fontOf(bold); return Math.max(...lines(v).map(l => ctx.measureText(l).width)); };
    const cols = head.length || Math.max(...plain.map(r => r.length));
    const widths = Array.from({ length: cols }, (_, c) => Math.max(...all.map((r, ri) => textW(r[c], ri === 0 || c === 0))) + PADX * 2);
    for (const r of body) {
      if (r.span) {
        const [label, value] = r.span;
        widths[0] = Math.max(widths[0], textW(label, true) + PADX * 2);
        const need = textW(value, false) + PADX * 2, have = widths.slice(1).reduce((a, w) => a + w, 0);
        if (need > have && cols > 1) widths[cols - 1] += need - have;
      } else if (r.group) {
        const need = textW(r.group, true) + PADX * 2, have = widths.reduce((a, w) => a + w, 0);
        if (need > have) widths[cols - 1] += need - have;
      }
    }
    const W = widths.reduce((a, w) => a + w, 0);
    const hOf = r => (r.group ? 1 : r.span ? Math.max(lines(r.span[0]).length, lines(r.span[1]).length) : Math.max(...r.map(v => lines(v).length))) * LH + PADY * 2;
    const headH = Math.max(...head.map(v => lines(v).length), 1) * LH + PADY * 2;
    const H = (head.length ? headH : 0) + body.reduce((a, r) => a + hOf(r), 0);
    cv.width = W + M * 2; cv.height = H + M * 2 + TITLE + 8 * S;
    ctx.fillStyle = '#fffaf2'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = INK; ctx.font = `bold ${19 * S}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(title, M, M + TITLE / 2);
    let y = M + TITLE + 8 * S;
    const cell = (text, x, w, h, bg, fg, bold) => {
      ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = LINE; ctx.lineWidth = S; ctx.strokeRect(x + S / 2, y + S / 2, w - S, h - S);
      const ls = lines(text);
      ctx.fillStyle = fg; ctx.font = fontOf(bold); ctx.textAlign = 'center';
      ls.forEach((l, li) => ctx.fillText(l, x + w / 2, y + h / 2 + (li - (ls.length - 1) / 2) * LH));
    };
    if (head.length) {
      let x = M;
      head.forEach((v, c) => { cell(v, x, widths[c], headH, HEAD_BG, INK, true); x += widths[c]; });
      y += headH;
    }
    for (const r of body) {
      const h = hOf(r);
      if (r.group) cell(r.group, M, W, h, GROUP_BG, INK, true);
      else if (r.span) {
        cell(r.span[0], M, widths[0], h, LABEL_BG, INK, true);
        cell(r.span[1], M + widths[0], W - widths[0], h, ...(tintOf(r.span[0]) || ['#ffffff', INK]), false);
      } else {
        let x = M;
        for (let c = 0; c < cols; c++) { cell(r[c], x, widths[c], h, ...cellTint(head, r, c), c === 0); x += widths[c]; }
      }
      y += h;
    }
    return cv;
  }
  // 點表格：把表格畫成圖片直接複製到剪貼簿（不用另存）
  function saveTableImage(b, title, hint) {
    const cv = tableCanvas(b, title);
    cv.toBlob(async blob => {
      if (!blob) return;
      try {
        await window.desk.copyImage(new Uint8Array(await blob.arrayBuffer()));
        if (hint) { hint.textContent = '✅ 已複製成圖片，可直接貼上'; setTimeout(() => { hint.textContent = '📷 點表格複製成圖片'; }, 3000); }
      } catch (_) { if (hint) hint.textContent = '⚠️ 圖片複製失敗'; }
    }, 'image/png');
  }

  // 熊寶系統的回覆：純文字，或是 { blocks, files }
  function show(reply) {
    if (typeof reply === 'string' || !reply || !Array.isArray(reply.blocks)) return add(String(reply || '熊寶系統沒有回覆，請再試一次'), 'bear');
    const d = bubble('bear rich');
    for (const b of reply.blocks) {
      if (b.type === 'table') {
        const title = (reply.blocks.find(x => x.type === 'title') || {}).text || '表格';
        d.append(...tableEl(b, title));
        continue;
      }
      // 只打日期：那天有資料的項目，點一列就查那一種
      if (b.type === 'pick') {
        const t = document.createElement('table');
        t.className = 'b-table b-pick';
        const hr = document.createElement('tr');
        (b.head || []).forEach(h => { const th = document.createElement('th'); th.textContent = h; hr.appendChild(th); });
        t.appendChild(hr);
        (b.rows || []).forEach((row, i) => {
          const r = document.createElement('tr');
          r.title = '點一下查看';
          row.forEach((v, c) => { const cell = document.createElement(c === 0 ? 'th' : 'td'); cell.textContent = v; r.appendChild(cell); });
          r.addEventListener('click', () => { const cmd = (b.cmds || [])[i]; if (cmd) { input.value = cmd; form.requestSubmit(); } });
          t.appendChild(r);
        });
        const hint = document.createElement('div');
        hint.className = 'b-hint';
        hint.textContent = '👆 點要看的那一項';
        d.append(t, hint);
        continue;
      }
      // 每一種各自的一鍵複製（只打地區時）
      if (b.type === 'copy') {
        const row = document.createElement('div');
        row.className = 'files';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = b.label || '📋 一鍵複製';
        btn.addEventListener('click', () => {
          window.desk.copy(b.text);
          btn.textContent = '✅ 已複製';
          setTimeout(() => { btn.textContent = b.label || '📋 一鍵複製'; }, 2000);
        });
        row.appendChild(btn);
        d.appendChild(row);
        continue;
      }
      if (b.type === 'pub') {
        const el = document.createElement('div');
        el.className = 'b-pub';
        el.textContent = b.text;
        d.appendChild(el);
        continue;
      }
      const el = document.createElement(b.type === 'link' ? 'a' : 'div');
      el.className = 'b-' + b.type;
      el.textContent = b.text;
      if (b.type === 'link') { el.href = b.url; el.addEventListener('click', e => { e.preventDefault(); window.open(b.url); }); }
      d.appendChild(el);
    }
    // 一鍵複製：整個搜尋結果
    if (reply.copy) {
      const row = document.createElement('div');
      row.className = 'files';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '📋 一鍵複製';
      btn.addEventListener('click', () => {
        window.desk.copy(reply.copy);
        btn.textContent = '✅ 已複製全部';
        setTimeout(() => { btn.textContent = '📋 一鍵複製'; }, 2000);
      });
      row.appendChild(btn);
      d.appendChild(row);
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

  // live：打字途中用，資料不齊也先回傳（缺的欄位空白）；送出時要日期、時間都有
  function parseCard(text, live) {
    const named = /^免稅卡/.test(text);
    const s = text.replace(/^免稅卡\s*/, '').trim();
    const tokens = s.split(/\s+/);
    let date = '', time = '', flight = '', transport = '';
    const rest = [];
    for (const t of tokens) {
      let m;
      if (!date && (m = t.match(/^(?:\d{4}[\/\-.])?(\d{1,2})[\/\-.](\d{1,2})$/))) date = `${pad2(m[1])}/${pad2(m[2])}`;
      else if (!time && (m = t.match(/^(\d{1,2})[:：](\d{2})$/))) time = `${pad2(m[1])}:${m[2]}`;
      else if (!flight && (m = t.toUpperCase().match(/^(B7|AE|DA)-?(\d{2,4})$/))) { flight = `${m[1]}-${m[2]}`; transport = 'airport'; }
      else if (/^[\d\/\-.:：]+$/.test(t) || (live && /^(B7|AE|DA)-?\d{0,1}$/i.test(t))) continue;   // 還沒打完的日期、時間、航班
      else rest.push(t);
    }
    if (live) {
      // 看得出是免稅卡才即時顯示：有航班代號加日期或時間、或日期加時間、或開頭打「免稅卡」
      if (!(named || (flight && (date || time)) || (date && time))) return null;
    } else if (!date || !time) return null;
    if (!flight) {
      // 沒有航班代號：第一個不是地名的當船名，當成船班
      const idx = rest.findIndex(t => !/港|嘉義|布袋|高雄|台南|臺南|台中|臺中|台北|臺北/.test(t));
      if (idx >= 0) { flight = rest.splice(idx, 1)[0]; transport = 'port'; }
    }
    let dest = rest.join(' ');
    const rule = DEST_RULES.find(r => r.keys.includes(dest) && (!r.transport || r.transport === transport));
    if (rule) dest = rule.value;
    if (!dest && transport === 'port') dest = PORT_DEST;
    if (!live && !flight) return null;
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

  async function drawCard(c, canvas = document.createElement('canvas')) {
    const img = await background();
    if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) { canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    if (img.destRight == null) img.destRight = destRight(ctx, canvas);   // 白色區塊右緣只跟底圖有關，算一次就好
    const right = img.destRight;
    const font = size => `bold ${size}px ${CARD.family}`;
    const pos = CARD.text;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = CARD.color;
    const chk = CARD.check[c.transport];
    if (chk) { ctx.font = `bold ${CARD.checkSize}px Arial`; ctx.fillText('✔', chk.x, chk.y); }
    ctx.font = font(CARD.size);
    if (c.date) ctx.fillText(c.date, pos.date.x, pos.date.y);
    if (c.time) ctx.fillText(c.time, pos.time.x, pos.time.y);
    const airline = c.transport === 'airport' ? AIRLINES[c.flight.slice(0, 2)] : '';
    if (airline) { ctx.fillText(airline, pos.flight.x, pos.flight.y - 120); ctx.fillText(c.flight, pos.flight.x, pos.flight.y + 140); }
    else if (c.flight) ctx.fillText(c.flight, pos.flight.x, pos.flight.y);
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

  const cardInfo = c => [`離境日期：${c.date || '（未填）'}`, `${c.transport === 'port' ? '船班' : '航班'}：${c.flight || '（未填）'}`, `離境時間：${c.time || '（未填）'}`, `目的地：${c.dest || '（未填）'}`].join('\n');
  function thumb(canvas, img) {
    const small = document.createElement('canvas');
    small.width = 280; small.height = Math.round(canvas.height * 280 / canvas.width);
    small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
    img.src = small.toDataURL('image/jpeg', 0.9);
  }

  // ---------- 免稅卡即時顯示：打字時就更新預覽（和航班卡產生器一樣） ----------
  let live = null, liveTimer = 0, liveSeq = 0;
  const liveCanvas = document.createElement('canvas');
  function clearLive() { clearTimeout(liveTimer); liveSeq++; if (live) { live.box.remove(); live = null; } }
  function scheduleLive() {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(updateLive, 120);
  }
  async function updateLive() {
    const c = parseCard(input.value.trim().replace(/\s+/g, ' '), true);
    if (!c) { clearLive(); return; }
    const seq = ++liveSeq;
    if (!live) {
      const box = bubble('bear rich live');
      const title = document.createElement('div'); title.className = 'b-title'; title.textContent = '免稅卡（即時預覽）';
      const info = document.createElement('div'); info.className = 'b-text';
      const img = document.createElement('img'); img.className = 'card'; img.addEventListener('load', scroll);
      box.append(title, info, img);
      live = { box, info, img };
    }
    live.info.textContent = cardInfo(c) + (bg ? '' : '\n底圖載入中…');
    scroll();
    try {
      await drawCard(c, liveCanvas);
      if (seq !== liveSeq || !live) return;
      live.info.textContent = cardInfo(c) + (date_time_ok(c) ? '\n按 Enter 或「送出」產生可下載的免稅卡' : '');
      thumb(liveCanvas, live.img);
    } catch (e) { if (live && seq === liveSeq) live.info.textContent = cardInfo(c) + '\n⚠️ ' + e.message; }
  }
  const date_time_ok = c => !!(c.date && c.time && c.flight);
  input.addEventListener('input', scheduleLive);

  async function dutyFree(c) {
    const d = bubble('bear rich');
    const title = document.createElement('div');
    title.className = 'b-title';
    title.textContent = '免稅卡';
    const info = document.createElement('div');
    info.className = 'b-text';
    info.textContent = cardInfo(c);
    d.append(title, info);
    scroll();
    let canvas;
    try { canvas = await drawCard(c); } catch (e) { info.textContent += '\n⚠️ ' + e.message; return; }
    const prev = document.createElement('img');
    prev.className = 'card';
    thumb(canvas, prev);
    if (!canvas.exportable) info.textContent += '\n⚠️ 底圖只能顯示、無法匯出 JPG，請確認 Drive 圖片已開放「知道連結的任何人」檢視';
    const row = document.createElement('div');
    row.className = 'files';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '⬇ 下載免稅卡 JPG';
    const name = `免稅航班卡_${c.date.replace(/\//g, '')}_${c.flight}.jpg`;
    btn.addEventListener('click', () => canvas.toBlob(async b => { if (b) saveFile(btn, name, new Uint8Array(await b.arrayBuffer())); }, 'image/jpeg', 0.85));
    // 一鍵複製圖片：直接放進剪貼簿，可直接貼上（下載照舊）
    const cp = document.createElement('button');
    cp.type = 'button';
    cp.textContent = '📋 一鍵複製圖片';
    cp.addEventListener('click', () => {
      try {
        canvas.toBlob(async b => {
          if (!b) { cp.textContent = '⚠️ 圖片複製失敗'; return; }
          try {
            await window.desk.copyImage(new Uint8Array(await b.arrayBuffer()));
            cp.textContent = '✅ 已複製，可直接貼上';
          } catch (_) { cp.textContent = '⚠️ 圖片複製失敗'; }
          setTimeout(() => { cp.textContent = '📋 一鍵複製圖片'; }, 3000);
        }, 'image/png');
      } catch (_) { cp.textContent = '⚠️ 底圖無法匯出，不能複製'; }
    });
    row.append(btn, cp);
    d.append(prev, row);
    prev.addEventListener('load', scroll);
    scroll();
  }

  add('要查什麼或記什麼，直接打給我（不用照固定格式）：\n11/15 分海\n11/15 潮汐\n11/14 宵夜 111\n澎南 湖西 美食\n白沙 早餐\n馬公 景點\n2027元宵\n當前航班\n11/16 高雄 AE361 10:00（免稅卡）', 'bear');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || send.disabled) return;
    const one = text.replace(/\s+/g, ' ');
    const draft = parseCard(one, true);
    clearLive();
    add(text, 'me');
    input.value = '';
    send.disabled = true;
    try {
      const card = parseCard(one);
      if (card) await dutyFree(card);
      else if (draft) {
        const lack = [!draft.date && '離境日期', !draft.flight && '航班', !draft.time && '離境時間'].filter(Boolean);
        add(`免稅卡還缺：${lack.join('、')}\n例如：11/16 高雄 AE361 10:00`, 'bear');
      } else {
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

  // 右上角：縮小（只留標題列）、恢復（展開回原本大小）
  const miniBtn = document.getElementById('mini'), restoreBtn = document.getElementById('restore');
  function setMini(on) {
    document.body.classList.toggle('mini', on);
    miniBtn.disabled = on;
    restoreBtn.disabled = !on;
    window.desk.mini(on);
    if (!on) { scroll(); input.focus(); }
  }
  miniBtn.addEventListener('click', () => setMini(true));
  restoreBtn.addEventListener('click', () => setMini(false));
  // 點標題列也能縮小／恢復（按鈕本身照舊）
  document.querySelector('header').addEventListener('click', e => {
    if (e.target.closest('button')) return;
    setMini(!document.body.classList.contains('mini'));
  });

  // 點熊寶：和點標題一樣，縮小／恢復切換（恢復時到輸入框打字）
  window.desk.onFocus(toggle => {
    const mini = document.body.classList.contains('mini');
    if (toggle) setMini(!mini); else if (mini) setMini(false); else input.focus();
  });
})();
