'use strict';
// 一隻熊寶的行為：遊蕩、怪動作、滑鼠互動、視窗互動、時段與季節動作
const clips = require('./clips');

const S = 0.5;                                  // 384 畫布縮成 192
const PAD = 48;                                  // 甩動傾斜時身體會甩出原本的範圍，視窗四周留空
const W = Math.round(clips.SCALE_BASE * S) + PAD * 2;   // 視窗邊長
const AX = clips.ANCHOR.x * S, AY = clips.ANCHOR.y * S;
const GRAB = { x: 192 * S, y: 76 * S };         // 被抓起時游標對準的點
const CLIMB_CONTACT = 316;                      // 攀爬／推視窗時手貼的那條線（朝右時）
const GRIP_Y = 68 * S;                          // 懸掛時雙手的高度
const HALF_BODY = 36;                           // 身體半寬（判斷撞到邊）
const G = 1500, MAX_FALL = 1100;

// ---------- 被抓著左右甩動（蚊香眼） ----------
// 以抓取點為旋轉中心的擺錘：游標加速時身體落後、游標急停或反向時下半身沿原方向甩出去再回彈
const SWAY = {
  FAST: 650,            // 游標左右速度超過這個（點／秒）才算快速
  MAX: 40 * Math.PI / 180,
  K: 110,               // 回正的力量（擺動快慢）
  DAMP_SHAKE: 2.2,      // 甩動中：擺幅保留多一點
  DAMP_CALM: 5.5,       // 停手仍按住：擺幅逐漸收小
  GAIN: 1 / 200,        // 游標加速度換成擺動的比例（速度越快甩越大）
  MAX_ACC: 40000,       // 游標瞬間跳動（例如換螢幕）不算，避免突然甩很大
  KEEP_MS: 650,         // 多久沒有快速反向就算停手
  RELEASE_MS: 260       // 放開後傾斜角度回正的時間
};

const SPEED = { walk: 46, tiptoe: 26, run: 150, crawl: 22, roll: 95, climb: 38, push: 32 };
const MOVE_CLIP = { walk: 'walk', tiptoe: 'tiptoe_right', run: 'run_right', crawl: 'crawl_left', roll: 'roll_left' };
const SLEEP_IDS = new Set(['pillow_sleep', 'belly_nap', 'curl_to_sleep']);

const rand = (a, b) => a + Math.random() * (b - a);
const chance = p => Math.random() < p;
function pick(weights) {
  let total = 0;
  for (const [, w] of weights) total += Math.max(0, w);
  let r = Math.random() * total;
  for (const [k, w] of weights) { r -= Math.max(0, w); if (r <= 0) return k; }
  return weights[weights.length - 1][0];
}

class Bear {
  constructor(world, { clone = false, fx, fy, facing } = {}) {
    this.world = world;
    this.clone = clone;
    this.facing = facing || (chance(0.5) ? 1 : -1);
    const d = world.displayAt(fx ?? 0, fy ?? 0);
    this.fx = fx ?? rand(d.workArea.x + 120, d.workArea.x + d.workArea.width - 120);
    this.fy = fy ?? d.workArea.y + 40;
    this.vx = 0; this.vy = 0;
    this.surface = null;
    this.mode = null; this.m = {};
    this.cur = null;         // 正在播放的 { id, mirror }
    this.token = 0;
    this.sleeping = false;
    this.away = false;
    this.workKind = null;
    this.drags = [];
    this.lastInteract = Date.now();
    this.lastPet = 0;
    this.bornAt = Date.now();
    this.lifeMs = clone ? rand(30, 60) * 1000 : Infinity;   // 分身存在 30～60 秒
  }

  // ---------- 播放 ----------
  outfit() { return this.world.outfit(); }

