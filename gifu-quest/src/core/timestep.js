import { STEP, MAX_STEPS } from './config.js';
// 固定ステップ120Hz・アキュムレータ方式。描画は alpha で補間。
export function createLoop({ update, render }) {
  let acc = 0, last = 0, running = false, raf = 0;
  const stats = { fps: 60, frameMs: 16.7, steps: 0 };
  let fpsAcc = 0, fpsN = 0;
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < MAX_STEPS) { update(STEP); acc -= STEP; n++; }
    if (n >= MAX_STEPS) acc = 0;
    stats.steps = n;
    const t0 = performance.now();
    render(acc / STEP, dt);
    stats.frameMs = performance.now() - t0;
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 0.5) { stats.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  }
  return {
    stats,
    start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    // テスト用：時間を進める
    advance(seconds) { const n = Math.round(seconds / STEP); for (let i = 0; i < n; i++) update(STEP); render(0, STEP); },
  };
}
