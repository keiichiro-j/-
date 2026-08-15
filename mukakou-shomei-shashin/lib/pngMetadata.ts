// Embeds a small proof-identity marker directly into the exported PNG's
// metadata (a standard tEXt chunk), independent of the visible QR/ID
// watermark. A crop that removes the visible corner badge doesn't touch
// this chunk, so the app can still recognize which proof record a photo
// came from — even though the pixel hash (and therefore the "unedited"
// claim itself) will correctly fail to verify once the pixels changed.
// Simple re-encoding (e.g. re-saving as JPEG, most social platforms'
// upload pipelines) does strip this, same limitation any metadata-based
// approach (including C2PA) has — it's a second signal, not a replacement
// for the hash/signature check.

export const PNG_TEXT_KEYWORD = "UneditedProof";

export interface EmbeddedProofMetadata {
  id: string;
  verifyUrl: string;
  app: string;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint32BE(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return bytes;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function injectPngTextChunk(png: Uint8Array, keyword: string, text: string): Uint8Array {
  if (!isPng(png)) throw new Error("not_a_png");

  const encoder = new TextEncoder();
  const data = concatBytes(encoder.encode(keyword), new Uint8Array([0]), encoder.encode(text));
  const type = encoder.encode("tEXt");
  const crc = writeUint32BE(crc32(concatBytes(type, data)));
  const chunk = concatBytes(writeUint32BE(data.length), type, data, crc);

  // IHDR is always the first chunk right after the 8-byte signature; insert
  // the new chunk immediately after it.
  const ihdrLength = new DataView(png.buffer, png.byteOffset + 8, 4).getUint32(0, false);
  const ihdrChunkEnd = 8 + 4 + 4 + ihdrLength + 4; // signature + (length+type+data+crc)

  return concatBytes(png.subarray(0, ihdrChunkEnd), chunk, png.subarray(ihdrChunkEnd));
}

function readPngTextChunk(png: Uint8Array, keyword: string): string | null {
  if (!isPng(png)) return null;
  const decoder = new TextDecoder("latin1");
  let offset = 8;
  while (offset + 8 <= png.length) {
    const length = new DataView(png.buffer, png.byteOffset + offset, 4).getUint32(0, false);
    const type = decoder.decode(png.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > png.length) break;
    if (type === "tEXt") {
      const chunkData = png.subarray(dataStart, dataEnd);
      const nullIndex = chunkData.indexOf(0);
      if (nullIndex !== -1 && decoder.decode(chunkData.subarray(0, nullIndex)) === keyword) {
        return decoder.decode(chunkData.subarray(nullIndex + 1));
      }
    }
    if (type === "IEND") break;
    offset = dataEnd + 4; // skip the trailing CRC
  }
  return null;
}

export async function embedProofMetadata(blob: Blob, meta: EmbeddedProofMetadata): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const withChunk = injectPngTextChunk(bytes, PNG_TEXT_KEYWORD, JSON.stringify(meta));
  return new Blob([new Uint8Array(withChunk)], { type: "image/png" });
}

export async function readEmbeddedProofMetadata(blob: Blob): Promise<EmbeddedProofMetadata | null> {
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = readPngTextChunk(bytes, PNG_TEXT_KEYWORD);
    if (!text) return null;
    const parsed = JSON.parse(text);
    if (typeof parsed?.id === "string" && typeof parsed?.verifyUrl === "string") {
      return parsed as EmbeddedProofMetadata;
    }
    return null;
  } catch {
    return null;
  }
}