  play(action, { restart = false } = {}) {
    const { clip, mirror } = clips.resolve(action, this.outfit(), this.facing);
    const changed = !this.cur || this.cur.id !== clip.id || this.cur.mirror !== mirror;
    if (changed || restart) {
      this.token++;
      this.cur = { id: clip.id, mirror, action };
      this.world.send(this, 'clip', { url: clips.fileUrl(clip), mirror, token: this.token });
    } else {
      this.cur.action = action;
    }
    this.setSleeping(SLEEP_IDS.has(action) || this.mode === 'fullscreen');
    return clip;
  }

  // 服裝換季時，正在播放的動作換成新服裝的版本
  refreshOutfit() {
    if (this.cur?.action) this.play(this.cur.action);
  }

  effect(kind, opts = {}) { this.world.send(this, 'effect', { kind, ...opts }); }

  say(text) {
    this.effect('speech', { text, ms: 4500 });
  }

  setSleeping(on) {
    if (on === this.sleeping) return;
    this.sleeping = on;
    this.world.send(this, 'sleeping', on);
  }

  // ---------- 位置 ----------
  display() { return this.world.displayAt(this.fx, this.fy - 40); }
  wa() { return this.display().workArea; }
  floorY() { const a = this.wa(); return a.y + a.height; }
  windowPos() { return { x: Math.round(this.fx - AX - PAD), y: Math.round(this.fy - AY - PAD) }; }

  clampX() {
    const a = this.wa();
    this.fx = Math.min(Math.max(this.fx, a.x + HALF_BODY), a.x + a.width - HALF_BODY);
  }

  // ---------- 狀態切換 ----------
  setMode(mode, data = {}) { this.mode = mode; this.m = data; }

  idle(sec = rand(1.5, 5)) {
    this.setMode('idle', { until: Date.now() + sec * 1000 });
    this.play('idle_blink');
  }

  // 播一次就結束的動作
  anim(action, then) {
    const clip = this.play(action, { restart: true });
    let ms = clip.duration_ms;
    // 原裝的坐下、縮成一團原本會自己起身，這裡改成停在最後一格
    this.setMode('anim', { until: Date.now() + ms, then });
    return clip;
  }

  // 重複播放一段時間
  hold(action, sec, then) {
    const clip = this.play(action, { restart: true });
    this.setMode('hold', { until: Date.now() + sec * 1000, then, action });
    return clip;
  }

  sit(sec) {
    const clip = this.play('sit_down', { restart: true });
    this.setMode('hold', { until: Date.now() + sec * 1000, action: 'sit_down', then: () => this.anim('stretch_up', () => this.idle()) });
    return clip;
  }

  sleep(sec, deep = false) {
    const kind = pick([['pillow_sleep', 5], ['belly_nap', 3], ['curl_to_sleep', 2]]);
    if (kind === 'curl_to_sleep' && this.outfit() === 'default') {
      // 原裝的縮成一團只有入睡過程，播完接著趴睡
      const c = this.play('curl_to_sleep', { restart: true });
      this.setMode('hold', { until: Date.now() + sec * 1000, deep, sleepy: true, wake: true });
      this.world.later(this, c.duration_ms, () => { if (this.mode === 'hold' && this.m.sleepy) this.play('belly_nap'); });
      this.setSleeping(true);
      return;
    }
    this.play(kind, { restart: true });
    this.setMode('hold', { until: Date.now() + sec * 1000, deep, sleepy: true, wake: true });
  }

  wakeUp() {
    this.setSleeping(false);
    this.anim(chance(0.5) ? 'rub_eyes' : 'yawn', () => this.idle());
  }

  move(kind, sec) {
    this.setMode('move', { kind, until: Date.now() + sec * 1000 });
    this.play(MOVE_CLIP[kind]);
  }

  startFall(vx = 0) {
    this.surface = null;
    this.vx = vx; this.vy = 0;
    this.setMode('fall', {});
    this.play('falling');
  }

