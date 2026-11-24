// プレイボット（QA）：キー入力だけで主人公を動かし、各ステージをスタートからボス部屋まで進もうとする簡単な AI。
//   node tests/e2e/playbot.mjs [--dist dist-qa] [--stage 1] [--char gen] [--time 300] [--no-teleport] [--stuck 40] [--json out.json] [--trace x0,x1]
//   ボス戦：node tests/e2e/playbot.mjs --boss [--stage 6] [--char gen] [--time 240] [--lives 4] [--p3（段階3から始める）] [--trace 3]
//     アリーナの入口へテレポートし（記録する）、「弱点が出た隙に踏む／技を当てる」「弾・体からは離れる」「床が溶岩になったら岩へ」だけで戦う。
//     lives-used＝ハートが尽きかけて満タンに戻した回数（＝あと何回分の命が要ったか）。src＝被弾・ミスの原因
// 地形（world.level.get）・敵・足場を読んで、KeyboardEvent（ArrowRight/Left, KeyZ, KeyX, ArrowDown）を送るだけで操作する。
// 描画ループは止め、game.update(1/120) を手で回すので実時間より速い。
// 詰まったら少し戻って跳び直し、2回目からは地形の経路探索（歩く・跳ぶ・落ちる）で回り道を探す。
// 記録：最大x/全体、ミス・被弾の場所、同じ場所で長く詰まった座標。詰まりが長いとき（既定40秒）だけ先へテレポートして続きを調べ、記録に残す。
// ハートが尽きそうになったら満タンに戻す（「何回で詰むか」ではなく「どこまで行けるか」を見るため。回数は refill に記録）。
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const DIST = arg('dist', 'dist');
const file = 'file://' + path.join(root, DIST, 'index.html');
const STAGES = (arg('stage', process.argv.includes('--boss') ? '1,2,3,4,5,6' : '1,2,3,4,5,6,7')).split(',').map(Number);
const CHARS = (arg('char', 'leaf,minamo,gen,haku')).split(',');
const LIMIT = +arg('time', 300);
const TELEPORT = !process.argv.includes('--no-teleport');
const STUCK_TP = +arg('stuck', 40);

