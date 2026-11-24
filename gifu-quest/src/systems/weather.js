// 天気（設計書 8章）。担当：FX・サウンド
// 8種類：晴れ・くもり・雨・雷雨・霧・雪・吹雪・火山灰。見た目と遊びへの影響（wet / wind / flash / fog）。
// - 各ステージは levelData.weathers の候補を持ち、エリアが変わったとき・一定時間ごとに次の天気へ移る
// - 切り替えは BLEND 秒かけて数値（雨粒の量・空の色・明るさ…）を少しずつ混ぜる
// - 粒子は上限（雨300・雪250）を最初に作って使い回す。低画質・スマホでは半分
// 粒子は画面座標で持ち、カメラが動いた分だけ奥行きに応じてずらす（画面の外に出たら反対側へ回す）。
import { TILE, RUNTIME } from '../core/config.js';
import { makeRng } from '../core/rng.js';
import { makeCanvas } from '../gfx/renderer.js';
import { T, isSolid, isOneWay, isSlope } from '../world/tiles.js';

// ---- 調整用の数値 ----
export const WEATHER_TUNE = {
  rainMax: 300, snowMax: 250,
  blend: 4,                    // 切り替えにかける秒数（3〜5秒）
  changeEvery: [55, 85],       // 一定時間ごとに次の天気へ（秒）
  gustSpeed: 165,              // 吹雪の横風（ドット/秒）
  gustCalm: [3.5, 6], gustWarn: 1.4, gustBlow: 2.6,
  thunderEvery: [5, 11],       // 稲光の間隔（秒）
  rippleRate: 36,              // 雨の波紋（個/秒、雨の強さ1のとき）
  coverTime: 18,               // 雪が積もりきるまでの秒数
};

// 天気ごとの数値。混ぜるのは NUM_KEYS と色の配列
// rain/snow/ash: 粒の量 0..1, fog: 霧, dim: 昼の暗さ, wet: 地面が濡れる, rays: 光の筋, thunder: 稲光, gust: 横風,
// cover: 雪が積もる, edge: 画面の端が白い, skyMix: 空の色をどれだけ天気の色にするか
const BASE = { rain: 0, snow: 0, ash: 0, fog: 0, dim: 0, wet: 0, rays: 0, thunder: 0, gust: 0, cover: 0, edge: 0, skyMix: 0, slant: 0.15,
  skyTop: [120, 170, 230], skyBottom: [210, 230, 245], tint: [255, 255, 255, 0] };
export const WEATHERS = {
  sunny:    { rays: 1, tint: [255, 236, 190, 0.035] },
  cloudy:   { dim: 0.10, skyMix: 0.7, skyTop: [128, 138, 152], skyBottom: [196, 202, 208], tint: [110, 120, 140, 0.06] },
  rain:     { rain: 0.8, dim: 0.16, wet: 1, skyMix: 0.8, skyTop: [92, 104, 124], skyBottom: [160, 172, 186], tint: [60, 100, 190, 0.12], slant: 0.18 },
  thunder:  { rain: 1, dim: 0.27, wet: 1, thunder: 1, skyMix: 0.88, skyTop: [46, 50, 70], skyBottom: [104, 110, 132], tint: [60, 70, 170, 0.15], slant: 0.3 },
  fog:      { fog: 0.85, dim: 0.05, skyMix: 0.75, skyTop: [184, 192, 200], skyBottom: [222, 226, 228], tint: [225, 228, 232, 0.08] },
  snow:     { snow: 0.65, dim: 0.05, cover: 1, skyMix: 0.65, skyTop: [168, 182, 206], skyBottom: [226, 232, 242], tint: [200, 216, 255, 0.07] },
  blizzard: { snow: 1, dim: 0.12, cover: 1, gust: 1, edge: 1, fog: 0.2, skyMix: 0.9, skyTop: [190, 200, 214], skyBottom: [236, 240, 246], tint: [225, 235, 255, 0.12] },
  ash:      { ash: 1, dim: 0.10, fog: 0.15, skyMix: 0.8, skyTop: [70, 28, 30], skyBottom: [196, 92, 52], tint: [210, 90, 50, 0.10] },
};
for (const k in WEATHERS) WEATHERS[k] = { ...BASE, ...WEATHERS[k] };
export const WEATHER_NAMES = Object.keys(WEATHERS);
export const WEATHER_ALIAS = { shower: 'rain', storm: 'thunder', thunderstorm: 'thunder', clear: 'sunny', volcano: 'ash', mist: 'fog', cloud: 'cloudy' };
export const normWeather = (n) => (WEATHERS[n] ? n : WEATHERS[WEATHER_ALIAS[n]] ? WEATHER_ALIAS[n] : null);

