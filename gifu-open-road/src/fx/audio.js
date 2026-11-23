// 効果音（WebAudioでコード生成。外部音声ファイルは使わない）
export function createAudio(settings) {
  let ac = null, master = null, noiseBuf = null, engine = null, siren = null;
  function ensure() {
    if (ac) return true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    try { ac = new AC(); } catch (e) { return false; }
    master = ac.createGain(); master.gain.value = settings.volume ?? 0.6; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  function noise(dur, freq, q, vol, decay = dur) {
    if (!ensure()) return;
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain(); const t = ac.currentTime;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + dur);
  }
  function tone(freq, dur, type = 'square', vol = 0.15, slide = 0) {
    if (!ensure()) return;
    const o = ac.createOscillator(); o.type = type; const g = ac.createGain(); const t = ac.currentTime;
    o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur);
  }
  const vol = (dist) => Math.max(0.05, 1 - (dist || 0) / 120);
  return {
    unlock() { ensure(); if (ac && ac.state === 'suspended') ac.resume(); },
    setVolume(v) { if (master) master.gain.value = v; },
    gun(w, mild, dist) {
      if (mild) { tone(900, 0.08, 'sine', 0.2 * vol(dist), -500); return; }
      const big = w.slot === 'long' || w.pellets;
      noise(big ? 0.35 : 0.2, big ? 1400 : 2400, 0.8, 0.9 * vol(dist), big ? 0.3 : 0.16);
    },
    boom(dist, mild) { if (mild) { tone(400, 0.4, 'triangle', 0.3, 900); noise(0.5, 3000, 0.5, 0.25 * vol(dist), 0.4); return; } noise(1.4, 400, 0.6, 1.2 * vol(dist), 1.3); tone(60, 0.8, 'sine', 0.5 * vol(dist), -30); },
    click() { tone(1800, 0.04, 'square', 0.08); },
    whoosh(hit) { noise(0.12, hit ? 900 : 2500, 1, hit ? 0.5 : 0.15, 0.1); },
    horn() { tone(415, 0.35, 'sawtooth', 0.12); tone(520, 0.35, 'sawtooth', 0.1); },
    alarm() { if (!ensure()) return; for (let k = 0; k < 6; k++) setTimeout(() => tone(k % 2 ? 700 : 950, 0.25, 'square', 0.08), k * 260); },
    pickup() { tone(880, 0.08, 'triangle', 0.15); setTimeout(() => tone(1320, 0.12, 'triangle', 0.15), 80); },
    cash() { tone(1200, 0.06, 'triangle', 0.14); setTimeout(() => tone(1600, 0.1, 'triangle', 0.14), 70); },
    fail() { tone(300, 0.4, 'sawtooth', 0.12, -150); },
    star() { tone(660, 0.12, 'square', 0.1); setTimeout(() => tone(440, 0.2, 'square', 0.1), 120); },
    // 連続音：エンジンとサイレン
    update(dt, s) {
      if (!ac) return;
      if (s.engineOn) {
        if (!engine) { const o = ac.createOscillator(); o.type = 'sawtooth'; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600; const g = ac.createGain(); g.gain.value = 0; o.connect(f); f.connect(g); g.connect(master); o.start(); engine = { o, g }; }
        engine.o.frequency.setTargetAtTime(28 + s.rpm / 60 * 1.1, ac.currentTime, 0.05);
        engine.g.gain.setTargetAtTime(0.05 + s.throttle * 0.05, ac.currentTime, 0.1);
      } else if (engine) engine.g.gain.setTargetAtTime(0, ac.currentTime, 0.1);
      if (s.siren > 0) {
        if (!siren) { const o = ac.createOscillator(); o.type = 'square'; const g = ac.createGain(); g.gain.value = 0; o.connect(g); g.connect(master); o.start(); siren = { o, g, t: 0 }; }
        siren.t += dt; siren.o.frequency.setTargetAtTime(Math.floor(siren.t * 1.6) % 2 ? 770 : 960, ac.currentTime, 0.01);
        siren.g.gain.setTargetAtTime(0.035 * s.siren, ac.currentTime, 0.1);
      } else if (siren) siren.g.gain.setTargetAtTime(0, ac.currentTime, 0.1);
    },
  };
}
