// プレイ中の表示（設計書 9章）。担当：UI
export function drawHud(ctx, W, vw, vh, scene) {
  const p = W.player;
  ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  ctx.fillText('♥'.repeat(Math.max(0, p.hearts)), 16, 14);
  ctx.fillText(`コイン ${W.stats.coins}`, 16, 40);
}