const NUM_KEYS = ['rain', 'snow', 'ash', 'fog', 'dim', 'wet', 'rays', 'thunder', 'gust', 'cover', 'edge', 'skyMix', 'slant'];
const ARR_KEYS = ['skyTop', 'skyBottom', 'tint'];

function isMobile() {
  try { return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches; } catch { return false; }
}
const smooth = (t) => t * t * (3 - 2 * t);
// 色の文字列を値が変わったときだけ作る（毎フレームの文字列生成を避ける）
function rgbaCache() {
  let key = -1, str = '';
  return (r, g, b, a) => {
    r = r < 0 ? 0 : r > 255 ? 255 : r | 0; g = g < 0 ? 0 : g > 255 ? 255 : g | 0; b = b < 0 ? 0 : b > 255 ? 255 : b | 0;
    const ai = Math.round(Math.max(0, Math.min(1, a)) * 100);
    const k = ((r * 256 + g) * 256 + b) * 101 + ai;
    if (k !== key) { key = k; str = `rgba(${r},${g},${b},${ai / 100})`; }
    return str;
  };
}

// ---- 焼き付けておく画像（起動時に一度だけ作る） ----
let IMG = null;
function images() {
  if (IMG) return IMG;
  IMG = {};
  // 光の筋：斜めに差し込む柔らかい帯
  const rays = makeCanvas(256, 256); const r = rays.getContext('2d');
  const beams = [[30, 26], [78, 14], [112, 34], [170, 18], [214, 28]];
  for (const [x, w] of beams) {
    for (let pass = 0; pass < 4; pass++) {
      const ww = w * (1 + pass * 0.6);
      const g = r.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, 'rgba(255,246,210,0.22)'); g.addColorStop(0.6, 'rgba(255,240,200,0.07)'); g.addColorStop(1, 'rgba(255,240,200,0)');
      r.fillStyle = g;
      r.beginPath(); r.moveTo(x - ww * 0.3, 0); r.lineTo(x + ww * 0.3, 0); r.lineTo(x + 90 + ww, 256); r.lineTo(x + 90 - ww, 256); r.closePath(); r.fill();
    }
  }
  IMG.rays = rays;
  // 雪煙：横に長い柔らかい楕円
  const puff = makeCanvas(64, 64); const p = puff.getContext('2d');
  const pg = p.createRadialGradient(32, 32, 0, 32, 32, 32);
  pg.addColorStop(0, 'rgba(255,255,255,0.75)'); pg.addColorStop(0.5, 'rgba(240,246,255,0.32)'); pg.addColorStop(1, 'rgba(240,246,255,0)');
  p.fillStyle = pg; p.fillRect(0, 0, 64, 64);
  IMG.puff = puff;
  // 吹雪の画面の端（白いビネット）
  const edge = makeCanvas(160, 90); const e = edge.getContext('2d');
  const eg = e.createRadialGradient(80, 45, 20, 80, 45, 98);
  eg.addColorStop(0, 'rgba(240,246,255,0)'); eg.addColorStop(0.55, 'rgba(240,246,255,0.12)'); eg.addColorStop(1, 'rgba(240,246,255,0.85)');
  e.fillStyle = eg; e.fillRect(0, 0, 160, 90);
  IMG.edge = edge;
  return IMG;
}

