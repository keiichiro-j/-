import { PHYS, TILE } from '../core/config.js';
import { LeafShot, UkaiBird, Slash } from './projectiles.js';
import { isBreakable } from '../world/tiles.js';

// 各キャラの技と固有の能力（設計書 4章）
const leafTech = (p, w) => {
  w.spawn(new LeafShot(w, p, false));
  p.techCd = p.techMax; p.attackAnim = 0.2; p.attackAlt = false; w.sfx('shoot');
};
const minamoTech = (p, w) => {
  w.spawn(new UkaiBird(w, p));
  p.techCd = p.techMax; p.attackAnim = 0.2; p.attackAlt = false; w.sfx('bird');
};
const genTech = (p, w) => {
  w.spawn(new Slash(w, p));
  p.techCd = p.techMax; p.attackAnim = 0.22; p.attackAlt = !p.attackAlt; w.sfx('slash');
};
const hakuTech = (p, w) => {
  if (!p.onGround && p.dashUsed) return;
  if (!p.onGround) p.dashUsed = true;
  p.dashT = 0.26; p.onGroundAtDash = p.onGround;
  p.vx = p.face * p.stats.dash * 1.55; p.vy = p.onGround ? p.vy : 0;
  p.techCd = p.techMax; p.attackAnim = 0;
  p.sx = 1.25; p.sy = 0.85;
  w.particles.burst(p.cx, p.y + p.h - 6, 12, { angle: p.face > 0 ? Math.PI : 0, spread: 0.8, speed: 200, life: 0.5, size: 6, size1: 1, color: '#f4f9ff', drag: 3 });
  w.sfx('dash');
};

export const ABILITIES = {
  leaf: { skills: ['wallKick'], tech: leafTech, charged: (p, w) => { w.spawn(new LeafShot(w, p, true)); p.attackAnim = 0.25; p.attackAlt = true; w.sfx('shootBig'); } },
  minamo: { skills: ['glide', 'swim'], tech: minamoTech },
  gen: { skills: ['heavyStomp', 'breakBricks'], tech: genTech },
  haku: { skills: ['doubleJump', 'noSlip'], tech: hakuTech },
  sarubobo: {
    skills: ['wallKick', 'glide', 'swim', 'heavyStomp', 'breakBricks', 'doubleJump', 'noSlip'],
    tech: (p, w) => { [leafTech, minamoTech, genTech, hakuTech][p.techIndex % 4](p, w); p.techIndex++; },
  },
};

// 主人公の攻撃が敵に当たったか調べる。rect と重なる敵に dmg を与える。戻り値: 当たった数
export function hitEnemies(w, rect, dmg, source, { once = null, cancelHazards = false } = {}) {
  let n = 0;
  for (const e of w.entities) {
    if (!e.alive) continue;
    if (cancelHazards && e.hazard && e.cancelable && overlap(rect, e)) { e.cancel ? e.cancel() : e.remove(); w.particles.hit(e.cx, e.cy, '#cfe8ff'); n++; continue; }
    if (!e.enemy) continue;
    if (once && once.has(e)) continue;
    const r = e.hurtRect();
    if (!overlap(rect, r)) continue;
    if (e.shielded && e.shielded(source, rect)) { once && once.add(e); w.sfx('clang'); w.particles.hit(e.cx, e.cy, '#ddd'); if (source.blocked) source.blocked(e); continue; }
    if (e.damage(dmg, source)) {
      n++;
      once && once.add(e);
      w.onEnemyHit(e, dmg);
    }
  }
  return n;
}
export function breakTilesIn(w, rect) {
  const tx0 = Math.floor(rect.x / TILE), tx1 = Math.floor((rect.x + rect.w - 0.01) / TILE);
  const ty0 = Math.floor(rect.y / TILE), ty1 = Math.floor((rect.y + rect.h - 0.01) / TILE);
  let n = 0;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (isBreakable(w.level.get(tx, ty))) { w.breakTile(tx, ty); n++; }
  return n;
}
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
