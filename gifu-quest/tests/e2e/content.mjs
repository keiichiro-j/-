// やり込み（称号・毎日のお題・腕試し）の通しテスト。仕様は docs/content.md
//   node tests/e2e/content.mjs [--dist dist] [--shots]
// 1. 称号：敵を倒すイベントで「腕自慢」→ 通知が出てコインが入る／ステージクリアで「初陣」
// 2. お題：達成でコイン、日付が変わると入れ替わる（Date を進める）
// 3. 腕試し：エンディング後にマップに出る → 開始 → 1体目撃破 → 次へ（ハート+1）→ ボスを直接 damage して全6体 → 記録
// 4. 特別ステージ8（沖縄）：1〜6クリアで地図に「南の島」→ 航路がひらける演出（1回だけ）→ ←→で選べる → クリアで称号2つ・結果からマップへ
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const di = process.argv.indexOf('--dist'); const DIST = di > 0 ? process.argv[di + 1] : 'dist';
const shots = process.argv.includes('--shots');
const url = 'file://' + path.join(root, DIST, 'index.html');
const browser = await chromium.launch();
const errors = [];
let failed = 0;
const ok = (c, m) => { if (c) console.log('✓ ' + m); else { failed++; console.log('✗ ' + m); } };

const page = await browser.newPage({ viewport: { width: 1200, height: 540 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
// 端末の日付を差し替えられるようにする（window.__fakeNow をミリ秒で入れると、その時刻から進む）
await page.addInitScript(() => {
  try { localStorage.clear(); } catch {}
  const RealDate = Date;
  window.__setNow = (ms) => { window.__nowOffset = ms - RealDate.now(); };
  window.__nowOffset = 0;
  class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + window.__nowOffset); } static now() { return RealDate.now() + window.__nowOffset; } }
  window.Date = FakeDate;
});
await page.goto(url);
await page.waitForFunction(() => window.__GQ__ && window.__GQ__.game.sceneName === 'title', null, { timeout: 15000 });
const shot = async (n) => { if (shots) await page.screenshot({ path: path.join(root, 'screenshots', `content-${n}.png`) }); };
const ev = (fn, arg) => page.evaluate(fn, arg);
// 手で時間を進める
await ev(() => {
  const G = window.__GQ__;
  window.__step = (n) => { for (let i = 0; i < n; i++) G.game.update(1 / 120); };
  window.__go = (name, p) => { G.game.go(name, p || {}, 'none'); };
});
await ev(() => window.__setNow(new Date(2026, 10, 24, 23, 50, 0).getTime()));

// ---- 1. 称号 ----
{
  await ev(() => { window.__go('worldmap'); });
  await page.waitForTimeout(300);
  const r0 = await ev(() => { const d = window.__GQ_SAVE__.data; return { coins: d.coins, got: Object.keys(d.achievements).length, date: d.missions.date, n: d.missions.list.length }; });
  ok(r0.got === 0 && r0.coins === 0, '新しいセーブでは称号なし');
  ok(r0.date === '2026-11-24' && r0.n === 3, `マップに入ると今日のお題が3つ (${r0.date})`);
  // 敵を100体（イベント）→「腕自慢」
  const r1 = await ev(() => {
    const { progress, toast } = window.__GQ__, d = window.__GQ_SAVE__.data, ev = progress.deps.events;
    const shown = toast.shown;
    const c0 = d.coins;
    for (let i = 0; i < 100; i++) ev.emit('enemyDefeated', { kind: 'zz' });
    return { got: !!d.achievements.enemy100, gain: d.coins - c0, busy: toast.busy, shown0: shown };
  });
  ok(r1.got, '敵を100体倒すと称号「腕自慢」');
  ok(r1.gain >= 80, `報酬のコインが入った (+${r1.gain})`);
  ok(r1.busy, '通知が積まれた');
  await page.waitForTimeout(500);
  const last = await ev(() => window.__GQ__.toast.last);
  ok(last && (last.kind === 'title' || last.kind === 'mission'), `通知が画面に出た（${last && last.kind}:${last && last.name}）`);
  await shot('1-toast-map');
  // ステージをクリア → 「初陣」と「リーフ」の称号（結果画面に通知）
  await ev(() => { window.__GQ__.loop.stop(); window.__go('stage', { stage: 1, char: 'leaf' }); window.__step(30); const W = window.__GQ__.game.scene.world; W.stageClear(); window.__step(330); });
  await ev(() => window.__GQ__.loop.start());
  await page.waitForFunction(() => window.__GQ__.game.sceneName === 'results' && !window.__GQ__.game.trans, null, { timeout: 5000 });
  const r2 = await ev(() => { const d = window.__GQ_SAVE__.data; return { first: !!d.achievements.first_clear, leaf: !!d.achievements.char_leaf, clears: d.records.clears }; });
  ok(r2.first && r2.leaf && r2.clears === 1, 'ステージクリアで「初陣」「若葉の旅人」');
  await page.waitForTimeout(700);
  await shot('2-results-toast');
}

