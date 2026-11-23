// 起動・メインループ。入力→物理（固定60Hz）→AI→システム→描画→HUD の順
/* global THREE */
import { TILE, MAP_W, MAP_H, WORLD_W, WORLD_H, SEED, QUALITY, PHYS, DAY, ECON, PED } from './core/config.js';
import { emit, on } from './core/events.js';
import { createInput } from './core/input.js';
import { defaultSave, saveSlot, loadSlot, loadSettings, saveSettings, anonId } from './core/save.js';
import { genWorld, districtAt, solidAt, isWalkable, T, idx, DRIVEWAY, MOUNTAIN } from './world/mapgen.js';
import { buildGround, sampleH, initTerrain } from './world/terrain.js';
import { buildCity, buildSigns } from './world/city.js';
import { buildProps } from './world/props.js';
import { buildSky } from './world/sky.js';
import { initGeom } from './fx/geom.js';
import { initParticles, updateParticles, spawn as spawnParticle } from './fx/particles.js';
import { createAudio } from './fx/audio.js';
import { createVehicles } from './vehicles/traffic.js';
import { vehicleGeometry } from './vehicles/models.js';
import { VEHICLES } from './vehicles/vehicle.js';
import { PROPERTIES, applyMods, ROBBERIES, robberyAmount } from './systems/property.js';
import { pay } from './systems/economy.js';
import { createCrowd } from './actors/crowd.js';
import { createPlayer, updatePlayer, tryEnter, exitCar, damagePlayer, setOutfit } from './actors/player.js';
import { createCam } from './actors/camera.js';
import { createCombat } from './combat/aim.js';
import { updateProjectiles, initExplosions, detonateSticky } from './combat/projectiles.js';
import { WEAPON_BY_ID } from './combat/weapons.js';
import { newWanted, reportCrime, updateWanted, clearWanted, CRIMES } from './systems/wanted.js';
import { createPolice } from './systems/police.js';
import { MISSIONS, newMissionState, startMission, updateMission, currentTarget as missionTarget, fail as failMission, taxiFare } from './systems/missions.js';
import { newMoney, earn, onBusted, onWasted, yen } from './systems/economy.js';
import { createHUD } from './ui/hud.js';
import { createMenus } from './ui/menus.js';
import { createTouch } from './ui/touch.js';
import { createServer } from './systems/server.js';

const DEFAULT_SETTINGS = { quality: null, density: 1, mild: false, aimAssist: null, dayMinutes: DAY.defaultMinutes, sensitivity: 1, invertY: false, hud: 'full', volume: 0.6, subtitle: 1, keys: {} };

