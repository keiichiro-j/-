// levels/*.json はビルド時に仮想モジュール gq:levels として埋め込まれる（build.mjs）
import ALL from 'gq:levels';
export const LEVELS = {};
for (const [k, v] of Object.entries(ALL)) {
  const m = k.match(/stage(\w+)/);
  if (!m) continue;
  const id = /^\d+$/.test(m[1]) ? Number(m[1]) : m[1];
  LEVELS[id] = v;
}
if (LEVELS[0]) LEVELS.test = LEVELS[0];
