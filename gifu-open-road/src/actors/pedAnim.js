// 人のポーズ計算（プロシージャル）。three.jsに依存しない（テスト対象）
// 角度の符号：Rx正＝手足が後ろへ／胴が前へ傾く、膝（すね）正＝後ろに曲がる、ひじ（前腕）負＝前に曲がる

export function newPose() {
  return { bob: 0, hipTwist: 0, torsoPitch: 0, torsoRoll: 0, torsoTwist: 0, headYaw: 0, headPitch: 0,
    uaL: 0, uaR: 0, uaLz: 0.08, uaRz: -0.08, faL: -0.15, faR: -0.15, thL: 0, thR: 0, shL: 0.05, shR: 0.05, hipDrop: 0, prop: 0 };
}

// 歩幅＝速度×周期の関係から、1歩の長さ（m）
export function strideLength(speed) { return Math.min(1.25, 0.42 + speed * 0.21); }

// 速度で連続ブレンドする歩行サイクル。phase はラジアン（2πで2歩）
export function advancePhase(phase, speed, dt) {
  if (speed < 0.05) return phase;
  return (phase + speed / strideLength(speed) * Math.PI * dt) % (Math.PI * 200);
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function pose(out, st) {
  const p = out;
  const sp = st.speed || 0, ph = st.phase || 0, t = st.t || 0;
  const s = Math.sin(ph), c = Math.cos(ph);
  // 0=待機 1=歩き 2=走り 3=全力疾走
  const run = clamp((sp - 1.8) / 2.2, 0, 1), walk = clamp(sp / 1.2, 0, 1), sprint = clamp((sp - 4.5) / 2, 0, 1);
  const A = walk * (0.42 + run * 0.38 + sprint * 0.12);
  p.thL = -A * s; p.thR = A * s;
  const kb = 0.25 + run * 0.9;
  p.shL = 0.06 + walk * (0.12 + kb * Math.max(0, c)); p.shR = 0.06 + walk * (0.12 + kb * Math.max(0, -c));
  const armA = walk * (0.32 + run * 0.5);
  p.uaL = armA * s; p.uaR = -armA * s;
  p.uaLz = 0.08 + run * 0.08; p.uaRz = -0.08 - run * 0.08;
  p.faL = -0.15 - run * 1.25 - walk * 0.1 - Math.max(0, -s) * walk * 0.25; p.faR = -0.15 - run * 1.25 - walk * 0.1 - Math.max(0, s) * walk * 0.25;
  p.bob = -walk * (0.025 + run * 0.04) * Math.abs(s) + run * 0.03 * Math.abs(c);
  p.hipTwist = walk * 0.12 * s; p.torsoTwist = -walk * 0.16 * s;
  p.torsoPitch = run * 0.22 + sprint * 0.1 + (st.lean || 0) * 0.3;
  p.torsoRoll = walk * 0.03 * c + (st.bank || 0);
  p.headYaw = clamp(st.look || 0, -1.2, 1.2); p.headPitch = -p.torsoPitch * 0.6;
  p.hipDrop = 0; p.prop = 0;
  // 待機中の呼吸
  if (sp < 0.1) { p.torsoPitch += Math.sin(t * 1.7) * 0.015; p.uaL += Math.sin(t * 1.1) * 0.02; }

  switch (st.state) {
    case 'phone': case 'film':
      p.uaR = st.state === 'film' ? -1.25 : -0.35; p.uaRz = st.state === 'film' ? -0.1 : -0.55; p.faR = st.state === 'film' ? -0.4 : -2.3; p.prop = 1;
      p.headPitch = st.state === 'phone' ? 0.0 : 0.05; break;
    case 'text': p.uaR = -0.5; p.faR = -1.4; p.uaL = -0.4; p.faL = -1.3; p.headPitch = 0.45; p.prop = 1; break;
    case 'umbrella': p.uaR = -0.6; p.uaRz = -0.2; p.faR = -1.5; p.prop = 0; break;
    case 'cower': {
      p.thL = p.thR = -1.6; p.shL = p.shR = 2.4; p.hipDrop = -0.52; p.torsoPitch = 0.75;
      p.uaL = p.uaR = -2.4; p.uaLz = 0.5; p.uaRz = -0.5; p.faL = p.faR = -1.8; p.headPitch = 0.4; break;
    }
    case 'crouch': {
      const k = 0.55;
      p.thL += -1.0 * k - 0.2; p.thR += -1.0 * k - 0.2; p.shL += 1.3 * k; p.shR += 1.3 * k; p.hipDrop = -0.32; p.torsoPitch += 0.35; break;
    }
    case 'handsup': p.uaL = p.uaR = -2.9; p.uaLz = 0.3; p.uaRz = -0.3; p.faL = p.faR = -0.3; p.headPitch = -0.1; break;
    case 'aim': p.uaR = -1.5; p.uaRz = 0.1; p.faR = -0.05; p.uaL = -1.35; p.uaLz = -0.45; p.faL = -0.5; p.torsoTwist = 0.15; p.headPitch = (st.aimPitch || 0); p.prop = 2; break;
    case 'aimLong': p.uaR = -1.3; p.uaRz = 0.05; p.faR = -0.6; p.uaL = -1.45; p.uaLz = -0.55; p.faL = -0.15; p.torsoTwist = 0.3; p.prop = 2; break;
    case 'punch': {
      const k = Math.sin(clamp(st.actT || 0, 0, 1) * Math.PI);
      p.uaR = -1.5 * k; p.faR = -0.2 - 0.4 * (1 - k); p.torsoTwist = -0.4 * k; p.uaL = -0.6; p.faL = -1.8; break;
    }
    case 'swing': {
      const k = clamp(st.actT || 0, 0, 1);
      p.uaR = -2.4 + k * 3.0; p.uaL = -2.2 + k * 2.8; p.faR = p.faL = -0.4; p.torsoTwist = 0.6 - k * 1.2; p.prop = 2; break;
    }
    case 'throw': { const k = clamp(st.actT || 0, 0, 1); p.uaR = -2.6 + k * 2.6; p.faR = -0.6; p.torsoTwist = 0.4 - k * 0.8; break; }
    case 'sit': p.thL = p.thR = -1.5; p.shL = p.shR = 1.5; p.hipDrop = -0.45; p.uaL = p.uaR = -0.3; p.faL = p.faR = -0.8; break;
    case 'swim': {
      const k = Math.sin(t * 4);
      p.torsoPitch = 1.3; p.uaL = -2.6 + k; p.uaR = -2.6 - k; p.thL = 0.2 + k * 0.3; p.thR = 0.2 - k * 0.3; p.shL = p.shR = 0.2; p.hipDrop = -0.85; p.headPitch = -1.0; break;
    }
    case 'down': {
      p.uaL = -1.2; p.uaLz = 0.9; p.uaR = 0.4; p.uaRz = -1.1; p.faL = -0.4; p.faR = -0.6;
      p.thL = -0.3; p.thR = 0.15; p.shL = 0.6; p.shR = 0.2; p.headYaw = 0.6; p.torsoPitch = 0; p.bob = 0; p.hipTwist = 0; p.torsoTwist = 0.2; break;
    }
    case 'knocked': {
      const k = Math.sin(t * 9);
      p.uaL = -1.8 + k * 0.8; p.uaLz = 0.8; p.uaR = -1.4 - k * 0.8; p.uaRz = -0.9; p.thL = -0.9 + k * 0.5; p.thR = 0.4 - k * 0.5; p.shL = 1.0; p.shR = 0.6; break;
    }
    case 'getup': {
      const k = clamp(st.actT || 0, 0, 1);
      p.thL = p.thR = -1.6 * (1 - k); p.shL = p.shR = 2.2 * (1 - k); p.hipDrop = -0.5 * (1 - k); p.torsoPitch = 0.9 * (1 - k); p.uaL = p.uaR = -0.4; break;
    }
    case 'fight': p.uaL = -1.1; p.faL = -1.9; p.uaR = -0.9; p.faR = -2.0; p.uaLz = 0.2; p.uaRz = -0.2; break;
    case 'drive': p.thL = p.thR = -1.4; p.shL = p.shR = 1.3; p.hipDrop = -0.4; p.uaL = p.uaR = -1.1; p.faL = p.faR = -0.6; break;
    default: break;
  }
  return p;
}
