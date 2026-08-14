import QRCode from "qrcode";

export interface WatermarkResult {
  blob: Blob;
  dataUrl: string;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("qr_image_load_failed"));
    img.src = src;
  });
}

/**
 * Bakes the VERIFIED watermark (QR + proof ID) into the photo's pixels.
 * This is the "②b 保存・共有時に生成される画像" step — always on, no opt-out —
 * so the QR/ID travel with the file wherever it's shared.
 */
export async function composeWatermarkedPhoto(params: {
  sourceCanvas: HTMLCanvasElement;
  proofId: string;
  verifyUrl: string;
}): Promise<WatermarkResult> {
  const { sourceCanvas, proofId, verifyUrl } = params;

  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    margin: 1,
    errorCorrectionLevel: "M",
    width: 256,
  });
  const qrImg = await loadImage(qrDataUrl);

  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const stripHeight = Math.round(height * 0.13);

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("canvas_context_unavailable");

  ctx.drawImage(sourceCanvas, 0, 0);

  const stripY = height - stripHeight;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillRect(0, stripY, width, stripHeight);
  ctx.strokeStyle = "#333333";
  ctx.lineWidth = Math.max(1, Math.round(height * 0.0018));
  ctx.beginPath();
  ctx.moveTo(0, stripY);
  ctx.lineTo(width, stripY);
  ctx.stroke();

  const qrSize = stripHeight * 0.72;
  const pad = stripHeight * 0.14;
  ctx.drawImage(qrImg, pad, stripY + (stripHeight - qrSize) / 2, qrSize, qrSize);

  const textX = pad * 2 + qrSize;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#111111";
  ctx.font = `bold ${Math.max(10, Math.round(stripHeight * 0.27))}px sans-serif`;
  ctx.fillText("UNEDITED VERIFIED", textX, stripY + stripHeight * 0.44);
  ctx.fillStyle = "#333333";
  ctx.font = `${Math.max(9, Math.round(stripHeight * 0.19))}px sans-serif`;
  ctx.fillText(`ID: ${proofId}`, textX, stripY + stripHeight * 0.68);
  ctx.fillText("Scan to verify", textX, stripY + stripHeight * 0.9);

  const blob: Blob = await new Promise((resolve, reject) => {
    out.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob_failed"))), "image/png");
  });

  return { blob, dataUrl: out.toDataURL("image/png") };
}
