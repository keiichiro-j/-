// サウンド（設計書 9章）。担当：FX・サウンド。音声ファイルは使わず Web Audio でその場で合成する。
// 初期は無音。RUNTIME.sound が true のときだけ鳴らす。
// API: audio.unlock() / audio.sfx(name, opts) / audio.bgm(name) / audio.stopBgm() / audio.setVolumes()
// - unlock()：画面に触れた・キーを押したときに呼ぶ（main.js）。AudioContext を作り、スマホの再生制限を解く
//   （最初の呼び出しで pointerup / touchend / click にも自分を登録する。スマホは指を離した瞬間しか再生を許さないため）
// - bgm(name)：今の曲名を覚えておく。音がオフのとき・unlock 前でも、オンになった瞬間にその曲から始まる
// - 設定画面で RUNTIME.sound / sfxVol / bgmVol を書き換えると、内部の見張り（約25msごと）が自動で反映する
// BGM は短い旋律をデータ（SONGS）で持ち、先読みスケジューラで繰り返す。ステージごとに和風の五音音階を使う。
// すべてオリジナルの旋律・音色（既存の曲・効果音に似せない）。
import { RUNTIME } from './config.js';

// ---- 音階（半音の位置）：琉球音階は使わない ----
export const SCALES = {
  ritsu:  [0, 2, 5, 7, 9],    // 律音階（明るい・祭り囃子・雅）
  minyo:  [0, 3, 5, 7, 10],   // 民謡音階（郡上踊り・素朴）
  miyako: [0, 1, 5, 7, 8],    // 都節音階（しっとり・雪・鵜飼の夜）
  kumoi:  [0, 2, 3, 7, 8],    // 雲井音階（緊迫・火の山）
};

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---- 合成の部品 ----
const noiseBufs = new WeakMap();
function noiseBuf(ac) {
  let b = noiseBufs.get(ac);
  if (b) return b;
  const len = Math.floor(ac.sampleRate * 1.5);
  b = ac.createBuffer(1, len, ac.sampleRate);
  const d = b.getChannelData(0);
  let s = 1234567;
  for (let i = 0; i < len; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x3fffffff) - 1; }
  noiseBufs.set(ac, b);
  return b;
}

// 1つの音を鳴らす道具。ac: AudioContext/OfflineAudioContext, out: 出力先, t0: 開始時刻
class Synth {
  constructor(ac, out, t0) { this.ac = ac; this.out = out; this.t0 = t0; }
  // 音量の形：立ち上がり a 秒 → 頂点 v → d 秒で消える
  env(g, t, a, v, d, hold = 0) {
    const p = g.gain;
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(v, t + a);
    if (hold > 0) p.setValueAtTime(v, t + a + hold);
    p.exponentialRampToValueAtTime(0.0001, t + a + hold + d);
    p.setValueAtTime(0, t + a + hold + d + 0.01);
  }
  // 発振器：type, f0→f1（d 秒で）, vol, 立ち上がり a, 長さ d, 遅れ at, filter
  tone({ type = 'sine', f0 = 440, f1 = null, vol = 0.3, a = 0.004, d = 0.15, hold = 0, at = 0, glide = null, filter = null, ff = 2000, ff1 = null, q = 1, vib = 0, vibRate = 6, detune = 0 }) {
    const ac = this.ac, t = this.t0 + at;
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    if (f1 != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + (glide ?? (a + hold + d)));
    const g = ac.createGain();
    this.env(g, t, a, vol, d, hold);
    let node = o;
    if (filter) {
      const f = ac.createBiquadFilter(); f.type = filter; f.Q.value = q;
      f.frequency.setValueAtTime(ff, t);
      if (ff1 != null) f.frequency.exponentialRampToValueAtTime(Math.max(30, ff1), t + a + hold + d);
      node.connect(f); node = f;
    }
    node.connect(g); g.connect(this.out);
    let lfo = null;
    if (vib) {
      lfo = ac.createOscillator(); lfo.frequency.value = vibRate;
      const lg = ac.createGain();
      lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f0 * vib, t + Math.min(0.25, (hold + d) * 0.5));
      lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t); lfo.stop(t + a + hold + d + 0.05);
    }
    o.start(t); o.stop(t + a + hold + d + 0.05);
    return a + hold + d;
  }
  // 雑音：フィルタ（帯域）を通して ff→ff1
  noise({ vol = 0.3, a = 0.002, d = 0.1, hold = 0, at = 0, filter = 'bandpass', ff = 1500, ff1 = null, q = 1 }) {
    const ac = this.ac, t = this.t0 + at;
    const src = ac.createBufferSource(); src.buffer = noiseBuf(ac);
    const f = ac.createBiquadFilter(); f.type = filter; f.Q.value = q;
    f.frequency.setValueAtTime(ff, t);
    if (ff1 != null) f.frequency.exponentialRampToValueAtTime(Math.max(30, ff1), t + a + hold + d);
    const g = ac.createGain();
    this.env(g, t, a, vol, d, hold);
    src.connect(f); f.connect(g); g.connect(this.out);
    src.start(t, Math.random() * 0.5); src.stop(t + a + hold + d + 0.05);
    return a + hold + d;
  }
  // 鈴・鐘：倍音が整数倍でない澄んだ音
  bell(f, vol = 0.25, d = 0.6, at = 0) {
    this.tone({ type: 'sine', f0: f, vol, d, at });
    this.tone({ type: 'sine', f0: f * 2.76, vol: vol * 0.32, d: d * 0.45, at });
    this.tone({ type: 'sine', f0: f * 5.4, vol: vol * 0.12, d: d * 0.25, at });
    return at + d;
  }
  // 琴：はじいた音（少し高めから落ち着く）
  koto(f, vol = 0.25, d = 0.7, at = 0) {
    this.tone({ type: 'triangle', f0: f * 1.012, f1: f, glide: 0.04, vol, a: 0.003, d, at });
    this.tone({ type: 'sine', f0: f * 2, vol: vol * 0.3, a: 0.003, d: d * 0.4, at });
    return at + d;
  }
  // 太鼓
  taiko(vol = 0.8, at = 0, f = 120) {
    this.tone({ type: 'sine', f0: f, f1: f * 0.45, vol, a: 0.002, d: 0.32, at });
    this.noise({ vol: vol * 0.35, d: 0.06, at, filter: 'lowpass', ff: 260 });
    return at + 0.34;
  }
}

