// 日本語の文字描画と、和風の枠（木札・和紙・金の縁取り）の共通関数。担当：UI
// フォントはシステムフォントのみ（Webフォント不可）
export const FONT_FAMILY = "'Hiragino Maru Gothic ProN','M PLUS Rounded 1c','Yu Gothic','YuGothic','Meiryo','Noto Sans CJK JP','Noto Sans JP',sans-serif";
export const FONT_SERIF = "'Hiragino Mincho ProN','Yu Mincho','YuMincho','Noto Serif CJK JP','Noto Serif JP',serif";

// 和の伝統色
export const COL = {
  shu: '#d0452f',      // 朱
  shuDark: '#8e2a1c',
  ai: '#1f3a5f',       // 藍
  aiDark: '#12233b',
  kin: '#e0b448',      // 金
  kinLight: '#f6dc8a',
  kinDark: '#9a7420',
  sumi: '#1d1816',     // 墨
  kinari: '#f3ead7',   // 生成り
  washi: '#efe4cc',
  wood: '#8a5a34',
  woodLight: '#b98a5a',
  woodDark: '#5a3820',
  matsu: '#3f6b3a',    // 松葉色
  sakura: '#f2b8c0',
  white: '#ffffff',
  gray: '#8c8378',
};

const fontCache = new Map();
export function font(size, weight = 'bold', serif = false) {
  const k = size * 10 + (weight === 'bold' ? 1 : 0) + (serif ? 2 : 0);
  let f = fontCache.get(k);
  if (!f) { f = `${weight} ${size}px ${serif ? FONT_SERIF : FONT_FAMILY}`; fontCache.set(k, f); }
  return f;
}

// 縁取り・影つきの文字。opts は使い回してよい（毎フレームの生成を避けるなら定数で渡す）
const DEF = { size: 20, color: COL.kinari, stroke: COL.sumi, strokeW: 0, shadow: false, align: 'left', baseline: 'alphabetic', weight: 'bold', serif: false, alpha: 1 };
export function drawText(ctx, str, x, y, o = DEF) {
  const size = o.size ?? 20;
  ctx.font = font(size, o.weight ?? 'bold', o.serif);
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = o.baseline ?? 'alphabetic';
  const a = o.alpha ?? 1;
  const prevA = ctx.globalAlpha;
  if (a !== 1) ctx.globalAlpha = prevA * a;
  const sw = o.strokeW ?? 0;
  if (o.shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    if (sw) { ctx.lineJoin = 'round'; ctx.lineWidth = sw; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.strokeText(str, x + 2, y + 3); }
    ctx.fillText(str, x + 2, y + 3);
  }
  if (sw) { ctx.lineJoin = 'round'; ctx.miterLimit = 2; ctx.lineWidth = sw; ctx.strokeStyle = o.stroke ?? COL.sumi; ctx.strokeText(str, x, y); }
  ctx.fillStyle = o.color ?? COL.kinari;
  ctx.fillText(str, x, y);
  if (a !== 1) ctx.globalAlpha = prevA;
}

