'use strict';
(() => {
  const SCALE = 0.5, SIZE = 384, PAD = 48;
  const stage = document.getElementById('stage');
  const rig = document.getElementById('rig');
  const layer = window.BearEffects.createLayer(stage);
  let img = null, mirror = false, latest = 0;

  // ---------- 動畫切換 ----------
  window.pet.on('clip', ({ url, mirror: m, token }) => {
    latest = token;
    const next = new Image();
    next.draggable = false;
    next.src = url + '?t=' + token;      // 不同網址讓動畫從第 1 格開始
    if (m) next.className = 'mirror';
    const swap = () => {
      if (token !== latest) return;
      stage.insertBefore(next, stage.firstChild);
      if (img && img !== next) img.remove();
      img = next; mirror = m;
    };
    next.decode().then(swap, swap);
  });
  // 對話框用一般文字大小顯示，縮小後才看得清楚
  const bubble = document.getElementById('bubble');
  let bubbleTimer = 0;
  function speak(text, ms) {
    bubble.textContent = text;
    bubble.classList.add('show');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.classList.remove('show'), ms || 3000);
  }
  window.pet.on('effect', d => {
    if (d.kind === 'speech') return speak(d.text, d.ms);
    try { layer.show(d.kind, d); } catch (_) { /* 忽略 */ }
  });
  window.pet.on('sleeping', on => layer.setSleeping(!!on));
  window.pet.on('fade', () => { stage.style.opacity = '0'; });

  // ---------- 被甩動時的傾斜（以抓取點為中心旋轉） ----------
  let sway = { deg: 0, px: 96, py: 38 };
  window.pet.on('sway', d => {
    sway = d;
    rig.style.transformOrigin = d.px + 'px ' + d.py + 'px';
    rig.style.transform = d.deg ? 'rotate(' + d.deg.toFixed(2) + 'deg)' : '';
  });

  // ---------- 小跳舞（工作模式閒著時）：左右擺＋跟著節拍輕輕彈起，以腳底為中心 ----------
  let groove = null;
  window.pet.on('groove', d => {
    if (!d || !d.ms) { groove = null; if (!sway.deg) rig.style.transform = ''; return; }
    groove = { t0: performance.now(), ms: d.ms };
    rig.style.transformOrigin = d.px + 'px ' + d.py + 'px';
    const step = now => {
      if (!groove || sway.deg) return;
      const t = now - groove.t0;
      if (t >= groove.ms) { groove = null; rig.style.transform = ''; return; }
      const env = Math.min(1, t / 400, (groove.ms - t) / 400);   // 開始、結束慢慢來
      const beat = (t / 1100) * Math.PI * 2;                     // 一拍 1.1 秒
      const deg = Math.sin(beat) * 3 * env;
      const dy = -Math.abs(Math.sin(beat)) * 2.5 * env;
      rig.style.transform = 'translateY(' + dy.toFixed(1) + 'px) rotate(' + deg.toFixed(2) + 'deg)';
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  // ---------- 只在熊寶身上接收滑鼠 ----------
  // 目前畫格縮成 48×48 的輪廓傳給主程式，由主程式判斷游標有沒有碰到熊寶（分身重疊時也抓得起來）
  const MASK = 48;
  const probe = document.createElement('canvas');
  probe.width = probe.height = MASK;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  let lastMask = '';
  function sendMask() {
    if (!img || !img.complete || !img.naturalWidth) return;
    try {
      // 輪廓涵蓋整個視窗（含四周留空與傾斜角度）
      const k = MASK / (SIZE * SCALE + PAD * 2);
      pctx.setTransform(1, 0, 0, 1, 0, 0);
      pctx.clearRect(0, 0, MASK, MASK);
      pctx.scale(k, k);
      pctx.translate(PAD + sway.px, PAD + sway.py);
      pctx.rotate((sway.deg || 0) * Math.PI / 180);
      pctx.translate(-sway.px, -sway.py);
      if (mirror) { pctx.translate(SIZE * SCALE, 0); pctx.scale(-1, 1); }
      pctx.drawImage(img, 0, 0, SIZE * SCALE, SIZE * SCALE);
      const d = pctx.getImageData(0, 0, MASK, MASK).data;
      const bits = new Uint8Array(MASK * MASK);
      let key = '';
      for (let i = 0; i < bits.length; i++) { bits[i] = d[i * 4 + 3] > 24 ? 1 : 0; key += bits[i]; }
      if (key === lastMask) return;
      lastMask = key;
      window.pet.mask(bits);
    } catch (_) { /* 略過這一次 */ }
  }
  setInterval(sendMask, 120);

  let hit = false, down = null, dragging = false;
  let headSince = 0, lastPet = 0;

  function onHead(clientY) { return (clientY - PAD) / SCALE < 200; }

  // 主程式通知：游標碰到熊寶（這時視窗才接收滑鼠）或離開
  window.pet.on('hover', on => {
    hit = !!on;
    document.body.classList.toggle('hit', hit);
    if (!hit && !down) headSince = 0;
  });

  function onMove(e) {
    if (down) {
      if (!dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) {
        dragging = true;
        headSince = 0;
        document.body.classList.add('dragging');
        window.pet.dragStart();
      }
      return;
    }
    if (hit && onHead(e.clientY)) { if (!headSince) headSince = performance.now(); }
    else headSince = 0;
  }
  document.addEventListener('pointermove', onMove);

  document.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !hit) return;
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
    window.pet.press(true);
    try { document.body.setPointerCapture(e.pointerId); } catch (_) { /* 忽略 */ }
  });

  function release(e) {
    if (!down) return;
    const wasDrag = dragging;
    const quick = performance.now() - down.t < 450;
    down = null; dragging = false;
    document.body.classList.remove('dragging');
    try { document.body.releasePointerCapture(e.pointerId); } catch (_) { /* 忽略 */ }
    window.pet.press(false);
    if (wasDrag) window.pet.dragEnd();
    else if (quick) window.pet.click();
  }
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);
  // 視窗失去滑鼠（例如被其他程式搶走）時也要放開，不讓熊寶一直被抓著
  document.addEventListener('lostpointercapture', release);
  window.addEventListener('blur', () => { if (down) release({}); });

  // 游標停在頭上就是摸摸頭
  setInterval(() => {
    if (!headSince || down || !hit) return;
    const now = performance.now();
    if (now - headSince > 600 && now - lastPet > 1300) { lastPet = now; window.pet.petted(); }
  }, 200);
})();