// ---- ページ内で動く AI（文字列化して送る） ----
function botRun({ limit, teleport, stuckTp, trace }) {
  const G = window.__GQ__; G.loop.stop();
  const W = G.game.scene.world, L = W.level, p = W.player, TILE = 36;
  const SOLID = new Set([1, 2, 3, 11, 18, 19, 20, 21]);
  const SLOPE = new Set([5, 6, 7, 8, 9, 10, 22, 23]);
  const solid = (tx, ty) => SOLID.has(L.get(tx, ty));
  const stand = (tx, ty) => { const t = L.get(tx, ty); return SOLID.has(t) || SLOPE.has(t) || t === 4; };
  const deadly = (tx, ty) => { const t = L.get(tx, ty); return t === 12 || t === 15 || t === 16; };
  const RIDES = new Set(['gondola', 'boat', 'festivalFloat']);
  const arena = W.entities.find((e) => e.type === 'bossArena');
  const goal = W.entities.find((e) => e.type === 'goal');
  const goalX = arena ? (arena.tx0 + 2.5) * TILE : goal ? goal.x : L.pxW - TILE * 3;
  const CODES = { left: 'ArrowLeft', right: 'ArrowRight', jump: 'KeyZ', attack: 'KeyX', down: 'ArrowDown' };
  const held = { left: false, right: false, jump: false, attack: false, down: false };
  const want = { left: false, right: false, jump: false, attack: false, down: false };
  const send = () => {
    for (const k in want) if (want[k] !== held[k]) {
      window.dispatchEvent(new KeyboardEvent(want[k] ? 'keydown' : 'keyup', { code: CODES[k], bubbles: true }));
      held[k] = want[k];
    }
  };
  const log = { hurts: [], missAt: [], stucks: [], teleports: [], refills: 0, rides: 0, result: 'timeout' };
  let t = 0, maxX = p.x, bestT = 0, lastHearts = p.hearts, lastMiss = W.stats.misses;
  let jumpHold = 0, jumpCool = 0, atkCool = 0, recover = 0, recoverDir = 1, recoverN = 0, stuckAt = null, stuckSince = 0;
  let rideStill = 0, rideOn = null, lastPlat = null, step = 0, dashHold = 0;
  const rideDone = new Set();
  const tileAt = (x) => Math.floor(x / TILE);

  // 足場（動く床）もタイルと同じく「立てる」とみなす（いまその場所にあるときだけ）
  function platAt(tx, ty) {
    const x0 = tx * TILE, x1 = x0 + TILE, y0 = ty * TILE - 6, y1 = ty * TILE + TILE;
    for (const e of W.platforms) { if (!e.alive || e.state === 'gone' || e.state === 'fall') continue; if (e.x < x1 && e.x + e.w > x0 && e.y >= y0 && e.y < y1) return e; }
    return null;
  }
  function groundBelow(tx, fromTy, depth) { for (let r = fromTy; r < fromTy + depth; r++) { if (deadly(tx, r)) return -1; if (stand(tx, r) || platAt(tx, r)) return r; } return 0; }
  function nearPlatform(x0, x1, yTop, yBot) {
    for (const e of W.platforms) {
      if (!e.alive || e.state === 'gone' || e.state === 'fall') continue;
      if (e.x + e.w > x0 && e.x < x1 && e.y > yTop && e.y < yBot) return e;
    }
    return null;
  }
  function decide(dt) {
    if (route) { follow(dt); if (route) return; }
    for (const k in want) want[k] = false;
    const cx = p.x + p.w / 2, foot = p.y + p.h, tx = tileAt(cx), fy = tileAt(foot - 1);
    let dir = 1;
    // 乗り物：乗って待つ
    const plat = p.onGround ? p.platform : null;
    if (plat && RIDES.has(plat.type) && !rideDone.has(plat)) {
      if (rideOn !== plat) { rideOn = plat; rideStill = 0; log.rides++; }
      const moving = Math.abs(plat.dx || 0) + Math.abs(plat.dy || 0) > 0.01;
      rideStill = moving ? 0 : rideStill + dt;
      if (plat.state === 'end' || (plat.state !== 'wait' && rideStill > 1.2)) { rideDone.add(plat); }
      else {
        // 床の真ん中に立つ。前から敵が来たら技
        const mid = plat.x + plat.w * 0.6;
        dir = cx < mid - 10 ? 1 : cx > mid + 10 ? -1 : 0;
        if (plat.state === 'wait') dir = cx < plat.x + plat.w * 0.5 ? 1 : 0;
        want.right = dir > 0; want.left = dir < 0;
        threats(cx, foot, true);
        return;
      }
    }
    if (recover > 0) { recover -= dt; dir = recoverDir; }
    // 前方の地形
    const look = Math.max(10, Math.abs(p.vx) * 0.16);
    const fx = tileAt(dir > 0 ? p.x + p.w + look : p.x - look);
    const wallAhead = solid(fx, fy) || solid(fx, fy - 1);
    let gap = false, edgeGap = false;
    if (p.onGround) {
      const g = groundBelow(fx, fy + 1, 4);
      gap = g <= 0;
      if (gap) { const g2 = groundBelow(tileAt(dir > 0 ? p.x + p.w + 4 : p.x - 4), fy + 1, 4); edgeGap = g2 <= 0 || true; }
    }
    // 動く床がある穴：床が近づくまで縁で待つ
    let waitPlat = false, walkOn = false;
    if (gap && p.onGround) {
      const ahead = nearPlatform(cx + (dir > 0 ? 0 : -6 * TILE), cx + (dir > 0 ? 7 * TILE : 0), foot - 4.5 * TILE, foot + 5 * TILE);
      // 地面で届く先があるか（4タイル先まで）
      let land = false;
      for (let d = 2; d <= 5 && !land; d++) { const c = fx + dir * d; for (let r = fy - 3; r <= fy + 3; r++) if (stand(c, r) && !solid(c, r - 1) && !solid(c, r - 2) && !deadly(c, r)) { land = true; break; } }
      if (ahead && ahead.type !== 'fallingPlatform' && ahead.type !== 'tightrope' && (!land || RIDES.has(ahead.type))) {
        const near = dir > 0 ? ahead.x - (p.x + p.w) : p.x - (ahead.x + ahead.w);
        const under = ahead.x < cx && ahead.x + ahead.w > cx;
        const level = Math.abs(ahead.y - foot) < 20;
        if (near > 1.3 * TILE && !under) { waitPlat = true; dir = 0; }
        else if (level || (ahead.y > foot && near < 0.6 * TILE)) { walkOn = true; }   // 隣に来ている床へは歩いて乗る
      }
    }
    want.right = dir > 0; want.left = dir < 0;
    // 走る（Xを押しっぱなし）。技を撃つときは一度離す
    if (dir && dashHold <= 0) want.attack = true;
    if (dashHold > 0) dashHold -= dt;
    // ジャンプ
    if (jumpHold > 0) { jumpHold -= dt; want.jump = true; }
    if (jumpCool > 0) jumpCool -= dt;
    const doJump = (hold) => { if (jumpCool <= 0 && !held.jump) { want.jump = true; jumpHold = hold; jumpCool = hold + 0.08; } };
    if (!waitPlat && !walkOn && p.onGround && (wallAhead || gap)) doJump(0.4);
    if (walkOn) want.attack = false;
    // 空中：下に足場があればその真ん中へ寄せる
    if (!p.onGround && !p.inWater && p.vy > -200 && groundBelow(tx, fy + 1, 8) <= 0) {
      const pl = nearPlatform(cx - 4 * TILE, cx + 4 * TILE, foot - 10, foot + 8 * TILE);
      if (pl && pl.x + pl.w / 2 > cx - 10) { const m = pl.x + pl.w / 2; const d = m - cx; want.right = d > 8; want.left = d < -8; }
    }
    if (recover > 0 && recover < 0.5 && p.onGround) doJump(0.4);
    // 水中：泳ぐ
    if (p.inWater) { const blocked = solid(fx, fy) || solid(fx, fy - 1) || solid(fx, fy - 2); want.jump = !blocked && W.tick % 30 < 4; if (blocked) { want.jump = false; jumpHold = 0; } }
    // 空中：穴の上なら二段ジャンプ／滑空
    if (!p.onGround && !p.inWater && p.vy > 60) {
      const below = groundBelow(tx, fy + 1, 7);
      if (below <= 0) {
        if (p.has('doubleJump') && p.airJumps > 0 && !held.jump && jumpCool <= 0) { want.jump = true; jumpHold = 0.3; jumpCool = 0.3; }
        if (p.has('glide')) want.jump = true;
      }
    }
    threats(cx, foot);
  }
  function threats(cx, foot, riding) {
    if (atkCool > 0) atkCool -= 1 / 60;
    for (const e of W.entities) {
      if (!e.alive || !(e.enemy || e.hazard) || e.boss) continue;
      const ex = e.x + e.w / 2, dx = (ex - cx) * p.face, dy = (e.y + e.h) - foot;
      if (dx > -20 && dx < 170 && dy > -90 && dy < 60) {
        if (atkCool <= 0 && !e.hazard) { want.attack = false; dashHold = 0.05; atkCool = 0.5; }   // 離す→次で押し直し＝技
        if (dx < 90 && p.onGround && (!riding || dy > -30) && (e.hazard || e.stompable === false || dx < 60)) { if (!held.jump && jumpCool <= 0) { want.jump = true; jumpHold = 0.35; jumpCool = 0.45; } }
      }
    }
  }
  // ---- 経路探索（詰まった時だけ使う）：立てるマスを節点に、歩く・跳ぶ・落ちるでつなぐ ----
  const STEP_UP = p.has('doubleJump') ? 5 : p.stats.jump >= 650 ? 4 : 3;
  const JDX = [5, 5, 4, 3, 2, 2];
  const open = (c, r) => { const t = L.get(c, r); return !SOLID.has(t) && !deadly(c, r); };
  const node = (c, r) => (stand(c, r) || platAt(c, r)) && !deadly(c, r) && open(c, r - 1) && open(c, r - 2);
  const corridor = (a, b, r) => { const sg = Math.sign(b - a) || 1; for (let c = a; c !== b + sg; c += sg) if (!open(c, r - 1) || !open(c, r - 2)) return false; return true; };
  const colOpen = (c, ra, rb) => { for (let r = Math.min(ra, rb); r <= Math.max(ra, rb); r++) if (!open(c, r)) return false; return true; };
  function plan(sc, sr, minC) {
    const key = (c, r) => c * 1000 + r;
    const from = new Map([[key(sc, sr), -1]]); const q = [[sc, sr]];
    let best = null;
    for (let qi = 0; qi < q.length && qi < 20000; qi++) {
      const [c, r] = q[qi];
      if (c > minC && (!best || c > best[0])) best = [c, r];
      const visit = (c2, r2) => { if (c2 < sc - 30 || c2 > sc + 40) return; const k = key(c2, r2); if (!from.has(k)) { from.set(k, key(c, r)); q.push([c2, r2]); } };
      for (let up = 0; up <= STEP_UP; up++) {
        const ty = r - up; if (ty < 2) break;
        if (up > 0 && !colOpen(c, ty - 2, r - 1)) break;
        for (const d of [1, -1]) for (let dx = up === 0 ? 1 : 0; dx <= JDX[up]; dx++) { const tx = c + d * dx; if (!corridor(c, tx, ty)) break; if (node(tx, ty)) visit(tx, ty); }
      }
      for (const d of [1, -1]) for (let dx = 1; dx <= 6; dx++) {
        const tx = c + d * dx; if (!corridor(c, tx, r)) break;
        if (node(tx, r)) continue;
        for (let yy = r + 1; yy < L.h; yy++) { if (!open(tx, yy - 2 + 2)) { if (node(tx, yy)) { if (dx <= 5 + ((yy - r) >> 1)) visit(tx, yy); } break; } if (node(tx, yy)) { visit(tx, yy); break; } }
      }
    }
    if (!best) return null;
    const path = []; let k = key(best[0], best[1]);
    while (k !== -1 && k !== undefined) { path.push([Math.floor(k / 1000), k % 1000]); k = from.get(k); }
    path.reverse(); path.shift();
    return path;
  }
  let route = null, routeT = 0;
  function follow(dt) {
    for (const k in want) want[k] = false;
    const cx = p.x + p.w / 2, foot = p.y + p.h, c = tileAt(cx), r = tileAt(foot + 2);
    if (p.onGround) while (route.length && route[0][0] === c && Math.abs(route[0][1] - r) <= 0) route.shift();
    if (!route.length) { route = null; return; }
    routeT += dt; if (routeT > 12) { route = null; return; }
    const [wc, wr] = route[0];
    const tx = wc * TILE + TILE / 2, dxp = tx - cx, dir = Math.abs(dxp) > 8 ? Math.sign(dxp) : 0;
    want.right = dir > 0; want.left = dir < 0;
    if (jumpHold > 0) { jumpHold -= dt; want.jump = true; }
    if (jumpCool > 0) jumpCool -= dt;
    if (p.onGround && jumpCool <= 0 && !held.jump) {
      const up = r - wr, cols = Math.abs(wc - c);
      const fx = tileAt(cx + dir * (p.w / 2 + 6));
      const needJump = up > 0 || (cols > 1 && !node(c + Math.sign(dxp), r)) || (dir && (solid(fx, r - 1) || solid(fx, r - 2)));
      const edge = dir > 0 ? (c + 1) * TILE - (p.x + p.w) : p.x - c * TILE;
      if (needJump && (cols <= (up >= 2 ? 1 : 2) || edge < 8 || (dir && solid(fx, r - 1)))) { want.jump = true; jumpHold = 0.45; jumpCool = 0.5; }
    }
    if (!p.onGround && p.has('doubleJump') && p.airJumps > 0 && p.vy > 40 && foot > wr * TILE + 4 && jumpCool <= 0 && !held.jump) { want.jump = true; jumpHold = 0.3; jumpCool = 0.35; }
    if (p.inWater && wr * TILE < foot) want.jump = W.tick % 24 < 4;
    if (p.has('glide') && !p.onGround && p.vy > 0 && foot < wr * TILE) want.jump = true;
  }
  function teleportAhead(fromTx) {
    for (let c = fromTx + 3; c < fromTx + 20; c++) {
      for (let r = 1; r < L.h - 1; r++) {
        if (stand(c, r) && !deadly(c, r) && !solid(c, r - 1) && !solid(c, r - 2) && !stand(c, r - 1)) {
          const fy = tileAt(p.y + p.h - 1);
          if (Math.abs(r - fy) > 8 && c < fromTx + 19) continue;
          p.x = p.px = c * TILE + 6; p.y = p.py = r * TILE - p.h; p.vx = p.vy = 0;
          return { from: fromTx, to: c, row: r };
        }
      }
    }
    return null;
  }

  while (t < limit) {
    if (W.dialogue) W.dialogue = null;
    if (G.game.sceneName !== 'stage') { log.result = 'scene:' + G.game.sceneName; break; }
    if (step % 2 === 0) { decide(1 / 60); send(); }
    G.game.update(1 / 120); step++; t += 1 / 120;
    if (trace && step % 15 === 0 && p.x / TILE >= trace[0] && p.x / TILE <= trace[1] && (log.trace = log.trace || []).length < 400) log.trace.push(`${t.toFixed(2)} x${(p.x / TILE).toFixed(1)} y${(p.y / TILE).toFixed(1)} vx${p.vx | 0} vy${p.vy | 0} g${p.onGround ? 1 : 0} pl:${p.platform ? p.platform.type + '/' + p.platform.state : '-'} keys:${Object.keys(held).filter((k) => held[k]).join('+')} rec${recover.toFixed(1)} rt${route ? route.slice(0, 3).join('|') : '-'}`);
    // 被弾・ミスの記録
    if (W.stats.misses !== lastMiss) { lastMiss = W.stats.misses; log.missAt.push([+(p.x / TILE).toFixed(0), +(p.y / TILE).toFixed(0), +t.toFixed(0)]); recover = 0; route = null; }
    else if (p.hearts < lastHearts) log.hurts.push([+(p.x / TILE).toFixed(0), +(p.y / TILE).toFixed(0)]);
    if (p.hearts <= 1 && W.state === 'play') { p.hearts = p.maxHearts; log.refills++; }
    lastHearts = p.hearts;
    if (W.state === 'down') { log.result = 'down'; break; }
    if (p.x > maxX + 18) { maxX = p.x; bestT = t; recoverN = 0; stuckAt = null; }
    if (arena && arena.state !== 'wait') { log.result = 'boss'; break; }
    if (W.state === 'clear') { log.result = 'clear'; break; }
    // 詰まり
    if (t - bestT > 3 && recover <= 0 && step % 2 === 0) {
      recoverN++; recover = 0.5 + Math.min(recoverN, 6) * 0.25; recoverDir = -1;
      if (recoverN >= 2 && !route) { const pr = plan(tileAt(p.x + p.w / 2), tileAt(p.y + p.h + 2), tileAt(maxX + p.w) + 1); if (pr && pr.length) { route = pr; routeT = 0; recover = 0; log.plans = (log.plans || 0) + 1; } }
      if (!stuckAt) { stuckAt = [Math.round(maxX / TILE), Math.round(p.y / TILE)]; stuckSince = bestT; }
      bestT = t - 1.5;   // 次の判定まで少し待つ
    }
    if (recover > 0 && recover < 0.55 && recoverDir < 0) recoverDir = 1;
    if (stuckAt && t - stuckSince > stuckTp) {
      log.stucks.push({ at: stuckAt, sec: +(t - stuckSince).toFixed(0), pos: [+(p.x / TILE).toFixed(1), +(p.y / TILE).toFixed(1)] });
      if (!teleport) { log.result = 'stuck'; break; }
      const r = teleportAhead(Math.max(Math.floor(maxX / TILE), Math.floor(p.x / TILE)));
      log.teleports.push(r);
      if (!r) { log.result = 'stuck'; break; }
      maxX = p.x; bestT = t; stuckAt = null; recoverN = 0; recover = 0;
    }
  }
  for (const k in want) want[k] = false; send();
  return { ...log, maxX: Math.round(maxX / TILE), goalX: Math.round(goalX / TILE), t: +t.toFixed(0), coins: W.stats.coins, misses: W.stats.misses };
}