// ---- 2. お題 ----
{
  const r = await ev(() => {
    const d = window.__GQ_SAVE__.data, { progress } = window.__GQ__, ev = progress.deps.events;
    // 今日のお題を「敵を20体」「福引き」「ボス1体」に置き換えて確かめる
    d.missions.list = [{ id: 'enemy20', p: 0, done: false }, { id: 'gacha', p: 0, done: false }, { id: 'boss1', p: 0, done: false }];
    d.missions.gachaBase = d.gacha.total;
    const c0 = d.coins, n0 = d.records.missionsDone;
    for (let i = 0; i < 20; i++) ev.emit('enemyDefeated', { kind: 'zz' });
    const a = d.missions.list[0].done, gainA = d.coins - c0;
    d.gacha.total++; progress.check();
    return { a, gainA, b: d.missions.list[1].done, done: d.records.missionsDone - n0 };
  });
  ok(r.a && r.gainA >= 80, `お題「敵を20体倒す」達成で +${r.gainA}`);
  ok(r.b && r.done === 2, '福引きを引くとお題「福引きを引く」達成');
  await ev(() => window.__go('records', { tab: 1 }));
  await page.waitForTimeout(400);
  await shot('3-missions');
  // 0時を越える → 入れ替わる
  const r2 = await ev(() => { window.__setNow(new Date(2026, 10, 25, 0, 1, 0).getTime()); window.__GQ__.progress.check(); const m = window.__GQ_SAVE__.data.missions; return { date: m.date, n: m.list.length, any: m.list.some((x) => x.done || x.p) }; });
  ok(r2.date === '2026-11-25' && r2.n === 3 && !r2.any, '0時を越えるとお題が入れ替わる');
}

