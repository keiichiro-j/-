import QRCode from "qrcode";
import { brandMarkDataUrl } from "./brandMark";

export interface WatermarkResult {
  blob: Blob;
  dataUrl: string;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Bakes the VERIFIED watermark (QR + proof ID + brand mark) into the
 * photo's pixels. This is the "②b 保存・共有時に生成される画像" step —
 * always on, no opt-out — so the QR/ID travel with the file wherever it's
 * shared.
 *
 * The badge is a small, mostly-transparent floating chip rather than a
 * full-width bar, so most of the photo stays untouched. It isn't fully
 * transparent, though: QR codes need real contrast against their backing
 * to stay scannable once printed on an arbitrary photo, so the chip keeps
 * a translucent card behind the QR + text.
 */
export async function composeWatermarkedPhoto(params: {
  sourceCanvas: HTMLCanvasElement;
  proofId: string;
  verifyUrl: string;
}): Promise<WatermarkResult> {
  const { sourceCanvas, proofId, verifyUrl } = params;

  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  // Card geometry is computed before the QR is rasterized so the QR can be
  // generated at (close to) its exact on-canvas pixel size — resampling a
  // fixed-size QR down to a small badge blurs the modules together and
  // makes it unscannable. A floor keeps it scannable even on a low-res
  // source (e.g. a webcam), where the proportional size alone could shrink
  // the QR below what any camera can resolve.
  const margin = width * 0.035;
  const cardHeight = Math.max(height * 0.115, 130);
  const cardWidth = Math.min(width - margin * 2, cardHeight * 5.4);
  const cardX = margin;
  const cardY = height - margin - cardHeight;
  const cornerRadius = cardHeight * 0.16;
  const pad = cardHeight * 0.14;
  // Rounded to whole pixels and drawn 1:1 (no canvas rescale below) — even
  // a hairline scale factor combined with disabled smoothing can misalign
  // module edges enough to break a scanner.
  const qrSize = Math.round(cardHeight - pad * 2);
  const qrX = Math.round(cardX + pad);
  const qrY = Math.round(cardY + pad);

  // High error-correction so the center third can be covered by the brand
  // mark without breaking scannability.
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    margin: 1,
    errorCorrectionLevel: "H",
    width: qrSize,
  });
  const [qrImg, logoOnWhite] = await Promise.all([
    loadImage(qrDataUrl),
    loadImage(brandMarkDataUrl({ size: 100, color: "#18181b" })),
  ]);

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("canvas_context_unavailable");

  ctx.drawImage(sourceCanvas, 0, 0);

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = cardHeight * 0.22;
  ctx.shadowOffsetY = cardHeight * 0.04;
  roundedRectPath(ctx, cardX, cardY, cardWidth, cardHeight, cornerRadius);
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fill();
  ctx.restore();

  // QR code, with the brand mark punched into its center (EC level H
  // tolerates this). Smoothing is disabled so module edges stay crisp.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
  ctx.imageSmoothingEnabled = true;
  const logoSize = qrSize * 0.3;
  const logoPad = logoSize * 0.16;
  roundedRectPath(
    ctx,
    qrX + qrSize / 2 - logoSize / 2 - logoPad,
    qrY + qrSize / 2 - logoSize / 2 - logoPad,
    logoSize + logoPad * 2,
    logoSize + logoPad * 2,
    logoSize * 0.22
  );
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.drawImage(logoOnWhite, qrX + qrSize / 2 - logoSize / 2, qrY + qrSize / 2 - logoSize / 2, logoSize, logoSize);

  // Wordmark + ID, to the right of the QR.
  const textX = qrX + qrSize + pad;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#111111";
  ctx.font = `800 ${Math.max(10, Math.round(cardHeight * 0.24))}px sans-serif`;
  ctx.fillText("UNEDITED VERIFIED", textX, cardY + cardHeight * 0.36);
  ctx.fillStyle = "#333333";
  ctx.font = `${Math.max(9, Math.round(cardHeight * 0.18))}px sans-serif`;
  ctx.fillText(`ID: ${proofId}`, textX, cardY + cardHeight * 0.62);
  ctx.fillStyle = "#555555";
  ctx.font = `${Math.max(8, Math.round(cardHeight * 0.15))}px sans-serif`;
  ctx.fillText("Scan QR or enter ID to verify", textX, cardY + cardHeight * 0.85);

  const blob: Blob = await new Promise((resolve, reject) => {
    out.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob_failed"))), "image/png");
  });

  return { blob, dataUrl: out.toDataURL("image/png") };
}