// ---- 効果音（34種類） ----
// 各関数は (S: Synth, o: opts) で音を並べ、だいたいの長さ（秒）を返す
const ST = (n) => Math.pow(2, n / 12);
export const SFX = {
  jump(S) { S.tone({ type: 'triangle', f0: 300, f1: 660, vol: 0.32, d: 0.13 }); S.tone({ type: 'sine', f0: 620, f1: 1240, vol: 0.08, d: 0.08 }); return 0.15; },
  land(S) { S.noise({ vol: 0.28, d: 0.07, filter: 'lowpass', ff: 520 }); S.tone({ type: 'sine', f0: 140, f1: 60, vol: 0.22, d: 0.08 }); return 0.1; },
  // コイン：きらっとした頭（高い雑音）＋二つの鈴。続けて取ると律音階で少しずつ上がる（o.streak 0..7）
  coin(S, o) {
    const k = Math.min(7, Math.max(0, (o && o.streak) || 0)), up = ST([0, 2, 5, 7, 9, 12, 14, 17][k]);
    S.noise({ vol: 0.07, d: 0.025, filter: 'highpass', ff: 7000 });
    S.bell(1568 * up, 0.19, 0.2); S.bell(2349 * up, 0.2, 0.4, 0.05);
    return 0.45;
  },
  // 踏みつけ：「ぽすっ」と低い手応え＋はじく音。連続で踏むたびに律音階で上がり、3連続からは鈴が重なる
  stomp(S, o) {
    const c = Math.min(8, Math.max(1, (o && o.chain) || 1));
    const f = 330 * ST([0, 2, 5, 7, 9, 12, 14, 17][c - 1]);
    S.tone({ type: 'sine', f0: 190, f1: 62, vol: 0.4, a: 0.002, d: 0.09 });             // 体に響く低い音
    S.tone({ type: 'triangle', f0: f * 1.7, f1: f, glide: 0.05, vol: 0.3, d: 0.12 });
    S.tone({ type: 'square', f0: f * 0.5, f1: f * 0.25, vol: 0.07, d: 0.07, filter: 'lowpass', ff: 1200 });
    S.noise({ vol: 0.2, d: 0.035, filter: 'lowpass', ff: 1800 });
    if (c >= 2) S.koto(f * 2, 0.08 + c * 0.01, 0.22, 0.05);
    if (c >= 3) S.bell(f * 3, 0.06 + c * 0.01, 0.25, 0.08);
    return 0.3;
  },
  hurt(S) { S.tone({ type: 'square', f0: 460, f1: 150, vol: 0.16, d: 0.24, filter: 'lowpass', ff: 1800 }); S.tone({ type: 'triangle', f0: 230, f1: 90, vol: 0.24, d: 0.22 }); S.noise({ vol: 0.14, d: 0.1, ff: 900 }); return 0.26; },
  miss(S) { [659, 554, 440, 330].forEach((f, i) => S.tone({ type: 'triangle', f0: f, f1: f * 0.94, vol: 0.26, d: 0.12, at: i * 0.1 })); return 0.55; },
  down(S) {
    const sc = SCALES.miyako, r = 64;
    [12 + sc[3], 12 + sc[2], 12 + sc[1], 12, sc[3], sc[1], 0].forEach((s, i) => S.koto(mtof(r + s), 0.22, 0.5, i * 0.14));
    S.tone({ type: 'sine', f0: mtof(r - 12), vol: 0.2, a: 0.05, hold: 0.5, d: 0.8, at: 0.98 });
    return 2.4;
  },
  hit(S) { S.noise({ vol: 0.3, d: 0.06, ff: 2200, q: 1.2 }); S.tone({ type: 'square', f0: 240, f1: 110, vol: 0.12, d: 0.07, filter: 'lowpass', ff: 1500 }); return 0.08; },
  defeat(S) { S.noise({ vol: 0.26, d: 0.14, ff: 1600, ff1: 500 }); S.tone({ type: 'sine', f0: 820, f1: 180, vol: 0.24, d: 0.2 }); S.bell(1320, 0.08, 0.25, 0.06); return 0.32; },
  shoot(S) { S.tone({ type: 'triangle', f0: 950, f1: 320, vol: 0.24, d: 0.1 }); S.noise({ vol: 0.08, d: 0.05, filter: 'highpass', ff: 3000 }); return 0.12; },
  shootBig(S) { S.tone({ type: 'sawtooth', f0: 420, f1: 90, vol: 0.2, d: 0.32, filter: 'lowpass', ff: 2200, ff1: 400 }); S.noise({ vol: 0.22, d: 0.22, filter: 'lowpass', ff: 1800, ff1: 300 }); return 0.35; },
  // 鵜（う）の鳴き声ふうの短い二声
  bird(S) { S.tone({ type: 'square', f0: 760, f1: 1100, vol: 0.2, d: 0.06, filter: 'bandpass', ff: 1400, q: 2 }); S.tone({ type: 'square', f0: 900, f1: 640, vol: 0.2, d: 0.08, at: 0.08, filter: 'bandpass', ff: 1200, q: 2 }); S.noise({ vol: 0.1, d: 0.1, ff: 2600, ff1: 1800, q: 2 }); return 0.18; },
  // 技（ひと振り）：空気を切る「ひゅっ」（帯域を下げながら）＋短い芯の音
  slash(S) {
    S.noise({ vol: 0.36, a: 0.012, d: 0.14, filter: 'bandpass', ff: 5200, ff1: 1100, q: 1.4 });
    S.noise({ vol: 0.12, a: 0.004, d: 0.05, filter: 'highpass', ff: 7000 });
    S.tone({ type: 'sine', f0: 1500, f1: 420, vol: 0.09, d: 0.1 });
    S.tone({ type: 'triangle', f0: 260, f1: 140, vol: 0.12, d: 0.06, at: 0.02 });
    return 0.17;
  },
  dash(S) { S.noise({ vol: 0.55, a: 0.02, d: 0.2, ff: 700, ff1: 2600, q: 2 }); return 0.23; },
  break(S) { S.noise({ vol: 0.42, d: 0.26, filter: 'lowpass', ff: 1800, ff1: 300 }); S.tone({ type: 'square', f0: 150, f1: 55, vol: 0.12, d: 0.12, filter: 'lowpass', ff: 700 }); S.noise({ vol: 0.18, d: 0.03, at: 0.07, ff: 3000 }); S.noise({ vol: 0.14, d: 0.03, at: 0.13, ff: 2400 }); return 0.3; },
  bump(S) { S.tone({ type: 'sine', f0: 190, f1: 85, vol: 0.42, d: 0.09 }); S.noise({ vol: 0.16, d: 0.05, filter: 'lowpass', ff: 380 }); return 0.1; },
  splash(S) { S.noise({ vol: 0.36, a: 0.005, d: 0.32, ff: 1300, ff1: 380, q: 0.8 }); S.noise({ vol: 0.12, d: 0.16, filter: 'highpass', ff: 3500 }); S.tone({ type: 'sine', f0: 500, f1: 900, vol: 0.06, d: 0.06, at: 0.12 }); return 0.36; },
  swim(S) { S.tone({ type: 'sine', f0: 320, f1: 560, vol: 0.18, d: 0.08 }); S.tone({ type: 'sine', f0: 420, f1: 720, vol: 0.12, d: 0.06, at: 0.07 }); return 0.14; },
  checkpoint(S) { [0, 2, 3, 4].forEach((k, i) => S.bell(mtof(72 + SCALES.ritsu[k] + (k === 4 ? 0 : 0)), 0.15, 0.6, i * 0.08)); S.bell(mtof(84), 0.14, 0.9, 0.34); return 1.3; },
  sarubobo(S) { [0, 1, 2, 3, 4].forEach((k, i) => S.koto(mtof(69 + SCALES.minyo[k]), 0.2, 0.35, i * 0.06)); S.bell(mtof(81 + 7), 0.14, 0.7, 0.32); return 1.05; },
  star(S) { for (let i = 0; i < 10; i++) S.tone({ type: 'triangle', f0: mtof(67 + SCALES.ritsu[i % 5] + 12 * Math.floor(i / 5)), vol: 0.15, d: 0.1, at: i * 0.045 }); S.noise({ vol: 0.06, a: 0.2, d: 0.3, filter: 'highpass', ff: 7000 }); return 0.6; },
  heart(S) { S.tone({ type: 'sine', f0: 587, vol: 0.22, a: 0.01, d: 0.22 }); S.tone({ type: 'sine', f0: 880, vol: 0.22, a: 0.01, d: 0.35, at: 0.1 }); S.tone({ type: 'triangle', f0: 1175, vol: 0.06, d: 0.3, at: 0.1 }); return 0.46; },
  // 木魚のような「こん」
  sign(S) { S.tone({ type: 'sine', f0: 560, f1: 520, vol: 0.3, d: 0.12 }); S.tone({ type: 'triangle', f0: 1120, vol: 0.06, d: 0.05 }); return 0.14; },
  pause(S) { S.tone({ type: 'sine', f0: 880, vol: 0.2, d: 0.07 }); S.tone({ type: 'sine', f0: 660, vol: 0.2, d: 0.1, at: 0.07 }); return 0.18; },
  select(S) { S.tone({ type: 'triangle', f0: 1250, vol: 0.14, a: 0.002, d: 0.04 }); return 0.05; },
  confirm(S) { S.koto(784, 0.2, 0.18); S.koto(1175, 0.2, 0.3, 0.07); return 0.38; },
  cancel(S) { S.tone({ type: 'triangle', f0: 660, vol: 0.18, d: 0.07 }); S.tone({ type: 'triangle', f0: 440, vol: 0.18, d: 0.12, at: 0.07 }); return 0.2; },
  clear(S) {
    const r = 67, sc = SCALES.ritsu;
    const ph = [[0, 0], [1, 0], [2, 0], [4, 0], [2, 0], [4, 0], [0, 1]];
    ph.forEach(([k, o], i) => S.tone({ type: 'triangle', f0: mtof(r + sc[k] + 12 * o), vol: 0.2, a: 0.01, d: i === ph.length - 1 ? 0.9 : 0.14, vib: i === ph.length - 1 ? 0.012 : 0, at: i * 0.12 }));
    [0, 0.24, 0.48, 0.72].forEach((t) => S.taiko(0.5, t));
    S.taiko(0.7, 0.84);
    S.bell(mtof(r + 24), 0.12, 1.2, 0.84);
    return 2.1;
  },
  bossIntro(S) {
    for (let i = 0; i < 8; i++) S.taiko(0.25 + i * 0.07, i * 0.11, 100);
    S.taiko(0.8, 1.0, 80);
    S.tone({ type: 'sawtooth', f0: 55, vol: 0.14, a: 0.3, hold: 0.6, d: 0.6, filter: 'lowpass', ff: 300, ff1: 900, vib: 0.02, vibRate: 5 });
    S.tone({ type: 'sawtooth', f0: 82.4, vol: 0.1, a: 0.3, hold: 0.6, d: 0.6, filter: 'lowpass', ff: 400 });
    return 1.6;
  },
  bossPhase(S) { SFX.clang(S); S.noise({ vol: 0.2, a: 0.3, d: 0.15, ff: 400, ff1: 3000, q: 3 }); S.taiko(0.7, 0.42, 90); return 0.8; },
  // ボス撃破：大きな一撃（爆発＋大太鼓）→ スローの間に下りる旋律 → 鐘と、上へ抜ける笛で「勝った」
  bossDefeat(S) {
    SFX.explosion(S);
    S.taiko(0.3, 0.06, 70);
    const r = 60, sc = SCALES.ritsu;
    [4, 3, 2, 1, 0].forEach((k, i) => S.tone({ type: 'triangle', f0: mtof(r + 12 + sc[k]), vol: 0.14, d: 0.2, at: 0.5 + i * 0.1 }));
    S.taiko(0.55, 1.0, 110); S.taiko(0.6, 1.05, 90);
    S.bell(mtof(r + 24), 0.16, 1.5, 1.05);
    S.tone({ type: 'triangle', f0: mtof(r + 19), f1: mtof(r + 24), glide: 0.25, vol: 0.12, a: 0.03, hold: 0.25, d: 0.6, vib: 0.01, at: 1.1 });
    S.noise({ vol: 0.06, a: 0.5, d: 0.4, filter: 'highpass', ff: 6000, at: 0.6 });
    return 2.6;
  },
  // 金属に当たる音（盾・からくり）
  clang(S) { [1800, 2730, 3950].forEach((f, i) => S.tone({ type: 'square', f0: f, vol: 0.05 - i * 0.01, d: 0.25 - i * 0.05, filter: 'bandpass', ff: f, q: 4 })); S.tone({ type: 'triangle', f0: 1200, vol: 0.12, d: 0.3 }); S.noise({ vol: 0.12, d: 0.04, filter: 'highpass', ff: 4000 }); return 0.32; },
  thunder(S) {
    S.noise({ vol: 0.42, a: 0.01, d: 0.25, filter: 'lowpass', ff: 2500, ff1: 600 });
    S.noise({ vol: 0.5, a: 0.12, hold: 0.4, d: 1.6, filter: 'lowpass', ff: 420, ff1: 90, at: 0.05 });
    S.noise({ vol: 0.3, a: 0.08, d: 0.9, filter: 'lowpass', ff: 300, ff1: 80, at: 0.6 });
    return 2.3;
  },
  explosion(S) { S.noise({ vol: 0.5, a: 0.004, d: 0.7, filter: 'lowpass', ff: 2400, ff1: 180 }); S.tone({ type: 'sine', f0: 95, f1: 32, vol: 0.45, d: 0.5 }); return 0.75; },
};
export const SFX_NAMES = Object.keys(SFX);

