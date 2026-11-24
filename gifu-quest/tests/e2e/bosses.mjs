// ボスの自動対戦テスト（担当：ボス）。テスト用アリーナ levels/stage91〜96.json を使う
//   node tests/e2e/bosses.mjs [--dist dist] [--boss 91] [--shots]
// 各ボス：登場演出 → 隙のたびに world.boss.damage → 段階1→2→3 → 撃破 → 宝珠 → 取ってクリア。
// 途中で主人公のミス（Boss.reset → アリーナの開け直し → 再登場）も確かめる。コンソールエラー0件。
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const DIST = arg('dist', 'dist');
const shots = process.argv.includes('--shots');
const only = arg('boss');
const file = 'file://' + path.join(root, DIST, 'index.html');
const STAGES = [91, 92, 93, 94, 95, 96].filter((s) => !only || String(s) === only);

const browser = await chromium.launch();
let failed = 0;
for (const st of STAGES) {
  for (const ch of ['gen', 'leaf']) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 540 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const log = [];
    try {
      await page.goto(`${file}?stage=${st}&char=${ch}`);
      await page.waitForFunction(() => window.__GQ__ && window.__GQ__.game.sceneName === 'stage', null, { timeout: 15000 });
      await page.waitForTimeout(300);
      // 準備：ループを止め、手で時間を進める
      const info = await page.evaluate(() => {
        const G = window.__GQ__; G.loop.stop();
        const S = G.game.scene, W = S.world;
        window.__T = {
          W, S,
          step(n) { for (let i = 0; i < n; i++) G.game.update(1 / 120); },
          arena() { return W.entities.find((e) => e.type === 'bossArena'); },
          enter() { const A = this.arena(), p = W.player; p.x = p.px = (A.tx0 + 4) * 36; p.y = p.py = (A.floorTy) * 36 - p.h; p.vx = 0; p.vy = 0; },
        };
        const A = window.__T.arena();
        return { boss: A && A.boss && A.boss.id, hp: A && A.boss && A.boss.maxHp };
      });
      if (!info.boss) throw new Error('arena/boss not found');
      log.push(`${info.boss} hp${info.hp}`);
      const fight = async (label, untilPhase, missAfter) => page.evaluate(({ untilPhase, missAfter }) => {
        const T = window.__T, W = T.W, A = T.arena();
        T.enter();
        T.step(30);
        if (A.state !== 'intro') return { err: 'intro did not start: ' + A.state };
        T.step(2.2 * 120);
        if (A.state !== 'fight' || W.boss !== A.boss) return { err: 'fight did not start: ' + A.state };
        const b = A.boss, p = W.player;
        const phases = new Set([b.phase]); const states = new Set();
        let t = 0, hits = 0; window.__lastHit = -9;
        while (t < 400 && b.alive && !b.dying) {
          p.invuln = 5; p.hearts = p.maxHearts; p.frozen = true;
          if (b.canHit() && b.invuln <= 0 && b.state !== 'hurt' && t - (window.__lastHit || -9) > 2.5) { if (b.damage(1, p)) { hits++; window.__lastHit = t; } }
          T.step(1); t += 1 / 120; states.add(b.state); phases.add(b.phase);
          if (untilPhase && b.phase >= untilPhase) break;
        }
        const res = { t: +t.toFixed(1), hits, phase: b.phase, hp: b.hp, states: [...states].join(','), phases: [...phases].join(',') };
        if (missAfter) {
          p.frozen = false; W.playerMiss('pit'); T.step(120);
          res.afterMiss = { hp: b.hp, max: b.maxHp, arena: A.state, boss: !!W.boss, lock: !!W.camera.lock };
        }
        return res;
      }, { untilPhase, missAfter });
      // 1回目：段階2まで → ミス → リセット確認
      const r1 = await fight('first', 2, true);
      log.push('to phase2+miss ' + JSON.stringify(r1));
      if (r1.err) throw new Error(r1.err);
      if (!r1.afterMiss || r1.afterMiss.hp !== r1.afterMiss.max || r1.afterMiss.arena !== 'wait' || r1.afterMiss.boss || r1.afterMiss.lock) throw new Error('reset failed ' + JSON.stringify(r1.afterMiss));
      // 2回目：段階ごとに画面写真を撮りながら撃破まで
      for (const ph of [2, 3, 0]) {
        const r = await page.evaluate((ph) => {
          const T = window.__T, W = T.W, A = T.arena();
          if (A.state === 'wait') { T.enter(); T.step(30); T.step(2.2 * 120); }
          const b = A.boss, p = W.player; let t = 0, hits = 0; window.__lastHit = -9;
          while (t < 400 && b.alive && !b.dying) {
            p.invuln = 5; p.hearts = p.maxHearts; p.frozen = true;
            if (b.canHit() && b.invuln <= 0 && b.state !== 'hurt' && t - (window.__lastHit || -9) > 2.5) { if (b.damage(1, p)) { hits++; window.__lastHit = t; } }
            T.step(1); t += 1 / 120;
            if (ph && b.phase >= ph) { T.step(240); break; }   // 段階が上がった後を少し見る
          }
          if (!ph) T.step(3 * 120);
          window.__GQ__.game.render(1);
          return { t: +t.toFixed(1), hits, phase: b.phase, alive: b.alive, state: b.state, orb: W.entities.some((e) => e.type === 'orb' && e.alive), ws: W.state, ents: W.entities.filter((e)=>e.alive).map((e)=>e.type).join(','), gate: A.state };
        }, ph);
        log.push(`run${ph || 'end'} ` + JSON.stringify(r));
        if (shots) await page.screenshot({ path: path.join(root, 'screenshots', `boss-test-${st}-${ch}-${ph ? 'p' + ph : 'end'}.png`) });
        if (!ph && (r.alive || (!r.orb && r.ws !== 'clear'))) throw new Error('boss not defeated or no orb');
      }
      // 宝珠を取ってクリア
      const clear = await page.evaluate(() => {
        const T = window.__T, W = T.W, p = W.player; p.frozen = false;
        const orb = W.entities.find((e) => e.type === 'orb' && e.alive);
        if (!orb) return { state: W.state, already: true };
        p.x = p.px = orb.cx - p.w / 2; p.y = p.py = orb.y + orb.h - p.h; p.vy = 0;
        T.step(60);
        return { state: W.state, inLava: W.inLiquid(p, 'lava') };
      });
      log.push('clear ' + JSON.stringify(clear));
      if (clear.state !== 'clear') throw new Error('stage not cleared');
    } catch (e) { errors.push(String(e.message || e)); }
    if (errors.length) { failed++; console.log(`✗ stage${st}-${ch}\n  ` + log.join('\n  ') + '\n  ERR ' + [...new Set(errors)].slice(0, 5).join('\n  ERR ')); }
    else console.log(`✓ stage${st}-${ch}  ` + log.join(' | '));
    await page.close();
  }
}
await browser.close();
if (failed) { console.log(`${failed} failed`); process.exit(1); }