  land(hard) {
    this.vy = 0; this.vx = 0;
    if (hard) {
      const dust = () => this.anim('dust_off', () => {
        if (this.recentDrags() >= 3) return this.angry();
        this.idle();
      });
      // 有摔落著地的圖（這套衣服也有）就先摔在地上爬起來，再拍拍屁股
      if (clips.hasVariant('land_impact', this.outfit())) this.anim('land_impact', dust);
      else dust();
    } else this.idle(rand(0.5, 2));
  }

  angry() {
    this.lastInteract = Date.now();
    // 發火跺腳，或背對鬧脾氣
    if (chance(0.5)) this.hold('tap_foot', 3.2, () => this.idle());
    else this.hold('shiver', 4, () => this.idle());
    this.effect('anger');
    this.world.later(this, 1100, () => this.effect('anger'));
  }

  sulk() {
    // 全螢幕結束：背對鬧脾氣
    this.hold('shiver', 5, () => this.idle());
    this.effect('anger');
    this.world.later(this, 1500, () => this.effect('anger'));
    this.world.later(this, 3000, () => this.effect('anger'));
  }

  // ---------- 外部事件 ----------
  onPet() {
    const now = Date.now();
    if (now - this.lastPet < 1400) return;
    this.lastPet = now;
    this.lastInteract = now;
    this.effect('heart');
    if (this.sleeping || this.busy()) return;
    this.anim(chance(0.7) ? 'giggle' : 'blow_kiss', () => this.resume());
  }

  onClick() {
    this.lastInteract = Date.now();
    if (this.mode === 'fullscreen' || this.mode === 'drag') return;
    if (this.sleeping) { this.wakeUp(); return; }
    if (this.busy()) return;
    const r = pick([['ears_perk', 3], ['backstep', 2], ['duck', 2], ['curious_tilt', 2], ['clap', 1]]);
    if (r === 'ears_perk' || r === 'backstep') this.effect('exclamation');
    if (r === 'backstep') this.hold('backstep', 1.2, () => this.resume());
    else this.anim(r, () => this.resume());
  }

  onDragStart() {
    if (this.mode === 'fullscreen') return;
    this.lastInteract = Date.now();
    this.drags.push(Date.now());
    this.surface = null;
    this.setSleeping(false);
    this.setMode('drag', { hist: [] });
    this.play('grab_struggle', { restart: true });
    const p = this.world.cursor();
    this.sway = { th: 0, om: 0, vs: 0, lastX: p.x, fastSign: 0, lastRev: 0, active: false, show: 0, deg: this.sway?.deg || 0 };
  }

  // 這套衣服有蚊香眼的圖才換（避免衣服在動作之間換來換去）
  canDizzy() { return clips.hasVariant('dizzy_sway', this.outfit()); }

  tickSway(dt, now) {
    const w = this.sway;
    const p = this.world.cursor();
    const v = dt > 0 ? (p.x - w.lastX) / dt : 0;
    w.lastX = p.x;
    const prev = w.vs;
    w.vs += (v - w.vs) * Math.min(1, dt * 25);       // 稍微平滑，避免單一格雜訊
    const a = dt > 0 ? Math.max(-SWAY.MAX_ACC, Math.min(SWAY.MAX_ACC, (w.vs - prev) / dt)) : 0;
    // 快速左右反向
    if (Math.abs(w.vs) > SWAY.FAST) {
      const sign = Math.sign(w.vs);
      if (w.fastSign && sign !== w.fastSign) {
        w.lastRev = now;
        if (!w.active) w.active = true;
        if (this.canDizzy()) this.play('dizzy_sway');   // 已經在播就接著播，不從第一格重播
      }
      w.fastSign = sign;
    }
    // 擺錘（分 4 小步算，比較穩定）
    const shaking = now - w.lastRev < SWAY.KEEP_MS;
    const damp = shaking ? SWAY.DAMP_SHAKE : SWAY.DAMP_CALM;
    for (let i = 0, h = dt / 4; i < 4; i++) {
      w.om += (-SWAY.K * w.th - damp * w.om + a * SWAY.GAIN) * h;
      w.th += w.om * h;
      if (Math.abs(w.th) > SWAY.MAX) { w.th = Math.sign(w.th) * SWAY.MAX; w.om *= -0.25; }
    }
    if (w.active) {
      w.show = Math.min(1, w.show + dt * 8);
      // 停手後擺幅收小到幾乎不動，回到原本被抓著的樣子
      if (!shaking && Math.abs(w.th) < 0.012 && Math.abs(w.om) < 0.12) {
        w.active = false; w.show = 0; w.fastSign = 0;
        this.play('grab_struggle');   // 換回被抓著的樣子（本來就是就不重播）
      }
    }
    this.setSwayDeg(w.active ? w.th * w.show * 180 / Math.PI : 0);
  }