// ---- BGM のデータ ----
// 旋律の書き方：空白で区切った1コマずつ（div=2 なら8分音符）。'|' は小節の区切り（無視）
//   1〜5 = 音階の何番目の音、' で1オクターブ上、, で下。'-' は前の音を伸ばす、'.' は休み
// drums：1文字1コマ。D=太鼓 d=弱い太鼓 s=締太鼓 k=太鼓の縁(カッ) x=鉦(チャン) h=拍子木 .=休み
// inst：fue(笛) shaku(尺八) koto(琴) shami(三味線) bell(鐘) bass pad
export const SONGS = {
  title: { bpm: 80, div: 2, root: 62, scale: 'ritsu', tracks: [
    { inst: 'shaku', oct: 1, vol: 0.5, notes: '3 - - 5 4 - 3 2 | 1 - - - 2 - 3 - | 5 - 1\' - 5 4 3 - | 2 - - - . . . . | 3 - 5 - 1\' - 2\' - | 1\' - 5 - 4 - 3 - | 2 - 3 - 4 - 2 - | 1 - - - - - . .' },
    { inst: 'koto', oct: 0, vol: 0.32, notes: '1, 5, 1 5, 3 5, 1 5, | 1, 5, 1 5, 3 5, 1 5, | 4,, 2, 4, 1 4, 2, 4, 2, | 5,, 2, 5, 2 5, 2, 5, 2, | 1, 5, 1 5, 3 5, 1 5, | 4,, 1, 4, 1 4, 1, 4, 1, | 5,, 2, 5, 2 5, 2, 5, 2, | 1, 5, 1 5, 1 . . .' },
  ], drums: 'd...............d.......h.......' },
  map: { bpm: 100, div: 2, root: 62, scale: 'ritsu', tracks: [
    { inst: 'koto', oct: 1, vol: 0.34, notes: '1 2 4 5 4 2 1 - | 2 4 5 1\' 5 - . . | 4 5 4 2 1 2 4 - | 2 - - - . . . . | 5 4 5 1\' 2\' 1\' 5 - | 4 2 4 5 4 - . . | 2 4 2 1 5, 1 2 - | 1 - - - . . . .' },
    { inst: 'bass', oct: -1, vol: 0.4, notes: '1 . . . 5, . . . | 2 . . . 5, . . . | 4, . . . 1 . . . | 5, . . . 5, . . . | 1 . . . 5, . . . | 4, . . . 4, . . . | 2 . . . 5, . . . | 1 . . . 1 . . .' },
  ], drums: 'd.h.d.h.d.h.d.hh' },
  // 金華山：明るい登山。律音階、笛と琴、拍子木
  stage1: { bpm: 118, div: 2, root: 60, scale: 'ritsu', tracks: [
    { inst: 'fue', oct: 1, vol: 0.4, notes: '1 2 3 - 5 3 2 1 | 2 - 3 5 3 - . . | 5 - 4 3 2 3 5 - | 3 - - - . . . . | 1\' - 5 4 5 - 3 - | 2 3 5 3 2 - 1 2 | 3 - 2 1 2 - 5, - | 1 - - - . . . .' },
    { inst: 'koto', oct: 0, vol: 0.26, notes: '1 5 1\' 5 1 5 1\' 5 | 4, 1 4 1 4, 1 4 1 | 2 5 2\' 5 2 5 2\' 5 | 5, 2 5 2 5, 2 5 2 | 1 5 1\' 5 1 5 1\' 5 | 4, 1 4 1 4, 1 4 1 | 2 5 2\' 5 5, 2 5 2 | 1 5 1\' 5 1 . . .' },
    { inst: 'bass', oct: -1, vol: 0.42, notes: '1 - . 1 5, - . 5, | 4, - . 4, 4, - . 4, | 2 - . 2 2 - . 2 | 5, - . 5, 5, - 5, . | 1 - . 1 5, - . 5, | 4, - . 4, 4, - . 4, | 2 - . 2 5, - . 5, | 1 - . 1 1 - . .' },
  ], drums: 'D.h.d.h.D.h.d.hh' },
  // 長良川：夕暮れの川と鵜飼の篝火。都節音階、尺八と流れる琴
  stage2: { bpm: 88, div: 2, root: 62, scale: 'miyako', tracks: [
    { inst: 'shaku', oct: 1, vol: 0.46, notes: '5 - - 4 3 - - - | 4 - 3 2 1 - - - | 2 - 3 - 4 - 5 - | 4 - - - - - . . | 1\' - - 5 4 - 3 - | 4 - 5 4 3 - 2 - | 1 - 2 - 3 - 2 - | 1 - - - - - . .' },
    { inst: 'koto', oct: -1, vol: 0.28, notes: '1 3 5 1\' 5 3 1 3 | 1 3 5 1\' 5 3 1 3 | 4, 2 4 1\' 4 2 4, 2 | 5, 2 4 5 4 2 5, 2 | 1 3 5 1\' 5 3 1 3 | 4, 2 4 1\' 4 2 4, 2 | 5, 2 4 5 4 2 5, 2 | 1 3 5 1\' . . . .' },
    { inst: 'pad', oct: -1, vol: 0.16, notes: '1 - - - - - - - | 1 - - - - - - - | 4, - - - - - - - | 5, - - - - - - - | 1 - - - - - - - | 4, - - - - - - - | 5, - - - - - - - | 1 - - - - - - -' },
  ], drums: 'd...............d.......k.......' },
  // 郡上八幡：郡上踊りの太鼓のリズム。民謡音階、三味線
  stage3: { bpm: 126, div: 2, root: 62, scale: 'minyo', tracks: [
    { inst: 'shami', oct: 1, vol: 0.38, notes: '4 - 5 4 3 - 1 - | 3 - 4 3 1 - . . | 1 3 4 5 1\' - 5 4 | 5 - - - . . 4 5 | 1\' - 5 4 3 4 5 - | 4 3 1 3 4 - . . | 3 4 3 1 5, - 1 - | 1 - - - . . . .' },
    { inst: 'fue', oct: 2, vol: 0.18, notes: '. . . . . . . . | . . . . . . . . | 1 - - - 1\' - - - | 5 - - - - - . . | . . . . . . . . | . . . . . . . . | 3 - - - 5, - 1 - | 1 - - - . . . .' },
    { inst: 'bass', oct: -1, vol: 0.38, notes: '1 . 1 . 5, . 1 . | 4, . 4, . 1 . 4, . | 1 . 1 . 4, . 5, . | 5, . 5, . 5, . 2 . | 1 . 1 . 5, . 1 . | 4, . 4, . 1 . 4, . | 4, . 1 . 5, . 1 . | 1 . 1 . 1 . . .' },
  ], drums: 'D.D.DkD.D.D.kkk.' },
  // 飛騨高山：祭り囃子。律音階、笛・鉦・締太鼓
  stage4: { bpm: 132, div: 2, root: 65, scale: 'ritsu', tracks: [
    { inst: 'fue', oct: 1, vol: 0.38, notes: '1\' - 5 - 4 5 1\' - | 2\' 1\' 5 4 5 - - - | 4 5 1\' 2\' 1\' 5 4 - | 5 - 4 2 1 - - - | 2 4 5 - 4 2 1 - | 2 - 4 5 4 - 2 1 | 5, 1 2 4 2 1 5, - | 1 - - - - - . .' },
    { inst: 'bass', oct: -1, vol: 0.36, notes: '1 . . 1 . . 1 . | 5, . . 5, . . 5, . | 4, . . 4, . . 4, . | 1 . . 1 . . 5, . | 2 . . 2 . . 2 . | 4, . . 4, . . 4, . | 5, . . 5, . . 5, . | 1 . . 1 . . . .' },
  ], drums: 'Dxsxdxss' },
  // 白川郷：静かな雪。都節音階、鐘と低い琴
  stage5: { bpm: 70, div: 2, root: 64, scale: 'miyako', tracks: [
    { inst: 'bell', oct: 1, vol: 0.3, notes: '5 - - - 4 - - - | 3 - 4 - 1 - - - | 2 - - - 3 - 2 - | 1 - - - - - - - | 1\' - - - 5 - 4 - | 5 - - - 3 - - - | 4 - 3 - 2 - 4 - | 3 - - - - - - -' },
    { inst: 'koto', oct: -1, vol: 0.24, notes: '1 . 5 . 1\' . . . | 1 . 5 . 3 . . . | 4, . 4 . 1\' . . . | 1 . 5 . 1\' . . . | 4, . 4 . 1\' . . . | 3, . 3 . 5 . . . | 4, . 4 . 2 . . . | 1 . 5 . 3 . . .' },
    { inst: 'pad', oct: -1, vol: 0.12, notes: '1 - - - - - - - | 1 - - - - - - - | 4, - - - - - - - | 1 - - - - - - - | 4, - - - - - - - | 3, - - - - - - - | 4, - - - - - - - | 1 - - - - - - -' },
  ], drums: '' },
  // 奥飛騨：火の山。雲井音階、刻む低音と太鼓で緊迫
  stage6: { bpm: 148, div: 2, root: 57, scale: 'kumoi', tracks: [
    { inst: 'shaku', oct: 1, vol: 0.4, notes: '5 - - 4 5 - 3 - | 2 - - - 3 2 1 - | 5 - 1\' - 2\' - 1\' 5 | 4 - - - 5 - - - | 1\' - - 5 1\' - 2\' - | 3\' - 2\' 1\' 5 - - - | 4 - 5 - 4 3 2 - | 1 - - - . . 5, -' },
    { inst: 'bass', oct: -1, vol: 0.44, notes: '1 1 3 1 1 2 1 5, | 1 1 3 1 1 2 1 5, | 4, 4, 1 4, 4, 5, 4, 3, | 5, 5, 2 5, 5, 1 5, 4, | 1 1 3 1 1 2 1 5, | 1 1 3 1 1 2 1 5, | 4, 4, 1 4, 5, 5, 2 5, | 1 1 3 1 1 . 1 .' },
  ], drums: 'D.s.DDs.D.s.Dsss' },
  boss: { bpm: 160, div: 2, root: 52, scale: 'miyako', tracks: [
    { inst: 'shami', oct: 1, vol: 0.36, notes: '1\' . 1\' . 2\' 1\' 5 . | 4 . 4 . 5 4 2 . | 1\' . 1\' . 2\' . 4\' . | 3\' - 2\' - 1\' - 5 - | 1\' . 1\' . 2\' 1\' 5 . | 4 . 4 . 5 4 2 . | 3 . 4 . 5 . 1\' . | 2\' - - - 1\' - - -' },
    { inst: 'bass', oct: 0, vol: 0.46, notes: '1 1 1\' 1 2 1 1 5, | 1 1 1\' 1 2 1 1 5, | 4, 4, 4 4, 5, 4, 4, 1 | 5, 5, 5 5, 2 5, 5, 1 | 1 1 1\' 1 2 1 1 5, | 1 1 1\' 1 2 1 1 5, | 4, 4, 4 4, 5, 5, 5 5, | 2 2 2\' 2 1 1 1\' 1' },
  ], drums: 'DkDkDDkkDkDkDkss' },
  clear: { bpm: 140, div: 2, root: 67, scale: 'ritsu', loop: false, tracks: [
    { inst: 'fue', oct: 1, vol: 0.42, notes: '1 2 3 5 3 5 1\' - 2\' 1\' 5 1\' - - - - . .' },
    { inst: 'koto', oct: 0, vol: 0.3, notes: '1 . 5 . 1 . 5 . 4, . 2 . 1\' - - - . .' },
  ], drums: 'D.D.D.DDD...D.....' },
  gameover: { bpm: 76, div: 2, root: 60, scale: 'miyako', loop: false, tracks: [
    { inst: 'shaku', oct: 1, vol: 0.46, notes: '5 4 3 2 1 - - - 1, - - - - - - . . .' },
    { inst: 'koto', oct: -1, vol: 0.26, notes: '1 . . . 4, . . . 1 - - - - - - . . .' },
  ], drums: '' },
  // オープニング：墨の静けさ → 竜の目覚め → 旅立ち。都節音階、尺八と琴、低い持続音、太鼓が高まる（16小節）
  opening: { bpm: 84, div: 2, root: 62, scale: 'miyako', tracks: [
    { inst: 'shaku', oct: 1, vol: 0.46, notes: '. . . . . . . . | 5 - - - - - 4 - | 3 - - - 2 - - - | 1 - - - - - . . | 1 - 2 - 3 - 5 - | 4 - - 3 2 - - - | 3 - 4 - 5 - 1\' - | 1\' - - - - - . . | 5 - - 4 5 - 1\' - | 2\' - 1\' - 5 - - - | 4 - 5 - 4 - 3 - | 2 - - - 1 - - - | 1\' - - - 2\' - 3\' - | 2\' - 1\' - 5 - 4 - | 5 - - - 1\' - - - | 1\' - - - - - . .' },
    { inst: 'koto', oct: 0, vol: 0.26, notes: '1, . 5, . 1 . . . | 1, . 5, . 1 . 3 . | 4,, . 1, . 4, . . . | 5,, . 2, . 5, . . . | 1, 5, 1 3 5 3 1 5, | 4,, 1, 4, 1 4, 1, 4, 1, | 1, 5, 1 3 5 3 1 5, | 1, 5, 1 3 1\' 3 1 5, | 1, 5, 1 5 1\' 5 1 5, | 2, 5, 2 5 2\' 5 2 5, | 4,, 1, 4, 1 4 1 4, 1 | 5,, 2, 5, 2 5 2 5, 2 | 1, 5, 1 5 1\' 5 1 5, | 2, 5, 2 5 2\' 5 2 5, | 5,, 2, 5, 2 5 2 5 2 | 1, 5, 1 5 1\' . . .' },
    { inst: 'pad', oct: -1, vol: 0.18, notes: '1 - - - - - - - | 1 - - - - - - - | 4, - - - - - - - | 5, - - - - - - - | 1 - - - - - - - | 4, - - - - - - - | 1 - - - - - - - | 1 - - - - - - - | 1 - - - - - - - | 2 - - - - - - - | 4, - - - - - - - | 5, - - - - - - - | 1 - - - - - - - | 2 - - - - - - - | 5, - - - - - - - | 1 - - - - - - -' },
    { inst: 'bass', oct: -1, vol: 0.34, notes: '. . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . . | 1 . . . 1 . . . | 4, . . . 4, . . . | 1 . . . 1 . . . | 1 . . . 5, . . . | 1 . 1 . 1 . 1 . | 2 . 2 . 2 . 2 . | 4, . 4, . 4, . 4, . | 5, . 5, . 5, . 5, . | 1 . 1 . 1 . 1 . | 2 . 2 . 2 . 2 . | 5, . 5, . 5, . 5, . | 1 . 1 . 1 . . .' },
  ], drums: 'D.......D.......D...d...D...d...D...d...D...d.k.D.d.D.d.D.k.d.k.D.s.D.s.D.s.DDs.D.s.D.s.DsssDsssD.s.D.s.DDs.DDs.DsssDsssD...D...' },   // 16小節：静かな鼓動 → 締太鼓で高まる
  ending: { bpm: 76, div: 2, root: 62, scale: 'ritsu', tracks: [
    { inst: 'shaku', oct: 1, vol: 0.44, notes: '1 - 2 - 3 - 5 - | 4 - - 3 2 - - - | 3 - 5 - 1\' - 2\' - | 1\' - - - - - . . | 2\' - 1\' - 5 - 4 - | 5 - 3 - 2 - - - | 3 - 2 - 1 - 2 - | 1 - - - - - . .' },
    { inst: 'koto', oct: 0, vol: 0.28, notes: '1, 5, 1 3 5 3 1 5, | 4,, 1, 4, 1 4, 1, 4, 1, | 1, 5, 1 3 5 3 1 5, | 1, 5, 1 3 1\' . . . | 2, 5, 2 4 5 4 2 5, | 5,, 2, 5, 2 5, 2, 5, 2, | 4,, 1, 4, 1 5,, 2, 5, 2 | 1, 5, 1 3 1 . . .' },
    { inst: 'pad', oct: -1, vol: 0.12, notes: '1 - - - - - - - | 4, - - - - - - - | 1 - - - - - - - | 1 - - - - - - - | 2 - - - - - - - | 5, - - - - - - - | 4, - - - 5, - - - | 1 - - - - - - -' },
  ], drums: 'd...............' },
};
export const BGM_NAMES = Object.keys(SONGS);

