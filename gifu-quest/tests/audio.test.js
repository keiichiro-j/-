// 音（src/core/audio.js）の単体テスト：ヘッドレスChromeの OfflineAudioContext で
// すべての効果音と BGM を短く書き出し、「無音でない」「割れない（|振幅|<=1）」ことを確かめる。
// 担当：FX・サウンド。playwright が無い環境では飛ばす。
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { SFX_NAMES, BGM_NAMES, songData } from '../src/core/audio.js';

const require = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require('playwright')); } catch { chromium = null; }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

describe('audio のデータ', () => {
  it('ARCHITECTURE の効果音・BGM がすべてある', () => {
    const sfx = 'jump land coin stomp hurt miss down hit defeat shoot shootBig bird slash dash break bump splash swim checkpoint sarubobo star heart sign pause select confirm cancel clear bossIntro bossPhase bossDefeat clang thunder explosion'.split(' ');
    for (const n of sfx) expect(SFX_NAMES).toContain(n);
    for (const n of ['title', 'map', 'stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'boss', 'clear', 'ending', 'gameover']) expect(BGM_NAMES).toContain(n);
  });
  it('各曲のパートの長さがそろっている', () => {
    for (const n of BGM_NAMES) {
      const p = songData(n);
      for (const t of p.tracks) expect(p.length % t.steps.length, `${n}/${t.inst}`).toBe(0);
      if (p.drums.length) expect(p.length % p.drums.length, `${n}/drums`).toBe(0);
    }
  });
});

describe.skipIf(!chromium)('audio の書き出し（OfflineAudioContext）', () => {
  let browser, page;
  beforeAll(async () => {
    const r = await esbuild.build({ entryPoints: [path.join(root, 'src/core/audio.js')], bundle: true, format: 'iife', globalName: 'GQA', write: false });
    browser = await chromium.launch();
    page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.addScriptTag({ content: r.outputFiles[0].text });
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  it('効果音：すべて鳴り、割れない', async () => {
    const res = await page.evaluate(async () => {
      const out = {};
      for (const name of GQA.SFX_NAMES) {
        const opts = name === 'stomp' ? { chain: 8 } : {};
        const sr = 22050, ac = new OfflineAudioContext(1, sr * 3, sr);
        GQA.playSfx(ac, ac.destination, name, opts, 0.01);
        const buf = await ac.startRendering();
        const d = buf.getChannelData(0);
        let peak = 0, sum = 0;
        for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += d[i] * d[i]; }
        out[name] = { peak, rms: Math.sqrt(sum / d.length) };
      }
      return out;
    });
    for (const [name, r] of Object.entries(res)) {
      expect(r.peak, `${name} 無音`).toBeGreaterThan(0.02);
      expect(r.peak, `${name} 割れ`).toBeLessThanOrEqual(1);
    }
  }, 60000);

  it('大きな効果音が重なっても、出口（makeMasterChain）で割れない', async () => {
    const res = await page.evaluate(async () => {
      const sr = 22050, ac = new OfflineAudioContext(1, sr * 3, sr);
      const m = GQA.makeMasterChain(ac);
      const bgm = ac.createGain(); bgm.gain.value = 0.6; bgm.connect(m);
      const p = GQA.songData('boss'); for (let s = 0, t = 0.02; t < 2.5; s++, t += p.stepDur) GQA.playStep(ac, bgm, 'boss', s, t);
      // 名前が違えば連打よけが効かないので、爆発・ボス撃破・被弾などを 40ms おきに重ねる
      const names = ['explosion', 'bossDefeat', 'thunder', 'hurt', 'shootBig', 'break'];
      for (let i = 0; i < 36; i++) GQA.playSfx(ac, m, names[i % names.length], {}, 0.05 + i * 0.04);
      const d = (await ac.startRendering()).getChannelData(0);
      let peak = 0; for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
      return peak;
    });
    expect(res).toBeGreaterThan(0.1);
    expect(res).toBeLessThanOrEqual(1);
  }, 60000);

  it('BGM：すべての曲が鳴り、割れない（音量最大）', async () => {
    const res = await page.evaluate(async () => {
      const out = {};
      for (const name of GQA.BGM_NAMES) {
        const p = GQA.songData(name);
        const secs = Math.min(8, p.length * p.stepDur + 1.5);
        const sr = 22050, ac = new OfflineAudioContext(1, Math.ceil(sr * secs), sr);
        const g = ac.createGain(); g.gain.value = 0.6; g.connect(ac.destination);   // bgmVol=1 のときの bgmBus
        for (let s = 0, t = 0.02; t < secs - 1.2 && s < p.length; s++, t += p.stepDur) GQA.playStep(ac, g, name, s, t);
        const buf = await ac.startRendering();
        const d = buf.getChannelData(0);
        let peak = 0;
        for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; }
        out[name] = peak;
      }
      return out;
    });
    for (const [name, peak] of Object.entries(res)) {
      expect(peak, `${name} 無音`).toBeGreaterThan(0.02);
      expect(peak, `${name} 割れ`).toBeLessThanOrEqual(1);
    }
  }, 90000);
});
