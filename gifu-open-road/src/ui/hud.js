// HUD（2Dキャンバス）：お金・時刻・天候、ミニマップ、★、体力、武器、速度計、目標、字幕
import { TILE, MAP_W, MAP_H, WORLD_W, WORLD_H } from '../core/config.js';
import { starStyle } from '../systems/wanted.js';
import { yen } from '../systems/economy.js';
import { weaponName, WEAPON_BY_ID } from '../combat/weapons.js';

export function createHUD(G, canvas, groundCanvas) {
  const g = canvas.getContext('2d');
  // ミニマップ用の縮小地図（1タイル=3px）
  const PPT = 3;
  const mm = document.createElement('canvas'); mm.width = MAP_W * PPT; mm.height = MAP_H * PPT;
  const mg = mm.getContext('2d'); mg.imageSmoothingEnabled = true; mg.drawImage(groundCanvas, 0, 0, mm.width, mm.height);
  // 建物を濃く
  for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) { if (G.world.bh[r * MAP_W + c] > 0) { mg.fillStyle = 'rgba(40,44,52,0.85)'; mg.fillRect(c * PPT, r * PPT, PPT, PPT); } }
  const H = { toasts: [], big: null, hurtT: 0, hurtDir: 0, hitT: 0, hitKill: false, cashShown: 0, bankShown: 0, bankT: 0, districtT: 0, district: '', subtitle: null };
  let W = 0, Hh = 0, scale = 1;
  function resize() {
    W = canvas.width = Math.floor(window.innerWidth); Hh = canvas.height = Math.floor(window.innerHeight);
    canvas.style.width = W + 'px'; canvas.style.height = Hh + 'px';
    scale = Math.max(0.7, Math.min(1.3, Math.min(W, Hh) / 700));
  }
  resize(); window.addEventListener('resize', resize);

  function toast(text, dur = 2.6, color = '#fff') { H.toasts.push({ text, t: dur, color }); if (H.toasts.length > 4) H.toasts.shift(); }
  function big(text, sub = '', dur = 3, color = '#ffd34a') { H.big = { text, sub, t: dur, dur, color }; }
  function hurt(fx, fz) { H.hurtT = 0.6; H.hurtDir = Math.atan2(fx - G.player.x, fz - G.player.z) - G.cam.yaw; }
  function hitMarker(kill) { H.hitT = 0.2; H.hitKill = kill; }
  function subtitle(text, dur = 4) { H.subtitle = { text, t: dur }; }

  const font = (px, bold = true) => `${bold ? 'bold ' : ''}${Math.round(px * scale)}px "Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif`;
  function txt(s, x, y, px, color = '#fff', align = 'left', bold = true) {
    g.font = font(px, bold); g.textAlign = align; g.textBaseline = 'middle';
    g.lineWidth = 3.5 * scale; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(s, x, y);
    g.fillStyle = color; g.fillText(s, x, y);
  }
  function bar(x, y, w, h, k, color, bg = 'rgba(0,0,0,0.45)') {
    g.fillStyle = bg; g.fillRect(x, y, w, h); g.fillStyle = color; g.fillRect(x, y, w * Math.max(0, Math.min(1, k)), h);
  }
  function star(x, y, r, style, t) {
    g.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath();
    g.lineWidth = 2 * scale; g.strokeStyle = 'rgba(0,0,0,0.8)';
    if (style === 'solid' || (style === 'blink' && Math.floor(t * 4) % 2)) { g.fillStyle = '#fff'; g.fill(); }
    else if (style === 'red') { g.fillStyle = '#ff3b3b'; g.fill(); }
    else if (style === 'hollow') { g.strokeStyle = '#fff'; }
    else if (style === 'blink') { g.fillStyle = 'rgba(255,255,255,0.25)'; g.fill(); }
    g.stroke();
  }

  function minimap(x, y, R, t) {
    const P = G.player;
    const zoom = (P.inCar ? 1.5 - Math.min(0.6, P.speed / 40) : 2.2) * scale;  // px / m
    const rot = G.cam.yaw - Math.PI; // 進行方向（カメラ）が上
    g.save();
    g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#56724a'; g.fillRect(x - R, y - R, R * 2, R * 2);
    g.translate(x, y); g.rotate(rot);
    const s = zoom / (PPT / TILE);
    g.drawImage(mm, -P.x * zoom, -P.z * zoom, mm.width * s, mm.height * s);
    // 捜索エリア
    const w = G.wanted;
    if (w.search && w.stars > 0) {
      g.beginPath(); g.arc((w.search.x - P.x) * zoom, (w.search.z - P.z) * zoom, w.search.r * zoom, 0, Math.PI * 2);
      g.fillStyle = w.status === 'seen' ? 'rgba(255,60,60,0.12)' : 'rgba(255,60,60,0.22)'; g.fill();
      g.strokeStyle = 'rgba(255,80,80,0.8)'; g.lineWidth = 2; g.stroke();
    }
    const dot = (wx, wz, color, r = 3.5, shape) => {
      let dx = (wx - P.x) * zoom, dz = (wz - P.z) * zoom; const d = Math.hypot(dx, dz);
      const lim = R / 1;
      if (d > lim - 6) { if (!shape) return; dx *= (lim - 6) / d; dz *= (lim - 6) / d; }
      g.fillStyle = color; g.beginPath(); g.arc(dx, dz, r * scale, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
    };
    for (const [k, col] of G.mapIcons) { const p = G.world.lm[k]; if (p) dot(p.x, p.z, col, 3); }
    // 警察
    for (const c of G.vehicles.cars) if (c.spec.police && (c.siren || c.patrol)) dot(c.phys.x, c.phys.z, c.siren ? (Math.floor(t * 4) % 2 ? '#ff3030' : '#3060ff') : '#7a9aff', 3.5);
    for (const a of G.police.officers) if (!a.hidden && a.alive) dot(a.x, a.z, '#3060ff', 2.5);
    for (const h of G.police.helis) dot(h.x, h.z, '#9ab0ff', 5);
    // ミッション開始地点
    if (!G.missions.active) for (const m of G.missionMarkers()) dot(m.x, m.z, '#ffd34a', 4.5, true);
    // 目的地
    const tg = G.currentTarget();
    if (tg) dot(tg.x, tg.z, '#ffe14a', 6, true);
    if (G.waypoint) dot(G.waypoint.x, G.waypoint.z, '#c070ff', 5, true);
    g.restore();
    // 自分
    g.save(); g.translate(x, y); g.rotate(G.cam.yaw - (P.inCar ? P.car.phys.heading : P.heading));
    g.beginPath(); g.moveTo(0, -8 * scale); g.lineTo(5.5 * scale, 6 * scale); g.lineTo(0, 3 * scale); g.lineTo(-5.5 * scale, 6 * scale); g.closePath();
    g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke();
    g.restore();
    g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.lineWidth = 3 * scale; g.strokeStyle = 'rgba(20,20,20,0.85)'; g.stroke();
    // 北
    txt('N', x + Math.sin(rot) * (R - 10 * scale), y - Math.cos(rot) * (R - 10 * scale), 11, '#fff', 'center');
  }

  function draw(dt, t) {
    g.clearRect(0, 0, W, Hh);
    const amount = G.settings.hud || 'full';
    const P = G.player;
    for (const x of H.toasts) x.t -= dt; H.toasts = H.toasts.filter(x => x.t > 0);
    if (H.big) { H.big.t -= dt; if (H.big.t <= 0) H.big = null; }
    if (H.subtitle) { H.subtitle.t -= dt; if (H.subtitle.t <= 0) H.subtitle = null; }
    // 被弾
    if (H.hurtT > 0) {
      H.hurtT -= dt;
      const grd = g.createRadialGradient(W / 2, Hh / 2, Math.min(W, Hh) * 0.3, W / 2, Hh / 2, Math.max(W, Hh) * 0.7);
      grd.addColorStop(0, 'rgba(160,0,0,0)'); grd.addColorStop(1, `rgba(160,0,0,${H.hurtT * 0.7})`);
      g.fillStyle = grd; g.fillRect(0, 0, W, Hh);
    }
    if (G.slowmo < 1) { g.fillStyle = 'rgba(40,80,140,0.12)'; g.fillRect(0, 0, W, Hh); }
    if (G.photoMode) return;
    const mobile = G.mobile;
    const pad = 16 * scale;
    // 照準
    if (G.combat.aiming || (P.inCar && G.combat.weapon().kind === 'gun' && G.combat.weapon().slot === 'hand' && G.input.mouse.right)) {
      const cx = W / 2, cy = Hh / 2, sp = (6 + G.combat.S.bloom * 6) * scale;
      if (G.combat.scope) {
        g.fillStyle = 'rgba(0,0,0,0.85)'; g.beginPath(); g.rect(0, 0, W, Hh); g.arc(cx, cy, Math.min(W, Hh) * 0.42, 0, Math.PI * 2, true); g.fill();
        g.strokeStyle = '#111'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx - Math.min(W, Hh) * 0.42, cy); g.lineTo(cx + Math.min(W, Hh) * 0.42, cy); g.moveTo(cx, cy - Math.min(W, Hh) * 0.42); g.lineTo(cx, cy + Math.min(W, Hh) * 0.42); g.stroke();
      } else {
        g.strokeStyle = G.combat.S.aimTarget ? '#ff5a4a' : '#fff'; g.lineWidth = 2;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.beginPath(); g.moveTo(cx + dx * sp, cy + dy * sp); g.lineTo(cx + dx * (sp + 7 * scale), cy + dy * (sp + 7 * scale)); g.stroke(); }
        g.fillStyle = '#fff'; g.fillRect(cx - 1, cy - 1, 2, 2);
      }
      if (H.hitT > 0) { H.hitT -= dt; g.strokeStyle = H.hitKill ? '#ff3a3a' : '#fff'; g.lineWidth = 2.5; for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { g.beginPath(); g.moveTo(cx + dx * 5, cy + dy * 5); g.lineTo(cx + dx * 11, cy + dy * 11); g.stroke(); } }
    } else if (!P.inCar && G.input.touch.active) { g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(W / 2 - 1.5, Hh / 2 - 1.5, 3, 3); }

    if (amount !== 'none') {
      // 右上：ミニマップと★
      const R = 70 * scale, mx = W - pad - R, my = pad + R;
      minimap(mx, my, R, t);
      const w = G.wanted, ss = starStyle(w);
      for (let k = 0; k < 5; k++) star(mx - R + 12 * scale + k * 25 * scale, my + R + 18 * scale, 10 * scale, k < w.stars ? ss : 'empty', t);
      if (w.stars > 0 && w.status !== 'seen') txt(w.status === 'unknown' ? '犯人未特定' : w.status === 'lost' ? '見失った' : '捜索中', mx, my + R + 40 * scale, 12, '#ffb0b0', 'center');
      // 左上：お金・時刻・天候
      const m = G.money;
      H.cashShown += (m.cash - H.cashShown) * Math.min(1, dt * 6);
      if (Math.abs(m.bank - H.bankShown) > 0.5) { H.bankT = 4; H.bankShown = m.bank; }
      txt(yen(Math.round(H.cashShown)), pad, pad + 12 * scale, 24, '#9dffa0');
      let ly = pad + 40 * scale;
      if (H.bankT > 0 || amount === 'full') { H.bankT -= dt; txt('口座 ' + yen(m.bank), pad, ly, 14, '#c8e8ff'); ly += 22 * scale; }
      const hh = Math.floor(G.hour()), mi = Math.floor((G.hour() % 1) * 60);
      txt(`${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}  ${G.sky.state.weather.icon} ${G.sky.state.weather.name}`, pad, ly, 15); ly += 22 * scale;
      if (H.districtT > 0) { H.districtT -= dt; txt(H.district, pad, ly, 18, `rgba(255,240,200,${Math.min(1, H.districtT)})`); ly += 24 * scale; }
      // 体力（スマホは左上へ）
      const bw = 150 * scale, bx = pad, by = mobile ? ly + 4 * scale : Hh - pad - 30 * scale;
      bar(bx, by, bw, 8 * scale, P.hp / 100, P.hp < 30 ? '#ff4a4a' : '#5ad06a');
      if (P.armor > 0) bar(bx, by + 11 * scale, bw, 5 * scale, P.armor / 100, '#5aa0ff');
      bar(bx, by + 19 * scale, bw * 0.7, 4 * scale, P.focus / 100, '#e0c040');
      // 右下：武器と弾数、運転中は速度計
      const wpn = G.combat.weapon(), sl = G.combat.slot();
      const rx = W - pad, ry = Hh - pad;
      if (!mobile) {
        txt(weaponName(wpn, G.settings.mild), rx, ry - (P.inCar ? 70 : 32) * scale, 16, '#fff', 'right');
        if (wpn.kind === 'gun' || wpn.kind === 'proj' || wpn.kind === 'spray') txt(G.combat.reloading ? 'リロード中…' : `${sl.clip} / ${sl.ammo}`, rx, ry - (P.inCar ? 50 : 12) * scale, 15, '#ffe8a0', 'right');
        if (wpn.kind === 'throw') txt(`×${sl.clip}`, rx, ry - (P.inCar ? 50 : 12) * scale, 15, '#ffe8a0', 'right');
      }
      if (P.inCar) {
        const p = P.car.phys;
        const kmh = Math.round(Math.abs(p.vf) * 3.6);
        const sx = mobile ? W / 2 : rx - 60 * scale, sy = mobile ? Hh - pad - 30 * scale : ry - 20 * scale;
        txt(`${kmh}`, sx, sy - 8 * scale, 30, '#fff', mobile ? 'center' : 'right');
        txt('km/h', sx + (mobile ? 0 : 4 * scale), sy + 16 * scale, 11, '#ccc', mobile ? 'center' : 'left');
        txt(p.gear < 0 ? 'R' : String(p.gear), sx + (mobile ? 38 : 40) * scale, sy - 8 * scale, 16, '#ffd34a', 'left');
        const fw = 70 * scale; bar(sx - (mobile ? fw / 2 : fw), sy + 28 * scale, fw, 5 * scale, p.fuel, p.fuel < 0.15 ? '#ff6a3a' : '#e0d060');
        if (p.hp < 50) txt(p.hp < 25 ? '車両の損傷：大' : '車両の損傷', sx, sy + 44 * scale, 11, '#ff9a6a', mobile ? 'center' : 'right');
      }
      // 中央上：ミッション
      const ms = G.missions.active;
      if (ms) {
        const st = ms.def.steps[ms.step];
        txt(st.text + (st.t === 'checkpoints' ? `（${ms.cp}/${G.resolve(st.points).length}）` : ''), W / 2, pad + 16 * scale, 17, '#ffe14a', 'center');
        if (st.time) { const s = Math.max(0, ms.timeLeft); txt(`${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`, W / 2, pad + 42 * scale, 22, s < 15 ? '#ff6a5a' : '#fff', 'center'); }
      } else if (G.taxi && G.taxi.active) {
        txt(G.taxi.text, W / 2, pad + 16 * scale, 17, '#ffe14a', 'center');
      }
    }
    // 中央下：字幕と案内
    let yy = Hh - (mobile ? 150 : 90) * scale;
    if (H.subtitle) { txt(H.subtitle.text, W / 2, yy, 17, '#fff', 'center', false); yy -= 28 * scale; }
    if (G.hint && amount !== 'none') { txt(G.hint, W / 2, yy, 16, '#c8f0ff', 'center'); yy -= 26 * scale; }
    for (let k = H.toasts.length - 1; k >= 0; k--) { const x = H.toasts[k]; txt(x.text, W / 2, yy, 16, x.color, 'center'); yy -= 24 * scale; }
    if (H.big) {
      const k = Math.min(1, H.big.t, (H.big.dur - H.big.t) * 3);
      g.globalAlpha = Math.max(0, k);
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, Hh * 0.36, W, Hh * 0.2);
      txt(H.big.text, W / 2, Hh * 0.44, 44, H.big.color, 'center');
      if (H.big.sub) txt(H.big.sub, W / 2, Hh * 0.51, 17, '#fff', 'center');
      g.globalAlpha = 1;
    }
    // 拘束の連打
    if (P.arrest) { txt(`振りほどけ！ ${G.mobile ? 'ジャンプボタン' : 'Space'} を連打 ${P.arrest.presses}/${P.arrest.need}`, W / 2, Hh * 0.62, 22, '#ff8a6a', 'center'); }
    if (G.ropeRide) txt('ロープウェイで移動中…', W / 2, Hh * 0.3, 18, '#fff', 'center');
  }

  function showDistrict(name) { if (name !== H.district) { H.district = name; H.districtT = 4; } }

  // 全体地図（M／スマホの地図アプリ）
  function drawFullMap(cv, explored) {
    const c = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    const s = Math.min(w / WORLD_W, h / WORLD_H) * 0.95;
    const ox = (w - WORLD_W * s) / 2, oy = (h - WORLD_H * s) / 2;
    c.fillStyle = '#1b2430'; c.fillRect(0, 0, w, h);
    c.drawImage(mm, ox, oy, WORLD_W * s, WORLD_H * s);
    // 未探索は灰色
    const CH = 10;
    for (let r = 0; r < MAP_H / CH; r++) for (let q = 0; q < MAP_W / CH; q++) if (!explored[r * (MAP_W / CH) + q]) { c.fillStyle = 'rgba(70,74,80,0.82)'; c.fillRect(ox + q * CH * TILE * s, oy + r * CH * TILE * s, CH * TILE * s + 0.5, CH * TILE * s + 0.5); }
    c.font = `bold ${Math.round(11 * Math.max(1, s * 2))}px sans-serif`; c.textAlign = 'center';
    for (const [k, col] of G.mapIcons) { const p = G.world.lm[k]; if (!p) continue; c.fillStyle = col; c.beginPath(); c.arc(ox + p.x * s, oy + p.z * s, 4, 0, 6.3); c.fill(); }
    for (const m of G.missionMarkers()) { c.fillStyle = '#ffd34a'; c.beginPath(); c.arc(ox + m.x * s, oy + m.z * s, 6, 0, 6.3); c.fill(); c.fillStyle = '#000'; c.fillText('!', ox + m.x * s, oy + m.z * s + 4); }
    const names = [['長良', 70, 5], ['長良川', 30, 13], ['岐阜市街地', 46, 28], ['柳ケ瀬', 66, 52], ['岐阜駅前', 66, 84], ['金華山', 122, 22], ['岐阜公園', 104, 58], ['西岐阜の田園', 16, 46], ['東部', 118, 66]];
    c.font = `bold ${Math.round(13 * Math.max(1, s * 1.5))}px sans-serif`;
    for (const [n, cc, rr] of names) { c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillText(n, ox + cc * TILE * s + 1, oy + rr * TILE * s + 1); c.fillStyle = '#fff'; c.fillText(n, ox + cc * TILE * s, oy + rr * TILE * s); }
    const P = G.player;
    c.fillStyle = '#fff'; c.beginPath(); c.arc(ox + P.x * s, oy + P.z * s, 6, 0, 6.3); c.fill(); c.strokeStyle = '#000'; c.lineWidth = 2; c.stroke();
    if (G.waypoint) { c.strokeStyle = '#c070ff'; c.lineWidth = 3; c.beginPath(); c.arc(ox + G.waypoint.x * s, oy + G.waypoint.z * s, 8, 0, 6.3); c.stroke(); }
    const tg = G.currentTarget(); if (tg) { c.fillStyle = '#ffe14a'; c.beginPath(); c.arc(ox + tg.x * s, oy + tg.z * s, 7, 0, 6.3); c.fill(); }
    if (G.wanted.search && G.wanted.stars) { c.strokeStyle = 'rgba(255,60,60,0.9)'; c.beginPath(); c.arc(ox + G.wanted.search.x * s, oy + G.wanted.search.z * s, G.wanted.search.r * s, 0, 6.3); c.stroke(); }
    return { s, ox, oy };
  }

  return { draw, toast, big, hurt, hitMarker, subtitle, showDistrict, drawFullMap, resize, H };
}