export async function boot() {
  const root = document.getElementById('app');
  const loading = document.getElementById('loading');
  const setLoad = (t) => { if (loading) loading.querySelector('p').textContent = t; };
  const mobile = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const rotateEl = document.getElementById('rotate');
  const settings = { ...DEFAULT_SETTINGS, ...loadSettings() };
  if (!settings.quality) settings.quality = mobile ? 'low' : 'high';
  if (!settings.aimAssist) settings.aimAssist = mobile ? 'strong' : 'off';
  const quality = { ...QUALITY[settings.quality] };

  const G = { settings, quality, mobile, paused: false, time: 0, slowmo: 1, feed: [], waypoint: null, hint: null, photoMode: false };
  window.__G = G; // デバッグ・テスト用
  G.saveSettings = () => saveSettings(settings);

  // ---------- 描画の土台 ----------
  const canvas = document.createElement('canvas'); canvas.id = 'gl'; root.appendChild(canvas);
  const hudCanvas = document.createElement('canvas'); hudCanvas.id = 'hud'; root.appendChild(hudCanvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile && settings.quality === 'high', powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.3, 4000);
  G.renderer = renderer; G.scene = scene;
  window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); checkOrientation(); });
  initGeom();

  setLoad('街を生成しています…');
  await tick();
  const world = genWorld(SEED); G.world = world;
  initTerrain(world);
  const ground = buildGround(world, renderer); scene.add(ground.group);
  setLoad('建物を建てています…'); await tick();
  const city = buildCity(world, scene); const signs = buildSigns(world, scene);
  const props = buildProps(world, scene, quality);
  const sky = buildSky(scene, renderer, quality, ground.ranges); G.sky = sky;
  initParticles(scene);
  G.fx = { spawn: spawnParticle };

  // ---------- 入力・音 ----------
  const input = createInput(canvas, settings); G.input = input;
  const audio = createAudio(settings); G.audio = audio;
  window.addEventListener('pointerdown', () => audio.unlock(), { once: false });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });
  G.server = createServer();

  // ---------- 時間 ----------
  G.clock = DAY.startHour;
  G.hour = () => G.clock % 24;
  G.night = () => sky.state.night;
  G.raining = () => sky.state.weather.rain > 0;
  const hourFactor = (h, kind) => {
    if (h < 5 || h >= 23) return kind === 'car' ? 0.35 : 0.35;
    if ((h >= 7 && h < 9.5) || (h >= 17 && h < 19.5)) return 1.15;
    if (h >= 20) return kind === 'car' ? 0.6 : 0.75;
    return 0.9;
  };

  // ---------- 人・車・主人公 ----------
  setLoad('人と車を配置しています…'); await tick();
  const vctx = { world, scene, quality, settings, sky, trafficFactor: () => hourFactor(G.hour(), 'car') };
  const vehicles = createVehicles(vctx); G.vehicles = vehicles;
  const crowd = createCrowd({ world, scene, quality, settings, hour: G.hour, night: G.night, raining: G.raining, pedFactor: () => hourFactor(G.hour(), 'ped') });
  G.crowd = crowd;
  vctx.pedsAhead = (x, z, fx, fz, r, l) => {
    let g = crowd.pedsAhead(x, z, fx, fz, r, l);
    const P = G.player; if (P && !P.inCar) { const rx = P.x - x, rz = P.z - z, a = rx * fx + rz * fz; if (a > 0 && a < r && Math.abs(rx * fz - rz * fx) < l) g = Math.min(g, a); }
    return g;
  };
  vctx.onHonk = (c) => { if (Math.hypot(c.phys.x - G.cam.x, c.phys.z - G.cam.z) < 40) audio.horn(); };
  vctx.onDriverExit = (c) => { const d = crowd.makeAgent(c.phys.x - Math.cos(c.phys.heading) * 1.8, c.phys.z + Math.sin(c.phys.heading) * 1.8); if (d) crowd.setState(d, 'flee', 5); };

  const home = world.lm.home;
  const P = createPlayer(G, home.x, home.z); G.player = P;
  G.cam = createCam(G, camera);
  const combat = createCombat(G); G.combat = combat;
  const wanted = newWanted(); G.wanted = wanted;
  const police = createPolice({ world, scene, quality, vehicles, crowd, wanted, mapfns: { solidAt }, night: G.night,
    playerHostile: () => P.hostileT > 0 || combat.aiming,
    copShoot: (a, PP, d) => combat.copShoot(a, PP, d),
    tryArrest: (cop) => { if (P.arrest || P.inCar || P.dead) return; P.arrest = { t: 3.2, presses: 0, need: 6 + wanted.stars * 2, cop }; audio.star(); },
    onReported: (type) => { hud.toast(`警察に見られた：${CRIMES[type].name}`, 3, '#ff9a8a'); audio.star(); },
  });
  G.police = police;
  vctx.sirenNear = police.sirenNear;
  const missions = newMissionState(); G.missions = missions;
  G.money = newMoney(ECON.startCash, ECON.startBank);
  G.save = defaultSave();
  G.explored = new Uint8Array((MAP_W / 10) * (MAP_H / 10));
  combat.load(G.save.weapons);

  // ---------- 画面 ----------
  const hud = createHUD(G, hudCanvas, ground.canvas); G.hud = hud;
  const menus = createMenus(G, root); G.menus = menus;
  const touch = createTouch(G, root, input); touch.show(mobile);
  const BASE_ICONS = [['gunshop', '#ff5a4a'], ['police', '#4a7aff'], ['hospital', '#5ad08a'], ['clothes', '#e07ad0'], ['conbini', '#ffb04a'], ['conbini2', '#ffb04a'], ['bank', '#3ad0a0'], ['paint', '#a07aff'], ['gas', '#ff7a3a'], ['gas2', '#ff7a3a'], ['jewelry', '#ffe07a'], ['dealer', '#4ab0ff'], ['tuner', '#ff4a8a'], ['realty', '#5ad0b0'], ['ropewayBase', '#ff4a4a']];
  G.mapIcons = BASE_ICONS;

  // ---------- 場所の解決 ----------
  const lastDw = DRIVEWAY[DRIVEWAY.length - 1];
  const castleGate = { x: lastDw[0] * TILE, z: lastDw[1] * TILE };
  const drivePts = DRIVEWAY.filter((_, i) => i > 2 && i % 7 === 0).map(([c, r]) => ({ x: c * TILE, z: r * TILE })).concat([castleGate]);
  G.resolve = (k) => {
    if (typeof k === 'object') return k;
    if (k === 'castleGate') return castleGate;
    if (k === 'home') return world.lm['prop_' + (G.save.homeId || 'nagara')];
    if (k === 'driveStart') return { x: DRIVEWAY[0][0] * TILE, z: DRIVEWAY[0][1] * TILE };
    if (k === 'driveway') return drivePts;
    return world.lm[k] || null;
  };
  G.missionMarkers = () => MISSIONS.map(d => G.resolve(d.start)).filter(Boolean);
  G.currentTarget = () => {
    if (missions.active) return missionTarget(missions, G.resolve);
    if (G.taxi && G.taxi.active) return G.taxi.target;
    return null;
  };

  // 3Dマーカー
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xffd34a, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  const markerGeo = new THREE.CylinderGeometry(1.6, 1.6, 2.4, 20, 1, true).translate(0, 1.2, 0);
  const startMarkers = MISSIONS.map(d => { const m = new THREE.Mesh(markerGeo, markerMat); const p = G.resolve(d.start); m.position.set(p.x, sampleH(world, p.x, p.z), p.z); scene.add(m); return m; });
  const targetMarker = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 30, 16, 1, true).translate(0, 15, 0), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
  scene.add(targetMarker);

  // ---------- 犯罪・通報・手配 ----------
  G.report = (type, x, z, by) => {
    const before = wanted.stars;
    reportCrime(wanted, type, x, z, by);
    if (wanted.stars > before) {
      hud.toast(by === 'police' ? `警察に見られた：${CRIMES[type].name}` : by === 'alarm' ? '警報で通報された！' : by === 'tracker' ? '追跡装置で通報された！' : `通報された：${CRIMES[type].name}`, 3, '#ff9a8a');
      audio.star();
      G.save.stats.maxStars = Math.max(G.save.stats.maxStars, wanted.stars);
    }
  };
  G.crime = (type, x, z, o = {}) => {
    if (type) G.save.stats.crimes++;
    if (type && police.witnessCrime(x, z)) G.report(type, x, z, 'police');
    crowd.witness(type, x, z, { radius: o.radius || PED.seeCrime, sound: o.sound, kind: o.kind || 'crime', victim: o.victim, melee: o.melee, attacker: P.agent, directTarget: o.directTarget });
  };
  G.clearWanted = () => { clearWanted(wanted); police.clearAll(); };
  on('report', (e) => { if (!P.dead) G.report(e.crime, e.x, e.z, 'civ'); });
  const district = (x, z) => districtAt(world, x, z).name;
  const post = (user, text, x, z) => { const h = G.hour(); G.feed.push({ user, text, x, z, time: `${Math.floor(h)}:${String(Math.floor(h % 1 * 60)).padStart(2, '0')}` }); if (G.feed.length > 60) G.feed.shift(); };
  const USERS = ['gifu_taro', 'nagara_cat', 'kinka_view', 'yanagase_walk', 'ayu_lover', 'station_daily', 'mino_photo', 'hashima_88'];
  on('filmed', (e) => { post(USERS[Math.floor(Math.random() * USERS.length)], `${district(e.x, e.z)}でやばい事件を目撃…（${CRIMES[e.crime] ? CRIMES[e.crime].name : '騒ぎ'}）動画あり`, e.x, e.z); hud.toast('ギフグラムに投稿された', 2, '#ffd0f0'); });
  on('pedHitByCar', (e) => {
    if (e.car.mode === 'player') { G.crime('hitrun', e.agent.x, e.agent.z, { victim: e.agent }); if (e.agent.role === 'cop') G.crime('copAttack', P.x, P.z, {}); }
  });
  vctx.onCrash = (a, b, imp, src) => {
    if (!b) return;
    const pc = a.mode === 'player' ? a : b.mode === 'player' ? b : null; if (!pc) return;
    const other = pc === a ? b : a;
    if (other.spec.police && imp > 4) G.crime('copAttack', P.x, P.z, {});
    if (imp > 6) G.cam.shake = Math.max(G.cam.shake, Math.min(0.6, imp * 0.04));
  };
  G.damagePlayer = (d, x, z, k) => damagePlayer(G, P, d, x, z, k);
  // 人に殴られる・車にはねられる
  // 主人公がはねられた
  const pHit = (car, sp) => { if (sp > 5 && !P.dead) { G.damagePlayer(sp * 2.2, car.phys.x, car.phys.z, 'car'); crowd.knock(P.agent, Math.sin(car.phys.heading) * sp * 0.6, 3, Math.cos(car.phys.heading) * sp * 0.6, 0, 'car'); P.agent.hp = 100; P.agent.alive = true; } };
  crowd.setHooks({ onPlayerHitByCar: pHit, onPedPunchPlayer: (a) => { G.damagePlayer(6, a.x, a.z, 'melee'); audio.whoosh(true); } });

  // ---------- 死亡・逮捕 ----------
  G.onPlayerDead = (kind) => {
    if (G.deadT) return;
    P.dead = true; G.deadT = 4;
    if (P.inCar) exitCar(G, P, true);
    if (kind === 'down') { crowd.knock(P.agent, 0, 1, 0, 0, 'down'); P.agent.alive = true; P.agent.noGetup = true; }
    hud.big(kind === 'down' ? 'ダウン' : '逮捕', kind === 'down' ? '病院に運ばれた（現金を失い、治療費を払う）' : '警察署に連行された（現金と武器を失う）', 4, kind === 'down' ? '#ff6a5a' : '#6a9aff');
    audio.fail();
    G.deadKind = kind;
    if (missions.active) { failMission(missions, kind); }
    if (G.taxi) endTaxi(false);
  };
  function respawn() {
    const kind = G.deadKind;
    const lost = kind === 'down' ? onWasted(G.money, ECON.hospitalFee) : onBusted(G.money);
    if (kind === 'busted') { const keep = combat.inv.weapons.filter(w => w.id === 'fist'); combat.inv.weapons = keep; combat.inv.cur = 0; }
    const at = kind === 'down' ? world.lm.hospital : world.lm.police;
    G.clearWanted();
    P.dead = false; P.hp = 100; P.armor = 0; P.arrest = null; P.agent.noGetup = false; P.agent.kn = null; P.agent.state = 'idle';
    teleport(at.x, at.z);
    hud.toast(`${yen(lost)} を失った`, 4, '#ffb0a0');
    G.clock += 3;
  }
  function teleport(x, z) {
    if (P.inCar) exitCar(G, P, true);
    P.x = x; P.z = z; P.y = sampleH(world, x, z); P.vx = P.vz = 0;
    Object.assign(P.agent, { x, z, y: P.y, state: 'idle', kn: null, hidden: false });
  }
  G.fastTravel = (pos) => { fade(() => { let x = pos.x, z = pos.z; teleport(x, z); G.clock += 0.5; }); };
  function fade(fn) { const f = document.getElementById('fade'); f.style.opacity = 1; setTimeout(() => { fn(); f.style.opacity = 0; }, 450); }

  // ---------- 店・強盗・睡眠・車 ----------
  G.nearCarFor = () => P.inCar ? P.car : vehicles.nearest(P.x, P.z, 7, (c) => !c.wreck && (c.owned || c.mode === 'parked'));
  G.repaint = (car, color) => {
    car.color = color; if (car.record) car.record.color = color; const info = vehicleGeometry(car.spec, color); car.mesh.geometry = info.geo; car.info = info; car.phys.hp = 100; car.phys.flatTires = 0;
    if (wanted.stars && wanted.status !== 'seen') { if (wanted.stars <= 3) { G.clearWanted(); hud.toast('塗り替えで警察の目をごまかした！', 3, '#a0ffa0'); } else { wanted.heat.known = { ...(wanted.heat.known || {}), carColor: -1 }; hud.toast('塗り替えた（★が多すぎて完全にはまけない）'); } }
    else hud.toast('塗り替えた');
    audio.cash();
  };
  G.sleep = (propId) => { fade(() => { G.clock += 8; P.hp = 100; G.saveGame(1); hud.toast('よく眠った（スロット1に保存）'); }); };
  G.post = (user, text) => post(user, text, null, null);

  // ---------- 自分の車（所有の記録） ----------
  let recSeq = 1;
  G.cars = {
    own(ent) {
      if (ent.record) return ent.record;
      const rec = { id: 'c' + Date.now().toString(36) + (recSeq++), model: ent.modelId, color: ent.color, mods: ent.mods || {}, loc: 'out' };
      G.save.ownedCars.push(rec); ent.owned = true; ent.record = rec; ent.mods = rec.mods;
      return rec;
    },
    applyMods(ent) { ent.spec = applyMods(VEHICLES[ent.modelId], ent.mods || {}); ent.phys.spec = ent.spec; if (ent.record) ent.record.mods = ent.mods; },
    spawn(rec, x, z, h = 0) {
      const ent = park(rec.model, x, z, h, { color: rec.color, owned: true });
      ent.record = rec; ent.owned = true; ent.mods = rec.mods || {}; rec.loc = 'out'; G.cars.applyMods(ent);
      return ent;
    },
    buy(model, color) {
      const d = world.lm.dealer;
      const ent = park(model, d.x + 4, d.z + 4, 0, { color });
      G.cars.own(ent);
      hud.big('納車', `${ent.spec.name}を店の前に用意した`, 3, '#9dffa0');
      post('gifu_cars', `新車の${ent.spec.name}が納車されていくのを見た`, d.x, d.z);
    },
  };

  // ---------- 不動産 ----------
  G.realty = {
    owned: (id) => G.save.ownedProps.includes(id),
    home: () => G.save.homeId,
    buy(id) {
      const pr = PROPERTIES.find(x => x.id === id); if (!pr || G.realty.owned(id)) return true;
      if (!pay(G.money, pr.price)) { hud.toast('お金が足りない（口座の残高も使えます）'); return false; }
      G.save.ownedProps.push(id); audio.cash(); hud.big('購入', `${pr.name}を手に入れた`, 3, '#9dffa0');
      post('gifu_estate', `${pr.name}が売れたらしい`, null, null); updatePropSigns(); G.saveGame(0); return true;
    },
    setHome(id) { G.save.homeId = id; updatePropSigns(); hud.toast(`${PROPERTIES.find(x => x.id === id).name}を自宅に登録した`); },
    stored: (id) => G.save.ownedCars.filter(r => r.loc === id),
    store(id) {
      const car = P.car, pr = PROPERTIES.find(x => x.id === id);
      if (!car) return;
      if (car.spec.police || car.modelId === 'ambulance' || car.modelId === 'armored') { hud.toast('緊急車両はしまえない'); return; }
      if (G.realty.stored(id).length >= pr.slots) { hud.toast(`ガレージがいっぱい（${pr.slots}台）`); return; }
      if (wanted.stars) { hud.toast('手配中はガレージに入れない'); return; }
      const rec = G.cars.own(car);
      rec.loc = id; rec.color = car.color; rec.mods = car.mods || {};
      exitCar(G, P, true); vehicles.removeVehicle(car);
      audio.pickup(); hud.toast(`${car.spec.name}をガレージにしまった（${G.realty.stored(id).length}/${pr.slots}）`);
    },
    retrieve(id, i) {
      const rec = G.realty.stored(id)[i]; if (!rec) return;
      const lp = world.lm['prop_' + id];
      const ent = G.cars.spawn(rec, lp.x + 3, lp.z + 3, 0);
      hud.toast(`${ent.spec.name}を出した`);
    },
  };
  function updatePropSigns() {
    for (const pr of PROPERTIES) {
      const own = G.realty.owned(pr.id), home = G.realty.home() === pr.id;
      signs.setProp(pr.id, own ? (home ? '自宅：' + pr.name : pr.name) : `売物件 ${yen(pr.price)}`, own ? (home ? '#2f7a3a' : '#3a5a8a') : '#a0473a');
    }
    G.mapIcons = BASE_ICONS.concat(PROPERTIES.map(pr => ['prop_' + pr.id, G.realty.home() === pr.id ? '#ffffff' : G.realty.owned(pr.id) ? '#9fd0ff' : '#c88a6a']));
  }

  // ---------- 強盗（店員を脅してレジ・金庫の金を奪う） ----------
  const ROB_SHOPS = { conbini: 'conbini', conbini2: 'conbini', gas: 'gas', gas2: 'gas', jewelry: 'jewelry', bank: 'bank' };
  const clerks = {};
  function spawnClerk(key) {
    const p = world.lm[key]; if (!p) return;
    const a = crowd.makeAgent(p.x + 0.8, p.z + 0.8, { role: 'clerk', ctrl: 'ext', cTop: key === 'bank' ? 0x2a3a5a : key === 'jewelry' ? 0x1a1a1a : 0x3a8a5a, cBottom: 0x2a2a30 });
    if (a) { a.state = 'idle'; a.heading = Math.random() * 6; clerks[key] = a; a.bornT = G.time; }
  }
  G.robbedAt = {};
  G.robbery = null;
  G.startRobbery = (kind) => {
    let key = null, bd = 8;
    for (const k in ROB_SHOPS) if (ROB_SHOPS[k] === kind && world.lm[k]) { const d = Math.hypot(world.lm[k].x - P.x, world.lm[k].z - P.z); if (d < bd) { bd = d; key = k; } }
    if (!key) return;
    if (G.robbedAt[key] && G.time - G.robbedAt[key] < 300) { hud.toast('さっき襲ったばかりだ。レジは空っぽ'); return; }
    const R = ROBBERIES[kind];
    const clerk = clerks[key] && clerks[key].alive ? clerks[key] : null;
    if (clerk) { clerk.state = 'handsup'; }
    G.robbery = { kind, key, t: R.sec, dur: R.sec, x: P.x, z: P.z, alarmT: 3, clerk };
    hud.big('強盗', kind === 'bank' ? '金庫を開けさせろ！ 銃を構えていれば警報は押されない' : '金を袋に詰めさせろ！ 銃を構えていれば警報は押されない', 2.5, '#ff9a6a');
    G.crime(R.stars, P.x, P.z, { radius: 18 });
    P.hostileT = 12;
  };

  // ---------- タクシー業務 ----------
  const walkTiles = []; for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) if (world.tiles[idx(c, r)] === T.WALK) walkTiles.push([c, r]);
  function randomCurb(x, z, dmin, dmax) {
    for (let k = 0; k < 60; k++) { const [c, r] = walkTiles[Math.floor(Math.random() * walkTiles.length)]; const px = c * TILE + 2, pz = r * TILE + 2; const d = Math.hypot(px - x, pz - z); if (d > dmin && d < dmax) return { x: px, z: pz }; }
    return { x: x + 50, z };
  }
  function startTaxi() { G.taxi = { active: true, stage: 'pickup', fares: 0 }; nextFare(); hud.toast('タクシー業務を開始（車を降りると終了）'); }
  function nextFare() {
    const t = G.taxi; const p = randomCurb(P.x, P.z, 80, 320);
    const a = crowd.makeAgent(p.x, p.z, { ctrl: 'ext' }); if (a) { a.poseState = 'handsup'; a.speed = 0; }
    Object.assign(t, { stage: 'pickup', target: p, passenger: a, text: '乗客を迎えに行け' });
  }
  function endTaxi(msg = true) { if (!G.taxi) return; if (G.taxi.passenger) { G.taxi.passenger.ctrl = 'ai'; G.taxi.passenger.hidden = false; G.taxi.passenger.poseState = null; } if (msg) hud.toast(`タクシー業務終了（${G.taxi.fares}組）`); G.taxi = null; }
  function updateTaxi(dt) {
    const t = G.taxi; if (!t) return;
    if (!P.inCar || !P.car.spec.taxi) { endTaxi(); return; }
    const d = Math.hypot(P.x - t.target.x, P.z - t.target.z);
    if (t.stage === 'pickup') {
      if (t.passenger && !crowd.agents.includes(t.passenger)) { nextFare(); return; }
      if (d < 9 && P.speed < 1.5) {
        t.passenger && (t.passenger.hidden = true);
        const dest = randomCurb(P.x, P.z, 150, 520);
        Object.assign(t, { stage: 'drive', target: dest, dist: Math.hypot(dest.x - P.x, dest.z - P.z), t0: G.time, text: `${district(dest.x, dest.z)}まで送れ` });
        hud.subtitle(`乗客：「${district(dest.x, dest.z)}までお願いします」`);
      }
    } else if (d < 9 && P.speed < 1.5) {
      const fare = taxiFare(t.dist, G.time - t.t0);
      earn(G.money, fare); audio.cash(); hud.toast(`運賃 ${yen(fare)}`, 3, '#9dffa0');
      G.save.stats.taxiFares++; G.save.stats.taxiEarned += fare;
      if (t.passenger) { const a = t.passenger; a.x = P.x + 2; a.z = P.z; a.hidden = false; a.ctrl = 'ai'; a.poseState = null; a.state = 'walk'; a.tc = -1; }
      t.fares++; nextFare();
    }
  }

  // ---------- セーブ／ロード ----------
  G.saveGame = (slot) => {
    const s = G.save;
    s.ownedCars = s.ownedCars.filter(r => r.loc !== 'gone');
    Object.assign(s, { money: { ...G.money }, weapons: combat.inv.weapons.map(w => ({ ...w })), stored: (combat.inv.stored || []).map(w => ({ ...w })), missions: { done: { ...missions.done }, best: { ...missions.best } }, outfit: P.outfit, hour: G.hour(), explored: Array.from(G.explored), pos: { x: P.x, z: P.z } });
    saveSlot(slot, s);
    G.server.submitScore({ id: anonId(), name: 'プレイヤー' + anonId().slice(0, 4), score: G.money.cash + G.money.bank, extra: `任務${Object.values(missions.done).reduce((a, b) => a + b, 0)}` }).catch(() => {});
  };
  G.loadGame = (slot) => {
    const s = loadSlot(slot); if (!s) return;
    for (const c of vehicles.cars.slice()) if (c.owned) vehicles.removeVehicle(c);
    G.save = s; Object.assign(G.money, s.money); combat.load(s.weapons); combat.inv.stored = s.stored || [];
    s.ownedProps = s.ownedProps || ['nagara']; s.homeId = s.homeId || 'nagara';
    // 外に出していた車は自宅のガレージに戻す（古い形式の記録にも場所を付ける）
    s.ownedCars = (s.ownedCars || []).map((r, i) => ({ id: r.id || 'old' + i, model: r.model, color: r.color, mods: r.mods || {}, loc: !r.loc || r.loc === 'out' ? s.homeId : r.loc }));
    updatePropSigns();
    Object.assign(missions, { active: null, done: { ...s.missions.done }, best: { ...s.missions.best } });
    setOutfit(G, P, s.outfit || 0); G.clock = s.hour || DAY.startHour; s.explored && s.explored.forEach((v, i) => { G.explored[i] = v; });
    G.clearWanted();
    if (s.pos) teleport(s.pos.x, s.pos.z);
    hud.toast('ロードした');
  };

  // 車を置ける場所（建物にめり込まない・道路の真ん中を避ける）を近くから探す
  function freeSpot(x, z, model, heading) {
    const spec = { len: VEHICLES[model].len, wid: VEHICLES[model].wid };
    const ok = (px, pz) => {
      const sn = Math.sin(heading), cs = Math.cos(heading);
      for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 0]]) {
        const qx = px + sn * a * (spec.len / 2 + 0.4) + cs * b * (spec.wid / 2 + 0.4), qz = pz + cs * a * (spec.len / 2 + 0.4) - sn * b * (spec.wid / 2 + 0.4);
        const c = Math.floor(qx / TILE), r = Math.floor(qz / TILE);
        if (c < 0 || r < 0 || c >= MAP_W || r >= MAP_H) return false;
        const t = world.tiles[idx(c, r)];
        if (solidAt(world, qx, qz, 0.5) || t === T.WATER || t === T.ROAD || t === T.BRIDGE || t === T.RAIL) return false;
      }
      // 前方に走り出せる空間があること
      for (let d = spec.len / 2 + 1; d < spec.len / 2 + 9; d += 1) if (solidAt(world, px + Math.sin(heading) * d, pz + Math.cos(heading) * d, 0.5)) return false;
      return !vehicles.cars.some(o => Math.hypot(o.phys.x - px, o.phys.z - pz) < 5);
    };
    const h0 = heading;
    for (let rad = 0; rad < 24; rad += 1) for (let k = 0; k < Math.max(1, rad * 6); k++) {
      const a = k / Math.max(1, rad * 6) * Math.PI * 2; const px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad;
      for (const dh of [0, Math.PI, Math.PI / 2, -Math.PI / 2]) { heading = h0 + dh; if (ok(px, pz)) return [px, pz, heading]; }
      heading = h0;
    }
    return [x, z, h0];
  }
  const park = (model, x, z, h, opts) => { const [px, pz, ph] = freeSpot(x, z, model, h); return vehicles.addVehicle(model, px, pz, ph, 'parked', opts || {}); };
  G.park = park;
  // 自宅前に自分の車、駅前にタクシー、ガレージ前にスポーツカー
  G.save.ownedCars = []; G.save.ownedProps = ['nagara']; G.save.homeId = 'nagara';
  G.cars.own(park('kei', home.x + 3, home.z + 3, Math.PI / 2, { color: 0x4a7aaa }));
  // 車屋の展示車
  for (const [m, dx] of [['super', -6], ['coupe', 0], ['suv', 6]]) { const e = park(m, world.lm.dealer.x + dx, world.lm.dealer.z + 6, Math.PI / 2); e.mission = true; }
  for (const k in ROB_SHOPS) spawnClerk(k);
  updatePropSigns();
  park('taxi', world.lm.taxi.x, world.lm.taxi.z, Math.PI / 2); park('taxi', world.lm.taxi.x - 7, world.lm.taxi.z, Math.PI / 2);
  park('coupe', world.lm.garage.x + 4, world.lm.garage.z + 3, 0);

  // ---------- 向き・ベンチマーク ----------
  function checkOrientation() { const portrait = mobile && window.innerHeight > window.innerWidth; rotateEl.style.display = portrait ? 'flex' : 'none'; G.portrait = portrait; }
  checkOrientation();
  const bench = { t: 0, frames: 0, done: !!loadSettings().quality };

  if (loading) loading.style.display = 'none';
  let started = false;
  menus.title(() => { started = true; hud.big('GIFU OPEN ROAD', '長良の自宅から始まる。地図の「!」が依頼だ', 4); hud.showDistrict(district(P.x, P.z)); }, (slot) => { started = true; G.loadGame(slot); });

  // ---------- メインループ ----------
  let last = performance.now(), acc = 0, exploreT = 0, autoT = 0, fpsT = 0, fpsN = 0;
  G.fps = 60;
  function frame(now) {
    requestAnimationFrame(frame);
    let rdt = Math.min(0.1, (now - last) / 1000); last = now;
    fpsT += rdt; fpsN++; if (fpsT >= 1) { G.fps = fpsN / fpsT; fpsT = 0; fpsN = 0; }
    const cmd = input.frame();
    const menuOpen = menus.isOpen();
    if (!started || G.portrait) { renderOnly(rdt); return; }
    // メニュー操作
    if (cmd.pause && !menuOpen) { menus.pause(); }
    else if (cmd.pause && menuOpen) menus.close();
    if (cmd.phone && !menuOpen) { if (G.photoMode) G.photoMode = false; else menus.phone(); }
    else if (cmd.phone && menuOpen && menus.M.open === 'phone') menus.close();
    if (cmd.map && !menuOpen) menus.fullMap(true); else if (cmd.map && menus.M.open === 'map') menus.close();
    if (G.paused) { renderOnly(rdt); return; }
    // ウェポンホイール（開いている間はスロー）
    const wheelOpen = cmd.wheel && !menuOpen && !P.inCar;
    menus.wheelShow(wheelOpen);
    if (wheelOpen) { menus.wheelLook(cmd.lookX, cmd.lookY); cmd.lookX = cmd.lookY = 0; cmd.fire = cmd.firePressed = false; }
    // フォーカス（ゲージ制のスロー）
    if (cmd.focus && !P.inCar) { combat.S.focusOn = !combat.S.focusOn && P.focus > 10; }
    if (combat.S.focusOn) { P.focus -= 22 * rdt; if (P.focus <= 0) { P.focus = 0; combat.S.focusOn = false; } } else P.focus = Math.min(100, P.focus + 2 * rdt);
    G.slowmo = wheelOpen ? 0.3 : combat.S.focusOn ? 0.35 : 1;
    const dt = rdt * G.slowmo;
    G.time += dt;
    G.clock += dt * 24 / (settings.dayMinutes * 60);
    G.save.playSec += rdt;

    // 乗り降り・調べる
    G.nearCar = !P.inCar && vehicles.nearest(P.x, P.z, 6, (c) => !c.wreck && Math.hypot(c.phys.x - P.x, c.phys.z - P.z) < c.spec.len / 2 + 1.8 && c.spec.len < 9 && !(c.mode === 'police' && c.driver === 'cop'));
    if (cmd.enter && !P.dead && !P.arrest && !G.ropeRide) { if (P.inCar) { exitCar(G, P); } else tryEnter(G, P); }
    interact(cmd);
    if (cmd.horn && P.inCar) { if (P.car.spec.police) { if (!G.hornHeld) P.car.siren = !P.car.siren; } else if (!G.hornHeld) { audio.horn(); crowd.witness(null, P.x, P.z, { kind: 'siren', radius: 20, sound: true }); } }
    G.hornHeld = cmd.horn;
    if (cmd.light && combat.inv.weapons.some(w => w.id === 'sticky')) detonateSticky(G);

    // 主人公とカメラ
    if (!G.ropeRide) updatePlayer(G, P, cmd, dt);
    combat.update(cmd, dt);
    // 物理（固定ステップ）
    acc += dt; let steps = 0;
    while (acc >= PHYS.step && steps < PHYS.maxSteps) { vehicles.update(PHYS.step, G.time, P); acc -= PHYS.step; steps++; }
    if (steps >= PHYS.maxSteps) acc = 0;
    if (P.inCar) { P.x = P.car.phys.x; P.z = P.car.phys.z; P.y = P.car.phys.y; P.heading = P.car.phys.heading; P.speed = Math.abs(P.car.phys.vf); P.agent.x = P.x; P.agent.z = P.z; }
    // AI
    const camDir = [Math.sin(G.cam.yaw), Math.cos(G.cam.yaw)];
    crowd.update(dt, G.time, { player: P, cars: vehicles.cars, camDir, raining: G.raining() });
    const pinfo = { x: P.x, z: P.z, y: P.y, inCar: P.inCar, car: P.car, speed: P.speed, heading: P.heading, arrest: P.arrest };
    const seen = police.update(dt, G.time, pinfo);
    // システム
    const curW = combat.weapon();
    updateWanted(wanted, dt, { policeSees: seen.sees, seeRate: seen.seeRate * (P.inCar && P.car.spec.tint ? 0.65 : 1), x: P.x, z: P.z, features: { outfit: P.outfit, mask: P.mask, weapon: combat.aiming ? curW.id : null, car: P.inCar ? P.car.id : null, carColor: P.inCar ? P.car.color : null } });
    if (wanted.stars) G.save.stats.wantedSurvival += dt;
    updateProjectiles(G, dt);
    updateMissions(dt);
    updateTaxi(dt);
    updateRobbery(dt);
    updateRopeway(dt, cmd);
    if (G.deadT) { G.deadT -= rdt; if (G.deadT <= 0) { G.deadT = 0; respawn(); } }
    // 自分の車が大破・水没したら記録から消す
    for (const c of vehicles.cars) if (c.record && (c.wreck || (c.phys.inWater && c.phys.y < -1)) && c.record.loc !== 'gone') { c.record.loc = 'gone'; hud.toast(`自分の${c.spec.name}を失った`, 3, '#ffb0a0'); }
    // 燃料切れ
    if (P.inCar && P.car.phys.fuel <= 0 && !G.fuelWarn) { G.fuelWarn = true; hud.toast('燃料切れ！ ガソリンスタンドへ'); } else if (P.inCar && P.car.phys.fuel > 0) G.fuelWarn = false;
    // 探索した地図
    exploreT -= rdt;
    if (exploreT <= 0) { exploreT = 0.5; const q = Math.floor(P.x / TILE / 10), r = Math.floor(P.z / TILE / 10); for (let dr = -1; dr <= 1; dr++) for (let dq = -1; dq <= 1; dq++) { const qq = q + dq, rr = r + dr; if (qq >= 0 && rr >= 0 && qq < MAP_W / 10 && rr < MAP_H / 10) G.explored[rr * (MAP_W / 10) + qq] = 1; } hud.showDistrict(district(P.x, P.z)); }
    // 街のできごと（SNS）
    autoT -= rdt;
    if (autoT <= 0) { autoT = 40 + Math.random() * 40; const pt = randomCurb(P.x, P.z, 60, 400); const ev = ['大道芸をやってる！', '屋台が出てる', '鵜飼の準備中', '渋滞してる…', 'きれいな夕焼け', 'ストリートライブ中', '猫が日向ぼっこ']; post(USERS[Math.floor(Math.random() * USERS.length)], `${district(pt.x, pt.z)}：${ev[Math.floor(Math.random() * ev.length)]}`, pt.x, pt.z); }
    // 簡易ベンチマーク（初回のみ3秒）
    if (!bench.done) { bench.t += rdt; bench.frames++; if (bench.t > 3) { bench.done = true; const fps = bench.frames / bench.t; const q = fps > 50 ? settings.quality : fps > 32 ? (settings.quality === 'high' ? 'mid' : settings.quality) : 'low'; settings.quality = q; Object.assign(quality, QUALITY[q]); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatio)); G.saveSettings(); } }

    G.cam.update(P, cmd, rdt, combat.aiming, combat.scope);
    // 音
    let siren = 0; for (const u of police.units) if (u.ent.siren) siren = Math.max(siren, 1 - Math.hypot(u.ent.phys.x - P.x, u.ent.phys.z - P.z) / 150);
    if (P.inCar && P.car.siren) siren = 1;
    audio.update(rdt, { engineOn: P.inCar, rpm: P.inCar ? P.car.phys.rpm : 0, throttle: P.inCar ? P.car.control.throttle : 0, siren });
    render(rdt, dt);
    touch.update();
  }

  function interact(cmd) {
    G.hint = null;
    if (P.dead || P.inCar && !P.car) return;
    const near = (p, r) => p && Math.hypot(p.x - P.x, p.z - P.z) < r;
    const shops = [['gunshop', 'ガンショップ'], ['clothes', '服屋'], ['conbini', 'コンビニ'], ['conbini2', 'コンビニ'], ['bank', '銀行'], ['hospital', '病院'], ['police', '警察署'], ['gas', 'ガソリンスタンド'], ['gas2', 'ガソリンスタンド'], ['paint', '塗装工房'], ['jewelry', '宝飾店'], ['dealer', '車屋'], ['tuner', 'カスタムショップ'], ['realty', '不動産屋']];
    const drive = ['gas', 'gas2', 'paint', 'tuner'];
    const key = mobile ? '「調べる」' : 'E';
    if (G.robbery) return;
    // 銃を構えて店員を脅す
    if (!P.inCar && combat.aiming) for (const k in ROB_SHOPS) {
      if (near(world.lm[k], 4.5)) { G.hint = `${key}：強盗する（${ROBBERIES[ROB_SHOPS[k]].name}）`; if (cmd.interact) G.startRobbery(ROB_SHOPS[k]); return; }
    }
    for (const [k, label] of shops) {
      const r = drive.includes(k) ? 9 : 3.5;
      if (near(world.lm[k], r) && (!P.inCar || drive.includes(k))) {
        G.hint = `${key}：${label}`;
        if (cmd.interact) menus.shop(k.replace(/2$/, ''));
        return;
      }
    }
    for (const pr of PROPERTIES) {
      const lp = world.lm['prop_' + pr.id]; if (!lp) continue;
      const own = G.realty.owned(pr.id);
      if (P.inCar && own && near(lp, 10)) {
        G.hint = `${key}：車をガレージにしまう（${G.realty.stored(pr.id).length}/${pr.slots}台）`;
        if (cmd.interact) G.realty.store(pr.id);
        return;
      }
      if (!P.inCar && near(lp, 3.5)) {
        G.hint = `${key}：${pr.name}${own ? (G.realty.home() === pr.id ? '（自宅）' : '（所有）') : `（売物件 ${yen(pr.price)}）`}`;
        if (cmd.interact) menus.shop('prop:' + pr.id);
        return;
      }
    }
    if (!missions.active && !G.taxi) for (const d of MISSIONS) {
      const p = G.resolve(d.start);
      if (near(p, d.needCar ? 8 : 4)) {
        G.hint = `${key}：依頼「${d.title}」`;
        if (cmd.interact) { if (d.needCar && !P.inCar) { hud.toast('車に乗って来ること'); return; } menus.brief(d, () => { startMission(missions, d, G.time); hud.big(d.title, d.steps[0].text, 3); }); }
        return;
      }
    }
    if (P.inCar && P.car.spec.taxi && !missions.active) {
      G.hint = G.taxi ? null : `${key}：タクシー業務を始める`;
      if (cmd.interact) { if (G.taxi) endTaxi(); else startTaxi(); }
      return;
    }
    const rw = props.ropeway;
    if (!P.inCar && !G.ropeRide && (near(rw.a, 7) || near(rw.b, 7))) {
      G.hint = `${key}：ロープウェイに乗る`;
      if (cmd.interact) { const up = near(rw.a, 7); rw.state.t = up ? 0 : 1; rw.state.dir = up ? 1 : -1; G.ropeRide = { up }; P.agent.hidden = true; }
    }
  }

  function updateRopeway(dt, cmd) {
    const rw = props.ropeway;
    rw.update(G.ropeRide ? dt : dt);
    if (G.ropeRide) {
      if (cmd.interact) { rw.state.t = G.ropeRide.up ? 1 : 0; }
      const g = rw.gondola.position; P.x = g.x; P.z = g.z; P.y = g.y - 0.8;
      if ((G.ropeRide.up && rw.state.t >= 1) || (!G.ropeRide.up && rw.state.t <= 0)) {
        const end = G.ropeRide.up ? rw.b : rw.a; G.ropeRide = null; P.agent.hidden = false;
        teleport(end.x + 4, end.z + 2);
      }
    }
  }

  function updateMissions(dt) {
    if (!missions.active) return;
    const r = updateMission(missions, dt, { x: P.x, z: P.z, inCar: P.inCar, carSpeed: P.inCar ? Math.abs(P.car.phys.vf) : 0, wanted: wanted.stars, carDestroyed: P.inCar && P.car.wreck }, G.resolve);
    if (!r) return;
    if (r.type === 'step') { hud.big('次の目標', r.text, 2.5); audio.pickup(); }
    else if (r.type === 'checkpoint') { audio.pickup(); }
    else if (r.type === 'complete') { earn(G.money, r.reward); audio.cash(); hud.big('ミッション完了', `${r.def.title}　報酬 ${yen(r.reward)}　${r.time.toFixed(1)}秒`, 4, '#9dffa0'); G.saveGame(0); post('gifu_news', `${r.def.title}が無事完了したらしい`, null, null); }
    else if (r.type === 'fail') { audio.fail(); hud.big('ミッション失敗', r.reason, 3.5, '#ff6a5a'); }
  }

  function updateRobbery(dt) {
    // 店員の復帰
    for (const k in ROB_SHOPS) { const c = clerks[k]; if (!c || !crowd.agents.includes(c)) { if (!G.clerkT || G.time - G.clerkT > 60) spawnClerk(k); continue; } if (!c.alive && c.state === 'down' && c.stateT <= 0) { crowd.remove(c); delete clerks[k]; G.clerkT = G.time; } }
    if (G.lateAlarm) { G.lateAlarm.t -= dt; if (G.lateAlarm.t <= 0) { G.report(G.lateAlarm.stars, G.lateAlarm.x, G.lateAlarm.z, 'alarm'); audio.alarm(); G.lateAlarm = null; } }
    const R = G.robbery; if (!R) return;
    const R0 = ROBBERIES[R.kind];
    R.t -= dt;
    // 銃を構え続けている間は、店員は警報ボタンを押せない
    const threatening = combat.aiming || P.hostileT > 10.5;
    if (!threatening) R.alarmT -= dt;
    if (R.alarmT <= 0 && !R.alarmed) { R.alarmed = true; G.report(R0.stars, R.x, R.z, 'alarm'); audio.alarm(); hud.toast('店員が警報ボタンを押した！', 3, '#ff8a7a'); }
    if (Math.hypot(P.x - R.x, P.z - R.z) > 7 || P.dead) { G.robbery = null; if (R.clerk) R.clerk.state = 'idle'; hud.toast('強盗を中断した'); return; }
    G.hint = `${R.kind === 'bank' ? '金庫から' : 'レジから'}金を詰めさせている… ${Math.ceil(R.t)}秒${threatening ? '' : '（銃を構えろ！）'}`;
    if (R.t <= 0) {
      const amt = robberyAmount(R.kind);
      earn(G.money, amt); audio.cash(); G.robbedAt[R.key] = G.time;
      hud.big('強盗成功', `${yen(amt)} を奪った。逃げろ！`, 3, '#ffd34a');
      if (!R.alarmed) G.lateAlarm = { t: 4, stars: R0.stars, x: R.x, z: R.z };
      if (R.clerk) { R.clerk.state = 'cower'; }
      post('gifu_news', `${district(P.x, P.z)}の${R0.name}で強盗事件。犯人は逃走中`, P.x, P.z);
      G.robbery = null;
    }
  }

  function render(rdt, dt) {
    const h = G.hour();
    sky.update(h, dt, camera.position);
    city.wallMat.emissiveIntensity = sky.state.night * 0.9;
    props.lampMat.emissiveIntensity = sky.state.night * 1.4;
    props.updateSignals(G.time);
    vehicles.render(camera, sky.state.night, G.time);
    crowd.render(G.time, dt, camera.position);
    combat.renderFx(dt);
    updateParticles(dt);
    // マーカー
    const showStart = !missions.active && !G.taxi;
    startMarkers.forEach((m) => { m.visible = showStart; m.rotation.y += rdt; });
    const tg = G.currentTarget();
    targetMarker.visible = !!tg;
    if (tg) targetMarker.position.set(tg.x, sampleH(world, tg.x, tg.z), tg.z);
    renderer.render(scene, camera);
    hud.draw(rdt, G.time);
  }
  function renderOnly(rdt) {
    if (!started) { G.cam.yaw += rdt * 0.05; G.cam.pitch = 0.25; G.cam.update(P, { lookX: 0, lookY: 0 }, rdt, false, false); }
    sky.update(G.hour(), 0, camera.position);
    city.wallMat.emissiveIntensity = sky.state.night * 0.9;
    props.lampMat.emissiveIntensity = sky.state.night * 1.4;
    crowd.render(G.time, 0, camera.position);
    vehicles.render(camera, sky.state.night, G.time);
    renderer.render(scene, camera);
    if (started) hud.draw(rdt, G.time);
  }
  requestAnimationFrame(frame);
  return G;
}

function tick() { return new Promise((r) => setTimeout(r, 0)); }

window.addEventListener('DOMContentLoaded', () => {
  boot().catch((e) => {
    console.error(e);
    const l = document.getElementById('loading'); if (l) { l.style.display = 'flex'; l.querySelector('p').textContent = '起動に失敗しました：' + e.message; }
  });
});
