'use strict';
// 依動作與服裝挑出要播放的 GIF，並決定是否左右鏡像
const path = require('path');
const manifest = require('../assets/pack/manifest.json');

const byId = new Map(manifest.animations.map(c => [c.id, c]));

// 動作清單更新（新增動作圖時從下載點取得，不用重新安裝）：只接受包含原本所有動作的新清單
function update(next) {
  if (!next || !Array.isArray(next.animations) || !next.outfits) return false;
  const ids = new Set(next.animations.map(a => a.id));
  if (!manifest.animations.every(a => ids.has(a.id))) return false;
  manifest.animations = next.animations;
  manifest.outfits = next.outfits;
  if (next.effects) manifest.effects = next.effects;
  if (next.work_animations) manifest.work_animations = next.work_animations;
  byId.clear();
  for (const a of manifest.animations) byId.set(a.id, a);
  return true;
}
const SCALE_BASE = manifest.width_px; // 384
const ANCHOR = manifest.anchor_px;    // 腳底 192, 333

// 圖本身朝向：+1 朝右、-1 朝左、0 正面或背面
function nativeFacing(clip) {
  const d = ((clip.nominal_facing_deg ?? 0) % 360 + 360) % 360;
  if (d > 0 && d < 180) return 1;
  if (d > 180 && d < 360) return -1;
  return 0;
}

function has(id) { return byId.has(id); }
function get(id) { return byId.get(id); }

function variantId(action, outfit) {
  if (outfit && outfit !== 'default') {
    const v = manifest.outfits[outfit]?.variants?.[action];
    if (v) return v;
  }
  return action;
}

// 走路：原裝只有正側面的向左走，向右用鏡像；其他服裝左右各有正側面
function walkClip(facing, outfit) {
  if (outfit && outfit !== 'default' && manifest.outfits[outfit]) {
    return { clip: byId.get(variantId(facing > 0 ? 'walk_right' : 'walk_left', outfit)), mirror: false };
  }
  return { clip: byId.get('walk_left'), mirror: facing > 0 };
}

// 一般動作：換成該服裝的版本，朝向和熊寶面向不同時鏡像
function resolve(action, outfit, facing) {
  if (action === 'walk') return walkClip(facing, outfit);
  const clip = byId.get(variantId(action, outfit));
  if (!clip) throw new RangeError('找不到動作 ' + action);
  const n = nativeFacing(clip);
  return { clip, mirror: n !== 0 && facing !== 0 && n !== facing };
}

// 桌寵會用到的全部動作；一套服裝要每個動作都有圖才會啟用，避免衣服換來換去
const ALL_ACTIONS = ['idle_blink', 'walk_right', 'walk_left', 'sit_down', 'pillow_sleep', 'belly_nap', 'curl_to_sleep',
  'falling', 'grab_struggle', 'dust_off', 'climb_edge', 'hang_edge', 'push_window', 'run_right', 'tiptoe_right',
  'crawl_left', 'roll_left', 'brake', 'sniff', 'look_back', 'scratch_head', 'curious_tilt', 'clap', 'wave', 'jump',
  'ears_perk', 'facepalm', 'point_down', 'beckon', 'giggle', 'blow_kiss', 'yawn', 'stretch_up', 'duck', 'tail_wag',
  'read_book', 'use_phone', 'play_toy', 'eat_snack', 'eat_bento', 'brush_teeth', 'rub_eyes', 'tap_foot', 'shiver',
  'backstep', 'write_code', 'write_document', 'draw_map'];

function outfitComplete(outfit) {
  const v = manifest.outfits[outfit]?.variants;
  return !!v && ALL_ACTIONS.every(a => v[a] && byId.has(v[a]));
}

// 這套衣服有沒有這個動作的圖（原裝看動作本身）
function hasVariant(action, outfit) {
  if (!outfit || outfit === 'default') return byId.has(action);
  const v = manifest.outfits[outfit]?.variants?.[action];
  return !!v && byId.has(v);
}

function specials(outfit) {
  return (manifest.outfits[outfit]?.specials || []).filter(has);
}

function fileUrl(clip) {
  return 'pack/' + clip.file.split(path.sep).join('/');
}

module.exports = { manifest, update, has, get, resolve, hasVariant, specials, fileUrl, nativeFacing, outfitComplete, ALL_ACTIONS, SCALE_BASE, ANCHOR };