// 旋律の文字列 → [{ m: MIDI番号, len: コマ数 } | null]
function parseTrack(song, tr) {
  const toks = tr.notes.split(/\s+/).filter((s) => s && s !== '|');
  const sc = SCALES[song.scale] || SCALES.ritsu;
  const out = new Array(toks.length).fill(null);
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i];
    if (tk === '.' || tk === '-') continue;
    const deg = parseInt(tk, 10);
    if (!(deg >= 1 && deg <= 5)) continue;
    let oct = tr.oct || 0;
    for (const ch of tk) { if (ch === "'") oct++; else if (ch === ',') oct--; }
    let len = 1;
    while (i + len < toks.length && toks[i + len] === '-') len++;
    out[i] = { m: song.root + 12 * oct + sc[deg - 1], len };
  }
  return out;
}
const parsed = new Map();
export function songData(name) {
  let p = parsed.get(name);
  if (p) return p;
  const s = SONGS[name]; if (!s) return null;
  const tracks = s.tracks.map((tr) => ({ inst: tr.inst, vol: tr.vol ?? 0.3, steps: parseTrack(s, tr) }));
  const drums = (s.drums || '').split('');
  const length = Math.max(1, ...tracks.map((t) => t.steps.length), drums.length);
  p = { song: s, tracks, drums, length, stepDur: 60 / s.bpm / (s.div || 2), loop: s.loop !== false };
  parsed.set(name, p);
  return p;
}

