"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { generateProofId } from "@/lib/id";
import { CapturedPhoto } from "@/lib/types";

type FacingMode = "user" | "environment";

export default function CameraScreen({
  onCaptured,
  onOpenHistory,
}: {
  onCaptured: (photo: CapturedPhoto) => void;
  onOpenHistory: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Guards against React StrictMode's dev-only double-invoke (and rapid
  // facingMode toggling) racing two getUserMedia calls against each other.
  const requestIdRef = useRef(0);
  const [facingMode, setFacingMode] = useState<FacingMode>("user");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const startStream = useCallback(async (mode: FacingMode) => {
    const requestId = ++requestIdRef.current;
    setError(null);
    setReady(false);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode },
          audio: false,
        });
      } catch {
        // Fall back for devices (e.g. laptop webcams) without a matching camera.
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      if (requestId !== requestIdRef.current) {
        // A newer request superseded this one before it resolved; discard.
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setReady(true);
    } catch {
      if (requestId === requestIdRef.current) {
        setError("カメラにアクセスできませんでした。ブラウザの権限設定を確認してください。");
      }
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opens the camera stream (external device), not a pure state derivation
    void startStream(facingMode);
    return () => {
      requestIdRef.current++;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  function handleShutter() {
    const video = videoRef.current;
    if (!video || !ready) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Captured pixels are never mirrored, even when the live preview is —
    // the saved/exported photo should reflect what the lens actually saw.
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    onCaptured({
      canvas,
      proofId: generateProofId(),
      capturedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="flex flex-1 flex-col bg-black text-white">
      <div className="relative flex-1 overflow-hidden">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-sm text-zinc-300">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => startStream(facingMode)}
              className="rounded-md border border-white/60 px-4 py-2 text-xs font-bold"
            >
              再試行
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
            style={facingMode === "user" ? { transform: "scaleX(-1)" } : undefined}
          />
        )}
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full border border-white/50 bg-black/30 px-3 py-1 text-[10px] font-bold tracking-wide">
          美顔・加工機能は非搭載
        </div>
      </div>

      <div className="relative flex items-center justify-center gap-10 bg-black py-5">
        <button
          type="button"
          onClick={onOpenHistory}
          className="absolute left-6 rounded-lg border border-white/60 px-3 py-3 text-[10px]"
        >
          履歴
        </button>
        <button
          type="button"
          onClick={handleShutter}
          disabled={!ready}
          aria-label="シャッター"
          className="h-[58px] w-[58px] rounded-full border-[3px] border-white bg-transparent p-[3px] disabled:opacity-40"
        >
          <span className="block h-full w-full rounded-full border border-white bg-white/90" />
        </button>
        <button
          type="button"
          onClick={() => setFacingMode((m) => (m === "user" ? "environment" : "user"))}
          className="absolute right-6 rounded-lg border border-white/60 px-3 py-3 text-[10px]"
        >
          切替
        </button>
      </div>
    </div>
  );
}
