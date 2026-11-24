// ステージを手で組み立てるための部品集（乱数は使わない）。
// 座標はタイル。y は上から下へ増える。「床の行 f」＝いちばん上の固いタイルの行（立つ位置は f-1）。
// エンティティの (x,y) は「足元中央がタイル (x,y) の底辺中央」（docs/ARCHITECTURE.md）。
// つまり床 f の上に立たせるときは y = f-1。

export class Stage {
  constructor({ id, name, theme, width, height, timeOfDay = 'day', timeFlow, weathers, bgm, ground = '#', fill }) {
    this.meta = { id, name, theme, timeOfDay, timeFlow, weathers, bgm: bgm || `stage${id}` };
    this.W = width; this.H = height;
    this.g = Array.from({ length: height }, () => new Array(width).fill('.'));
    this.entities = [];
    this.areas = [];
    this.ch = ground;           // 地面の文字
    this.fillCh = fill || ground; // 地面の中身の文字
    this.x = 0;                 // カーソル（次に作る列）
    this.f = height - 4;        // カーソルの床の行
  }

  // ---- タイル ----
  in(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }
  get(x, y) { return this.in(x, y) ? this.g[y][x] : '#'; }
  set(x, y, c) { if (this.in(x, y)) this.g[y][x] = c; return this; }
  // 長方形（両端を含む）
  rect(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c); return this; }
  clear(x0, y0, x1, y1) { return this.rect(x0, y0, x1, y1, '.'); }
  // 列 x の y から下を埋める（表面は top 文字、中身は fill）
  column(x, y, top = this.ch, fill = this.fillCh) { for (let yy = y; yy < this.H; yy++) this.set(x, yy, yy === y ? top : fill); return this; }
  // 横一列（通り抜け足場・屋根など）
  row(x0, x1, y, c = '-') { for (let x = x0; x <= x1; x++) this.set(x, y, c); return this; }
  // 文字列の絵をそのまま置く（'?' は置かない）
  stamp(x0, y0, lines) { lines.forEach((ln, dy) => [...ln].forEach((c, dx) => { if (c !== '?') this.set(x0 + dx, y0 + dy, c); })); return this; }

  // ---- カーソルで地形を進める ----
  flat(n, opt = {}) { for (let i = 0; i < n; i++) this.column(this.x + i, this.f, opt.top || this.ch, opt.fill || this.fillCh); this.x += n; return this; }
  gap(n) { this.x += n; return this; }                    // 穴（何も置かない）
  pool(n, depth = 3, c = 'w', top = '~') {               // 水たまり：深さ depth の水を張った窪み
    for (let i = 0; i < n; i++) { const x = this.x + i; this.set(x, this.f, top); for (let d = 1; d < depth; d++) this.set(x, this.f + d, c); this.column(x, this.f + depth); }
    this.x += n; return this;
  }
  lava(n, depth = 2) { return this.pool(n, depth, 'l', 'L'); }
  step(dy) { this.f += dy; return this; }                // 段差（負で上へ）
  to(f) { this.f = f; return this; }
  up45(n) { for (let i = 0; i < n; i++) { const x = this.x + i; this.column(x, this.f - i, '/'); } this.x += n; this.f -= n; return this; }
  down45(n) { for (let i = 0; i < n; i++) { const x = this.x + i; this.column(x, this.f + i, '\\'); } this.x += n; this.f += n; return this; }
  up22(n) {
    for (let i = 0; i < n; i++) { const x = this.x + i * 2; this.column(x, this.f - 1 - i, 'a'); this.column(x + 1, this.f - 1 - i, 'b'); }
    this.x += n * 2; this.f -= n; return this;
  }
  down22(n) {
    for (let i = 0; i < n; i++) { const x = this.x + i * 2; this.column(x, this.f + i, 'c'); this.column(x + 1, this.f + i, 'd'); }
    this.x += n * 2; this.f += n; return this;
  }
  // 合掌造りの急な屋根（滑り台）：右下がり。top 行から n 段
  slideR(x, top, n, under = this.fillCh) { for (let i = 0; i < n; i++) { this.set(x + i, top + i, '>'); for (let y = top + i + 1; y < top + n; y++) this.set(x + i, y, under); } return this; }
  slideL(x, top, n, under = this.fillCh) { for (let i = 0; i < n; i++) { this.set(x - i, top + i, '<'); for (let y = top + i + 1; y < top + n; y++) this.set(x - i, y, under); } return this; }

  // ---- コイン ----
  coin(x, y) { if (this.get(x, y) === '.') this.set(x, y, 'o'); return this; }
  coins(x0, x1, y) { for (let x = x0; x <= x1; x++) this.coin(x, y); return this; }
  coinCol(x, y0, y1) { for (let y = y0; y <= y1; y++) this.coin(x, y); return this; }
  // 跳ぶ軌道の放物線：(x0,y0) から (x1,y1) へ、頂点は高い方の端より h 上
  arc(x0, y0, x1, y1, h = 2) {
    const n = Math.abs(x1 - x0);
    const top = Math.min(y0, y1) - h;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + Math.sign(x1 - x0) * i;
      // 2次ベジェ：始点・頂点・終点
      const py = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * (top - (h * 0.5)) + t * t * y1;
      this.coin(x, Math.round(py));
    }
    return this;
  }

  // ---- エンティティ ----
  ent(type, x, y, props = {}) { this.entities.push({ type, x, y, ...props }); return this; }
  start(x, y) { return this.ent('start', x, y); }
  checkpoint(index, x, y) { return this.ent('checkpoint', x, y, { index }); }
  sarubobo(index, x, y, note) { return this.ent('sarubobo', x, y, { index, note }); }
  sign(id, x, y, title, text) { return this.ent('sign', x, y, { id, title, text }); }
  enemy(type, kind, x, y, props = {}) { return this.ent(type, x, y, { kind, ...props }); }
  decor(sprite, x, y, props = {}) { return this.ent('decor', x, y, { sprite, z: -5, ...props }); }
  // 隠し部屋：外枠を固いタイルで作り、中を空ける。入口は呼ぶ側で H などにする
  room(x0, y0, x1, y1, wall = this.fillCh) {
    this.rect(x0, y0, x1, y1, wall);
    this.clear(x0 + 1, y0 + 1, x1 - 1, y1 - 1);
    this.ent('cameraZone', x0, y0, { w: x1 - x0 + 1, h: y1 - y0 + 1 });
    return this;
  }
  // ボス部屋（右端、幅30）。x0 列は入口の壁（床の上3マスが入口）、x1 列は奥の壁。床は平ら
  // spec は src/bosses/arena.js：x0,x1 は壁の列（含む）、y1 は床の一番下の行
  arena(boss, f, { wall = 'S', floor = this.ch, fill = this.fillCh, headroom = 12, gateWall = true } = {}) {
    const x0 = this.W - 30, x1 = this.W - 1, y0 = Math.max(0, f - headroom);
    const y1 = Math.min(this.H - 1, y0 + 14);   // 画面固定の範囲がちょうど15行になるように
    this.clear(x0, 0, x1, f - 1);
    for (let x = x0; x <= x1; x++) this.column(x, f, floor, fill);
    if (gateWall) this.rect(x0, y0, x0, f - 4, wall);
    this.rect(x1, 0, x1, f - 1, wall);
    this.entities.push({ type: 'bossArena', x0, x1, y0, y1, boss });
    this.x = this.W; this.f = f;
    return { x0, x1, y0 };
  }
  area(name, x0, x1, tall = false) { this.areas.push(tall ? { name, x0, x1, tall: true } : { name, x0, x1 }); return this; }

  toJSON() {
    const m = this.meta;
    const out = { id: m.id, name: m.name, theme: m.theme, timeOfDay: m.timeOfDay };
    if (m.timeFlow) out.timeFlow = m.timeFlow;
    out.weathers = m.weathers; out.bgm = m.bgm;
    out.areas = this.areas;
    out.tiles = this.g.map((r) => r.join(''));
    // note は設計メモ（ゲームでは使わない）なので残してよいが、出力を短くするため消す
    out.entities = this.entities.map((e) => { const o = { ...e }; delete o.note; return o; });
    return out;
  }
}

// JSON を「1エンティティ1行」で読みやすく書き出す
export function stringify(data) {
  const lines = ['{'];
  const keys = Object.keys(data);
  keys.forEach((k, i) => {
    const comma = i < keys.length - 1 ? ',' : '';
    const v = data[k];
    if (k === 'tiles') lines.push(` "tiles": [\n${v.map((r) => '  ' + JSON.stringify(r)).join(',\n')}\n ]${comma}`);
    else if (k === 'entities' || k === 'areas') lines.push(` "${k}": [\n${v.map((e) => '  ' + JSON.stringify(e)).join(',\n')}\n ]${comma}`);
    else lines.push(` ${JSON.stringify(k)}: ${JSON.stringify(v)}${comma}`);
  });
  lines.push('}');
  return lines.join('\n') + '\n';
}