// 楽器1音
function playNote(S, inst, f, dur, vol) {
  switch (inst) {
    case 'fue':   // 篠笛：明るく息の混じった高い音、ゆっくりビブラート
      S.tone({ type: 'sine', f0: f, vol, a: 0.03, hold: Math.max(0, dur - 0.08), d: 0.12, vib: 0.008, vibRate: 5.5 });
      S.tone({ type: 'triangle', f0: f * 2, vol: vol * 0.12, a: 0.03, hold: Math.max(0, dur - 0.08), d: 0.08 });
      S.noise({ vol: vol * 0.08, a: 0.02, d: 0.08, ff: f * 2, q: 4 });
      break;
    case 'shaku': // 尺八：柔らかい立ち上がりと息
      S.tone({ type: 'triangle', f0: f * 0.985, f1: f, glide: 0.08, vol, a: 0.07, hold: Math.max(0, dur - 0.12), d: 0.18, vib: 0.01, vibRate: 4.8, filter: 'lowpass', ff: f * 3 });
      S.noise({ vol: vol * 0.12, a: 0.05, hold: Math.max(0, dur * 0.3), d: 0.12, ff: f * 1.5, q: 3 });
      break;
    case 'koto': S.koto(f, vol, Math.max(0.45, dur * 1.3)); break;
    case 'shami': // 三味線：硬くはじいて早く消える、さわりのジリっとした音
      S.tone({ type: 'sawtooth', f0: f, vol: vol * 0.7, a: 0.002, d: Math.min(0.4, 0.18 + dur * 0.4), filter: 'lowpass', ff: 3600, ff1: 700, q: 2 });
      S.noise({ vol: vol * 0.12, d: 0.03, ff: f * 4, q: 6 });
      break;
    case 'bell': S.bell(f, vol, Math.max(1.2, dur * 1.5)); break;
    case 'bass': S.tone({ type: 'triangle', f0: f, vol, a: 0.006, hold: Math.max(0, dur * 0.5), d: Math.max(0.12, dur * 0.6) }); break;
    case 'pad': S.tone({ type: 'sawtooth', f0: f, vol, a: Math.min(0.5, dur * 0.3), hold: Math.max(0, dur * 0.5), d: dur * 0.4 + 0.2, filter: 'lowpass', ff: 520, detune: 4 }); break;
    default: S.tone({ type: 'triangle', f0: f, vol, d: dur });
  }
}
function playDrum(S, ch) {
  switch (ch) {
    case 'D': S.taiko(0.62); break;
    case 'd': S.taiko(0.34); break;
    case 's': S.tone({ type: 'sine', f0: 340, f1: 190, vol: 0.24, d: 0.08 }); S.noise({ vol: 0.12, d: 0.03, ff: 1600, q: 1.5 }); break;
    case 'k': S.noise({ vol: 0.2, d: 0.035, ff: 2600, q: 3 }); S.tone({ type: 'triangle', f0: 920, vol: 0.08, d: 0.03 }); break;
    case 'x': [2100, 3170, 4630].forEach((f, i) => S.tone({ type: 'square', f0: f, vol: 0.022 - i * 0.005, d: 0.12 - i * 0.03, filter: 'bandpass', ff: f, q: 5 })); break;
    case 'h': S.noise({ vol: 0.22, d: 0.04, ff: 1900, q: 8 }); S.tone({ type: 'sine', f0: 1450, vol: 0.08, d: 0.035 }); break;
  }
}
// 1コマ分を鳴らす（オフラインのテストからも使う）
export function playStep(ac, out, name, step, t) {
  const p = songData(name); if (!p) return;
  const S = new Synth(ac, out, t);
  for (const tr of p.tracks) {
    const n = tr.steps.length ? tr.steps[step % tr.steps.length] : null;
    if (n) playNote(S, tr.inst, mtof(n.m), n.len * p.stepDur, tr.vol);
  }
  if (p.drums.length) { const ch = p.drums[step % p.drums.length]; if (ch && ch !== '.') playDrum(S, ch); }
}
// 効果音を ac/out に並べる（オフラインのテストからも使う）。長さ（秒）を返す
export function playSfx(ac, out, name, opts, t) {
  const f = SFX[name]; if (!f) return 0;
  return f(new Synth(ac, out, t), opts || {});
}

