// スマホのタッチ操作：左半分＝触った位置が中心のスティック、右半分＝視点、ボタンは場面で入れ替え
export function createTouch(G, root, input) {
  const T = input.touch;
  const el = document.createElement('div'); el.id = 'touch'; root.appendChild(el);
  const stick = document.createElement('div'); stick.className = 'stick'; stick.innerHTML = '<div class="knob"></div>'; el.appendChild(stick);
  const knob = stick.firstChild;
  const BTN = [
    { id: 'attack', label: '攻撃', cls: 'big' }, { id: 'aim', label: '構え' }, { id: 'jump', label: 'ジャンプ' }, { id: 'enter', label: '乗る' },
    { id: 'interact', label: '調べる' }, { id: 'weapon', label: '武器' }, { id: 'phone', label: '📱', cls: 'small top' }, { id: 'pause', label: '⏸', cls: 'small top' }, { id: 'cam', label: '視点', cls: 'small top' },
  ];
  const btns = {};
  const pos = G.settings.buttonPos || {};
  for (const b of BTN) {
    const d = document.createElement('div'); d.className = 'tbtn ' + (b.cls || ''); d.textContent = b.label; d.dataset.id = b.id;
    if (pos[b.id]) { d.style.right = pos[b.id].right; d.style.bottom = pos[b.id].bottom; }
    el.appendChild(d); btns[b.id] = d;
  }
  let stickId = null, lookId = null, sx = 0, sy = 0, lx = 0, ly = 0;
  const holds = {};
  const R = 55;
  function setBtn(id, down) {
    if (id === 'weapon') {
      if (down) holds.weapon = setTimeout(() => { T.btn.wheel = true; holds.weaponLong = true; }, 400);
      else { clearTimeout(holds.weapon); if (!holds.weaponLong) T.pressed.add('next'); holds.weaponLong = false; T.btn.wheel = false; }
      return;
    }
    if (id === 'aim') { if (down) T.btn.aim = !T.btn.aim; btns.aim.classList.toggle('on', !!T.btn.aim); return; }
    const map = { jump: G.player && G.player.inCar ? 'brake' : 'jump' };
    const key = map[id] || id;
    T.btn[key] = down; if (down) T.pressed.add(key);
    if (key === 'brake') T.btn.jump = down;
  }
  el.addEventListener('touchstart', (e) => {
    T.active = true; G.audio && G.audio.unlock();
    for (const t of e.changedTouches) {
      const b = t.target.closest && t.target.closest('.tbtn');
      if (b) { b.classList.add('down'); b._tid = t.identifier; setBtn(b.dataset.id, true); continue; }
      if (t.clientX < window.innerWidth * 0.45 && stickId === null) {
        stickId = t.identifier; sx = t.clientX; sy = t.clientY;
        stick.style.display = 'block'; stick.style.left = (sx - R) + 'px'; stick.style.top = (sy - R) + 'px'; knob.style.transform = 'translate(0,0)';
      } else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
    }
    e.preventDefault();
  }, { passive: false });
  el.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) {
        let dx = t.clientX - sx, dy = t.clientY - sy; const d = Math.hypot(dx, dy);
        if (d > R) { dx *= R / d; dy *= R / d; }
        knob.style.transform = `translate(${dx}px,${dy}px)`;
        T.mx = dx / R; T.my = -dy / R; T.run = d > R * 0.95;
      } else if (t.identifier === lookId) { T.dx += (t.clientX - lx) * 1.6; T.dy += (t.clientY - ly) * 1.6; lx = t.clientX; ly = t.clientY; }
    }
    e.preventDefault();
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { stickId = null; T.mx = T.my = 0; T.run = false; stick.style.display = 'none'; }
      else if (t.identifier === lookId) lookId = null;
      for (const id in btns) { const b = btns[id]; if (b._tid === t.identifier) { b.classList.remove('down'); b._tid = null; setBtn(id, false); } }
    }
    e.preventDefault();
  };
  el.addEventListener('touchend', end, { passive: false });
  el.addEventListener('touchcancel', end, { passive: false });

  // 場面でボタンを入れ替え、使えないものは薄く
  function update() {
    const P = G.player; if (!P) return;
    btns.jump.textContent = P.inCar ? 'ブレーキ' : 'ジャンプ';
    btns.enter.textContent = P.inCar ? '降りる' : '乗る';
    const w = G.combat.weapon();
    btns.attack.textContent = w.kind === 'melee' ? 'パンチ' : w.kind === 'throw' ? '投げる' : '撃つ';
    const sl = G.combat.slot();
    const html = '🔫 ' + (G.settings.mild ? w.mild : w.name).slice(0, 5) + (w.kind === 'gun' || w.kind === 'proj' ? `<br>${G.combat.reloading ? 'リロード' : sl.clip + '/' + sl.ammo}` : w.unit ? `<br>×${sl.clip}` : '');
    if (btns.weapon._h !== html) { btns.weapon.innerHTML = html; btns.weapon._h = html; }
    btns.enter.classList.toggle('dim', !P.inCar && !G.nearCar);
    btns.interact.classList.toggle('dim', !G.hint);
    btns.aim.classList.toggle('dim', w.kind === 'melee' || w.kind === 'throw' || (P.inCar && w.slot !== 'hand'));
    btns.attack.classList.toggle('dim', P.inCar && !(w.kind === 'gun' && w.slot === 'hand'));
  }
  function show(v) { el.style.display = v ? 'block' : 'none'; }
  return { update, show, el };
}