// 折り返し（禁則：行頭に句読点を置かない）。結果は文字列・幅・フォントでキャッシュ
const wrapCache = new Map();
const KINSOKU = '、。，．・！？!?」』）)ー〜…ぁぃぅぇぉっゃゅょァィゥェォッャュョ';
export function wrapText(ctx, str, maxW, size = 20, weight = 'bold') {
  const key = size + '|' + weight + '|' + maxW + '|' + str;
  let lines = wrapCache.get(key);
  if (lines) return lines;
  ctx.font = font(size, weight);
  lines = [];
  for (const para of String(str).split('\n')) {
    let line = '';
    for (const ch of para) {
      const t = line + ch;
      if (ctx.measureText(t).width > maxW && line.length > 0) {
        if (KINSOKU.includes(ch)) { line = t; continue; }
        lines.push(line); line = ch;
      } else line = t;
    }
    lines.push(line);
  }
  if (wrapCache.size > 400) wrapCache.clear();
  wrapCache.set(key, lines);
  return lines;
}
// 折り返して描く。chars を渡すとその文字数まで（文字送り）。戻り値は描いた高さ
export function drawWrapped(ctx, str, x, y, maxW, o, lineH, chars = Infinity) {
  const size = (o && o.size) || 20;
  const lines = wrapText(ctx, str, maxW, size, (o && o.weight) || 'bold');
  lineH = lineH || size * 1.55;
  let left = chars;
  for (let i = 0; i < lines.length; i++) {
    if (left <= 0) break;
    const L = lines[i];
    const s = left >= L.length ? L : L.slice(0, left);
    left -= L.length;
    drawText(ctx, s, x, y + i * lineH, o);
  }
  return lines.length * lineH;
}
export function textLength(ctx, str, maxW, size = 20) {
  let n = 0; for (const l of wrapText(ctx, str, maxW, size)) n += l.length; return n;
}

// ---- 枠 ----
export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
}

// 和紙のパネル（生成り＋金の縁取り）
export function drawWashi(ctx, x, y, w, h, opt = {}) {
  const r = opt.r ?? 14;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = opt.fill || COL.washi; ctx.globalAlpha = opt.alpha ?? 1; ctx.fill();
  ctx.restore();
  ctx.save();
  // 紙のむら（固定の模様）
  roundRect(ctx, x, y, w, h, r); ctx.clip();
  ctx.globalAlpha = 0.06; ctx.fillStyle = '#8a6a3a';
  for (let i = 0; i < 26; i++) {
    const px = x + ((i * 97) % 100) / 100 * w, py = y + ((i * 61) % 100) / 100 * h;
    ctx.fillRect(px, py, 18 + (i * 13) % 40, 1.2);
  }
  ctx.restore();
  ctx.lineWidth = 3; ctx.strokeStyle = opt.border || COL.kin;
  roundRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, r); ctx.stroke();
  ctx.lineWidth = 1; ctx.strokeStyle = opt.inner || 'rgba(154,116,32,0.55)';
  roundRect(ctx, x + 7, y + 7, w - 14, h - 14, Math.max(2, r - 6)); ctx.stroke();
}

// 墨色の半透明パネル（暗い背景・オーバーレイ用）
export function drawSumiPanel(ctx, x, y, w, h, opt = {}) {
  const r = opt.r ?? 14;
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = opt.fill || 'rgba(24,18,16,0.86)'; ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = opt.border || COL.kin; ctx.stroke();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(224,180,72,0.35)';
  roundRect(ctx, x + 6, y + 6, w - 12, h - 12, Math.max(2, r - 5)); ctx.stroke();
}

// 角丸の木札（メニューの項目）。active で朱色＋金の縁、disabled で薄く
export function drawTag(ctx, x, y, w, h, active, disabled, pulse = 0) {
  ctx.save();
  if (disabled) ctx.globalAlpha *= 0.45;
  ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = active ? 14 : 6; ctx.shadowOffsetY = 3;
  roundRect(ctx, x, y, w, h, h * 0.3);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  if (active) { g.addColorStop(0, '#e2583f'); g.addColorStop(1, COL.shuDark); }
  else { g.addColorStop(0, COL.woodLight); g.addColorStop(1, COL.wood); }
  ctx.fillStyle = g; ctx.fill();
  ctx.shadowColor = 'transparent';
  // 木目
  ctx.globalAlpha *= 0.18; ctx.strokeStyle = COL.woodDark; ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + 10, y + h * i / 4); ctx.bezierCurveTo(x + w * 0.3, y + h * i / 4 - 3, x + w * 0.7, y + h * i / 4 + 3, x + w - 10, y + h * i / 4); ctx.stroke(); }
  ctx.restore();
  ctx.save();
  if (disabled) ctx.globalAlpha *= 0.45;
  ctx.lineWidth = active ? 3 : 2;
  ctx.strokeStyle = active ? (pulse ? `rgba(246,220,138,${0.75 + 0.25 * pulse})` : COL.kinLight) : COL.woodDark;
  roundRect(ctx, x + 1, y + 1, w - 2, h - 2, h * 0.3); ctx.stroke();
  ctx.restore();
}