// 出口の音量の整え方（実行時と単体テストで同じものを使う）：コンプレッサー → リミッター → 出力。
// 爆発やボス撃破など大きな音が重なっても割れない（|振幅|<=1）ように、最後に強いリミッターを置く。
export function makeMasterChain(ac, dest = ac.destination) {
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 4;
  comp.attack.value = 0.003; comp.release.value = 0.2;
  const lim = ac.createDynamicsCompressor();
  lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20;
  lim.attack.value = 0.001; lim.release.value = 0.1;
  comp.connect(lim); lim.connect(dest);
  return comp;
}

// ---- 実行時 ----
const LOOKAHEAD = 0.15;
export const audio = {
  ctx: null, master: null, sfxBus: null, bgmBus: null,
  cur: null,          // 今の曲名（音がオフでも覚えておく）
  playing: null,      // 実際に鳴らしている曲 { name, gain, step, next, data }
  timer: null,
  last: {},           // 効果音の連打よけ
  wasOn: null,        // 前回の見張りで鳴らしてよかったか（null＝まだ見ていない）
  gestured: false,    // 操作の中で一度 resume できたか
  _susp: null,
  unlock() {
    // 触った・押した瞬間に呼ばれる。音がオフでも文脈だけ作っておく（オンにした瞬間に鳴らせるように）
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch { this.ctx = null; return; }
      const ac = this.ctx;
      this.master = makeMasterChain(ac);
      this.sfxBus = ac.createGain(); this.sfxBus.connect(this.master);
      this.bgmBus = ac.createGain(); this.bgmBus.connect(this.master);
      this.setVolumes();
      this.timer = setInterval(() => this.tick(), 25);
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => this.tick());
      // スマホのタッチでは pointerdown は「ユーザーの操作」に数えられず（仕様上、指を離した pointerup / touchend / click が数えられる）、
      // その中で resume() しても再生が許されない。指を離したときにも unlock を呼ぶ
      const again = () => this.unlock();
      for (const ev of ['pointerup', 'touchend', 'click']) window.addEventListener(ev, again, { passive: true });
    }
    // 音がオフでも、最初の1回は操作の中で resume して再生の制限を解いておく（すぐ tick が止める）。
    // 設定で「入」にするのは指を離した後の描画フレームなので、その時点では操作の中ではなく、ここで解いておかないと鳴らない
    if ((RUNTIME.sound || !this.gestured) && this.ctx.state !== 'running' && !(typeof document !== 'undefined' && document.hidden)) {
      this.ctx.resume().then(() => { this.gestured = true; }, () => {});
      // 古い iOS の再生制限を解く：操作の中で無音を1つ鳴らす
      try { const ac = this.ctx, b = ac.createBuffer(1, 1, 22050), s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0); } catch { /* 無視 */ }
    }
    this.tick();
  },
  setVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(Math.max(0, Math.min(1, RUNTIME.sfxVol ?? 0.8)), t, 0.02);
    this.bgmBus.gain.setTargetAtTime(Math.max(0, Math.min(1, RUNTIME.bgmVol ?? 0.6)) * 0.6, t, 0.05);
    this._vol = (RUNTIME.sfxVol ?? 0.8) * 1000 + (RUNTIME.bgmVol ?? 0.6);
  },
  // 見張り：音のオン・オフ、音量、画面が隠れたとき、BGM の先読み
  tick() {
    const ac = this.ctx; if (!ac) return;
    const hidden = typeof document !== 'undefined' && document.hidden;
    const on = !!RUNTIME.sound && !hidden;
    if (on !== this.wasOn) {
      this.wasOn = on;
      if (on) { if (ac.state !== 'running') ac.resume().catch(() => {}); }
      else this.stopPlaying(0.15);
    }
    if (!on) {
      // 鳴らさない間は止めておく（画面を隠した時・音オフ。作っただけで動き続けないように）
      if (ac.state === 'running' && !this._susp) {
        this._susp = setTimeout(() => { this._susp = null; if (!this.wasOn && this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }, 300);
      }
      return;
    }
    if ((RUNTIME.sfxVol ?? 0.8) * 1000 + (RUNTIME.bgmVol ?? 0.6) !== this._vol) this.setVolumes();
    // 覚えている曲がまだ鳴っていなければ始める
    if (this.cur && (!this.playing || this.playing.name !== this.cur) && !this._ended) this.startPlaying(this.cur);
    const P = this.playing; if (!P) return;
    const now = ac.currentTime;
    if (P.next < now - 0.2) P.next = now + 0.05;   // 止まっていた後は今から
    while (P.next < now + LOOKAHEAD) {
      if (!P.data.loop && P.step >= P.data.length) { this._ended = P.name; this.playing = null; return; }
      playStep(ac, P.gain, P.name, P.step, P.next);
      P.step++; P.next += P.data.stepDur;
    }
  },
  // 曲の切り替え：前の曲を薄くしながら、新しい曲をすっと立ち上げる（ぶつ切り・二重鳴りにしない）。
  // ジングル（繰り返さない曲：クリアなど）は前の曲を素早く切って、頭からはっきり聞かせる
  startPlaying(name) {
    const data = songData(name);
    const jingle = data && !data.loop;
    this.stopPlaying(jingle ? 0.12 : 0.45);
    if (!data || !this.ctx) return;
    const t = this.ctx.currentTime, start = t + (jingle ? 0.1 : 0.15);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(jingle ? 1 : 0.0001, t);
    if (!jingle) g.gain.linearRampToValueAtTime(1, start + 0.35);
    g.connect(this.bgmBus);
    this.playing = { name, gain: g, step: 0, next: start, data };
  },
  stopPlaying(fade = 0.4) {
    const P = this.playing; if (!P || !this.ctx) { this.playing = null; return; }
    const t = this.ctx.currentTime;
    try { P.gain.gain.cancelScheduledValues(t); P.gain.gain.setValueAtTime(P.gain.gain.value, t); P.gain.gain.linearRampToValueAtTime(0, t + fade); } catch { /* 無視 */ }
    setTimeout(() => { try { P.gain.disconnect(); } catch { /* 無視 */ } }, (fade + 0.6) * 1000);
    this.playing = null;
  },
  sfx(name, opts) {
    if (!RUNTIME.sound || !this.ctx || this.ctx.state !== 'running') return;
    if (!SFX[name]) return;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] || -1) < 0.035) return;   // 同じ音の連打で割れないように
    // コインは続けて取ると音が上がる（0.4秒以内に次を取ると1段上）
    if (name === 'coin' && !(opts && opts.streak != null)) {
      this.coinStreak = now - (this.last.coin || -1) < 0.4 ? Math.min(7, (this.coinStreak || 0) + 1) : 0;
      const o = this._coinO || (this._coinO = { streak: 0 }); o.streak = this.coinStreak; opts = o;
    }
    this.last[name] = now;
    try { playSfx(this.ctx, this.sfxBus, name, opts, now + 0.005); } catch { /* 無視 */ }
  },
  bgm(name) {
    if (!SONGS[name]) { if (name) console.warn('audio.bgm: unknown', name); return; }
    if (this.cur === name && (this.playing || this._ended === name)) return;   // 同じ曲は続ける（ジングルは繰り返さない）
    this.cur = name; this._ended = null;
    this.tick();
  },
  stopBgm() { this.cur = null; this._ended = null; this.stopPlaying(0.5); },
};
