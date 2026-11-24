// 音の実行時の振る舞い（src/core/audio.js の audio オブジェクト）を、偽の AudioContext で確かめる。担当：FX・サウンド
// - スマホ：指を離した時（pointerup/touchend/click）にも unlock され、音オフでも最初の操作で再生制限を解く
// - 音オフ・画面を隠した時は止める／オンで再開
// - BGM を切り替えても二重に鳴らない
// - 同じ効果音の連打は間引く
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { RUNTIME } from '../src/core/config.js';

// どんなメソッド・AudioParam も受け付ける偽のノード
function param() { return { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} }; }
function node(ac, kind) {
  const n = { kind, connected: [], connect(d) { this.connected.push(d); return d; }, disconnect() { this.connected.length = 0; }, start() { ac.started[kind] = (ac.started[kind] || 0) + 1; }, stop() {} };
  for (const p of ['gain', 'frequency', 'detune', 'Q', 'threshold', 'knee', 'ratio', 'attack', 'release']) n[p] = param();
  return n;
}
class FakeAC {
  constructor() { this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 22050; this.destination = { kind: 'dest' }; this.started = {}; this.resumes = 0; this.suspends = 0; FakeAC.last = this; }
  resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
  suspend() { this.suspends++; this.state = 'suspended'; return Promise.resolve(); }
  createOscillator() { return node(this, 'osc'); }
  createGain() { return node(this, 'gain'); }
  createBiquadFilter() { return node(this, 'filter'); }
  createBufferSource() { return node(this, 'src'); }
  createDynamicsCompressor() { return node(this, 'comp'); }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
}

const listeners = {};
let audio;
beforeAll(async () => {
  vi.useFakeTimers();
  globalThis.window = { AudioContext: FakeAC, addEventListener: (ev, fn) => { (listeners[ev] ||= []).push(fn); } };
  globalThis.document = { hidden: false, addEventListener: (ev, fn) => { (listeners['doc:' + ev] ||= []).push(fn); } };
  ({ audio } = await import('../src/core/audio.js'));
});
afterAll(() => { vi.useRealTimers(); delete globalThis.window; delete globalThis.document; });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('audio の実行時', () => {
  it('音オフでも最初の操作で再生制限を解き、すぐ止める。指を離した時にも unlock する', async () => {
    RUNTIME.sound = false;
    audio.unlock();
    const ac = FakeAC.last;
    for (const ev of ['pointerup', 'touchend', 'click']) expect(listeners[ev]?.length, ev).toBe(1);
    expect(ac.resumes).toBe(1);
    await flush();
    expect(audio.gestured).toBe(true);
    vi.advanceTimersByTime(400);
    expect(ac.state).toBe('suspended');
    // 2回目以降の操作では、音オフのまま起こさない
    listeners.pointerup[0]();
    expect(ac.resumes).toBe(1);
  });

  it('設定で音を入れると再開し、BGM を切り替えても1曲だけ鳴る', async () => {
    const ac = FakeAC.last;
    audio.bgm('stage1');
    RUNTIME.sound = true;
    vi.advanceTimersByTime(30);
    expect(ac.state).toBe('running');
    expect(audio.playing?.name).toBe('stage1');
    const g1 = audio.playing.gain;
    audio.bgm('boss');
    expect(audio.playing.name).toBe('boss');
    expect(audio.playing.gain).not.toBe(g1);
    // 古い曲の音量の入れ物は切り離される（鳴り続けない）
    vi.advanceTimersByTime(1100);
    expect(g1.connected.length).toBe(0);
    // 同じ曲をもう一度頼んでも最初からやり直さない
    const g2 = audio.playing.gain;
    audio.bgm('boss');
    expect(audio.playing.gain).toBe(g2);
  });

  it('同じ効果音の連打は間引き、音オフでは鳴らさない', () => {
    const ac = FakeAC.last;
    ac.currentTime = 10;
    const before = ac.started.osc || 0;
    audio.sfx('select'); audio.sfx('select'); audio.sfx('select');
    const one = (ac.started.osc || 0) - before;
    expect(one).toBeGreaterThan(0);
    ac.currentTime = 10.01;
    audio.sfx('select');
    expect((ac.started.osc || 0) - before).toBe(one);
    RUNTIME.sound = false;
    ac.currentTime = 11;
    audio.sfx('jump');
    expect((ac.started.osc || 0) - before).toBe(one);
    vi.advanceTimersByTime(400);
    expect(audio.playing).toBe(null);
    expect(ac.state).toBe('suspended');
  });

  it('画面を隠すと止め、戻すと再開する', () => {
    const ac = FakeAC.last;
    RUNTIME.sound = true;
    vi.advanceTimersByTime(30);
    expect(ac.state).toBe('running');
    document.hidden = true; listeners['doc:visibilitychange'][0]();
    vi.advanceTimersByTime(400);
    expect(ac.state).toBe('suspended');
    expect(audio.playing).toBe(null);
    document.hidden = false; listeners['doc:visibilitychange'][0]();
    expect(ac.state).toBe('running');
    expect(audio.playing?.name).toBe('boss');
    RUNTIME.sound = false;
  });
});
