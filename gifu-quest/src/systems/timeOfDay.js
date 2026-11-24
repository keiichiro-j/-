// 時間帯（設計書 8章）。担当：FX・サウンド
// 昼・夕暮れ・夜・夜祭りの4種類。空のグラデーション（sky）、全体の暗さ（darkness）、色味（tint）を一括で決める。
// levelData.timeFlow（例 ["dusk","night"]）があれば、主人公の進み具合（0..1）で少しずつ移る（ステージ2・4）。
// 色はすべて [r,g,b] の数値で持ち、混ぜた結果は env.js が文字列にする（毎フレームの文字列生成を避ける）。

// 調整用の数値（色・暗さ）。tint は画面全体に重ねる色 [r,g,b,a]
export const TIME_PRESETS = {
  day:      { top: [92, 164, 236],  bottom: [214, 236, 250], darkness: 0,    tint: [255, 250, 235, 0],    lightCol: [14, 18, 40],  playerR: 0 },
  dusk:     { top: [70, 76, 142],   bottom: [255, 168, 104], darkness: 0.18, tint: [255, 132, 60, 0.13],  lightCol: [40, 20, 46],  playerR: 140 },
  night:    { top: [8, 14, 40],     bottom: [34, 50, 96],    darkness: 0.52, tint: [40, 70, 160, 0.10],   lightCol: [6, 10, 30],   playerR: 150 },
  festival: { top: [20, 12, 48],    bottom: [118, 52, 84],   darkness: 0.42, tint: [255, 120, 80, 0.07],  lightCol: [24, 8, 30],   playerR: 150 },
};
export const TIME_NAMES = Object.keys(TIME_PRESETS);

// 進み具合 → timeFlow の位置。最初の 20% はそのまま、最後の 15% は最後の時間帯
const FLOW_START = 0.2, FLOW_END = 0.85;

const lerp = (a, b, t) => a + (b - a) * t;
function mixArr(out, a, b, t) { for (let i = 0; i < out.length; i++) out[i] = lerp(a[i], b[i], t); return out; }

export function createTimeOfDay(levelData) {
  const flow = Array.isArray(levelData.timeFlow) && levelData.timeFlow.length > 1
    ? levelData.timeFlow.filter((n) => TIME_PRESETS[n]) : null;
  const first = flow ? flow[0] : (TIME_PRESETS[levelData.timeOfDay] ? levelData.timeOfDay : 'day');
  const out = {
    name: first,
    top: TIME_PRESETS[first].top.slice(), bottom: TIME_PRESETS[first].bottom.slice(),
    tint: TIME_PRESETS[first].tint.slice(), lightCol: TIME_PRESETS[first].lightCol.slice(),
    darkness: TIME_PRESETS[first].darkness, playerR: TIME_PRESETS[first].playerR,
    nightness: 0,   // 0=昼 … 1=夜（星・月を出すかなど背景用）
  };
  const tod = {
    out,
    flow,
    forced: null,       // 開発用に固定した時間帯
    pos: 0,             // 目標の位置（flow の添字。小数で間を表す）
    cur: 0,             // 実際の位置（ゆっくり追従）
    set(name) { if (TIME_PRESETS[name]) { this.forced = name; } },
    clearForce() { this.forced = null; },
    update(dt, progress) {
      let a, b, t;
      if (this.forced) {
        a = b = TIME_PRESETS[this.forced]; t = 0; out.name = this.forced;
        // 固定時はすぐに切り替える
        mixArr(out.top, a.top, b.top, t); mixArr(out.bottom, a.bottom, b.bottom, t);
        mixArr(out.tint, a.tint, b.tint, t); mixArr(out.lightCol, a.lightCol, b.lightCol, t);
        out.darkness = a.darkness; out.playerR = a.playerR || 120;
        out.nightness = Math.min(1, a.darkness / 0.45);
        return;
      }
      if (flow) {
        const p = Math.max(0, Math.min(1, (progress - FLOW_START) / (FLOW_END - FLOW_START)));
        this.pos = p * (flow.length - 1);
        // 戻ったときも急に変わらないように追従（1秒で約半分）
        this.cur += (this.pos - this.cur) * Math.min(1, dt * 0.7);
        const i = Math.min(flow.length - 2, Math.floor(this.cur));
        t = this.cur - i;
        a = TIME_PRESETS[flow[i]]; b = TIME_PRESETS[flow[i + 1]];
        out.name = t < 0.5 ? flow[i] : flow[i + 1];
      } else {
        a = b = TIME_PRESETS[first]; t = 0; out.name = first;
      }
      mixArr(out.top, a.top, b.top, t); mixArr(out.bottom, a.bottom, b.bottom, t);
      mixArr(out.tint, a.tint, b.tint, t); mixArr(out.lightCol, a.lightCol, b.lightCol, t);
      out.darkness = lerp(a.darkness, b.darkness, t);
      out.playerR = lerp(a.playerR || 120, b.playerR || 120, t);
      out.nightness = Math.min(1, out.darkness / 0.45);
    },
  };
  tod.update(0, 0);
  tod.cur = tod.pos;
  return tod;
}
