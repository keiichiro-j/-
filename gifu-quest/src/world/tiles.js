import { TILE } from '../core/config.js';
// タイルの種類（設計書 5章「当たり判定」）。レベルJSONの1文字 → タイルID
export const T = {
  EMPTY: 0, GROUND: 1, BRICK: 2, CRACK: 3, ONEWAY: 4,
  SLOPE_UR: 5, SLOPE_DR: 6,           // 45度：右上がり / 右下がり
  SLOPE_UR_LO: 7, SLOPE_UR_HI: 8,     // 22.5度 右上がり（低い半分 / 高い半分）
  SLOPE_DR_HI: 9, SLOPE_DR_LO: 10,    // 22.5度 右下がり（高い半分 / 低い半分）
  ICE: 11, SPIKE: 12, WATER_TOP: 13, WATER: 14, LAVA_TOP: 15, LAVA: 16,
  FAKE: 17,      // 見た目は壁、通り抜けられる（隠し部屋の入口）
  STONE: 18,     // 石垣
  ROOF: 19,      // 屋根瓦
  WOOD: 20,      // 木の床・板
  SNOW: 21,      // 雪の地面
  ROOF_SLIDE_R: 22, ROOF_SLIDE_L: 23, // 合掌造りの急な屋根（滑り台、45度。右下がり/左下がり）
};

export const CHAR_TO_TILE = {
  '.': T.EMPTY, ' ': T.EMPTY,
  '#': T.GROUND, 'B': T.BRICK, '%': T.CRACK, '-': T.ONEWAY,
  '/': T.SLOPE_UR, '\\': T.SLOPE_DR, 'a': T.SLOPE_UR_LO, 'b': T.SLOPE_UR_HI, 'c': T.SLOPE_DR_HI, 'd': T.SLOPE_DR_LO,
  'I': T.ICE, '^': T.SPIKE, '~': T.WATER_TOP, 'w': T.WATER, 'L': T.LAVA_TOP, 'l': T.LAVA,
  'H': T.FAKE, 'S': T.STONE, 'R': T.ROOF, 'W': T.WOOD, 'N': T.SNOW, '>': T.ROOF_SLIDE_R, '<': T.ROOF_SLIDE_L,
};
// 文字のうちタイルでなくエンティティになるもの（読み込み時に変換）
export const CHAR_TO_ENTITY = { 'o': 'coin' };

const SOLID = new Set([T.GROUND, T.BRICK, T.CRACK, T.ICE, T.STONE, T.ROOF, T.WOOD, T.SNOW]);
const SLOPES = new Set([T.SLOPE_UR, T.SLOPE_DR, T.SLOPE_UR_LO, T.SLOPE_UR_HI, T.SLOPE_DR_HI, T.SLOPE_DR_LO, T.ROOF_SLIDE_R, T.ROOF_SLIDE_L]);

export const isSolid = (t) => SOLID.has(t);
export const isSlope = (t) => SLOPES.has(t);
export const isOneWay = (t) => t === T.ONEWAY;
export const isWater = (t) => t === T.WATER || t === T.WATER_TOP;
export const isLava = (t) => t === T.LAVA || t === T.LAVA_TOP;
export const isHazard = (t) => t === T.SPIKE;
export const isBreakable = (t) => t === T.BRICK || t === T.CRACK;
export const isSlippery = (t) => t === T.ICE;
export const isSlide = (t) => t === T.ROOF_SLIDE_R || t === T.ROOF_SLIDE_L;

// 坂の床の高さ（タイル下端から、0..TILE）。lx はタイル内のx（0..TILE）
export function slopeHeight(t, lx) {
  const u = Math.min(Math.max(lx / TILE, 0), 1);
  switch (t) {
    case T.SLOPE_UR: case T.ROOF_SLIDE_L: return u * TILE;
    case T.SLOPE_DR: case T.ROOF_SLIDE_R: return (1 - u) * TILE;
    case T.SLOPE_UR_LO: return u * TILE * 0.5;
    case T.SLOPE_UR_HI: return TILE * 0.5 + u * TILE * 0.5;
    case T.SLOPE_DR_HI: return TILE - u * TILE * 0.5;
    case T.SLOPE_DR_LO: return TILE * 0.5 - u * TILE * 0.5;
  }
  return 0;
}
// 坂の向き（右へ進むと上がる:-1、下がる:+1）。滑り台の押し出しに使う
export function slopeDir(t) {
  if (t === T.SLOPE_UR || t === T.SLOPE_UR_LO || t === T.SLOPE_UR_HI || t === T.ROOF_SLIDE_L) return -1;
  if (isSlope(t)) return 1;
  return 0;
}
