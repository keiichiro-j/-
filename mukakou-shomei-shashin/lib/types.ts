export interface CapturedPhoto {
  canvas: HTMLCanvasElement;
  proofId: string;
  capturedAt: string;
}

export type TabKey = "camera" | "history" | "settings";
