(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BearEffects = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const DURATION = Object.freeze({ zzz: 1600, speech: 2200, anger: 950, heart: 1250, exclamation: 1000, sweat: 1100 });

  function label(ctx, text, size, color, x = 0, y = 0) {
    ctx.font = 'bold ' + size + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function path(ctx, fill, stroke, draw) {
    ctx.beginPath();
    draw();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  function draw(ctx, kind, t, { x, y, text } = {}) {
    if (!Object.hasOwn(DURATION, kind)) throw new RangeError('Unknown effect ' + kind);
    const u = Math.max(0, Math.min(1, t));
    ctx.save();
    ctx.translate(x ?? (kind === 'zzz' ? 242 : 192), y ?? (kind === 'zzz' ? 145 : 62));
    ctx.globalAlpha = Math.min(1, u * 9, (1 - u) * 5);
    if (kind === 'zzz') {
      const color = '#c3dcff';
      for (let i = 0; i < 3; i++) {
        label(ctx, 'Z', 16 + i * 5, color, i * 17 + u * 12, -i * 19 - u * 29);
      }
    } else if (kind === 'speech') {
      const chars = Array.from(text || '嗨！');
      const content = chars.length > 13 ? chars.slice(0, 12).join('') + '…' : chars.join('');
      ctx.font = 'bold 17px system-ui, sans-serif';
      const w = Math.max(65, Math.min(268, ctx.measureText(content).width + 32));
      path(ctx, '#fffaf2', '#876c4b', () => ctx.roundRect(-w / 2, -20, w, 40, 14));
      path(ctx, '#fffaf2', null, () => {
        ctx.moveTo(-10, 17); ctx.lineTo(0, 29); ctx.lineTo(8, 17); ctx.closePath();
      });
      label(ctx, content, 17, '#573d2a');
    } else if (kind === 'anger') {
      const pulse = 1 + Math.sin(u * Math.PI * 4) * .13;
      ctx.scale(pulse, pulse);
      for (let i = 0; i < 4; i++) {
        path(ctx, null, '#f36260', () => { ctx.moveTo(-19, -7); ctx.quadraticCurveTo(-7, -7, -7, -19); });
        ctx.rotate(Math.PI / 2);
      }
    } else if (kind === 'heart') {
      ctx.translate(0, -u * 28);
      path(ctx, '#ff839f', '#bb4e6b', () => {
        ctx.moveTo(0, 17); ctx.bezierCurveTo(-39, -7, -14, -33, 0, -13);
        ctx.bezierCurveTo(14, -33, 39, -7, 0, 17); ctx.closePath();
      });
    } else if (kind === 'exclamation') {
      ctx.translate(0, -Math.sin(u * Math.PI) * 12);
      path(ctx, '#ffd56c', '#b57c29', () => ctx.roundRect(-6, -20, 12, 25, 6));
      path(ctx, '#ffd56c', '#b57c29', () => ctx.arc(0, 15, 4, 0, 2 * Math.PI));
    } else {
      ctx.translate(0, u * 21);
      path(ctx, '#84d6ff', '#3e8fc3', () => {
        ctx.moveTo(0, -22); ctx.bezierCurveTo(8, -10, 15, -4, 13, 5);
        ctx.bezierCurveTo(10, 19, -15, 18, -13, 4); ctx.bezierCurveTo(-13, -3, -6, -12, 0, -22);
        ctx.closePath();
      });
    }
    ctx.restore();
  }

  function createLayer(root) {
    const canvas = root.ownerDocument.createElement('canvas');
    canvas.width = canvas.height = 384;
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none'
    });
    root.append(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    let handle;
    let active = [];
    let sleeping = false;
    let nextSleep = 0;

    function enqueue(kind, options) {
      if (!Object.hasOwn(DURATION, kind)) throw new RangeError('Unknown effect ' + kind);
      active.push({ kind, options, start: performance.now(), duration: DURATION[kind] });
    }

    function frame(now) {
      handle = undefined;
      ctx.clearRect(0, 0, 384, 384);
      if (sleeping && now >= nextSleep) {
        enqueue('zzz', {});
        nextSleep = now + 2000;
      }
      active = active.filter(effect => now - effect.start < effect.duration);
      for (const effect of active) {
        draw(ctx, effect.kind, (now - effect.start) / effect.duration, effect.options);
      }
      if (active.length || sleeping) handle = requestAnimationFrame(frame);
    }

    function wake() {
      if (handle === undefined) handle = requestAnimationFrame(frame);
    }

    return {
      show(kind, options = {}) { enqueue(kind, options); wake(); },
      setSleeping(on) {
        if (sleeping === on) return;
        sleeping = on;
        if (on) {
          nextSleep = 0;
          wake();
        } else {
          active = active.filter(effect => effect.kind !== 'zzz');
          wake();
        }
      },
      dispose() {
        if (handle !== undefined) cancelAnimationFrame(handle);
        handle = undefined;
        active = [];
        canvas.remove();
      }
    };
  }

  return { createLayer, draw, kinds: Object.keys(DURATION) };
});
