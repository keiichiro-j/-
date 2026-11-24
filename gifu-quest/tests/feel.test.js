// ゲームフィール（手触り・わかりやすさ）の確認：はじめての案内・装いの持ち方
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { heroAnchor } from '../src/art/heroes.js';
import { holdFor } from '../src/art/heroGear.js';
import { HERO_ANIMS } from '../src/actors/player.js';
import WEAPONS from '../src/data/weapons.json';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const HELD_SCALE = { fan: 0.4, umbrella: 0.48, hammer: 0.5, axe: 0.5, torch: 0.52, baton: 0.5, spade: 0.5, staff: 0.55 };

describe('はじめて遊ぶ人への案内（hint）', () => {
  it('ステージ1の導入に、移動・ジャンプ・技・ダッシュ・降りる・看板の案内がある', () => {
    const L = JSON.parse(fs.readFileSync(path.join(root, 'levels/stage1.json'), 'utf8'));
    const ids = L.entities.filter((e) => e.type === 'hint').map((e) => e.id);
    expect(ids.sort()).toEqual(['attack', 'dash', 'drop', 'jump', 'move', 'sign']);
    for (const e of L.entities.filter((q) => q.type === 'hint')) expect(e.x).toBeLessThan(73);   // 導入エリアの中
  });
});

describe('装い：手に持った武器が顔にかからない', () => {
  const ids = ['leaf', 'minamo', 'gen', 'haku', 'sarubobo'];
  const kinds = [...new Set(WEAPONS.weapons.map((w) => w.kind))];
  it('全キャラ×全アニメ×全コマ×全形：顔にかかる向きなら、向きを変えるか頭の後ろに回す', () => {
    for (const id of ids) for (const [anim, A] of Object.entries(HERO_ANIMS)) for (let f = 0; f < A.frames; f++) {
      const P = heroAnchor(id, anim, f);
      expect(P.head, `${id} ${anim}`).toBeTruthy();
      for (const kind of kinds) {
        const H = holdFor(id, anim, f, P, kind, HELD_SCALE[kind] || 0.58);
        expect(Number.isFinite(H.ang)).toBe(true);
        if (!H.behind) {
          // 握りから先の点が頭の円に入っていない
          const L = kind === 'fan' ? 9 : 20 * (HELD_SCALE[kind] || 0.58);
          const tx = P.hand.x + Math.cos(H.ang) * L, ty = P.hand.y + Math.sin(H.ang) * L;
          expect(Math.hypot(tx - P.head.x, ty - P.head.y), `${id} ${anim} ${f} ${kind}`).toBeGreaterThan(P.hr * 0.9);
        }
      }
    }
  });
  it('勝利ポーズで腕を上げたコマは、扇を頭の後ろから掲げる', () => {
    const P = heroAnchor('leaf', 'win', 1);
    const H = holdFor('leaf', 'win', 1, P, 'fan', 0.4);
    expect(H.behind).toBe(true);
    expect(H.ang).toBeLessThan(-1);   // 上向き
  });
});