// ---- 3. 腕試し ----
{
  const noRush = await ev(() => { window.__GQ_SAVE__.data.seenEnding = false; window.__go('worldmap'); return window.__GQ__.game.scene.btnLabels(); });
  const withRush = await ev(() => { window.__GQ_SAVE__.data.seenEnding = true; window.__go('worldmap'); return window.__GQ__.game.scene.btnLabels(); });
  ok(!noRush.includes('腕試し') && withRush.includes('腕試し'), 'エンディングを見た後だけマップに「腕試し」');
  await page.waitForTimeout(400);
  await shot('4-map-rush');
  await ev(() => { window.__GQ_SAVE__.data.equipped = null; window.__GQ__.loop.stop(); window.__go('bossrush', { char: 'gen' }); });
  // ボスを倒す（隙に damage）→ 宝珠を取る → 次へ
  const beat = (i) => ev((i) => {
    const S = window.__GQ__.game.scene, W = S.world, p = W.player, step = window.__step;
    const A = W.entities.find((e) => e.type === 'bossArena');
    if (!A) return { err: 'no arena' };
    p.x = p.px = (A.tx0 + 4) * 36; p.y = p.py = A.floorTy * 36 - p.h; p.vx = p.vy = 0;
    step(30); step(2.4 * 120);
    const b = A.boss; let t = 0;
    if (W.boss !== b) return { err: 'fight not started ' + A.state };
    while (t < 300 && b.alive && !b.dying) {
      p.invuln = 5; p.frozen = true;
      if (b.canHit() && b.invuln <= 0 && b.state !== 'hurt') b.damage(3, p);
      step(1); t += 1 / 120;
    }
    let k = 0; while (k++ < 1200 && !W.entities.some((e) => e.type === 'orb' && e.alive) && W.state === 'play') { p.invuln = 5; step(1); }
    p.frozen = false; p.invuln = 0;
    const orb = W.entities.find((e) => e.type === 'orb' && e.alive);
    if (i === 0) p.hearts = 2;   // 減ったハートが引き継がれ、1つ回復するのを確かめる
    if (orb) { p.x = p.px = orb.cx - p.w / 2; p.y = p.py = orb.y + orb.h - p.h; p.vy = 0; }
    step(60);
    const st = W.state; step(2.8 * 120);
    return { boss: b.id, state: st, phase: S.phase, idx: S.idx, hearts: S.run.hearts, t: +t.toFixed(1) };
  }, i);
  const r1 = await beat(0);
  ok(r1.state === 'clear' && r1.phase === 'break', `1体目（${r1.boss}）撃破 → 休み (${JSON.stringify(r1)})`);
  const h = await ev(() => { const S = window.__GQ__.game.scene; window.__step(3 * 120); return { idx: S.idx, phase: S.phase, hearts: S.world.player.hearts, max: S.world.player.maxHearts }; });
  ok(h.idx === 1 && h.phase === 'fight', '次のボスへ進んだ');
  ok(h.hearts === 3 && r1.hearts === 3, `ハートを引き継いで1つ回復 (${h.hearts}/${h.max})`);
  await ev(() => window.__GQ__.loop.start()); await page.waitForTimeout(300); await shot('5-rush-2'); await ev(() => window.__GQ__.loop.stop());
  for (let i = 1; i < 6; i++) {
    const r = await beat(i);
    ok(r.state === 'clear', `${i + 1}体目（${r.boss}）撃破` + (r.state === 'clear' ? '' : ' ' + JSON.stringify(r)));
    if (i < 5) await ev(() => window.__step(3 * 120));
    else ok(r.phase === 'done', '6体倒して勝ちぬき');
  }
  const rec = await ev(() => window.__GQ_SAVE__.data.bossRush);
  ok(rec.clears === 1 && rec.best > 0 && rec.most === 6 && rec.tries === 1, `腕試しの記録 (${JSON.stringify(rec)})`);
  const ach = await ev(() => !!window.__GQ_SAVE__.data.achievements.rush_clear);
  ok(ach, '称号「六番勝負」');
  await ev(() => window.__GQ__.loop.start());
  await page.waitForTimeout(900);
  await shot('6-rush-done');
  await ev(() => window.__go('records', { tab: 2 }));
  await page.waitForTimeout(400);
  await shot('7-records-rush');
  // 力尽きた時
  const fail = await ev(() => { window.__GQ__.loop.stop(); window.__go('bossrush', { char: 'leaf' }); const S = window.__GQ__.game.scene; S.world.playerDown(); window.__step(3.2 * 120); return { phase: S.phase, tries: window.__GQ_SAVE__.data.bossRush.tries }; });
  ok(fail.phase === 'fail' && fail.tries === 2, '力尽きると終わり（記録画面に挑戦回数） ' + JSON.stringify(fail));
  await ev(() => window.__GQ__.loop.start());
}
// ---- 4. 特別ステージ8（沖縄） ----
{
  const hidden = await ev(() => {
    window.__GQ__.loop.stop();
    const d = window.__GQ_SAVE__.data; d.cleared = [1, 2, 3, 4, 5]; if (d.seenHints) delete d.seenHints.route8;
    window.__go('worldmap'); window.__step(10);
    const S = window.__GQ__.game.scene; return { vis: S.visibleList(), reveal: S.reveal };
  });
  ok(!hidden.vis.includes(8) && hidden.reveal < 0, '1〜6をクリアするまで南の島は地図に出ない');
  const rv = await ev(() => {
    const d = window.__GQ_SAVE__.data; d.cleared = [1, 2, 3, 4, 5, 6]; d.lastStage = 6;
    window.__go('worldmap', { stage: 6 }); window.__step(10);
    const S = window.__GQ__.game.scene;
    return { vis: S.visibleList(), reveal: S.reveal, seen: !!(d.seenHints && d.seenHints.route8) };
  });
  ok(rv.vis.includes(8) && rv.reveal > 0 && rv.seen, `解放された時に「南の島への航路がひらけた！」の演出 (${JSON.stringify(rv)})`);
  await ev(() => { window.__step(150); window.__GQ__.game.render(1); });
  await shot('8-south-reveal');
  const after = await ev(() => { window.__step(3 * 120); const S = window.__GQ__.game.scene; const r = { reveal: S.reveal, sel: S.sel, has: !!window.__GQ__.game.scene.visibleList }; window.__go('worldmap', { stage: 6 }); window.__step(10); r.again = window.__GQ__.game.scene.reveal; return r; });
  ok(after.reveal < 0 && after.again < 0, '演出は1回だけ（次にマップに来た時は出ない）');
  const keys = await ev(() => {
    const S = window.__GQ__.game.scene; S.sel = 6; S.moveSel(1); const a = S.sel; S.moveSel(-1); const b = S.sel; S.moveSel(1); return [a, b, S.sel];
  });
  ok(keys[0] === 8 && keys[1] === 6 && keys[2] === 8, `←→で南の島を選べる (${keys})`);
  await ev(() => { window.__GQ__.loop.start(); });
  await page.waitForTimeout(400);
  await shot('9-south-map');
  // クリア：レベルがあれば実際に入ってクリア、無ければ記録だけ
  const cl = await ev(() => {
    const G = window.__GQ__; G.loop.stop();
    const d = window.__GQ_SAVE__.data, has = !!G.game.scene.visibleList && G.game.scene.visibleList().includes(8);
    const c0 = d.coins, end0 = d.seenEnding;
    let label = null;
    {   // levels/stage8.json（ステージ担当）に入ってクリア。入れなければ下で記録だけ
      try { window.__go('stage', { stage: 8, char: 'leaf' }); window.__step(30); const W = G.game.scene.world; if (W) { W.stageClear(); window.__step(330); } } catch (e) { return { err: String(e) }; }
    }
    if (G.game.sceneName !== 'results') { if (!d.cleared.includes(8)) d.cleared.push(8); G.progress.stageCleared({ stage: 8, char: 'leaf', stats: { hits: 0, misses: 0, time: 400 }, target: 420 }); window.__go('results', { stage: 8, char: 'leaf', stats: { coins: 0, sarubobo: [false, false, false], hits: 0, misses: 0, time: 400, enemies: 0 }, newBest: true }); window.__step(5); }
    label = G.game.scene.list && G.game.scene.list.items[0].label;
    return { has, scene: G.game.sceneName, label, cleared: d.cleared.includes(8), orb: !!d.achievements.south_orb, hero: !!d.achievements.nirai_hero, gain: d.coins - c0, end: d.seenEnding === end0, orb6: d.cleared.filter((n) => n >= 1 && n <= 6).length };
  });
  ok(cl.scene === 'results' && cl.cleared && cl.label === 'マップへ' && cl.end, `ステージ8のクリアは cleared に入り、結果からはマップへ (${JSON.stringify(cl)})`);
  ok(cl.orb && cl.hero && cl.gain >= 600, `称号「南の宝珠」「ニライカナイの勇者」 (+${cl.gain})`);
  await ev(() => window.__GQ__.loop.start());
}
ok(errors.length === 0, 'コンソールエラー0件' + (errors.length ? ': ' + errors.slice(0, 3).join(' / ') : ''));
await browser.close();
if (failed) process.exit(1);
