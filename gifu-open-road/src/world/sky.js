// 昼夜・空・光・天候
/* global THREE */
import { WORLD_W, WORLD_H, MAP_W, TILE, HEIGHTS } from '../core/config.js';
import { RIVER } from './mapgen.js';

const lerpC = (a, b, t) => a.clone().lerp(b, t);
const C = (h) => new THREE.Color(h);
const SKY = { day: C(0x8fc3ea), dusk: C(0xe39a6a), night: C(0x0b1426) };
const FOG = { day: C(0xb9d3e6), dusk: C(0xc49480), night: C(0x101828) };

export const WEATHERS = [
  { id: 'clear', name: '晴れ', icon: '☀', fog: 1, light: 1, rain: 0 },
  { id: 'cloudy', name: '曇り', icon: '☁', fog: 0.85, light: 0.75, rain: 0 },
  { id: 'rain', name: '雨', icon: '☂', fog: 0.65, light: 0.6, rain: 1 },
  { id: 'storm', name: '雷雨', icon: '⚡', fog: 0.55, light: 0.45, rain: 1.6 },
  { id: 'fog', name: '霧', icon: '🌫', fog: 0.3, light: 0.75, rain: 0 },
];
const NEXT = { clear: [['clear', 5], ['cloudy', 3], ['fog', 1]], cloudy: [['clear', 3], ['cloudy', 2], ['rain', 3]], rain: [['cloudy', 3], ['rain', 2], ['storm', 1]], storm: [['rain', 3]], fog: [['clear', 3], ['cloudy', 1]] };