  // 傾斜角度交給畫面（以抓取點為中心旋轉）
  setSwayDeg(deg) {
    if (!this.sway) this.sway = { deg: 0 };
    if (Math.abs(deg) < 0.05) deg = 0;
    if (Math.abs(deg - (this.sway.sent ?? 0)) < 0.05) { this.sway.deg = deg; return; }
    this.sway.deg = deg; this.sway.sent = deg;
    this.world.send(this, 'sway', { deg, px: GRAB.x, py: GRAB.y });
  }

  // 放開後：角度平順回正
  settleSway(dt) {
    const d = this.sway?.deg || 0;
    if (!d) return;
    const next = d * Math.exp(-dt * 1000 / SWAY.RELEASE_MS * 3);
    this.setSwayDeg(Math.abs(next) < 0.3 ? 0 : next);
  }

  onDragEnd() {
    if (this.mode !== 'drag') return;
    const h = this.m.hist;
    let vx = 0;
    if (h.length >= 2) {
      const a = h[0], b = h[h.length - 1];
      const dt = (b.t - a.t) / 1000;
      if (dt > 0.01) vx = Math.max(-900, Math.min(900, (b.x - a.x) / dt));
    }
    if (Math.abs(vx) > 60) this.facing = vx > 0 ? 1 : -1;
    this.startFall(vx);
    this.m.thrown = true;
  }

  recentDrags() {
    const now = Date.now();
    this.drags = this.drags.filter(t => now - t < 40000);
    return this.drags.length;
  }

  // 正在做不該被打斷的事
  busy() {
    return ['drag', 'fall', 'climb', 'hang', 'push', 'fullscreen'].includes(this.mode);
  }

  // 被打斷後回到原本該做的事
  resume() {
    if (this.workKind && !this.clone) return this.work(this.workKind);
    this.idle();
  }

  notice(text) {
    if (this.busy() || this.clone) return false;
    this.setSleeping(false);
    this.anim('wave', () => this.resume());
    this.say(text);
    return true;
  }

  work(kind) {
    this.workKind = kind;
    if (this.busy() || this.sleeping) return;
    const id = { code: 'write_code', document: 'write_document', map: 'draw_map' }[kind];
    this.setMode('work', { kind });
    this.play(id);
  }

  stopWork() {
    this.workKind = null;
    if (this.mode === 'work') this.anim('stretch_up', () => this.idle());
  }

  setAway(away) {
    if (this.away === away) return;
    this.away = away;
    if (away) {
      if (!this.busy()) this.sleep(3600, true);
    } else if (this.sleeping && this.mode === 'hold') {
      this.wakeUp();
    }
  }

  enterFullscreen() {
    if (this.mode === 'fullscreen') return;
    const a = this.wa();
    this.surface = { type: 'floor' };
    this.fx = a.x + a.width - 90;
    this.fy = a.y + a.height;
    this.vx = this.vy = 0;
    this.facing = -1;
    this.setMode('fullscreen', {});
    this.play(chance(0.6) ? 'pillow_sleep' : 'belly_nap', { restart: true });
    this.setSleeping(true);
  }

  exitFullscreen() {
    if (this.mode !== 'fullscreen') return;
    this.setMode('idle', { until: 0 });
    this.setSleeping(false);
    this.sulk();
  }