// ---- ボス戦（--boss）：アリーナの入口へテレポート（記録する）→「弱点が出た隙に踏む／技を当てる」だけの簡単な戦い方 ----
function bossRun({ limit, lives, trace, p3 }) {
  const G = window.__GQ__; G.loop.stop();
  const W = G.game.scene.world, p = W.player, TILE = 36;
  const A = W.entities.find((e) => e.type === 'bossArena');
  const CODES = { left: 'ArrowLeft', right: 'ArrowRight', jump: 'KeyZ', attack: 'KeyX', down: 'ArrowDown' };
  const held = {}, want = {};
  for (const k in CODES) { held[k] = false; want[k] = false; }
  const send = () => { for (const k in want) if (want[k] !== held[k]) { window.dispatchEvent(new KeyboardEvent(want[k] ? 'keydown' : 'keyup', { code: CODES[k] })); held[k] = want[k]; } };
  const FLOORY = A.floorTy * TILE;
  const enter = () => { p.x = p.px = (A.tx0 + 4) * TILE; p.y = p.py = A.floorTy * TILE - p.h; p.vx = p.vy = 0; W.camera.snapTo(p.cx, p.y); };
  enter();
  const log = { teleports: 1, src: {}, hurts: 0, misses: 0, phases: [], result: 'timeout', hits: 0, hurtBy: {} };
  const oh = p.hurt.bind(p);
  p.hurt = (src, d) => { const r = oh(src, d); if (r) { const k = !src ? 'tile' : src.boss ? 'body:' + src.state + ':' + src.moveName : (src.spec && src.spec.sprite) || src.sprite || src.type || 'other'; log.src[k] = (log.src[k] || 0) + 1; } return r; };
  const om = W.playerMiss.bind(W);
  W.playerMiss = (kind) => { if (W.state === 'play') { const k = 'miss:' + kind + (W.boss ? ':' + W.boss.state + ':' + W.boss.moveName + ':ph' + W.boss.phase : ''); log.src[k] = (log.src[k] || 0) + 1; } return om(kind); };
  let t = 0, step = 0, jumpHold = 0, jumpCool = 0, atkCool = 0, lastHearts = p.hearts, lastHp = null, lastPhase = 0, lastMiss = W.stats.misses;
  const rcx = (r) => r.x + r.w / 2;
  function decide(dt) {
    for (const k in want) want[k] = false;
    const b = W.boss;
    if (jumpHold > 0) { jumpHold -= dt; want.jump = true; }
    if (jumpCool > 0) jumpCool -= dt;
    if (atkCool > 0) atkCool -= dt;
    if (!b) { // 登場演出中・撃破後：宝珠を取りに行く
      const orb = W.entities.find((e) => e.alive && e.type === 'orb');
      if (orb) { const d = orb.x + orb.w / 2 - p.cx; want.right = d > 6; want.left = d < -6; if (orb.y + orb.h < p.y && p.onGround && jumpCool <= 0) { want.jump = true; jumpHold = 0.4; jumpCool = 0.6; } }
      else if (A.state === 'intro' && A.introT > 0.8) want.jump = (step % 20) < 2;
      return;
    }
    const cx = p.cx, foot = p.y + p.h;
    const jump = (h) => { if (jumpCool <= 0 && !held.jump && (p.onGround || p.inWater || (p.has('doubleJump') && p.airJumps > 0))) { want.jump = true; jumpHold = h; jumpCool = h + 0.1; } };
    // 1) よける：近づく弾・ボスの体
    let danger = 0, fall = 0;
    for (const e of W.entities) {
      if (!e.alive || !(e.hazard || e.enemy) || e === b) continue;
      const r = e.hurtRect ? e.hurtRect() : e; const ex = rcx(r), vx = e.vx || 0;
      const dx = ex - cx, coming = vx === 0 || Math.sign(vx) === -Math.sign(dx);
      if (Math.abs(dx) < 140 && coming && r.y < foot + 10 && r.y + r.h > p.y - 50) danger = danger || (dx > 0 ? 1 : -1);
      // 上から落ちてくる弾（着地点を予測して横へよける）
      if (e.hazard && (e.vy || 0) > -200 && r.y + r.h < p.y) { const tt = (p.y - r.y - r.h) / Math.max(150, e.vy || 150); const lx = ex + vx * Math.min(tt, 1.2); if (Math.abs(lx - cx) < 60 && tt < 1.0) fall = fall || (lx > cx ? 1 : -1); }
      if (e.enemy && !e.hazard && Math.abs(dx) < 120 && Math.abs(r.y + r.h - foot) < 50 && atkCool <= 0 && p.id !== 'haku') { want.attack = true; atkCool = 0.4; p.face = Math.sign(dx) || 1; }
    }
    for (let i = 0; i < b.nBodies; i++) {
      const r = b.bodies[i]; if (r.w <= 0) continue;
      const near = cx > r.x - 60 && cx < r.x + r.w + 60 && foot > r.y - 10 && p.y < r.y + r.h;
      const moving = Math.abs(b.vx || 0) > 40;
      if (near && (moving || b.state === 'attack')) danger = danger || (rcx(r) > cx ? 1 : -1);
    }
    // 床が溶岩に沈む（6面の段階3）：岩の足場に乗って戦う
    const lq = W.liquids.find((q) => q.kind === 'lava' && q.y < FLOORY + 24);
    if (lq) { rockMode(b, lq, jump, fall); return; }
    if (fall) { want.right = fall < 0; want.left = fall > 0; return; }
    const wk = b.weak, vis = wk.w > 0 && b.canHit() && b.invuln <= 0;
    if (vis) {
      const wx = rcx(wk), dx = wx - cx;
      const high = wk.y + wk.h < foot - 20;
      if (p.id !== 'haku' && Math.abs(dx) < (p.id === 'gen' ? 110 : 300) && Math.abs(wk.y + wk.h / 2 - p.cy) < 70 && atkCool <= 0) {
        // 技を当てる（向きを合わせて押す）
        if ((dx > 0) !== (p.face > 0)) { want.right = dx > 0; want.left = dx < 0; }
        else { want.attack = true; atkCool = 0.35; }
      } else if (p.id === 'haku' && Math.abs(dx) < 200 && Math.abs(wk.y + wk.h / 2 - p.cy) < 60 && atkCool <= 0) {
        want.right = dx > 0; want.left = dx < 0; if ((dx > 0) === (p.face > 0)) { want.attack = true; atkCool = 0.7; }
      } else {
        // 踏む：弱点の真上を目指して跳ぶ
        want.right = dx > 8; want.left = dx < -8;
        if (high || Math.abs(dx) < 70) { if (Math.abs(dx) < 110) jump(0.45); }
        if (!p.onGround && p.vy > 0 && p.has('doubleJump') && foot > wk.y) jump(0.3);
      }
      if (!danger) return;
    }
    if (danger) {
      // 弾から遠ざかりつつ跳ぶ
      want.right = danger < 0; want.left = danger > 0; jump(0.4);
      return;
    }
    // 待つ：ボスの体から少し離れて構える
    let bx = null; for (let i = 0; i < b.nBodies; i++) if (b.bodies[i].w > 0) { bx = rcx(b.bodies[i]); break; }
    if (bx != null) {
      const d = cx - bx, want_d = 230, room = cx - A.x;
      if (Math.abs(d) < want_d) { const away = d >= 0 ? 1 : -1; const wall = away > 0 ? (A.x + A.w - cx < 100) : (room < 140); const dir = wall ? -away : away; want.right = dir > 0; want.left = dir < 0; if (wall && Math.abs(d) < 120) jump(0.45); }
    }
  }
  // 溶岩・穴へ歩いて入らない（跳ぶ時は別）
  function guard() {
    if (!p.onGround || want.jump) return;
    const dir = want.right ? 1 : want.left ? -1 : 0; if (!dir) return;
    const fx = Math.floor((dir > 0 ? p.x + p.w + 8 : p.x - 8) / TILE), fy = Math.floor((p.y + p.h + 4) / TILE);
    const t0 = W.level.get(fx, fy);
    const lava = t0 === 15 || t0 === 16 || W.inLiquid({ x: fx * TILE, y: p.y, w: TILE, h: p.h + 8 }, 'lava');
    let floor = false; for (let r = fy; r < fy + 3; r++) { const tt = W.level.get(fx, r); if (tt && tt !== 15 && tt !== 16 && tt !== 13 && tt !== 14) { floor = true; break; } }
    if (!floor) for (const e of W.platforms) if (e.alive && e.x < (fx + 1) * TILE && e.x + e.w > fx * TILE && e.y >= p.y + p.h - 4 && e.y < p.y + p.h + 3 * TILE) floor = true;
    if (lava || !floor) { want.right = false; want.left = false; }
  }
  let rockTarget = null, attackRun = 0;
  function rockMode(b, lq, jump, fall) {
    const cx = p.cx, foot = p.y + p.h;
    const safe = (r) => r.alive && r.type === 'bossPlatform' && r.y < lq.y - 20 && r.y > A.y && !(r.crumble >= 0.5) && !(r.down > 0);
    const on = p.onGround && p.platform && safe(p.platform) ? p.platform : null;
    const wk = b.weak, vis = wk.w > 0 && b.canHit() && b.invuln <= 0;
    if (attackRun > 0) attackRun -= 1 / 60;
    // 弱点が近ければ跳んで踏む
    if (vis && on && Math.abs(wk.x + wk.w / 2 - cx) < 150 && attackRun <= 0) { attackRun = 0.9; }
    if (attackRun > 0 && vis) {
      const d = wk.x + wk.w / 2 - cx; want.right = d > 6; want.left = d < -6;
      if (p.onGround) jump(0.3);
      if (p.id !== 'haku' && Math.abs(d) < 120 && atkCool <= 0 && (d > 0) === (p.face > 0)) { want.attack = true; atkCool = 0.4; }
      return;
    }
    if (on && !(on.crumble > 0.3)) { rockTarget = on; if (fall) { /* 岩の上で弾をよけるのは難しいので技で消す */ if (p.id === 'gen' && atkCool <= 0) { want.attack = true; atkCool = 0.4; } } 
      // 岩の上：技で攻撃（遠くからでも当たるキャラ）
      if (vis && p.id !== 'gen' && p.id !== 'haku' && atkCool <= 0) { const d = wk.x + wk.w / 2 - cx; if ((d > 0) !== (p.face > 0)) { want.right = d > 0; want.left = d < 0; } else { want.attack = true; atkCool = 0.5; } }
      return; }
    // 乗る岩を選ぶ（崩れかけ・沈んでいる岩は除く）。近い順、高い岩を少し優先
    let best = null, bd = 1e9;
    for (const r of W.platforms) { if (!safe(r) || r === (on && on.crumble > 0.3 ? on : null)) continue; const d = Math.abs(r.x + r.w / 2 - cx) + (r.y < FLOORY - 100 ? -40 : 0) + (p.platform === r ? 500 : 0); if (d < bd) { bd = d; best = r; } }
    if (!best) return;
    rockTarget = best;
    const d = best.x + best.w / 2 - cx;
    want.right = d > 8; want.left = d < -8;
    if ((p.onGround || p.inWater) && (Math.abs(d) < 150 || foot > best.y + 4)) jump(0.45);
    if (!p.onGround && p.has('doubleJump') && p.airJumps > 0 && p.vy > 0 && foot > best.y - 4) jump(0.3);
    if (!p.onGround && p.has('glide') && p.vy > 0 && foot < best.y) want.jump = true;
  }
  while (t < limit) {
    if (W.dialogue) W.dialogue = null;
    if (G.game.sceneName !== 'stage') { log.result = 'scene:' + G.game.sceneName; break; }
    if (step % 2 === 0) { decide(1 / 60); if (!W.liquids.some((q) => q.kind === 'lava' && q.y < FLOORY + 24)) guard(); send(); }
    G.game.update(1 / 120); step++; t += 1 / 120;
    const b = W.boss || (A.boss && A.boss);
    if (p3 && W.boss && W.boss.phase === 1 && !W.boss._qaP3) { W.boss._qaP3 = true; W.boss.hp = Math.floor(W.boss.maxHp / 3); W.boss.startPhase(3); log.p3 = (log.p3 || 0) + 1; }
    if (trace && b && b.phase >= trace && step % 15 === 0 && (log.trace = log.trace || []).length < 200) { const lq = W.liquids.find((q) => q.kind === 'lava'); log.trace.push(`${t.toFixed(2)} ${b.state}:${b.moveName} x${((p.x - A.x) / TILE).toFixed(1)} foot${((FLOORY - p.y - p.h)).toFixed(0)} g${p.onGround ? 1 : 0} pl:${p.platform ? ((p.platform.x - A.x) / TILE).toFixed(1) + '/' + (FLOORY - p.platform.y).toFixed(0) + '/c' + (p.platform.crumble || 0).toFixed(1) : '-'} lava${lq ? (FLOORY - lq.y).toFixed(0) : '-'} rt${rockTarget ? ((rockTarget.x - A.x) / TILE).toFixed(1) : '-'} keys:${Object.keys(held).filter((k) => held[k]).join('+')} h${p.hearts}`); }
    if (b && b.phase !== lastPhase) { lastPhase = b.phase; log.phases.push([b.phase, +t.toFixed(0)]); }
    if (b && lastHp != null && b.hp < lastHp) log.hits++;
    if (b) lastHp = b.hp;
    if (p.hearts <= 1 && p.hearts < lastHearts && W.state === 'play') { log.lives = (log.lives || 0) + 1; p.hearts = p.maxHearts; lastHearts = p.maxHearts + 1; }
    if (p.hearts < lastHearts) { log.hurts += lastHearts - p.hearts; const st = W.boss ? W.boss.state + ':' + W.boss.moveName : '-'; log.hurtBy[st] = (log.hurtBy[st] || 0) + 1; }
    lastHearts = p.hearts;
    if (W.stats.misses !== lastMiss) { lastMiss = W.stats.misses; log.misses++; }
    if (W.state === 'down') { log.result = 'down'; break; }
    if (W.state === 'respawn' || (A.state === 'wait' && W.state === 'play' && p.cx < (A.tx0 + 1) * TILE && t > 1)) {
      if (log.misses > lives) { log.result = 'lost'; break; }
      if (W.state === 'play') { enter(); log.teleports++; lastHp = null; }
    }
    if (W.state === 'clear' || W.result === 'clear') { log.result = 'win'; break; }
    if (A.state === 'done' && !W.entities.some((e) => e.alive && e.type === 'orb') && W.state !== 'clear') { /* 宝珠待ち */ }
  }
  for (const k in want) want[k] = false; send();
  const b = A.boss;
  return { ...log, t: +t.toFixed(0), bossHp: b ? b.hp + '/' + b.maxHp : '?', heartsLeft: p.hearts + '/' + p.maxHearts };
}

