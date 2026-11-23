// サウンド（設計書 9章）。担当：FX・サウンド。音声ファイルは使わず Web Audio で合成する。
// 初期は無音。RUNTIME.sound が true のときだけ鳴らす。
// API: audio.unlock() / audio.sfx(name, opts) / audio.bgm(name) / audio.stopBgm() / audio.setVolumes()
import { RUNTIME } from './config.js';
export const audio = {
  ctx: null,
  unlock() {
    if (this.ctx || !RUNTIME.sound) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; }
  },
  sfx(name, opts) {},
  bgm(name) {},
  stopBgm() {},
  setVolumes() {},
};