  // ---------- 每一格 ----------
  tick(dt) {
    const now = Date.now();
    if (this.mode !== 'drag') this.settleSway(dt);
    switch (this.mode) {
      case 'drag': this.tickDrag(now); return this.tickSway(dt, now);
      case 'fall': return this.tickFall(dt);
      case 'climb': return this.tickClimb(dt);
      case 'hang': if (now >= this.m.until) this.startFall(0); return;
      case 'push': return this.tickPush(dt);
      case 'fullscreen': return;
    }
    if (!this.checkSupport()) return;
    if (this.mode === 'move') return this.tickMove(dt, now);
    if (this.mode === 'idle' && now >= this.m.until) return this.decide();
    if ((this.mode === 'anim' || this.mode === 'hold') && now >= this.m.until) {
      const then = this.m.then;
      if (this.m.wake) {
        if (this.away && this.m.deep) { this.m.until = now + 60000; return; }
        return this.wakeUp();
      }
      if (then) then(); else this.resume();
    }
  }

  tickDrag(now) {
    const p = this.world.cursor();
    this.fx = p.x - GRAB.x + AX;
    this.fy = p.y - GRAB.y + AY;
    this.m.hist.push({ x: p.x, t: now });
    while (this.m.hist.length > 6) this.m.hist.shift();
  }

  tickFall(dt) {
    const prevFy = this.fy;
    this.vy = Math.min(MAX_FALL, this.vy + G * dt);
    this.fy += this.vy * dt;
    if (this.vx) {
      this.fx += this.vx * dt;
      this.vx *= Math.pow(0.6, dt);
      const a = this.wa();
      if (this.fx < a.x + HALF_BODY || this.fx > a.x + a.width - HALF_BODY) { this.vx = -this.vx * 0.4; this.clampX(); }
    }
    const hard = this.m.thrown || this.vy > 650;
    // 落在視窗頂端
    const w = this.world.landingWindow(this.fx, prevFy, this.fy, this.wa());
    if (w) {
      this.fy = w.rect.y;
      this.surface = { type: 'window', hwnd: w.hwnd, top: w.rect.y, left: w.rect.x };
      return this.land(hard);
    }
    const floor = this.floorY();
    if (this.fy >= floor) {
      this.fy = floor;
      this.surface = { type: 'floor' };
      this.clampX();
      return this.land(hard);
    }
  }

  // 站的地方還在嗎？視窗移動時跟著動，視窗不見就掉下去
  checkSupport() {
    const s = this.surface;
    if (!s) { this.startFall(0); return false; }
    if (s.type === 'floor') {
      this.fy = this.floorY();
      return true;
    }
    const w = this.world.windowById(s.hwnd);
    if (!w || w.zoomed || this.world.occluded(w, this.fx, w.rect.y - 4)) { this.startFall(0); return false; }
    if (w.rect.x !== s.left) { this.fx += w.rect.x - s.left; s.left = w.rect.x; }
    this.fy = s.top = w.rect.y;
    if (this.fx < w.rect.x + 6 || this.fx > w.rect.x + w.rect.width - 6) { this.startFall(0); return false; }
    return true;
  }

