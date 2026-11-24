// すべての「コードで描く絵」を登録する
import { defineHeroes } from './heroes.js';
import { defineEnemies } from './enemies.js';
import { defineProps } from './props.js';
import { defineBossArt } from './bosses.js';
import { defineWeaponArt } from './weapons.js';
export function defineAllArt() {
  defineHeroes();
  defineEnemies();
  defineProps();
  defineBossArt();
  defineWeaponArt();
}
