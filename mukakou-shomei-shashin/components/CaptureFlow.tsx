"use client";

import { useEffect, useState } from "react";
import { CapturedPhoto } from "@/lib/types";
import { composeWatermarkedPhoto } from "@/lib/watermark";
import { sha256Hex } from "@/lib/hash";
import { saveHistoryEntry } from "@/lib/history";
import CameraScreen from "./CameraScreen";
import ConfirmScreen from "./ConfirmScreen";
import ExportScreen from "./ExportScreen";

type Step =
  | { kind: "camera" }
  | { kind: "confirm"; photo: CapturedPhoto }
  | { kind: "saving"; photo: CapturedPhoto }
  | { kind: "export"; photo: CapturedPhoto; dataUrl: string; blob: Blob }
  | { kind: "error"; photo: CapturedPhoto; message: string };

export default function CaptureFlow({
  onOpenHistory,
  onOpenDetail,
  onFullScreenChange,
}: {
  onOpenHistory: () => void;
  onOpenDetail: (id: string) => void;
  onFullScreenChange?: (fullScreen: boolean) => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "camera" });

  useEffect(() => {
    onFullScreenChange?.(step.kind !== "camera");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind]);

  async function registerAndWatermark(photo: CapturedPhoto) {
    setStep({ kind: "saving", photo });
    try {
      const verifyUrl = `${window.location.origin}/verify/${photo.proofId}`;
      const { blob, dataUrl } = await composeWatermarkedPhoto({
        sourceCanvas: photo.canvas,
        proofId: photo.proofId,
        verifyUrl,
      });
      const hash = await sha256Hex(blob);

      const res = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: photo.proofId, hash, capturedAt: photo.capturedAt }),
      });
      if (!res.ok) {
        throw new Error(`証明情報の発行に失敗しました (${res.status})`);
      }
      const { signature, registeredAt } = await res.json();

      await saveHistoryEntry({
        id: photo.proofId,
        capturedAt: photo.capturedAt,
        registeredAt,
        hash,
        signature,
        verifyUrl,
        favorite: false,
        imageBlob: blob,
      });

      setStep({ kind: "export", photo, dataUrl, blob });
    } catch (e) {
      setStep({
        kind: "error",
        photo,
        message: e instanceof Error ? e.message : "証明情報の発行に失敗しました",
      });
    }
  }

  if (step.kind === "camera") {
    return (
      <CameraScreen
        onCaptured={(photo) => setStep({ kind: "confirm", photo })}
        onOpenHistory={onOpenHistory}
      />
    );
  }

  if (step.kind === "confirm") {
    return (
      <ConfirmScreen
        canvas={step.photo.canvas}
        proofId={step.photo.proofId}
        saving={false}
        onRetake={() => setStep({ kind: "camera" })}
        onSave={() => registerAndWatermark(step.photo)}
      />
    );
  }

  if (step.kind === "saving") {
    return (
      <ConfirmScreen
        canvas={step.photo.canvas}
        proofId={step.photo.proofId}
        saving
        onRetake={() => setStep({ kind: "camera" })}
        onSave={() => {}}
      />
    );
  }

  if (step.kind === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-white px-6 text-center">
        <p className="text-sm text-red-600">{step.message}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStep({ kind: "camera" })}
            className="rounded-md border border-zinc-800 px-4 py-2 text-xs font-bold"
          >
            撮り直す
          </button>
          <button
            type="button"
            onClick={() => registerAndWatermark(step.photo)}
            className="rounded-md bg-zinc-900 px-4 py-2 text-xs font-bold text-white"
          >
            再試行
          </button>
        </div>
      </div>
    );
  }

  return (
    <ExportScreen
      dataUrl={step.dataUrl}
      blob={step.blob}
      proofId={step.photo.proofId}
      onOpenDetail={() => onOpenDetail(step.photo.proofId)}
      onDone={() => setStep({ kind: "camera" })}
    />
  );
}