  tickMove(dt, now) {
    const kind = this.m.kind;
    const step = SPEED[kind] * dt * this.facing;
    const prevFront = this.fx + this.facing * HALF_BODY;
    const nx = this.fx + step;
    const a = this.wa();
    const s = this.surface;

    if (s.type === 'window') {
      const w = this.world.windowById(s.hwnd);
      const left = w.rect.x + 18, right = w.rect.x + w.rect.width - 18;
      if (nx < left || nx > right) {
        if (chance(0.35)) { this.fx = nx; return this.startFall(this.facing * 60); }
        this.facing = -this.facing;
        return this.play(MOVE_CLIP[kind]);
      }
    } else {
      // 撞到螢幕邊
      if (nx < a.x + HALF_BODY || nx > a.x + a.width - HALF_BODY) {
        if (kind === 'walk' && chance(0.45)) return this.startClimb('screen', this.facing > 0 ? a.x + a.width : a.x);
        this.facing = -this.facing;
        return this.play(MOVE_CLIP[kind]);
      }
      // 撞到貼地的視窗側邊
      const hit = this.world.sideObstacle(prevFront, nx + this.facing * HALF_BODY, this.facing, this.fy);
      if (hit && !this.m.passing?.has(hit.hwnd)) {
        const r = pick([['climb', kind === 'walk' ? 3 : 0], ['push', kind === 'walk' && !hit.zoomed ? 2 : 0], ['turn', 2.5], ['pass', 2.5]]);
        if (r === 'climb') return this.startClimb('window', this.facing > 0 ? hit.rect.x : hit.rect.x + hit.rect.width, hit);
        if (r === 'push') return this.startPush(hit);
        if (r === 'turn') { this.facing = -this.facing; return this.play(MOVE_CLIP[kind]); }
        (this.m.passing ||= new Set()).add(hit.hwnd);
      }
    }
    this.fx = nx;
    if (now >= this.m.until) {
      if (kind === 'run') return this.anim('brake', () => this.idle());
      this.idle();
    }
  }

  startClimb(target, edgeX, win) {
    this.surface = null;
    const mirror = this.facing < 0;
    const contact = (mirror ? clips.SCALE_BASE - CLIMB_CONTACT : CLIMB_CONTACT) * S;
    this.fx = edgeX - contact + AX;
    this.setMode('climb', { target, edgeX, hwnd: win?.hwnd, left: win?.rect.x });
    this.play('climb_edge');
  }

  tickClimb(dt) {
    this.fy -= SPEED.climb * dt;
    const handY = this.fy - AY + GRIP_Y;
    if (this.m.target === 'screen') {
      const a = this.wa();
      if (handY <= a.y + 2) {
        this.fx = this.facing > 0 ? a.x + a.width - 80 : a.x + 80;
        this.fy = a.y - GRIP_Y + AY;
        this.setMode('hang', { until: Date.now() + rand(3, 8) * 1000 });
        this.play('hang_edge');
      } else if (chance(dt * 0.02)) {
        this.startFall(-this.facing * 80);
      }
      return;
    }
    const w = this.world.windowById(this.m.hwnd);
    if (!w || w.rect.x !== this.m.left) return this.startFall(0);
    if (handY <= w.rect.y) {
      this.fy = w.rect.y;
      this.fx = this.m.edgeX + this.facing * 46;
      this.surface = { type: 'window', hwnd: w.hwnd, top: w.rect.y, left: w.rect.x };
      this.anim('clap', () => this.idle());
    }
  }

  startPush(win) {
    const mirror = this.facing < 0;
    const contact = (mirror ? clips.SCALE_BASE - CLIMB_CONTACT : CLIMB_CONTACT) * S;
    const edgeX = this.facing > 0 ? win.rect.x : win.rect.x + win.rect.width;
    this.fx = edgeX - contact + AX;
    this.setMode('push', { hwnd: win.hwnd, left: rand(70, 150), acc: 0 });
    this.play('push_window');
  }

  tickPush(dt) {
    const w = this.world.windowById(this.m.hwnd);
    const a = this.wa();
    const step = SPEED.push * dt * this.facing;
    if (!w || this.m.left <= 0 ||
        (this.facing > 0 && w.rect.x + w.rect.width + 4 >= a.x + a.width) ||
        (this.facing < 0 && w.rect.x - 4 <= a.x)) {
      return this.anim('clap', () => { this.facing = -this.facing; this.idle(); });
    }
    if (this.world.nudge(w, step)) {
      this.fx += step;
      this.m.left -= Math.abs(step);
    } else {
      this.m.left = 0;
    }
  }

