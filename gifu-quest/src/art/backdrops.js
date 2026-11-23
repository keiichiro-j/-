// 背景の多重スクロール（担当：アート）。createBackdrop(theme, levelData) → { draw, drawFront }
export function createBackdrop(theme, levelData) {
  return {
    draw(ctx, camX, camY, vw, vh, env, time) {
      const g = ctx.createLinearGradient(0, 0, 0, vh);
      g.addColorStop(0, env.sky.top); g.addColorStop(1, env.sky.bottom);
      ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    },
    drawFront(ctx, camX, camY, vw, vh, env, time) {},
  };
}
