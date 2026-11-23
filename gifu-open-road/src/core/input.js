// 入力→操作コマンドの対応表。キーボード・マウス・タッチ・ゲームパッドを同じ形に揃える
export const DEFAULT_KEYS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', run: 'ShiftLeft', jump: 'Space', crouch: 'KeyC',
  enter: 'KeyF', interact: 'KeyE', reload: 'KeyR', cover: 'KeyQ', throw: 'KeyG', wheel: 'Tab', horn: 'KeyH',
  light: 'KeyL', cam: 'KeyV', phone: 'ArrowUp', map: 'KeyM', swap: 'AltLeft', pause: 'Escape', focus: 'CapsLock',
};
export const KEY_LABELS = {
  forward: '前進／アクセル', back: '後退／ブレーキ', left: '左', right: '右', run: '走る', jump: 'ジャンプ／サイドブレーキ', crouch: 'しゃがむ',
  enter: '乗る／降りる', interact: '調べる・話す', reload: 'リロード', cover: 'カバー', throw: '投げる', wheel: 'ウェポンホイール', horn: 'クラクション／サイレン',
  light: 'ライト', cam: '視点切り替え', phone: 'スマホ', map: '地図', swap: '主人公の切り替え', pause: '一時停止', focus: 'フォーカス',
};