export function buildSky(scene, renderer, quality, ranges) {
  scene.background = SKY.day.clone();
  scene.fog = new THREE.Fog(FOG.day.clone(), 60, quality.fogFar);
  const hemi = new THREE.HemisphereLight(0xdfefff, 0x5a6a48, 0.65);
  const sun = new THREE.DirectionalLight(0xfff1dc, 0.9);
  sun.position.set(100, 200, 50);
  scene.add(hemi); scene.add(sun); scene.add(sun.target);
  if (quality.shadow) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const s = sun.shadow.camera; s.left = -40; s.right = 40; s.top = 40; s.bottom = -40; s.near = 1; s.far = 400;
  }
  // 太陽と月
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(14, 16), new THREE.MeshBasicMaterial({ color: 0xfff3c0, fog: false }));
  const moon = new THREE.Mesh(new THREE.CircleGeometry(8, 16), new THREE.MeshBasicMaterial({ color: 0xdde6ff, fog: false }));
  scene.add(sunDisc); scene.add(moon);

  // 川の水面
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_W + 400, (RIVER.r1 - RIVER.r0 + 1) * TILE + 1, 40, 4).rotateX(-Math.PI / 2),
    new THREE.MeshPhongMaterial({ color: 0x3f7f9a, transparent: true, opacity: 0.82, shininess: 80, specular: 0x99bbcc }));
  water.position.set(WORLD_W / 2, HEIGHTS.water, (RIVER.r0 + (RIVER.r1 - RIVER.r0 + 1) / 2) * TILE);
  scene.add(water);

  // 雨
  const RN = 1400;
  const rainGeo = new THREE.BufferGeometry();
  const rp = new Float32Array(RN * 6);
  for (let i = 0; i < RN; i++) { const x = (Math.random() - 0.5) * 60, y = Math.random() * 30, z = (Math.random() - 0.5) * 60; rp.set([x, y, z, x + 0.05, y - 0.7, z], i * 6); }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xaabbd0, transparent: true, opacity: 0.45 }));
  rain.frustumCulled = false; rain.visible = false;
  scene.add(rain);

  const state = { weather: WEATHERS[0], weatherTimer: 0, flash: 0, night: 0, wet: false, sunElev: 1 };

  function nextWeather() {
    const opts = NEXT[state.weather.id]; let tot = opts.reduce((a, o) => a + o[1], 0), r = Math.random() * tot;
    for (const [id, w] of opts) { r -= w; if (r <= 0) { state.weather = WEATHERS.find(x => x.id === id); return; } }
  }

  function update(hour, dt, camPos) {
    // 太陽の高さ（6時に日の出、18時に日没）
    const a = (hour - 6) / 12 * Math.PI;
    const elev = Math.sin(a);
    state.sunElev = elev;
    const dayK = THREE.MathUtils.clamp(elev * 3 + 0.3, 0, 1);
    const duskK = THREE.MathUtils.clamp(1 - Math.abs(elev) * 4, 0, 1) * (elev > -0.25 ? 1 : 0);
    state.night = 1 - dayK;
    const w = state.weather;
    let sky = lerpC(SKY.night, SKY.day, dayK).lerp(SKY.dusk, duskK * 0.6);
    let fog = lerpC(FOG.night, FOG.day, dayK).lerp(FOG.dusk, duskK * 0.5);
    const grey = C(0x7d8790).lerp(C(0x1a1f26), 1 - dayK);
    sky.lerp(grey, 1 - w.light); fog.lerp(grey, 1 - w.light);
    if (state.flash > 0) { sky.lerp(C(0xffffff), state.flash); state.flash = Math.max(0, state.flash - dt * 3); }
    scene.background.copy(sky); scene.fog.color.copy(fog);
    scene.fog.far = quality.fogFar * w.fog * (0.75 + 0.25 * dayK);
    scene.fog.near = 30 * w.fog;
    hemi.intensity = (0.18 + 0.5 * dayK) * (0.6 + 0.4 * w.light) + state.flash;
    sun.intensity = Math.max(0, elev) * 0.95 * w.light;
    sun.color.copy(lerpC(C(0xffb070), C(0xfff1dc), THREE.MathUtils.clamp(elev * 2, 0, 1)));
    const cx = camPos.x, cz = camPos.z;
    sun.position.set(cx + Math.cos(a) * 150, Math.max(10, elev * 220), cz + 60);
    sun.target.position.set(cx, 0, cz);
    sunDisc.position.set(cx + Math.cos(a) * 600, elev * 500, cz + 250); sunDisc.lookAt(cx, 0, cz); sunDisc.visible = elev > -0.1;
    moon.position.set(cx - Math.cos(a) * 600, -elev * 500, cz + 250); moon.lookAt(cx, 0, cz); moon.visible = elev < 0.1;
    // 天候
    state.weatherTimer -= dt;
    if (state.weatherTimer <= 0) { nextWeather(); state.weatherTimer = 60 + Math.random() * 90; }
    state.wet = w.rain > 0;
    rain.visible = w.rain > 0;
    if (rain.visible) {
      rain.position.set(cx, camPos.y - 12, cz);
      const pos = rainGeo.attributes.position.array;
      const fall = dt * 24 * w.rain;
      for (let i = 0; i < RN; i++) { let y = pos[i * 6 + 1] - fall; if (y < 0) y += 30; pos[i * 6 + 1] = y; pos[i * 6 + 4] = y - 0.7; }
      rainGeo.attributes.position.needsUpdate = true;
      if (w.id === 'storm' && Math.random() < dt * 0.08) state.flash = 0.9;
    }
    water.material.color.setHex(0x3f7f9a).lerp(C(0x0a1a26), state.night * 0.8);
    // 遠景の山並み：空気遠近法（空の色に溶ける）
    if (ranges) {
      ranges.children[0].material.color.copy(fog).lerp(C(0x2a3a3a), 0.38 * (1 - w.fog * 0.3));
      ranges.children[1].material.color.copy(fog).lerp(sky, 0.4).lerp(C(0x3a4a5a), 0.18);
      ranges.position.set(cx - WORLD_W / 2, 0, cz - WORLD_H / 2);
    }
  }
  return { state, update, sun, hemi, setWeather: (id) => { state.weather = WEATHERS.find(w => w.id === id) || WEATHERS[0]; } };
}
