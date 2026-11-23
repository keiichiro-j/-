// ミッション定義（データ）と進行。three.jsに依存しない（テスト対象）
// 部品：goto（場所へ行く）/ deliver（制限時間つきで届ける）/ checkpoints（レース）/ escape（逃げ切る）
export const MISSIONS = [
  { id: 'flowers', title: '花束の配達', kind: '配達', start: 'florist', reward: 4000,
    brief: '柳ケ瀬の花屋から、長良の旅館へ花束を届けてほしい。川を渡る橋を使え。',
    steps: [{ t: 'goto', at: 'florist', r: 4, text: '花屋で花束を受け取れ' }, { t: 'deliver', at: 'ryokan', r: 6, time: 150, text: '旅館へ花束を届けろ' }] },
  { id: 'veg', title: '朝どれ野菜', kind: '配達', start: 'farm', reward: 3500, needCar: true,
    brief: '西岐阜の農家の野菜を、駅前のコンビニまで急いで運んでくれ。車が必要だ。',
    steps: [{ t: 'goto', at: 'farm', r: 6, text: '農家で野菜を積め（車で）', vehicle: true }, { t: 'deliver', at: 'conbini2', r: 7, time: 120, text: '駅前のコンビニへ運べ', vehicle: true }] },
  { id: 'museum', title: '博物館の資料', kind: '配達', start: 'museum', reward: 5000,
    brief: '公園の博物館から、岐阜駅前の像の前で待つ学芸員へ資料を届けろ。',
    steps: [{ t: 'goto', at: 'museum', r: 5, text: '博物館で資料を受け取れ' }, { t: 'deliver', at: 'statue', r: 8, time: 140, text: '駅前の像まで届けろ' }] },
  { id: 'castle', title: '山頂への差し入れ', kind: '配達', start: 'statue', reward: 6000,
    brief: '岐阜城の展望台スタッフへ弁当を届けろ。金華山はドライブウェイかロープウェイで登れる。',
    steps: [{ t: 'goto', at: 'statue', r: 8, text: '駅前で弁当を受け取れ' }, { t: 'deliver', at: 'castleGate', r: 10, time: 240, text: '金華山の山頂へ届けろ' }] },
  { id: 'bank', title: '現金の移送', kind: '配達', start: 'bank', reward: 5500, needCar: true,
    brief: '銀行から病院へ書類と現金を運ぶ。途中で警察に目を付けられるな（手配が付いたら失敗）。',
    steps: [{ t: 'goto', at: 'bank', r: 6, text: '銀行で荷物を積め（車で）', vehicle: true }, { t: 'deliver', at: 'hospital', r: 8, time: 160, text: '病院へ運べ（手配されると失敗）', vehicle: true, noWanted: true }] },
  { id: 'hillclimb', title: '金華山ヒルクライム', kind: 'レース', start: 'driveStart', reward: 8000, needCar: true,
    brief: 'ドライブウェイを山頂まで駆け上がれ。全チェックポイントを通過すること。',
    steps: [{ t: 'checkpoints', points: 'driveway', r: 9, time: 95, text: 'チェックポイントを通過して山頂を目指せ', vehicle: true }] },
  { id: 'escape', title: '追跡をまけ', kind: 'サイド', start: 'police', reward: 7000,
    brief: '警察署の前でわざと目立ち、手配★2を付けられてから逃げ切れ。',
    steps: [{ t: 'getWanted', stars: 2, text: '警察の前で騒ぎを起こせ（★2）' }, { t: 'escape', text: '手配を振り切れ' }] },
];

export function newMissionState() { return { active: null, done: {}, best: {} }; }

// resolve(key) -> {x,z} ; ctx: {x, z, inCar, carSpeed, wanted, carDestroyed}
export function startMission(ms, def, now = 0) {
  ms.active = { def, step: 0, timeLeft: def.steps[0].time || 0, startedAt: now, cp: 0, elapsed: 0 };
  return ms.active;
}

export function currentTarget(ms, resolve) {
  const a = ms.active; if (!a) return null;
  const st = a.def.steps[a.step];
  if (st.t === 'checkpoints') { const pts = resolve(st.points); return pts ? pts[a.cp] : null; }
  if (st.at) return resolve(st.at);
  return null;
}

export function updateMission(ms, dt, ctx, resolve) {
  const a = ms.active; if (!a) return null;
  const st = a.def.steps[a.step];
  a.elapsed += dt;
  if (st.time) { a.timeLeft -= dt; if (a.timeLeft <= 0) return fail(ms, '時間切れ'); }
  if (a.def.needCar && ctx.carDestroyed) return fail(ms, '車が壊れた');
  if (st.noWanted && ctx.wanted > 0) return fail(ms, '手配された');
  let done = false;
  if (st.t === 'goto' || st.t === 'deliver') {
    const p = resolve(st.at);
    if (p && Math.hypot(ctx.x - p.x, ctx.z - p.z) < st.r && (!st.vehicle || ctx.inCar) && (!ctx.inCar || ctx.carSpeed < 6)) done = true;
  } else if (st.t === 'checkpoints') {
    const pts = resolve(st.points);
    const p = pts[a.cp];
    if (Math.hypot(ctx.x - p.x, ctx.z - p.z) < st.r && (!st.vehicle || ctx.inCar)) { a.cp++; if (a.cp >= pts.length) done = true; else return { type: 'checkpoint', n: a.cp, of: pts.length }; }
  } else if (st.t === 'getWanted') { if (ctx.wanted >= st.stars) done = true; }
  else if (st.t === 'escape') { if (ctx.wanted === 0) done = true; }
  if (!done) return null;
  a.step++;
  if (a.step >= a.def.steps.length) {
    const def = a.def, time = a.elapsed;
    ms.done[def.id] = (ms.done[def.id] || 0) + 1;
    if (!ms.best[def.id] || time < ms.best[def.id]) ms.best[def.id] = time;
    ms.active = null;
    return { type: 'complete', def, reward: def.reward, time };
  }
  const next = a.def.steps[a.step];
  if (next.time) a.timeLeft = next.time;
  a.cp = 0;
  return { type: 'step', text: next.text };
}

export function fail(ms, reason) {
  const def = ms.active && ms.active.def; ms.active = null;
  return { type: 'fail', def, reason };
}

// タクシー業務：料金＝距離×単価＋早着ボーナス
export function taxiFare(distM, seconds) {
  const base = 500 + distM * 6;
  const par = distM / 9 + 15;
  const bonus = seconds < par ? Math.round((par - seconds) * 20) : 0;
  return Math.round(base + bonus);
}
