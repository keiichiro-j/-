// Brand mark geometry: an aperture-blade ring (camera) with a checkmark
// (verified) at its center. Kept as pure numeric data + string builders so
// the exact same shape can be rendered as a React SVG component
// (components/BrandMark.tsx) and rasterized onto the watermark canvas
// (lib/watermark.ts) without the two drifting apart.
export const BRAND_MARK_GEOMETRY = {
  viewBox: 100,
  center: 50,
  ringRadius: 43,
  ringStrokeWidth: 7,
  tickInnerRadius: 32,
  tickOuterRadius: 41,
  tickStrokeWidth: 5.5,
  tickSkewDeg: 20,
  checkPath: "M 34 51 L 45 62 L 68 37",
  checkStrokeWidth: 9,
} as const;

export interface TickLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function computeApertureTicks(): TickLine[] {
  const { center: cx, tickInnerRadius, tickOuterRadius, tickSkewDeg } = BRAND_MARK_GEOMETRY;
  const cy = cx;
  const skew = (tickSkewDeg * Math.PI) / 180;
  return Array.from({ length: 6 }, (_, i) => {
    const baseAngle = ((i * 60 - 90) * Math.PI) / 180;
    return {
      x1: cx + tickInnerRadius * Math.cos(baseAngle - skew / 2),
      y1: cy + tickInnerRadius * Math.sin(baseAngle - skew / 2),
      x2: cx + tickOuterRadius * Math.cos(baseAngle + skew / 2),
      y2: cy + tickOuterRadius * Math.sin(baseAngle + skew / 2),
    };
  });
}

/** The mark's shapes only (no <svg> wrapper) — for embedding inline.
 * `checkColor` defaults to `color` but can be set separately (used by the
 * app icon's accent checkmark). */
export function brandMarkInnerSvg(color: string, checkColor: string = color): string {
  const { center: cx, ringRadius, ringStrokeWidth, tickStrokeWidth, checkPath, checkStrokeWidth } =
    BRAND_MARK_GEOMETRY;
  const ticks = computeApertureTicks()
    .map(
      (t) =>
        `<line x1="${t.x1.toFixed(2)}" y1="${t.y1.toFixed(2)}" x2="${t.x2.toFixed(2)}" y2="${t.y2.toFixed(2)}" stroke="${color}" stroke-width="${tickStrokeWidth}" stroke-linecap="round"/>`
    )
    .join("");
  return `<circle cx="${cx}" cy="${cx}" r="${ringRadius}" fill="none" stroke="${color}" stroke-width="${ringStrokeWidth}"/>${ticks}<path d="${checkPath}" fill="none" stroke="${checkColor}" stroke-width="${checkStrokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/**
 * The polished, colored "app icon" treatment: a rounded-square gradient
 * background with the mark inset (padded, like Apple's own app icons —
 * the glyph never touches the corner curvature) and an accent-colored
 * checkmark. Used for the favicon/app icon; NOT used inline in the UI,
 * where the plain single-color `BrandMark` is used instead so it can
 * adapt to any surface via `currentColor`.
 */
export function appIconSvgMarkup(
  params: {
    size?: number;
    gradientFrom?: string;
    gradientTo?: string;
    ringColor?: string;
    checkColor?: string;
    cornerRadius?: number;
    padScale?: number;
  } = {}
): string {
  const {
    size = 512,
    gradientFrom = "#3d3d40",
    gradientTo = "#050505",
    ringColor = "#ffffff",
    checkColor = "#30d97e",
    cornerRadius = 22,
    padScale = 0.78,
  } = params;
  const gradientId = "unedited-app-icon-gradient";
  const glyph = brandMarkInnerSvg(ringColor, checkColor);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0.25" y2="1">
<stop offset="0" stop-color="${gradientFrom}"/><stop offset="1" stop-color="${gradientTo}"/>
</linearGradient></defs>
<rect width="100" height="100" rx="${cornerRadius}" fill="url(#${gradientId})"/>
<g transform="translate(50 50) scale(${padScale}) translate(-50 -50)">${glyph}</g>
</svg>`;
}