// 選択中を示す金の菱形（左右）
export function drawCursor(ctx, x, y, s = 8, color = COL.kinLight) {
  ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.7, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.7, y); ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = COL.kinDark; ctx.stroke();
}

// 縁取りの標準スタイル（使い回し用）
export const ST = {
  title: { size: 30, color: COL.kinari, stroke: COL.sumi, strokeW: 6, align: 'center', baseline: 'middle', shadow: true },
  item: { size: 24, color: COL.kinari, stroke: COL.woodDark, strokeW: 4, align: 'center', baseline: 'middle' },
  itemActive: { size: 24, color: '#fff8e6', stroke: COL.shuDark, strokeW: 4, align: 'center', baseline: 'middle' },
  body: { size: 18, color: COL.sumi, align: 'left', baseline: 'top', weight: 'bold' },
  bodyLight: { size: 18, color: COL.kinari, stroke: COL.sumi, strokeW: 3, align: 'left', baseline: 'top' },
  small: { size: 14, color: COL.kinari, stroke: COL.sumi, strokeW: 3, align: 'center', baseline: 'middle' },
  hint: { size: 15, color: COL.kinari, stroke: COL.sumi, strokeW: 3.5, align: 'center', baseline: 'middle', alpha: 0.9 },
};

// 時間の表示 m:ss.d
export function fmtTime(t) {
  if (t == null || !isFinite(t)) return '--:--.-';
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
}

// 操作ガイド（キーボード／タッチで文言を変える）
export function hintText(isTouch, keys, taps) { return isTouch ? taps : keys; }

// 背景：藍の夜空〜生成りのグラデーション＋麻の葉風の薄い模様（各画面の背景に）
export function drawPatternBg(ctx, vw, vh, top = COL.aiDark, bottom = '#2c4a6e', t = 0) {
  const g = ctx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, top); g.addColorStop(1, bottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
  // 青海波
  ctx.save();
  ctx.globalAlpha = 0.07; ctx.strokeStyle = COL.kinLight; ctx.lineWidth = 1.2;
  const R = 26;
  for (let row = 0, y = vh - 10; y > vh * 0.55; row++, y -= R * 0.5) {
    const off = (row % 2) * R + ((t * 8) % (R * 2));
    for (let x = -R * 2 + off; x < vw + R * 2; x += R * 2) {
      for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.arc(x, y, R * k / 3, Math.PI, 0); ctx.stroke(); }
    }
  }
  ctx.restore();
}

// 紅葉（色と形）。ctx を移動・回転済みの位置に描く
export function drawMomiji(ctx, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.62;
    const a1 = a - 0.25, a2 = a + 0.25;
    ctx.lineTo(Math.cos(a1) * s * 0.35, Math.sin(a1) * s * 0.35);
    ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
    ctx.lineTo(Math.cos(a2) * s * 0.35, Math.sin(a2) * s * 0.35);
  }
  ctx.lineTo(0, s * 0.5);
  ctx.closePath(); ctx.fill();
}

// 宝珠（光る玉）
export function drawOrb(ctx, x, y, r, color, glow = 1) {
  ctx.save();
  if (glow > 0) {
    const g0 = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2.6);
    g0.addColorStop(0, color); g0.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha *= 0.45 * glow; ctx.fillStyle = g0;
    ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha /= 0.45 * glow;
  }
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, color); g.addColorStop(1, 'rgba(20,10,30,0.9)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
export const ORB_COLORS = ['#ff6a4a', '#4ab0ff', '#7ae07a', '#ffb84a', '#e8f4ff', '#c46aff'];