  // ---------- 決定下一個動作 ----------
  decide() {
    const tod = this.world.timeOfDay();
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    const outfit = this.outfit();
    const a = this.wa();
    const onWindow = this.surface?.type === 'window';
    const nearLeft = this.fx < a.x + 160, nearRight = this.fx > a.x + a.width - 160;
    if (nearLeft) this.facing = 1; else if (nearRight) this.facing = -1;

    if (this.workKind && !this.clone) return this.work(this.workKind);

    // 太久沒理牠
    if (!this.clone && Date.now() - this.lastInteract > 40 * 60000 && !this.away) return this.angry();

    const w = [
      ['walk', 28], ['tiptoe', 4], ['run', onWindow ? 1 : 4], ['crawl', 3], ['roll', onWindow ? 1 : 2],
      ['oneshot', 18], ['tail_wag', 2], ['read_book', 3], ['use_phone', 3], ['play_toy', 2], ['eat_snack', 1.5],
      ['sit', 5], ['sleep', 2], ['special', 3], ['split', this.clone || !this.world.canSplit() ? 0 : 0.6],
      ['shiver', outfit === 'winter' ? 2 : 0]
    ];
    const add = (k, v) => w.push([k, v]);
    if (tod === 'dawn') { add('stretch_up', 6); add('yawn', 5); add('rub_eyes', 5); add('brush_teeth', 6); }
    if (tod === 'day' && h >= 11.5 && h < 13.5) add('eat_bento', 8);
    if (tod === 'night') {
      if (h >= 19) { add('yawn', 2); add('read_book', 2); add('sleep', 4); }
      else { add('sleep', 30); add('yawn', 3); }
    }

    const k = pick(w);
    switch (k) {
      case 'walk': return this.move('walk', rand(3, 10));
      case 'tiptoe': return this.move('tiptoe', rand(2, 4));
      case 'run': return this.move('run', rand(0.8, 2));
      case 'crawl': return this.move('crawl', rand(2, 5));
      case 'roll': {
        const c = clips.get('roll_left');
        return this.move('roll', c.duration_ms / 1000);
      }
      case 'oneshot': {
        const id = pick([['sniff', 2], ['look_back', 2], ['scratch_head', 2], ['curious_tilt', 2], ['clap', 1],
          ['wave', 1], ['jump', 1.5], ['ears_perk', 1], ['facepalm', 1], ['point_down', 1], ['beckon', 1],
          ['giggle', 1], ['blow_kiss', 1], ['yawn', 1], ['stretch_up', 1], ['duck', 1], ['dust_off', 1]]);
        return this.anim(id, () => this.idle());
      }
      case 'tail_wag': return this.hold('tail_wag', rand(2.5, 5), () => this.idle());
      case 'read_book': return this.hold('read_book', rand(10, 25), () => this.idle());
      case 'use_phone': return this.hold('use_phone', rand(8, 20), () => this.idle());
      case 'play_toy': return this.hold('play_toy', rand(6, 15), () => this.idle());
      case 'brush_teeth': return this.hold('brush_teeth', rand(5, 9), () => this.idle());
      case 'shiver': return this.hold('shiver', rand(2, 4), () => this.idle());
      case 'eat_snack': case 'eat_bento': case 'stretch_up': case 'yawn': case 'rub_eyes':
        return this.anim(k, () => this.idle());
      case 'sit': return this.sit(rand(8, 30));
      case 'sleep': return this.sleep(tod === 'night' && h < 5 ? rand(60, 240) : rand(15, 50));
      case 'special': return this.playSpecial();
      case 'split': return this.world.split(this);
    }
    this.idle();
  }

  playSpecial() {
    const list = clips.specials(this.outfit());
    if (!list.length) return this.idle();
    const id = list[Math.floor(Math.random() * list.length)];
    const c = clips.get(id);
    if (c.playback === 'loop') return this.hold(id, rand(8, 15), () => this.idle());
    if (!c.after) return this.hold(id, rand(8, 14), () => this.idle()); // 冬天縮成一團會停在最後一格
    return this.anim(id, () => this.idle());
  }
}

module.exports = { Bear, W, S, PAD, SLEEP_IDS };
