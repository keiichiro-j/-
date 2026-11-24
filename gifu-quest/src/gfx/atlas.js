import { makeCanvas } from './renderer.js';
// 絵素材の一括画像（設計書 2章・8章）。
// art/*.js が defineSprite で「コードで描く絵」を登録 → 起動時に2倍解像度でアトラスへ焼き付ける。
// assets/ に同名PNG＋JSONがあれば（ビルド時に window.__GQ_ASSETS__ へ埋め込み）そちらを優先する。
export const BAKE_SCALE = 2;
const PAGE = 2048;
const defs = new Map();     // name -> def
const sprites = new Map();  // name -> { img, frames:[{sx,sy,sw,sh}], w, h, ox, oy }
const pages = [];
let shelf = null;

/**
 * @param {string} name
 * @param {{w:number,h:number,frames?:number,ox?:number,oy?:number,draw:(ctx:CanvasRenderingContext2D, frame:number, def:object)=>void}} def
 *   w,h: 1コマの論理サイズ。ox,oy: 基準点（既定は足元中央 w/2,h）。draw は (0,0)-(w,h) に描く。
 */
export function defineSprite(name, def) {
  defs.set(name, { frames: 1, ox: def.w / 2, oy: def.h, ...def, name });
  sprites.delete(name);
}
export function hasSprite(name) { return defs.has(name) || sprites.has(name); }
export function spriteInfo(name) { return sprites.get(name) || defs.get(name); }

function alloc(w, h) {
  if (!shelf || shelf.x + w > PAGE) {
    if (shelf) { shelf.y += shelf.rowH + 2; shelf.x = 0; shelf.rowH = 0; }
  }
  if (!shelf || shelf.y + h > PAGE) {
    const c = makeCanvas(PAGE, PAGE);
    pages.push(c);
    shelf = { c, ctx: c.getContext('2d'), x: 0, y: 0, rowH: 0 };
  }
  const r = { c: shelf.c, ctx: shelf.ctx, x: shelf.x, y: shelf.y };
  shelf.x += w + 2;
  shelf.rowH = Math.max(shelf.rowH, h);
  return r;
}

function bakeOne(def) {
  const sw = Math.ceil(def.w * BAKE_SCALE), sh = Math.ceil(def.h * BAKE_SCALE);
  const frames = [];
  let img = null;
  for (let f = 0; f < def.frames; f++) {
    const r = alloc(sw, sh);
    img = r.c;
    const ctx = r.ctx;
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, sw, sh); ctx.clip();
    ctx.translate(r.x, r.y);
    ctx.scale(BAKE_SCALE, BAKE_SCALE);
    try { def.draw(ctx, f, def); } catch (e) { console.error('sprite draw failed', def.name, e); }
    ctx.restore();
    frames.push({ img: r.c, sx: r.x, sy: r.y, sw, sh });
  }
  sprites.set(def.name, { frames, w: def.w, h: def.h, ox: def.ox, oy: def.oy, img });
}

function loadOverrides() {
  const A = (typeof window !== 'undefined' && window.__GQ_ASSETS__) || {};
  const jobs = [];
  for (const [name, a] of Object.entries(A)) {
    jobs.push(new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const frames = a.frames.map((f) => ({ img, sx: f.x, sy: f.y, sw: f.w, sh: f.h }));
        sprites.set(name, { frames, w: a.w, h: a.h, ox: a.ox ?? a.w / 2, oy: a.oy ?? a.h, override: true });
        res();
      };
      img.onerror = res;
      img.src = a.png;
    }));
  }
  return Promise.all(jobs);
}

// 分割して裏で焼き付ける（1回あたり budgetMs）。onProgress(0..1)
export async function bakeAll(onProgress, budgetMs = 10, only = null) {
  await loadOverrides();
  const list = [...defs.values()].filter((d) => !sprites.has(d.name) && (!only || only(d.name)));
  let i = 0;
  while (i < list.length) {
    const t0 = performance.now();
    while (i < list.length && performance.now() - t0 < budgetMs) bakeOne(list[i++]);
    onProgress && onProgress(i / list.length);
    if (i < list.length) await new Promise((r) => setTimeout(r, 0));
  }
}
export function bakeSync(name) { const d = defs.get(name); if (d) bakeOne(d); }

/**
 * x,y は基準点（既定：足元中央）の位置。opts: { flip, sx, sy, rot, alpha, frame }
 */
export function drawSprite(ctx, name, frame, x, y, opts) {
  let s = sprites.get(name);
  if (!s) { if (defs.has(name)) { bakeOne(defs.get(name)); s = sprites.get(name); } }
  if (!s) {
    // 未登録：マゼンタの四角（見つけやすい）。名前は一度だけ警告し、missingSprites() で一覧できる
    if (!missing.has(name)) { missing.add(name); console.warn('drawSprite: unknown sprite', name); }
    ctx.fillStyle = '#f0f'; ctx.fillRect(x - 8, y - 16, 16, 16); return;
  }
  const fr = s.frames[((frame | 0) % s.frames.length + s.frames.length) % s.frames.length];
  const flip = opts && opts.flip, sx = (opts && opts.sx) || 1, sy = (opts && opts.sy) || 1;
  const rot = (opts && opts.rot) || 0, alpha = opts && opts.alpha !== undefined ? opts.alpha : 1;
  if (!flip && sx === 1 && sy === 1 && !rot && alpha === 1) {
    ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, x - s.ox, y - s.oy, s.w, s.h);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.scale(flip ? -sx : sx, sy);
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -s.ox, -s.oy, s.w, s.h);
  ctx.restore();
}
const missing = new Set();
export function missingSprites() { return [...missing]; }
export function spriteNames() { return [...defs.keys()]; }
export function atlasPages() { return pages; }