export function createInput(target, settings) {
  const keys = new Set(), pressed = new Set();
  let keymap = { ...DEFAULT_KEYS, ...(settings.keys || {}) };
  const mouse = { dx: 0, dy: 0, left: false, right: false, leftP: false, wheel: 0, locked: false, dragging: false, dragMode: false };
  const touch = { mx: 0, my: 0, dx: 0, dy: 0, btn: {}, pressed: new Set(), active: false };
  const st = { lastDevice: 'kb' };

  const onKey = (e, down) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    const code = e.code;
    if (down) { if (!keys.has(code)) pressed.add(code); keys.add(code); }
    else keys.delete(code);
    st.lastDevice = 'kb';
    if (Object.values(keymap).includes(code) || code.startsWith('Digit')) e.preventDefault();
  };
  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', () => { keys.clear(); mouse.left = mouse.right = false; });

  target.addEventListener('contextmenu', (e) => e.preventDefault());
  target.addEventListener('mousedown', (e) => {
    st.lastDevice = 'kb';
    if (!mouse.locked && !mouse.dragMode && settings.pointerLock !== false && target.requestPointerLock) {
      try { const r = target.requestPointerLock(); if (r && r.catch) r.catch(() => { mouse.dragMode = true; }); } catch (err) { mouse.dragMode = true; }
    }
    if (e.button === 0) { mouse.left = true; mouse.leftP = true; }
    if (e.button === 2) mouse.right = true;
    mouse.dragging = true;
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.left = false; if (e.button === 2) mouse.right = false; mouse.dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (mouse.locked || (mouse.dragMode && mouse.dragging)) { mouse.dx += e.movementX || 0; mouse.dy += e.movementY || 0; }
  });
  document.addEventListener('pointerlockchange', () => { mouse.locked = document.pointerLockElement === target; });
  document.addEventListener('pointerlockerror', () => { mouse.dragMode = true; });
  target.addEventListener('wheel', (e) => { mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

  const k = (name) => keys.has(keymap[name]);
  const p = (name) => pressed.has(keymap[name]);
  const tb = (name) => !!touch.btn[name];
  const tp = (name) => touch.pressed.has(name);

  let padPrev = {};
  function readPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && Array.from(pads).find(x => x && x.connected);
    if (!gp) return null;
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const bv = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
    const now = { a: b(0), b: b(1), x: b(2), y: b(3), lb: b(4), rb: b(5), back: b(8), start: b(9), up: b(12), down: b(13), l3: b(10), r3: b(11) };
    const pr = {}; for (const key in now) pr[key] = now[key] && !padPrev[key];
    padPrev = now;
    const r = { lx: dz(gp.axes[0]), ly: dz(gp.axes[1]), rx: dz(gp.axes[2]), ry: dz(gp.axes[3]), lt: bv(6), rt: bv(7), now, pr };
    if (Math.abs(r.lx) + Math.abs(r.ly) + r.lt + r.rt + Math.abs(r.rx) > 0.2 || Object.values(pr).some(Boolean)) st.lastDevice = 'pad';
    return r;
  }

  function frame() {
    const gp = readPad();
    const sens = (settings.sensitivity || 1) * 0.0026;
    const inv = settings.invertY ? -1 : 1;
    const c = {
      mx: (k('right') ? 1 : 0) - (k('left') ? 1 : 0) + touch.mx,
      my: (k('forward') ? 1 : 0) - (k('back') ? 1 : 0) + touch.my,
      lookX: mouse.dx * sens + touch.dx * sens * 1.4,
      lookY: (mouse.dy * sens + touch.dy * sens * 1.4) * inv,
      run: k('run') || touch.run, jump: p('jump') || tp('jump'), jumpHeld: k('jump') || tb('jump'), crouch: p('crouch'), enter: p('enter') || tp('enter'), interact: p('interact') || tp('interact'),
      aim: mouse.right || tb('aim'), fire: mouse.left || tb('attack'), firePressed: mouse.leftP || tp('attack'), reload: p('reload'), throw: p('throw'),
      wheel: k('wheel') || tb('wheel'), phone: p('phone') || tp('phone'), map: p('map'), pause: p('pause') || tp('pause'), horn: k('horn'), light: p('light'), cam: p('cam') || tp('cam'),
      next: mouse.wheel > 0 || tp('next'), prev: mouse.wheel < 0, focus: p('focus'), cover: p('cover'), swap: p('swap'),
      accel: k('forward') ? 1 : 0, brake: k('back') ? 1 : 0, steer: (k('left') ? 1 : 0) - (k('right') ? 1 : 0), handbrake: k('jump') || tb('jump'),
      digit: null, touchDrive: touch.active, mash: p('jump') || tp('jump') || pressed.has('KeyE'),
    };
    for (let d = 1; d <= 9; d++) if (pressed.has('Digit' + d)) c.digit = d;
    if (touch.active && (touch.mx || touch.my)) { c.steer = -touch.mx; c.accel = Math.max(0, touch.my); c.brake = Math.max(0, -touch.my); }
    if (touch.active && tb('brake')) c.brake = 1;
    if (gp) {
      c.mx += gp.lx; c.my -= gp.ly; c.lookX += gp.rx * 0.05 * (settings.sensitivity || 1); c.lookY += gp.ry * 0.035 * inv * (settings.sensitivity || 1);
      if (gp.lx) c.steer = -gp.lx;
      c.accel = Math.max(c.accel, gp.rt); c.brake = Math.max(c.brake, gp.lt);
      c.aim = c.aim || gp.lt > 0.4; c.fire = c.fire || gp.rt > 0.4; c.firePressed = c.firePressed || (gp.rt > 0.4 && !padPrev._rt);
      c.jump = c.jump || gp.pr.a; c.handbrake = c.handbrake || gp.now.rb; c.enter = c.enter || gp.pr.y; c.interact = c.interact || gp.pr.b;
      c.crouch = c.crouch || gp.pr.l3; c.run = c.run || gp.now.x; c.reload = c.reload || gp.pr.x; c.pause = c.pause || gp.pr.start; c.phone = c.phone || gp.pr.up;
      c.next = c.next || gp.pr.rb; c.wheel = c.wheel || gp.now.lb; c.cam = c.cam || gp.pr.back; c.map = c.map || gp.pr.down; c.mash = c.mash || gp.pr.a;
      padPrev._rt = gp.rt > 0.4;
    }
    c.mx = Math.max(-1, Math.min(1, c.mx)); c.my = Math.max(-1, Math.min(1, c.my));
    mouse.dx = mouse.dy = 0; mouse.wheel = 0; mouse.leftP = false; touch.dx = touch.dy = 0;
    pressed.clear(); touch.pressed.clear();
    return c;
  }

  return { frame, touch, mouse, st, setKeys(m) { keymap = { ...DEFAULT_KEYS, ...m }; }, get keymap() { return keymap; },
    exitLock() { if (document.exitPointerLock && mouse.locked) document.exitPointerLock(); } };
}
