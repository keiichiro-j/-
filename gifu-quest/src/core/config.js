// 調整用の数値はすべてここに集約する（設計書 5章）。デバッグ画面(F1)から書き換え可能。
export const TILE = 36;
export const VIEW_H = 540;
export const VIEW_W_MIN = 960;
export const VIEW_W_MAX = 1200;
export const STEP = 1 / 120;          // 固定ステップ
export const MAX_STEPS = 8;

export const PHYS = {
  gravityHold: 1320,        // 上昇中・ボタン押しっぱなし
  gravityRelease: 2550,     // 離した後・落下中
  apexThreshold: 90,        // 頂点付近の速度幅
  apexMul: 0.6,
  maxFall: 860,
  coyote: 0.10,
  jumpBuffer: 0.13,
  cornerCorrect: 6,
  accelGround: 1500,
  decelGround: 1900,
  turnMul: 2.0,
  airMul: 0.75,
  stompBounceHold: 660,
  stompBounceRelease: 420,
  stompMargin: 12,
  dashMul: 1.55,
  iceFriction: 0.12,        // 氷上の加減速倍率
  rainFriction: 0.9,
  waterGravity: 520,
  waterMaxFall: 160,
  swimImpulse: 300,
  hurtInvuln: 1.4,
  hurtKnockX: 220,
  hurtKnockY: 360,
  wallSlideMax: 140,
  wallKickVX: 300,
  glideFall: 110,
  dashInvuln: 0.35,
  stepUp: 14,               // 坂・段差を自然に乗り越える幅
};

export const CAMERA = {
  lookAhead: 0.12,
  lookSwitchTime: 0.4,
  verticalMargin: 0.28,
  lerp: 10,
};

export const HITBOX = { w: 24, h: 44, hurtInset: 4 };

export const LIMITS = { particles: 800, weather: 300 };

// 実行中に書き換えられる設定（設定画面・F1デバッグ）
export const RUNTIME = {
  quality: 'high',      // 'high' | 'low' | 'auto'
  shake: true,
  difficulty: 'normal', // 'easy' | 'normal'
  sound: false,
  sfxVol: 0.8,
  bgmVol: 0.6,
  debug: false,
};

export function statsToPhysics(c) {
  const walk = 168 + c.speed * 19;
  return {
    walk,
    dash: walk * PHYS.dashMul,
    jump: 560 + c.jump * 32,
    power: 0.8 + c.power * 0.1,
    hearts: c.hp + 1,
  };
}
