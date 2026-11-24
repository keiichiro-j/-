// レベルデータの自動検査（設計書 6章「レベルデザインのルール」）。
// validateLevel(data, opts) → { errors: [...], warnings: [...], stats }
// DOM も他のモジュールも使わない（tools/level-editor.html にそのまま埋め込む）。
// 能力の基準は「最も跳べないゲン」：初速624・上昇重力1320 → 最高到達 約4タイル。余裕を見て
//   段差は3タイルまで、穴は4タイル（立つ位置の間隔は5列）まで越えられるとみなす。

export const VALIDATE_RULES = {
  minLen: 250, maxLen: 320, minRows: 15,
  maxGap: 4,          // 地面の穴の幅
  maxStep: 3,         // 登れる段差
  jumpDx: [5, 5, 4, 3], // 上る高さ 0,1,2,3 のときに届く横の距離（立つ位置の列の差）
  fallDxMax: 8,
  liftTiles: { steamVent: 7, bouncer: 6 },
};

const SOLID_CH = '#BIS RWN%'.replace(' ', '');
const SLOPE_CH = '/\\abcd><';
const KNOWN_CH = '.# BIS%RWN-/\\abcd><^~wLlHo'.replace(' ', '') + ' ';
const isSolidCh = (c) => SOLID_CH.includes(c);
const isSlopeCh = (c) => SLOPE_CH.includes(c);
const isWaterCh = (c) => c === '~' || c === 'w';
const isLavaCh = (c) => c === 'L' || c === 'l';
// 体が入れるマス（坂のマスは足元が入るので可）
const isOpenCh = (c) => !isSolidCh(c) && !isLavaCh(c) && c !== '^';
const isFloorCh = (c) => isSolidCh(c) || isSlopeCh(c) || c === '-';

export const THEMES = ['kinka', 'nagara', 'gujo', 'takayama', 'shirakawa', 'okuhida'];
export const TIMES = ['day', 'dusk', 'night', 'festival'];
export const WEATHERS = ['sunny', 'cloudy', 'rain', 'shower', 'storm', 'thunder', 'fog', 'snow', 'blizzard', 'ash'];
export const BOSSES = ['musasabi', 'salamander', 'dancer', 'yatai', 'yukioni', 'dragon'];
export const ENEMY_TYPES = ['walker', 'spiky', 'hopper', 'flyer', 'thrower', 'popper', 'charger', 'shielder'];
// 床として乗れる仕掛け（近くにあれば穴・段差を許可し、到達の探索でも足場として扱う）
export const PLATFORM_TYPES = ['movingPlatform', 'gondola', 'boat', 'fallingPlatform', 'rhythmPlatform', 'festivalFloat', 'tightrope', 'steamVent', 'bouncer', 'lantern'];
// 範囲で置くもの（x,y 一点ではない）
const REGION_TYPES = ['cameraZone', 'bossArena', 'waterLevel', 'risingLava', 'windZone', 'lightningZone', 'autoScroll'];
// 壁に埋まっていてはいけないもの
const POINT_TYPES = ['start', 'coin', 'sarubobo', 'skewer', 'heart', 'checkpoint', 'sign', 'goal', 'waterSwitch', ...ENEMY_TYPES];

