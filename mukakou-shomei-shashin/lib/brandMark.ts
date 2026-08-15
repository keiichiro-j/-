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

/** The mark's shapes only (no <svg> wrapper) — for embedding inline. */
export function brandMarkInnerSvg(color: string): string {
  const { center: cx, ringRadius, ringStrokeWidth, tickStrokeWidth, checkPath, checkStrokeWidth } =
    BRAND_MARK_GEOMETRY;
  const ticks = computeApertureTicks()
    .map(
      (t) =>
        `<line x1="${t.x1.toFixed(2)}" y1="${t.y1.toFixed(2)}" x2="${t.x2.toFixed(2)}" y2="${t.y2.toFixed(2)}" stroke="${color}" stroke-width="${tickStrokeWidth}" stroke-linecap="round"/>`
    )
    .join("");
  return `<circle cx="${cx}" cy="${cx}" r="${ringRadius}" fill="none" stroke="${color}" stroke-width="${ringStrokeWidth}"/>${ticks}<path d="${checkPath}" fill="none" stroke="${color}" stroke-width="${checkStrokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** A full standalone `<svg>` markup string — for use as an `Image` src (canvas, <img>) via a data URI. */
export function brandMarkSvgMarkup(params: {
  size?: number;
  color?: string;
  background?: string;
  backgroundRadius?: number;
} = {}): string {
  const { size = 100, color = "#18181b", background, backgroundRadius = 0 } = params;
  const bg = background
    ? `<rect width="100" height="100" rx="${backgroundRadius}" fill="${background}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${bg}${brandMarkInnerSvg(color)}</svg>`;
}

/** Works in both the browser and Node (unlike btoa/Buffer, needs neither). */
export function brandMarkDataUrl(params: Parameters<typeof brandMarkSvgMarkup>[0] = {}): string {
  const svg = brandMarkSvgMarkup(params);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
