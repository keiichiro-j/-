import QRCode from "qrcode";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}

function drawOutlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.lineJoin = "round";
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

/**
 * Bakes the VERIFIED watermark (QR + proof ID) into the photo's pixels.
 * This is the "②b 保存・共有時に生成される画像" step — always on, no
 * opt-out — so the QR/ID travel with the file wherever it's shared.
 *
 * Everything outside the QR code itself is fully transparent: no card, no
 * background bar, no logo. Only the QR + ID text sit on the photo. A
 * boxed sticker is trivial for another app to select and crop/paint out;
 * a QR code has no such rectangle to select and blends into the frame,
 * so it's harder to identify and strip cleanly. The QR's own light
 * modules stay opaque white, though — that contrast is what makes a QR
 * code scannable at all, unlike a decorative background.
 */
export async function composeWatermarkedPhoto(params: {
  sourceCanvas: HTMLCanvasElement;
  proofId: string;
  verifyUrl: string;
}): Promise<Blob> {
  const { sourceCanvas, proofId, verifyUrl } = params;

  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  const margin = Math.round(width * 0.035);
  // Floored so the QR stays scannable even on a low-res source (e.g. a
  // webcam) where a purely proportional size could shrink below what any
  // camera can resolve.
  const qrSize = Math.max(Math.round(height * 0.14), 140);
  const qrX = margin;
  const qrY = height - margin - qrSize;

  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    margin: 1,
    errorCorrectionLevel: "M",
    width: qrSize,
  });
  const qrImg = await loadImage(qrDataUrl);

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("canvas_context_unavailable");

  ctx.drawImage(sourceCanvas, 0, 0);

  // Drawn 1:1 (source already rasterized at qrSize) with smoothing off, so
  // module edges stay crisp — any rescale blur risks the code.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
  ctx.imageSmoothingEnabled = true;

  const fontSize = Math.max(11, Math.round(qrSize * 0.14));
  ctx.font = `700 ${fontSize}px sans-serif`;
  ctx.textBaseline = "bottom";
  ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.22));
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.fillStyle = "#ffffff";
  drawOutlinedText(ctx, `ID: ${proofId}`, qrX, qrY - fontSize * 0.4);

  return new Promise((resolve, reject) => {
    out.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob_failed"))), "image/png");
  });
}
