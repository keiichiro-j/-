// 全定数と端末別の品質プリセット。数値はここと各定義表に集め、コードに直書きしない。
export const TILE = 4;            // 1タイル = 4m
export const MAP_W = 140;         // タイル数（東西）
export const MAP_H = 100;         // タイル数（南北）
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;
export const SEED = 19500;        // 毎回同じ街になる
export const SAVE_VERSION = 1;

export const QUALITY = {
  high: { label: '高', peds: 170, cars: 34, police: 12, pixelRatio: 1.5, shadow: true, fogFar: 330, treeDensity: 1 },
  mid:  { label: '中', peds: 120, cars: 26, police: 10, pixelRatio: 1.25, shadow: false, fogFar: 260, treeDensity: 0.8 },
  low:  { label: '低', peds: 80,  cars: 18, police: 8,  pixelRatio: 1.0, shadow: false, fogFar: 200, treeDensity: 0.55 },
};

export const PHYS = {
  step: 1 / 60,         // 物理は固定60Hz
  maxSteps: 5,          // 1フレームあたり最大ステップ
  gravity: 9.8,
  wallRestitution: 0.25,
};

export const GRIP = { asphalt: 1.0, wet: 0.85, grass: 0.6, field: 0.45, snow: 0.4 };

export const HEIGHTS = {
  mountainPeak: 58,     // 金華山の標高
  riverBed: -2.4,
  water: -0.45,
  bridge: 0.5,
};

export const DAY = {
  defaultMinutes: 8,    // 実時間8分で1日
  startHour: 9.5,
};

export const PED = {
  walkSpeed: 1.35, runSpeed: 3.6, sprintSpeed: 6.2,
  hearGun: 90, hearExplosion: 120, seeCrime: 25, seeWeapon: 20, seeCar: 10,
  reportDelay: 4,       // 電話の仕草から通報までの秒数
  lodNear: 30, lodFar: 80,
  despawnDist: 120, spawnMin: 28, spawnMax: 110,
};

export const PLAYER = {
  hp: 100, armor: 0, walk: 2.0, run: 5.2, sprint: 7.2, crouch: 1.2, jump: 5.2, swim: 1.6,
  focusMax: 100, focusDrain: 22, focusRegen: 4,
};

export const TRAFFIC = {
  laneWidth: 4, cycle: 30, green: 12, yellow: 3,
  idm: { a: 2.2, b: 3.5, s0: 2.5, T: 1.3 },
  spawnMin: 70, spawnMax: 170, despawn: 220,
};

// ★の数ごとの警察の対応（設計書8章）
export const POLICE_BY_STAR = [
  { cars: 0, foot: 0, heli: 0, shoot: false, ram: false, block: false },
  { cars: 2, foot: 2, heli: 0, shoot: false, ram: false, block: false },
  { cars: 3, foot: 3, heli: 0, shoot: true,  ram: true,  block: false },
  { cars: 4, foot: 4, heli: 0, shoot: true,  ram: true,  block: true },
  { cars: 4, foot: 4, heli: 1, shoot: true,  ram: true,  block: true },
  { cars: 5, foot: 4, heli: 2, shoot: true,  ram: true,  block: true },
];

export const WANTED = {
  searchRadiusPerStar: 60, escapeSecPerStar: 8, lostBlinkSec: 5,
  sightCar: 45, sightFoot: 32, sightHeli: 70, detectRate: 0.9,
  heatDecayDays: 3, shrinkRate: 1.2,
};

export const ECON = {
  startCash: 8000, startBank: 20000, hospitalFee: 3000, fuelPrice: 160, repairPrice: 2500,
  paintPrice: 3000, clothesPrice: 2000, registerPrice: 5000,
};

export const CAMERA = { dist: 6.5, height: 2.4, aimDist: 2.6, fov: 62, aimFov: 48, scopeFov: 18, driveDist: 9, driveHeight: 3.2 };