export function validateLevel(data, opts = {}) {
  const R = { ...VALIDATE_RULES, ...(opts.rules || {}) };
  const errors = [], warnings = [];
  const err = (m) => errors.push(m), warn = (m) => warnings.push(m);
  const stats = {};
  if (!data || !Array.isArray(data.tiles)) { err('tiles がない'); return { errors, warnings, stats }; }
  const rows = data.tiles;
  const H = rows.length, W = Math.max(0, ...rows.map((r) => r.length));
  stats.w = W; stats.h = H;
  const practice = opts.practice ?? (data.id === 0);

  // ---- 形式 ----
  const lenCount = new Map(); rows.forEach((r) => lenCount.set(r.length, (lenCount.get(r.length) || 0) + 1));
  const usual = [...lenCount].sort((a, b) => b[1] - a[1])[0]?.[0] ?? W;
  rows.forEach((r, y) => { if (r.length !== usual) err(`行 ${y} の長さ ${r.length}（他は ${usual}）`); });
  const badCh = new Map();
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (!KNOWN_CH.includes(c) && !badCh.has(c)) badCh.set(c, `${x},${y}`); }));
  for (const [c, at] of badCh) err(`未知の文字 '${c}'（${at} など）`);
  if (H < R.minRows) err(`高さ ${H} 行（15行以上必要）`);
  if (!practice && (W < R.minLen || W > R.maxLen)) err(`長さ ${W} タイル（${R.minLen}〜${R.maxLen}）`);
  if (!practice) {
    if (!THEMES.includes(data.theme)) err(`theme '${data.theme}' が不明`);
    if (!TIMES.includes(data.timeOfDay)) err(`timeOfDay '${data.timeOfDay}' が不明`);
    if (data.timeFlow && (!Array.isArray(data.timeFlow) || data.timeFlow.some((t) => !TIMES.includes(t)))) err('timeFlow が不正');
    if (!Array.isArray(data.weathers) || !data.weathers.length) err('weathers がない');
    else for (const w of data.weathers) if (!WEATHERS.includes(w)) warn(`weathers '${w}' は未知の天気`);
    if (!data.bgm) warn('bgm がない');
  }

  const at = (x, y) => (x < 0 || x >= W) ? '#' : (y < 0 ? '.' : (y >= H ? '.' : (rows[y][x] ?? '.')));
  const ents = Array.isArray(data.entities) ? data.entities : [];

  // ---- エリア ----
  const areas = Array.isArray(data.areas) ? data.areas : [];
  if (!practice) {
    if (areas.length !== 4) err(`エリアが ${areas.length} 個（導入・展開・山場・ボスの4つ）`);
    areas.forEach((a, i) => {
      if (!a.name) err(`エリア ${i} に name がない`);
      if (!(a.x1 > a.x0)) err(`エリア ${i} の x0,x1 が不正`);
      if (i === 0 && a.x0 !== 0) err('最初のエリアは x0=0 から');
      if (i > 0 && areas[i - 1].x1 !== a.x0) err(`エリア ${i - 1} と ${i} の境目がずれている（${areas[i - 1].x1} / ${a.x0}）`);
    });
    if (areas.length && areas[areas.length - 1].x1 !== W) err(`最後のエリアの x1=${areas[areas.length - 1].x1} が右端 ${W} と違う`);
  }
  const areaOf = (x) => areas.findIndex((a) => x >= a.x0 && x < a.x1);

  // ---- エンティティの範囲・埋まり ----
  for (const e of ents) {
    const name = `${e.type}${e.kind ? '(' + e.kind + ')' : ''} @${e.x},${e.y}`;
    if (!e.type) { err('type のないエンティティ'); continue; }
    if (e.type === 'bossArena') {
      // x0 列＝入口の壁、x1 列＝奥の壁（どちらも含む）。y1＝床の一番下の行（src/bosses/arena.js）
      if (!(e.x0 >= 0 && e.x1 < W && e.x1 > e.x0 && e.y0 >= 0 && e.y1 < H && e.y1 > e.y0)) err(`bossArena の範囲が不正 ${JSON.stringify([e.x0, e.x1, e.y0, e.y1])}`);
      continue;
    }
    if (e.type === 'cameraZone') {
      if (!(e.x >= 0 && e.y >= 0 && e.x + e.w <= W && e.y + e.h <= H)) err(`cameraZone が範囲外 @${e.x},${e.y}`);
      continue;
    }
    if (REGION_TYPES.includes(e.type)) {
      const x0 = e.x0 ?? e.x, x1 = e.x1 ?? e.x;
      if (!(x0 >= 0 && x1 <= W)) err(`${e.type} が範囲外 x0=${x0} x1=${x1}`);
      continue;
    }
    if (!(Number.isFinite(e.x) && Number.isFinite(e.y))) { err(`${name}: 座標がない`); continue; }
    if (e.x < 0 || e.x >= W || e.y < 0 || e.y >= H) { err(`${name}: 範囲外`); continue; }
    if (POINT_TYPES.includes(e.type) && isSolidCh(at(Math.floor(e.x), Math.floor(e.y)))) err(`${name}: 壁に埋まっている`);
    if (e.type === 'gondola' && (e.x2 == null || e.y2 == null)) err(`${name}: gondola に x2,y2 がない`);
    if ((e.type === 'boat' || e.type === 'festivalFloat') && e.x2 == null) err(`${name}: ${e.type} に x2 がない`);
    if (ENEMY_TYPES.includes(e.type) && !e.kind) warn(`${name}: kind がない`);
    if (e.type === 'popper') {
      const c = at(e.x, e.y);
      const inRegion = ents.some((q) => (q.type === 'waterLevel' || q.type === 'risingLava') && e.x >= q.x0 && e.x < q.x1);
      if (c !== '~' && c !== 'L' && !inRegion) warn(`${name}: popper は水面 ~ か溶岩の表面 L のタイルに置く`);
    }
  }

  // ---- 必須要素 ----
  const of = (t) => ents.filter((e) => e.type === t);
  const starts = of('start'), cps = of('checkpoint'), sbs = of('sarubobo'), sks = of('skewer'), signs = of('sign'), arenas = of('bossArena');
  if (starts.length !== 1) err(`start が ${starts.length} 個（1個）`);
  if (!practice) {
    if (cps.length !== 2) err(`checkpoint が ${cps.length} 個（2個）`);
    const ci = cps.map((c) => c.index).sort();
    if (ci.join() !== '0,1') err(`checkpoint の index が ${JSON.stringify(ci)}（0,1）`);
    if (sbs.length !== 3) err(`sarubobo が ${sbs.length} 個（3個）`);
    const si = sbs.map((c) => c.index).sort();
    if (si.join() !== '0,1,2') err(`sarubobo の index が ${JSON.stringify(si)}（0,1,2）`);
    if (sks.length !== 1) err(`skewer（飛騨牛串）が ${sks.length} 個（1個）`);
    if (arenas.length !== 1) err(`bossArena が ${arenas.length} 個（1個）`);
    areas.forEach((a, i) => {
      const s = signs.filter((g) => g.x >= a.x0 && g.x < a.x1);
      if (!s.length && i < areas.length - 1) err(`エリア「${a.name}」に看板 sign がない`);
    });
    for (const s of signs) {
      if (!s.title || !s.text) err(`sign @${s.x},${s.y}: title と text が必要`);
      else if (s.text.length < 40 || s.text.length > 110) warn(`sign「${s.title}」の本文 ${s.text.length} 字（60〜90字程度）`);
    }
    const zones = of('cameraZone');
    if (zones.length < 1 || zones.length > 3) warn(`隠し部屋（cameraZone）が ${zones.length} 個（1〜2個）`);
    const inZone = (e) => zones.some((z) => e.x >= z.x && e.x < z.x + z.w && e.y >= z.y && e.y < z.y + z.h);
    if (!sbs.some(inZone)) warn('隠し部屋（cameraZone の中）にさるぼぼがない');
    if (!zones.some((z) => { for (let y = z.y; y < z.y + z.h; y++) for (let x = z.x; x < z.x + z.w; x++) if (at(x, y) === 'H' || at(x, y) === '%') return true; return false; })) warn('隠し部屋の入口（H または %）が見つからない');
    // 中間地点の位置
    const c0 = cps.find((c) => c.index === 0), c1 = cps.find((c) => c.index === 1);
    if (c0 && areas[1] && Math.abs(c0.x - areas[1].x0) > 15) warn(`checkpoint 0 は展開エリアの手前に（x=${c0.x}, 展開 x0=${areas[1].x0}）`);
    if (c0 && c1 && c0.x >= c1.x) err('checkpoint 0 が 1 より右にある');
    const A = arenas[0];
    if (A) {
      if (c1 && c1.x >= A.x0) err('checkpoint 1 はボス部屋の前に');
      if (c1 && A.x0 - c1.x > 40) warn(`checkpoint 1 がボス部屋から遠い（${A.x0 - c1.x} タイル）`);
      if (A.x1 - A.x0 + 1 !== 30) warn(`bossArena の幅 ${A.x1 - A.x0 + 1}（30タイル）`);
      if (A.x1 !== W - 1) warn('bossArena は右端に（x1 = 幅-1）');
      if (A.y1 - A.y0 + 1 < 15) warn(`bossArena の高さ ${A.y1 - A.y0 + 1} 行（画面固定には15行以上）`);
      // 床が平らか・中が広いか
      const floors = new Set();
      for (let x = A.x0 + 1; x < A.x1; x++) { let f = -1; for (let y = A.y0 + 1; y <= A.y1; y++) if (isSolidCh(at(x, y))) { f = y; break; } floors.add(f); }
      if (floors.size !== 1 || floors.has(-1)) err(`bossArena の床が平らでない（床の行 ${[...floors].join(',')}）`);
      else { const f = [...floors][0]; if (f - A.y0 < 9) warn(`bossArena の中の高さ ${f - A.y0} 行（広く）`); if (!isSolidCh(at(A.x1, f - 1))) warn('bossArena の奥（x1 列）は壁に'); }
      if (!BOSSES.includes(A.boss)) err(`bossArena の boss '${A.boss}' が不明`);
      const last = areas[areas.length - 1];
      if (last && !(A.x0 >= last.x0)) err('bossArena はボスエリアの中に');
    }
    // 飛騨牛串：先に敵の密集地帯
    for (const s of sks) {
      const n = ents.filter((e) => ENEMY_TYPES.includes(e.type) && e.x > s.x && e.x < s.x + 30).length;
      if (n < 3) warn(`skewer @${s.x},${s.y} の先30タイルに敵が ${n} 体（密集地帯の前に置く）`);
    }
  }

  // ---- 到達の探索（タイルのグラフ） ----
  // ノード：立てるマス（体2マスが空き・足元が床）、泳げるマス、仕掛けの足場（仮想）
  const N = W * H;
  const kind = new Uint8Array(N);   // 0:なし 1:立つ 2:泳ぐ 3:足場(仮想)
  const id = (x, y) => y * W + x;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = at(x, y);
    if (isWaterCh(c) && isOpenCh(at(x, y - 1)) ) { kind[id(x, y)] = 2; continue; }
    if (!isOpenCh(c) || !isOpenCh(at(x, y - 1))) continue;
    if (isFloorCh(at(x, y + 1)) || isSlopeCh(c)) kind[id(x, y)] = 1;
  }
  // 水位が変わる水域は最高水位まで泳げる
  for (const e of of('waterLevel')) {
    const top = Math.min(e.yLow ?? H, e.yHigh ?? H);
    for (let x = Math.max(0, e.x0); x < Math.min(W, e.x1); x++) for (let y = top; y < H && !isSolidCh(at(x, y)); y++) if (isOpenCh(at(x, y))) kind[id(x, y)] = kind[id(x, y)] || 2;
  }
  const rideLinks = [];   // 仮想足場どうしのつながり
  const addVirtual = (x, y) => { if (x >= 0 && x < W && y >= 0 && y < H && !isSolidCh(at(x, y))) { if (kind[id(x, y)] === 0) kind[id(x, y)] = 3; return id(x, y); } return -1; };
  const platformCols = new Set();
  for (const e of ents) {
    if (!PLATFORM_TYPES.includes(e.type) || !Number.isFinite(e.x)) continue;
    // 置き方（src/world/platforms.js）：x＝床の左端のタイル、y＝床の上面がくる行 → 立つマスは y-1
    // 跳ね台・湯気は足元中央がタイル (x,y)（他のエンティティと同じ）→ 立つマスは y
    const w = e.w || ({ gondola: 3, boat: 5, festivalFloat: 4, movingPlatform: 3, tightrope: 6 }[e.type] ?? 2);
    const lift = e.type === 'bouncer' ? Math.round(5 * (e.power ?? 1)) : e.type === 'steamVent' ? Math.round((e.h ?? 5) * Math.min(1.4, e.power ?? 1)) : R.liftTiles[e.type];
    let prev = null;
    if (lift) {
      for (let k = 0; k <= lift; k++) { const n = addVirtual(e.x, e.y - k); if (n >= 0) { if (prev != null) rideLinks.push([prev, n]); prev = n; } platformCols.add(e.x); }
      continue;
    }
    if (e.type === 'lantern') continue;
    const sy = e.y - 1;
    let x2 = e.x, y2 = sy;
    if (e.type === 'movingPlatform') { x2 = e.x + (e.dx || 0); y2 = sy + (e.dy || 0); if (!e.dx && !e.dy) x2 = e.x + 4; }
    if (e.type === 'gondola') { x2 = e.x2 ?? e.x + 10; y2 = (e.y2 ?? e.y - 4) - 1; }
    if (e.type === 'boat' || e.type === 'festivalFloat') { x2 = e.x2 ?? e.x + 20; }
    const steps = Math.max(Math.abs(x2 - e.x), Math.abs(y2 - sy), 1);
    for (let s = 0; s <= steps; s++) {
      const cx = Math.round(e.x + (x2 - e.x) * s / steps), cy = Math.round(sy + (y2 - sy) * s / steps);
      let rowPrev = null;
      for (let i = 0; i < w; i++) {
        const n = addVirtual(cx + i, cy);
        platformCols.add(cx + i);
        if (n < 0) continue;
        if (rowPrev != null) rideLinks.push([rowPrev, n]);
        if (prev != null) rideLinks.push([prev, n]);
        rowPrev = n;
      }
      if (rowPrev != null) prev = rowPrev;
    }
  }
  const adj = new Map();
  for (const [a, b] of rideLinks) { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }

  const open = (x, y) => isOpenCh(at(x, y));
  // 横に移動する通路（体の2マス）が空いているか
  const corridor = (xa, xb, y) => { const s = Math.sign(xb - xa); for (let x = xa; x !== xb + s; x += s) { if (!open(x, y) || !open(x, y - 1)) return false; } return true; };
  const colOpen = (x, ya, yb) => { for (let y = Math.min(ya, yb); y <= Math.max(ya, yb); y++) if (!open(x, y)) return false; return true; };

  const seen = new Uint8Array(N);
  const from = new Int32Array(N).fill(-1);
  const queue = [];
  let st = starts[0];
  if (st) {
    let sy = Math.floor(st.y);
    while (sy < H && !kind[id(st.x, sy)]) sy++;
    if (sy < H) { seen[id(st.x, sy)] = 1; queue.push(id(st.x, sy)); }
    else err('start の下に立てる場所がない');
  }
  const visit = (n, p) => { if (!seen[n]) { seen[n] = 1; from[n] = p; queue.push(n); } };
  for (let qi = 0; qi < queue.length; qi++) {
    const n = queue[qi];
    const x = n % W, y = (n / W) | 0;
    const k = kind[n];
    for (const m of adj.get(n) || []) visit(m, n);
    if (k === 2) {   // 泳ぐ：上下左右へ
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < W && yy >= 0 && yy < H && kind[id(xx, yy)] && open(xx, yy)) visit(id(xx, yy), n); }
      if (isWaterCh(at(x, y - 1))) continue;    // 水面でなければ跳べない
    }
    // 上へ跳ぶ（0〜3段）
    for (let up = 0; up <= R.maxStep; up++) {
      const ty = y - up;
      if (ty < 1) break;
      if (up > 0 && !colOpen(x, ty - 1, y - 1)) break;
      const maxDx = R.jumpDx[up];
      for (const dir of [1, -1]) for (let dx = up === 0 ? 1 : 0; dx <= maxDx; dx++) {
        const tx = x + dir * dx;
        if (tx < 0 || tx >= W) break;
        if (!corridor(x, tx, ty)) break;
        const m = id(tx, ty);
        if (kind[m]) visit(m, n);
      }
    }
    // 横へ出て落ちる
    for (const dir of [1, -1]) for (let dx = 1; dx <= R.fallDxMax; dx++) {
      const tx = x + dir * dx;
      if (tx < 0 || tx >= W) break;
      if (!corridor(x, tx, y)) break;
      if (kind[id(tx, y)] && dx <= R.jumpDx[0]) continue;   // 同じ高さは上で処理済み
      for (let yy = y + 1; yy < H; yy++) {
        if (!open(tx, yy)) break;
        const m = id(tx, yy);
        if (kind[m]) { if (dx <= R.jumpDx[0] + Math.floor((yy - y) / 2)) visit(m, n); break; }
      }
    }
  }
  stats.reached = queue.length;
  const reached = (x, y) => x >= 0 && x < W && y >= 0 && y < H && seen[id(x, y)];
  // アイテムに手が届くか：近くの到達マスから3マス以内に頭上が空いている
  const touchable = (ex, ey) => {
    ex = Math.round(ex); ey = Math.round(ey);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= R.maxStep + 1; dy++) {
      const x = ex + dx, y = ey + dy;
      if (reached(x, y) && colOpen(x, ey, y)) return true;
    }
    return false;
  };
  let reachedCount = 0; for (let i = 0; i < N; i++) if (seen[i]) reachedCount++;
  stats.reachedCells = reachedCount;

  if (st) {
    const A = arenas[0];
    if (A) {
      let ok = false;
      for (let y = 0; y < H && !ok; y++) for (let x = A.x0 + 1; x < A.x1; x++) if (reached(x, y)) { ok = true; break; }
      if (!ok) {
        let best = 0, by = 0; for (let i = 0; i < N; i++) if (seen[i] && i % W > best) { best = i % W; by = (i / W) | 0; }
        err(`start からボス部屋に届かない（ゲンで到達できる最も右は x=${best}, y=${by}）`);
      }
    }
    for (const t of ['goal']) for (const e of of(t)) if (!touchable(e.x, e.y)) err(`${t} @${e.x},${e.y} に届かない`);
    for (const t of ['sarubobo', 'checkpoint', 'skewer', 'sign']) {
      for (const e of of(t)) if (!touchable(e.x, e.y)) err(`${t}${e.index != null ? ' ' + e.index : ''} @${e.x},${e.y} にゲンで届かない`);
    }
  }

  // ---- 穴（落ちると即ミス）：幅と着地点 ----
  // 落ちるとミスの列：一番下が空いている、または溶岩の表面より上に立てる所がない
  const lavaCol = (x) => { let top = -1; for (let y = 0; y < H; y++) if (isLavaCh(at(x, y))) { top = y; break; } if (top < 0) return false; for (let y = 0; y < top; y++) if (kind[id(x, y)] === 1) return false; return true; };
  const pitCol = (x) => { const c = at(x, H - 1); return (!isSolidCh(c) && !isSlopeCh(c) && !isWaterCh(c)) || lavaCol(x); };
  const supportCol = (x) => { if (platformCols.has(x)) return true; for (let y = 1; y < H - 1; y++) if (kind[id(x, y)] === 1 || kind[id(x, y)] === 2) return true; return false; };
  const pits = [];
  for (let x = 0; x < W; x++) {
    if (!pitCol(x)) continue;
    let r = x; while (r + 1 < W && pitCol(r + 1)) r++;
    pits.push([x, r]);
    x = r;
  }
  stats.pits = pits.length;
  for (const [l, r] of pits) {
    let run = 0, worst = 0;
    for (let x = l; x <= r; x++) { if (supportCol(x) && !isLavaCh(at(x, H - 1))) { run = 0; continue; } run++; worst = Math.max(worst, run); }
    // 足場の無い列が続く幅
    let bare = 0, worstBare = 0;
    for (let x = l; x <= r; x++) { let any = platformCols.has(x); for (let y = 1; y < H - 1 && !any; y++) if (kind[id(x, y)] === 1) any = true; if (any) bare = 0; else { bare++; worstBare = Math.max(worstBare, bare); } }
    if (worstBare > R.maxGap) err(`穴の幅 ${worstBare} タイル（x=${l}〜${r}）。${R.maxGap} 以内か、動く床・足場を置く`);
    // 先の着地点：右隣2列に同じ高さの平らな床
    const c = r + 1;
    if (c >= W - 1) { err(`穴（x=${l}〜${r}）の先に着地できる場所がない`); continue; }
    let flat = false;
    for (let y = 1; y < H - 1; y++) {
      if (kind[id(c, y)] === 1 && kind[id(c + 1, y)] === 1 && !isSlopeCh(at(c, y)) && !isSlopeCh(at(c + 1, y)) && !isSlopeCh(at(c, y + 1)) && !isSlopeCh(at(c + 1, y + 1))) { flat = true; break; }
      if (platformCols.has(c) && platformCols.has(c + 1)) { flat = true; break; }
    }
    if (!flat) err(`穴（x=${l}〜${r}）の先 x=${c} に平らな着地点（幅2）がない`);
  }

  // ---- 段差（空が見える地表で、上り3タイルを超える崖）----
  for (let i = 0; i < areas.length; i++) {
    const a = areas[i];
    if (a.tall) continue;
    const surf = (x) => { for (let y = 1; y < H; y++) { if (kind[id(x, y)] === 1) return y; if (!open(x, y) && !isWaterCh(at(x, y))) return -1; } return -1; };
    for (let x = Math.max(0, a.x0); x < Math.min(W - 1, a.x1); x++) {
      const s0 = surf(x), s1 = surf(x + 1);
      if (s0 < 0 || s1 < 0) continue;
      const rise = s0 - s1;
      // 道が行き止まりになっている所だけ（崖の手前までは来られるのに、その先の列に一つも届かない）
      const blocked = reached(x, s0) && ![1, 2, 3].some((d) => { for (let y = 0; y < H; y++) if (reached(x + d, y)) return true; return false; });
      if (rise > R.maxStep && blocked && !(open(x + 1, s0) && open(x + 1, s0 - 1)) && !reached(x + 1, s1) && !platformCols.has(x + 1) && !platformCols.has(x)) {
        err(`段差 ${rise} タイル（x=${x}→${x + 1}, y=${s0}→${s1}）が登れない`);
      }
    }
  }

  // ---- 敵の種類 ----
  const kinds = { 1: ['uribo', 'karasu', 'iga', 'saru', 'inoshishi'], 2: ['sawagani', 'kajika', 'tonbo', 'ayu'], 3: ['chochin', 'uchiwa', 'geta', 'kappa'], 4: ['karakuri', 'tako', 'hanabi', 'shishi'], 5: ['yukidama', 'yukiusagi', 'koritoge', 'yukigumo'], 6: ['hinotama', 'yogangaeru', 'komori', 'iwanage', 'hibashira', 'kamoshika'] };
  const allowed = kinds[data.id];
  if (allowed) for (const e of ents) if (ENEMY_TYPES.includes(e.type) && e.kind && !allowed.includes(e.kind)) warn(`${e.type}(${e.kind}) @${e.x},${e.y} はこのステージの敵の見た目ではない`);
  stats.enemies = ents.filter((e) => ENEMY_TYPES.includes(e.type)).length;
  stats.coins = rows.reduce((s, r) => s + [...r].filter((c) => c === 'o').length, 0) + of('coin').length;

  // 到達できる最短の道（エディタで表示する）
  stats.path = [];
  if (arenas[0]) {
    let end = -1;
    for (let i = 0; i < N && end < 0; i++) if (seen[i] && i % W > arenas[0].x0) end = i;
    for (let n = end, g = 0; n >= 0 && g < N; n = from[n], g++) stats.path.push([n % W, (n / W) | 0]);
    stats.path.reverse();
  }
  stats.reachedMask = seen;
  return { errors, warnings, stats };
}
