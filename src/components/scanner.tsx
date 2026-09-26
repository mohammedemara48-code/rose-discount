import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import type { Point } from "@/lib/sticker-price";

type Phase = "opening" | "live" | "denied" | "failed";

export type ScanFrame = { canvas: HTMLCanvasElement; points: Point[] };

function pointsOf(result: { getResultPoints: () => Array<{ getX: () => number; getY: () => number }> }): Point[] {
  return result.getResultPoints().map((point) => ({ x: point.getX(), y: point.getY() }));
}

function snapshot(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1;
  canvas.height = video.videoHeight || 1;
  canvas.getContext("2d")?.drawImage(video, 0, 0);
  return canvas;
}

export function Scanner({ onText }: { onText: (text: string, frame?: ScanFrame) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const onTextRef = useRef(onText);
  const [phase, setPhase] = useState<Phase>("opening");
  const [photoError, setPhotoError] = useState("");

  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let controls: { stop: () => void } | undefined;

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 180,
          delayBetweenScanSuccess: 900,
        });
        const next = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: "environment" } } },
          video,
          (result) => {
            if (!result || !video.videoWidth) return;
            onTextRef.current(result.getText(), { canvas: snapshot(video), points: pointsOf(result) });
          },
        );
        if (cancelled) {
          next.stop();
          return;
        }
        controls = next;
        setPhase("live");
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : "";
        setPhase(name === "NotAllowedError" || name === "PermissionDeniedError" ? "denied" : "failed");
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
      const stream = video.srcObject;
      if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    };
  }, []);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setPhotoError("");
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeFromImageElement(img);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      canvas.getContext("2d")?.drawImage(img, 0, 0);
      onTextRef.current(result.getText(), { canvas, points: pointsOf(result) });
    } catch {
      setPhotoError("ما قدرنا نقرأ الكود من الصورة.");
    } finally {
      URL.revokeObjectURL(url);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const alert =
    photoError ||
    (phase === "denied" ? "اسمح للكاميرا من إعدادات المتصفح." : phase === "failed" ? "الكاميرا مش متاحة." : "");

  return (
    <div className="relative h-full overflow-hidden rounded-card bg-ink">
      <video ref={videoRef} className="h-full w-full object-cover" muted autoPlay playsInline />
      <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-on-rose" />
      <button
        type="button"
        className="press absolute end-3 top-3 grid size-11 place-items-center rounded-xl bg-ink/70 text-on-rose"
        aria-label="صورة"
        onClick={() => fileRef.current?.click()}
      >
        <ImagePlus className="size-5" aria-hidden="true" />
      </button>
      <input
        ref={fileRef}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
      {alert ? (
        <p role="alert" className="absolute inset-x-3 bottom-3 rounded-xl bg-paper/95 px-3 py-2 text-center text-sm text-ink">
          {alert}
        </p>
      ) : null}
    </div>
  );
}
