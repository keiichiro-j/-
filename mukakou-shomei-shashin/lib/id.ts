// Proof ID format shared between client (generation) and server (validation).
// Example: UNEDITED-7F3A-92KD
export const PROOF_ID_PATTERN = /^UNEDITED-[0-9A-F]{4}-[0-9A-F]{4}$/;

function randomGroup(): string {
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
    .join("");
}

export function generateProofId(): string {
  return `UNEDITED-${randomGroup()}-${randomGroup()}`;
}
