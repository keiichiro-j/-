// 天気と時間帯（設計書 8章）。担当：FX・サウンド
// weather.js と timeOfDay.js をまとめ、World・背景・光・後処理が読む値を毎フレーム更新する。
// プロパティ（docs/ARCHITECTURE.md「環境」）：
//   wet（雨で滑る）, wind（横風 ドット/秒。主人公の速度に足される）, darkness(0..1：光の穴の膜), flash(稲光 0..1),
//   sky{top,bottom}（CSS色）, tint（画面に重ねる色 'rgba()' か null）, weather（天気の名前）, timeOfDay, fog(0..1)
//   追加：dim（昼の暗さ 0..1。後処理が重ねる）, shade（暗い膜の色 'rgb()'）, playerLightR（主人公の周りの光の半径）,
//         nightness（0=昼..1=夜。星や月）, gust（吹雪の予告/吹く 'calm'|'warn'|'blow'）, snowCover（0..1）, time
// 開発用：env.debugSet('night' | 'rain' | 'night+rain' | 'auto' | 'flash' | 'gust' ...)
import { createWeather, normWeather, WEATHER_NAMES } from './weather.js';
import { createTimeOfDay, TIME_PRESETS, TIME_NAMES } from './timeOfDay.js';

// 数値の色 → 文字列。値が変わったときだけ作り直す（毎フレームの文字列生成を避ける）
function colorCache() {
  let key = -1, str = '';
  return (r, g, b, a = 1) => {
    r = r < 0 ? 0 : r > 255 ? 255 : r | 0; g = g < 0 ? 0 : g > 255 ? 255 : g | 0; b = b < 0 ? 0 : b > 255 ? 255 : b | 0;
    const ai = Math.round(Math.max(0, Math.min(1, a)) * 100);
    const k = ((r * 256 + g) * 256 + b) * 101 + ai;
    if (k !== key) { key = k; str = ai >= 100 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${ai / 100})`; }
    return str;
  };
}

export const DEBUG_VALUES = [...TIME_NAMES, ...WEATHER_NAMES, 'auto', 'flash', 'gust'];

export function createEnv(world, levelData) {
  const tod = createTimeOfDay(levelData);
  const wx = createWeather(world, levelData);
  const cTop = colorCache(), cBot = colorCache(), cTint = colorCache(), cShade = colorCache();
  const progress = () => {
    const p = world.player, L = world.level;
    return p && L && L.pxW ? Math.max(0, Math.min(1, p.cx / L.pxW)) : 0;
  };

  const env = {
    weather: wx.name,
    timeOfDay: tod.out.name,
    wet: false, wind: 0, darkness: 0, flash: 0, fog: 0, dim: 0,
    sky: { top: '#6fb7ff', bottom: '#d8f0ff' },
    tint: null,
    shade: 'rgb(6,10,30)',
    playerLightR: 120,
    nightness: 0,
    gust: 'calm',
    snowCover: 0,
    time: 0, camX: 0, camY: 0,
    tod, wx,

    update(dt) {
      this.time += dt;
      if (!this._snapped && world.player) { this._snapped = true; tod.update(0, progress()); tod.cur = tod.pos; }   // 中間地点から始めたとき
      tod.update(dt, progress());
      wx.update(dt);
      this.compute();
    },

    compute() {
      const o = tod.out, c = wx.cur;
      // 空：時間帯の空に天気の色を混ぜる。天気の色は時間帯の明るさで暗くする
      const bright = 1 - o.darkness * 0.85;
      const m = c.skyMix;
      const st = c.skyTop, sb = c.skyBottom;
      this.sky.top = cTop(o.top[0] + (st[0] * bright - o.top[0]) * m, o.top[1] + (st[1] * bright - o.top[1]) * m, o.top[2] + (st[2] * bright - o.top[2]) * m);
      this.sky.bottom = cBot(o.bottom[0] + (sb[0] * bright - o.bottom[0]) * m, o.bottom[1] + (sb[1] * bright - o.bottom[1]) * m, o.bottom[2] + (sb[2] * bright - o.bottom[2]) * m);
      // 色味：時間帯と天気の2枚の重ね塗りを1枚にまとめる
      const t1 = o.tint, t2 = c.tint;
      const a = 1 - (1 - t1[3]) * (1 - t2[3]);
      if (a < 0.005) this.tint = null;
      else {
        const w1 = t1[3] / (t1[3] + t2[3]), w2 = 1 - w1;
        this.tint = cTint(t1[0] * w1 + t2[0] * w2, t1[1] * w1 + t2[1] * w2, t1[2] * w1 + t2[2] * w2, a);
      }
      // 暗さ：夜の膜（光の穴）は時間帯で決まり、悪天候だと少し濃くなる。昼の暗さ（dim）は後処理で重ねる
      this.darkness = Math.min(0.92, o.darkness + c.dim * o.nightness * 0.45);
      this.dim = c.dim * (1 - o.nightness);
      this.shade = cShade(o.lightCol[0], o.lightCol[1], o.lightCol[2]);
      this.playerLightR = o.playerR;
      this.nightness = o.nightness;
      this.fog = c.fog;
      this.wet = c.wet > 0.5;
      this.wind = wx.wind;
      this.flash = wx.flash;
      this.gust = wx.gustState;
      this.snowCover = wx.coverAmt;
      this.weather = wx.name;
      this.timeOfDay = o.name;
    },

    drawFront(ctx, cam, vw, vh) { this.camX = cam.x; this.camY = cam.y; wx.drawFront(ctx, cam, vw, vh, this); },

    // 開発用（tools/shot.mjs --time から呼ばれる）。'night+rain' のように + か , でつなげられる
    debugSet(v) {
      for (const part of String(v).split(/[+,]/)) {
        const s = part.trim();
        if (!s) continue;
        if (TIME_PRESETS[s]) { tod.set(s); continue; }
        if (s === 'auto') { tod.clearForce(); wx.locked = false; continue; }
        if (s === 'day-auto') { tod.clearForce(); continue; }
        if (s === 'flash' || s === 'lightning') { wx.strike(); continue; }
        if (s === 'gust') { wx.gustState = 'warn'; wx.gustT = 0.01; continue; }
        if (normWeather(s)) {
          wx.set(s, true); wx.locked = true;
          if (s === 'snow' || s === 'blizzard') wx.coverAmt = 0.85;   // 写真用にすぐ積もらせる
          continue;
        }
        console.warn('env.debugSet: unknown', s, DEBUG_VALUES.join(' '));
      }
      tod.update(0, progress());
      this.compute();
    },
  };
  env.compute();
  return env;
}