export function createWeather(world, levelData) {
  const rng = makeRng(((levelData.id | 0) + 7) * 7919);
  const list = (levelData.weathers || ['sunny']).map(normWeather).filter(Boolean);
  if (!list.length) list.push('sunny');

  const cur = { ...WEATHERS[list[0]], skyTop: WEATHERS[list[0]].skyTop.slice(), skyBottom: WEATHERS[list[0]].skyBottom.slice(), tint: WEATHERS[list[0]].tint.slice() };
  let from = { ...cur, skyTop: cur.skyTop.slice(), skyBottom: cur.skyBottom.slice(), tint: cur.tint.slice() };
  let to = WEATHERS[list[0]];

  const mobile = isMobile();
  const lowCap = () => (RUNTIME.quality === 'low' || mobile ? 0.5 : 1);

  // 雨粒：x, y, z（奥行き 0.45..1）, 速さ
  const RN = WEATHER_TUNE.rainMax;
  const rain = { x: new Float32Array(RN), y: new Float32Array(RN), z: new Float32Array(RN), v: new Float32Array(RN) };
  // 雪・灰：x, y, z（大きさ 0..1）, ゆれの位相
  const SN = WEATHER_TUNE.snowMax;
  const snow = { x: new Float32Array(SN), y: new Float32Array(SN), z: new Float32Array(SN), ph: new Float32Array(SN) };
  // 雪煙（横風の予告）
  const PN = 26;
  const puffs = { x: new Float32Array(PN), y: new Float32Array(PN), s: new Float32Array(PN), a: new Float32Array(PN), v: new Float32Array(PN) };
  // 水たまりの波紋（ワールド座標）
  const QN = 48;
  const rip = { x: new Float32Array(QN), y: new Float32Array(QN), t: new Float32Array(QN), r: new Float32Array(QN) };
  for (let i = 0; i < QN; i++) rip.t[i] = 9;
  let ripCursor = 0, ripAcc = 0;
  // 足跡（ワールド座標）
  const FN = 40;
  const foot = { x: new Float32Array(FN), y: new Float32Array(FN), t: new Float32Array(FN), f: new Int8Array(FN) };
  for (let i = 0; i < FN; i++) foot.t[i] = 99;
  let footCursor = 0, footDist = 0, footSide = 1, lastPX = 0;
  // 見えている地面の上面（ワールド座標の x, y, 幅）。カメラのタイル位置が変わったときだけ作り直す
  const SURF_MAX = 1200;
  const surf = new Float32Array(SURF_MAX * 3); let surfN = 0; let surfKey = -1, surfVer = -1;
  // 稲妻の形（画面座標の折れ線）
  const bolt = new Float32Array(2 * 14); let boltN = 0;

  const cCover = rgbaCache(), cRain0 = rgbaCache(), cRain1 = rgbaCache(), cFlake = rgbaCache();
  let vw = 1200, vh = 540;
  let lastCamX = null, lastCamY = 0;

  function seedAll() {
    for (let i = 0; i < RN; i++) { rain.x[i] = rng.next() * (vw + 200) - 100; rain.y[i] = rng.next() * vh; rain.z[i] = 0.45 + rng.next() * 0.55; rain.v[i] = 900 + rng.next() * 400; }
    for (let i = 0; i < SN; i++) { snow.x[i] = rng.next() * (vw + 100) - 50; snow.y[i] = rng.next() * vh; snow.z[i] = rng.next(); snow.ph[i] = rng.next() * 6.28; }
    for (let i = 0; i < PN; i++) { puffs.a[i] = 0; }
  }
  seedAll();

  const W = {
    list, cur,
    name: list[0], index: 0,
    blendT: 1,            // 0..1（1で切り替え完了）
    changeT: rng.range(...WEATHER_TUNE.changeEvery),
    locked: false,        // 開発用に固定
    areaIdx: -1,
    time: 0,
    wind: 0, flash: 0, coverAmt: 0,
    gustState: 'calm', gustT: rng.range(...WEATHER_TUNE.gustCalm), gustDir: -1, gustLevel: 0,
    thunderT: rng.range(2, 5), thunderSoundT: -1, flashSeq: 0,

    set(name, instant = false) {
      const n = normWeather(name); if (!n) return false;
      from = { ...cur, skyTop: cur.skyTop.slice(), skyBottom: cur.skyBottom.slice(), tint: cur.tint.slice() };
      to = WEATHERS[n]; this.name = n;
      this.blendT = instant ? 1 : 0;
      if (instant) this.applyBlend(1);
      const li = list.indexOf(n); if (li >= 0) this.index = li;
      if (n === 'thunder') this.thunderT = Math.min(this.thunderT, instant ? 0.4 : 3);
      return true;
    },
    next() {
      if (list.length < 2) return;
      this.index = (this.index + 1) % list.length;
      this.set(list[this.index]);
    },
    applyBlend(k) {
      const t = smooth(Math.min(1, k));
      for (const key of NUM_KEYS) cur[key] = from[key] + (to[key] - from[key]) * t;
      for (const key of ARR_KEYS) { const a = from[key], b = to[key], o = cur[key]; for (let i = 0; i < o.length; i++) o[i] = a[i] + (b[i] - a[i]) * t; }
    },
    strike() {
      this.flash = 1; this.flashSeq = 0.14;
      this.thunderSoundT = 0.25 + rng.next() * 0.6;
      // 稲妻の形
      let x = vw * (0.15 + rng.next() * 0.7), y = -10;
      boltN = 0;
      for (let i = 0; i < 14 && y < vh * 0.55; i++) { bolt[boltN * 2] = x; bolt[boltN * 2 + 1] = y; boltN++; x += (rng.next() - 0.5) * 60; y += 18 + rng.next() * 30; }
    },

    update(dt) {
      this.time += dt;
      // ---- 天気の切り替え ----
      if (this.blendT < 1) { this.blendT = Math.min(1, this.blendT + dt / WEATHER_TUNE.blend); this.applyBlend(this.blendT); }
      if (!this.locked && list.length > 1) {
        const p = world.player;
        if (p && world.level) {
          const areas = world.level.areas; const tx = Math.floor(p.cx / TILE);
          let ai = 0; for (let i = 0; i < areas.length; i++) if (tx >= areas[i].x0 && tx < areas[i].x1) { ai = i; break; }
          if (this.areaIdx < 0) this.areaIdx = ai;
          else if (ai !== this.areaIdx) { this.areaIdx = ai; this.next(); this.changeT = rng.range(...WEATHER_TUNE.changeEvery); }
        }
        this.changeT -= dt;
        if (this.changeT <= 0) { this.next(); this.changeT = rng.range(...WEATHER_TUNE.changeEvery); }
      }

      // ---- 稲光 ----
      if (this.flashSeq > 0) { this.flashSeq -= dt; if (this.flashSeq <= 0) this.flash = Math.max(this.flash, 0.75); }   // 2回目のまたたき
      this.flash = Math.max(0, this.flash - dt * 3.2);
      if (cur.thunder > 0.5) {
        this.thunderT -= dt;
        if (this.thunderT <= 0) { this.strike(); this.thunderT = rng.range(...WEATHER_TUNE.thunderEvery); }
      }
      if (this.thunderSoundT > 0) { this.thunderSoundT -= dt; if (this.thunderSoundT <= 0) world.sfx && world.sfx('thunder'); }

      // ---- 吹雪の横風：静か → 予告（雪煙）→ 吹く ----
      if (cur.gust > 0.05) {
        this.gustT -= dt;
        if (this.gustT <= 0) {
          if (this.gustState === 'calm') { this.gustState = 'warn'; this.gustT = WEATHER_TUNE.gustWarn; this.gustDir = rng.next() < 0.5 ? -1 : 1; }
          else if (this.gustState === 'warn') { this.gustState = 'blow'; this.gustT = WEATHER_TUNE.gustBlow; }
          else { this.gustState = 'calm'; this.gustT = rng.range(...WEATHER_TUNE.gustCalm); }
        }
        const target = this.gustState === 'blow' ? 1 : this.gustState === 'warn' ? 0.08 : 0;
        this.gustLevel += (target - this.gustLevel) * Math.min(1, dt * (target > this.gustLevel ? 4 : 2.2));
      } else { this.gustLevel += (0 - this.gustLevel) * Math.min(1, dt * 3); this.gustState = 'calm'; }
      this.wind = this.gustDir * WEATHER_TUNE.gustSpeed * this.gustLevel * Math.min(1, cur.gust);
      if (Math.abs(this.wind) < 1) this.wind = 0;

      // ---- 雪の積もり具合 ----
      const coverTarget = cur.cover * Math.min(1, (cur.snow + 0.2));
      if (this.coverAmt < coverTarget) this.coverAmt = Math.min(coverTarget, this.coverAmt + dt / WEATHER_TUNE.coverTime);
      else this.coverAmt = Math.max(coverTarget, this.coverAmt - dt / (WEATHER_TUNE.coverTime * 1.5));

      // ---- 粒の移動 ----
      const cap = lowCap();
      const nRain = Math.round(RN * cap * cur.rain);
      const rvx = -cur.slant * 1100 + this.wind * 1.2;
      for (let i = 0; i < nRain; i++) {
        const z = rain.z[i];
        rain.y[i] += rain.v[i] * z * dt;
        rain.x[i] += rvx * z * dt;
        if (rain.y[i] > vh + 20) { rain.y[i] -= vh + 60 + rng.next() * 40; rain.x[i] = rng.next() * (vw + 300) - 150; }
      }
      const flakes = Math.max(cur.snow, cur.ash);
      const nSnow = Math.round(SN * cap * flakes);
      const blow = cur.gust * (0.35 + this.gustLevel * 0.9);
      const baseVX = this.gustDir * 300 * blow + this.wind * 0.6;
      const tt = this.time;
      for (let i = 0; i < nSnow; i++) {
        const z = snow.z[i];
        const fall = cur.ash > cur.snow ? 22 + z * 34 : 34 + z * 62 + blow * 80;
        snow.y[i] += fall * dt;
        snow.x[i] += (Math.sin(tt * 1.3 + snow.ph[i]) * 18 * (0.5 + z) + baseVX * (0.4 + z * 0.8)) * dt;
        if (snow.y[i] > vh + 10) { snow.y[i] = -10; snow.x[i] = rng.next() * (vw + 100) - 50; }
      }
      // 雪煙（予告と吹いている間）
      const wantPuffs = cur.gust > 0.3 && (this.gustState === 'warn' || this.gustState === 'blow');
      for (let i = 0; i < PN; i++) {
        if (puffs.a[i] > 0) {
          puffs.x[i] += this.gustDir * puffs.v[i] * dt;
          puffs.a[i] -= dt * 0.35;
          if (puffs.x[i] < -300 || puffs.x[i] > vw + 300) puffs.a[i] = 0;
        } else if (wantPuffs && rng.next() < dt * 6) {
          puffs.a[i] = 0.6 + rng.next() * 0.4;
          puffs.x[i] = this.gustDir > 0 ? -200 - rng.next() * 100 : vw + 200 + rng.next() * 100;
          puffs.y[i] = vh * (0.35 + rng.next() * 0.6);
          puffs.s[i] = 0.7 + rng.next() * 1.0;
          puffs.v[i] = 520 + rng.next() * 260;
        }
      }
      // 波紋：見えている地面のどこかに出す
      ripAcc += dt * WEATHER_TUNE.rippleRate * cur.rain * cap;
      while (ripAcc >= 1) {
        ripAcc -= 1;
        if (!surfN) break;
        const s = Math.floor(rng.next() * surfN) * 3;
        const i = ripCursor; ripCursor = (ripCursor + 1) % QN;
        rip.x[i] = surf[s] + rng.next() * surf[s + 2]; rip.y[i] = surf[s + 1]; rip.t[i] = 0; rip.r[i] = 5 + rng.next() * 7;
      }
      for (let i = 0; i < QN; i++) rip.t[i] += dt;
      // 足跡（雪が積もっているときだけ）
      const p = world.player;
      for (let i = 0; i < FN; i++) foot.t[i] += dt;
      if (p) {
        const dx = Math.abs(p.x - lastPX); lastPX = p.x;
        if (this.coverAmt > 0.25 && p.onGround && dx < 20) {
          footDist += dx;
          if (footDist > 20) {
            footDist = 0; footSide = -footSide;
            const i = footCursor; footCursor = (footCursor + 1) % FN;
            foot.x[i] = p.cx + footSide * 4; foot.y[i] = p.y + p.h; foot.t[i] = 0; foot.f[i] = p.vx >= 0 ? 1 : -1;
          }
        }
      }
    },

    // カメラの移動分、粒をずらす（奥行きの分だけ）
    follow(cam) {
      if (lastCamX === null) { lastCamX = cam.x; lastCamY = cam.y; return; }
      let dx = cam.x - lastCamX, dy = cam.y - lastCamY;
      lastCamX = cam.x; lastCamY = cam.y;
      if (Math.abs(dx) > vw || Math.abs(dy) > vh) { seedAll(); return; }   // ワープしたときは撒き直す
      if (!dx && !dy) return;
      const W2 = vw + 300;
      for (let i = 0; i < RN; i++) {
        const z = rain.z[i];
        let x = rain.x[i] - dx * z; if (x < -150) x += W2; else if (x > vw + 150) x -= W2;
        rain.x[i] = x; rain.y[i] -= dy * z;
        if (rain.y[i] < -80) rain.y[i] += vh + 60;
      }
      const W3 = vw + 100;
      for (let i = 0; i < SN; i++) {
        const z = 0.5 + snow.z[i] * 0.6;
        let x = snow.x[i] - dx * z; if (x < -50) x += W3; else if (x > vw + 50) x -= W3;
        snow.x[i] = x;
        let y = snow.y[i] - dy * z; if (y < -12) y += vh + 20; else if (y > vh + 12) y -= vh + 20;
        snow.y[i] = y;
      }
      for (let i = 0; i < PN; i++) puffs.x[i] -= dx * 0.9;
    },

    // 見えている地面の上面を集める（波紋・積雪・濡れた光り用）
    scanSurfaces(cam) {
      const L = world.level; if (!L) return;
      const tx0 = Math.max(0, Math.floor(cam.x / TILE) - 1), ty0 = Math.max(0, Math.floor(cam.y / TILE) - 1);
      const key = tx0 * 4096 + ty0;
      if (key === surfKey && L.version === surfVer) return;
      surfKey = key; surfVer = L.version; surfN = 0;
      const tx1 = Math.min(L.w - 1, tx0 + Math.ceil(vw / TILE) + 2), ty1 = Math.min(L.h - 1, ty0 + Math.ceil(vh / TILE) + 2);
      for (let tx = tx0; tx <= tx1; tx++) {
        for (let ty = Math.max(1, ty0); ty <= ty1; ty++) {
          const t = L.get(tx, ty);
          if (!(isSolid(t) || isOneWay(t)) || t === T.FAKE) continue;
          const up = L.get(tx, ty - 1);
          if (isSolid(up) || isOneWay(up) || isSlope(up) || up === T.WATER || up === T.WATER_TOP || up === T.LAVA || up === T.LAVA_TOP || up === T.FAKE) continue;
          if (surfN >= SURF_MAX) break;
          surf[surfN * 3] = tx * TILE; surf[surfN * 3 + 1] = ty * TILE; surf[surfN * 3 + 2] = TILE; surfN++;
        }
      }
    },

    // ---- 描画（env.drawFront から。画面座標） ----
    drawFront(ctx, cam, vw_, vh_, env) {
      if (vw_ !== vw || vh_ !== vh) { vw = vw_; vh = vh_; seedAll(); }
      const img = images();
      this.follow(cam);
      const low = RUNTIME.quality === 'low';
      const bright = 1 - env.darkness * 0.6;

      // 光の筋（晴れ・昼）
      const rayA = cur.rays * (1 - env.darkness * 1.6) * (1 - cur.fog);
      if (rayA > 0.02 && !low) {
        // 1枚だけ、上の方に通常合成で薄く（加算は重いので使わない）
        const sway = Math.sin(this.time * 0.35) * 0.2 + 0.8;
        ctx.globalAlpha = rayA * 0.6 * sway;
        const ox = -((cam.x * 0.05) % (vw * 0.3));
        ctx.drawImage(img.rays, ox - vw * 0.05, -20, vw * 1.4, vh * 0.8);
        ctx.globalAlpha = 1;
      }

      // ---- ワールド座標のもの：積雪・濡れた地面・波紋・足跡 ----
      const needSurf = this.coverAmt > 0.02 || cur.wet > 0.05;
      if (needSurf) this.scanSurfaces(cam);
      const hasFoot = this.coverAmt > 0.05;
      if (needSurf || hasFoot) {
        ctx.save(); ctx.translate(-cam.x, -cam.y);
        if (this.coverAmt > 0.02 && surfN) {
          // 積もった雪：上面に白い帽子
          const hgt = 2 + this.coverAmt * 5;
          ctx.fillStyle = cCover(Math.round(244 * bright), Math.round(248 * bright), Math.round(255 * bright), 0.35 + this.coverAmt * 0.6);
          ctx.beginPath();
          for (let i = 0; i < surfN; i++) {
            const x = surf[i * 3], y = surf[i * 3 + 1], w = surf[i * 3 + 2];
            const b = ((x * 0.37) % 3) | 0;
            ctx.rect(x - 1, y - hgt + b * 0.5, w + 2, hgt + 2);
          }
          ctx.fill();
        }
        if (cur.wet > 0.05 && surfN) {
          // 濡れた地面の照り返し
          ctx.strokeStyle = 'rgba(200,225,255,1)';
          ctx.globalAlpha = 0.22 * cur.wet * (0.6 + 0.4 * bright);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let i = 0; i < surfN; i++) { const x = surf[i * 3], y = surf[i * 3 + 1] + 1.5; ctx.moveTo(x + 3, y); ctx.lineTo(x + surf[i * 3 + 2] - 3, y); }
          ctx.stroke();
          // 波紋
          ctx.lineWidth = 1.2;
          // 濃さを3段にまとめ、段ごとに1本のパスで描く（1個ずつ stroke すると重い）
          for (let b = 0; b < 3; b++) {
            let any = false;
            ctx.beginPath();
            for (let i = 0; i < QN; i++) {
              const t = rip.t[i]; if (t > 0.6) continue;
              const k = t / 0.6; if (((k * 3) | 0) !== b) continue;
              const rx = rip.r[i] * (0.3 + k), x = rip.x[i], y = rip.y[i] + 1;
              ctx.moveTo(x + rx, y); ctx.ellipse(x, y, rx, rx * 0.28, 0, 0, 6.2832); any = true;
            }
            if (any) { ctx.globalAlpha = (1 - (b + 0.5) / 3) * 0.7 * cur.wet; ctx.stroke(); }
          }
          ctx.globalAlpha = 1;
        }
        if (hasFoot) {
          ctx.fillStyle = 'rgba(120,140,180,1)';
          for (let i = 0; i < FN; i++) {
            const t = foot.t[i]; if (t > 8) continue;
            ctx.globalAlpha = Math.min(1, (8 - t) / 3) * 0.35 * this.coverAmt;
            ctx.beginPath(); ctx.ellipse(foot.x[i], foot.y[i] - 1.5, 4, 1.6, 0, 0, 6.2832); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      }

      // ---- 雨（2層、それぞれ1本のパスでまとめて描く） ----
      const cap = lowCap();
      const nRain = Math.round(RN * cap * cur.rain);
      if (nRain > 0) {
        const rvx = -cur.slant * 1100 + this.wind * 1.2;
        const lb = Math.round(200 * bright + 30);
        // 1〜1.6ドットの線なので端は丸めない（丸い端は300本だと目に見えて重い）
        for (let layer = 0; layer < 2; layer++) {
          ctx.strokeStyle = layer ? cRain1(lb, lb + 12, lb + 30, 0.55) : cRain0(lb - 20, lb - 6, lb + 10, 0.32);
          ctx.lineWidth = layer ? 1.6 : 1;
          ctx.beginPath();
          for (let i = 0; i < nRain; i++) {
            const z = rain.z[i];
            if ((z > 0.78) !== !!layer) continue;
            const x = rain.x[i], y = rain.y[i], k = 0.022 + z * 0.012;
            ctx.moveTo(x, y); ctx.lineTo(x - rvx * z * k, y - rain.v[i] * z * k);
          }
          ctx.stroke();
        }
      }

      // ---- 雪・火山灰 ----
      const flakes = Math.max(cur.snow, cur.ash);
      const nSnow = Math.round(SN * cap * flakes);
      if (nSnow > 0) {
        const ashy = cur.ash > cur.snow;
        const c = ashy ? cFlake(Math.round(150 * bright + 40), Math.round(140 * bright + 36), Math.round(136 * bright + 34), 0.8) : cFlake(Math.round(250 * bright), Math.round(252 * bright), 255, 0.9);
        ctx.fillStyle = c;
        // 小さい粒は四角でまとめて
        ctx.beginPath();
        for (let i = 0; i < nSnow; i++) { const z = snow.z[i]; if (z > 0.7) continue; const s = ashy ? 1.4 + z * 1.6 : 1.6 + z * 2; ctx.rect(snow.x[i], snow.y[i], s, s); }
        ctx.fill();
        // 大きい粒は丸
        ctx.beginPath();
        for (let i = 0; i < nSnow; i++) { const z = snow.z[i]; if (z <= 0.7) continue; const r = ashy ? 1.6 : 2.2 + (z - 0.7) * 9; ctx.moveTo(snow.x[i] + r, snow.y[i]); ctx.arc(snow.x[i], snow.y[i], r, 0, 6.2832); }
        ctx.fill();
        // 火山灰：ときどき赤い火の粉
        if (ashy) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = 'rgba(255,120,40,0.9)';
          ctx.beginPath();
          for (let i = 0; i < nSnow; i += 9) { const fl = 0.6 + 0.4 * Math.sin(this.time * 9 + snow.ph[i] * 5); const s = 1.5 + fl * 1.5; ctx.rect(snow.x[i] + 3, snow.y[i] - 4, s, s); }
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
      }

      // ---- 雪煙（横風の予告）----
      if (cur.gust > 0.05) {
        for (let i = 0; i < PN; i++) {
          if (puffs.a[i] <= 0) continue;
          const s = puffs.s[i];
          ctx.globalAlpha = Math.min(1, puffs.a[i]) * 0.5 * cur.gust * bright;
          ctx.drawImage(img.puff, puffs.x[i] - 180 * s, puffs.y[i] - 26 * s, 360 * s, 52 * s);
        }
        ctx.globalAlpha = 1;
      }
      // 吹雪：画面の端が白い
      if (cur.edge > 0.02) {
        ctx.globalAlpha = Math.min(1, cur.edge * (0.7 + this.gustLevel * 0.3)) * bright;
        ctx.drawImage(img.edge, 0, 0, vw, vh);
        ctx.globalAlpha = 1;
      }

      // ---- 稲妻 ----
      if (this.flash > 0.35 && boltN > 1) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(200,210,255,1)';
        for (let pass = 0; pass < 2; pass++) {
          ctx.globalAlpha = (this.flash - 0.3) * (pass ? 1 : 0.35);
          ctx.lineWidth = pass ? 2 : 8;
          ctx.beginPath(); ctx.moveTo(bolt[0], bolt[1]);
          for (let i = 1; i < boltN; i++) ctx.lineTo(bolt[i * 2], bolt[i * 2 + 1]);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      }
    },
  };
  return W;
}