const browser = await chromium.launch();
const BOSS = process.argv.includes('--boss');
const results = [];
for (const st of STAGES) {
  for (const ch of CHARS) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 540 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
    let r;
    try {
      await page.goto(`${file}?stage=${st}&char=${ch}`);
      await page.waitForFunction(() => window.__GQ__ && window.__GQ__.game.sceneName === 'stage', null, { timeout: 15000 });
      await page.waitForTimeout(300);
      if (BOSS) { r = await page.evaluate(bossRun, { limit: +arg('time', 240), lives: +arg('lives', 4), trace: +arg('trace', 0), p3: process.argv.includes('--p3') }); if (r.trace) console.log(r.trace.join('\n')); console.log(`boss${st} ${ch.padEnd(6)} ${r.result.padEnd(6)}${r.p3 ? ' (段階3から×' + r.p3 + ')' : ''} t${r.t}s lives-used ${r.lives || 0} bossHp ${r.bossHp} hits ${r.hits} hurts ${r.hurts} misses ${r.misses} hearts ${r.heartsLeft} phases ${JSON.stringify(r.phases)} hurtBy ${JSON.stringify(r.hurtBy)} src ${JSON.stringify(r.src)}`); results.push({ stage: st, char: ch, ...r }); await page.close(); continue; }
      r = await page.evaluate(botRun, { limit: LIMIT, teleport: TELEPORT, stuckTp: STUCK_TP, trace: arg('trace') ? arg('trace').split(',').map(Number) : null });
      if (r.trace) console.log(r.trace.join('\n'));
    } catch (e) { r = { result: 'error', err: String(e.message || e) }; }
    r.stage = st; r.char = ch; r.errors = [...new Set(errors)].slice(0, 5);
    results.push(r);
    const tp = r.teleports && r.teleports.length ? ` TP${r.teleports.length}` : '';
    console.log(`stage${st} ${ch.padEnd(6)} ${String(r.result).padEnd(8)} max ${r.maxX}/${r.goalX}${tp} misses ${r.misses} hurts ${r.hurts?.length} refill ${r.refills} t${r.t}s`
      + (r.stucks?.length ? `\n    stuck: ${r.stucks.map((s) => `@${s.at.join(',')}(${s.sec}s)`).join(' ')}` : '')
      + (r.missAt?.length ? `\n    miss@ ${r.missAt.map((m) => m.slice(0, 2).join(',')).join(' ')}` : '')
      + (r.hurts?.length ? `\n    hurt@ ${r.hurts.map((m) => m.join(',')).join(' ')}` : '')
      + (r.teleports?.length ? `\n    teleport: ${r.teleports.map((m) => m ? m.from + '->' + m.to + ',' + m.row : 'none').join(' ')}` : '')
      + (r.errors.length ? `\n    console: ${r.errors.join(' | ')}` : '') + (r.err ? `\n    ${r.err}` : ''));
    await page.close();
  }
}
await browser.close();
const out = arg('json');
if (out) fs.writeFileSync(path.resolve(out), JSON.stringify(results, null, 1));
