import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus } from "lucide-react";

type Phase = "idle" | "opening" | "live" | "denied" | "failed";

export function Scanner({ onText }: { onText: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const onTextRef = useRef(onText);
  const [on, setOn] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [photoError, setPhotoError] = useState("");

  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  useEffect(() => {
    if (!on) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let controls: { stop: () => void } | undefined;
    setPhase("opening");

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 180,
          delayBetweenScanSuccess: 700,
        });
        const next = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: "environment" } } },
          video,
          (result) => {
            if (result) onTextRef.current(result.getText());
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
        setOn(false);
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
      const stream = video.srcObject;
      if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    };
  }, [on]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setPhotoError("");
    const url = URL.createObjectURL(file);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeFromImageUrl(url);
      onTextRef.current(result.getText());
    } catch {
      setPhotoError("ما قدرنا نقرأ الكود من الصورة. قرّب الاستيكر أو اكتب الكود.");
    } finally {
      URL.revokeObjectURL(url);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <section className="grid gap-3">
      {on ? (
        <div className="relative overflow-hidden rounded-card bg-ink">
          <video ref={videoRef} className="aspect-square w-full object-cover" muted autoPlay playsInline />
          <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-on-rose" />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          className="press flex h-14 items-center justify-center gap-2 rounded-xl bg-rose px-3 text-base font-semibold text-on-rose"
          onClick={() => {
            setPhotoError("");
            if (on) {
              setOn(false);
              setPhase("idle");
              return;
            }
            setOn(true);
          }}
        >
          <Camera className="size-5" aria-hidden="true" />
          {on ? "إيقاف" : "الكاميرا"}
        </button>
        <button
          type="button"
          className="press flex h-14 items-center justify-center gap-2 rounded-xl border border-line bg-card px-3 text-base font-semibold text-ink"
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus className="size-5" aria-hidden="true" />
          صورة
        </button>
      </div>
      <input
        ref={fileRef}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
      {phase === "denied" ? (
        <p role="alert" className="rounded-xl bg-rose-soft px-3 py-3 text-sm text-ink">
          المتصفح منع الكاميرا. اسمح بها من الإعدادات، أو اكتب الكود، أو ارفع صورة الاستيكر.
        </p>
      ) : null}
      {phase === "failed" ? (
        <p role="alert" className="rounded-xl bg-rose-soft px-3 py-3 text-sm text-ink">
          الكاميرا مش متاحة هنا. اكتب الكود تحت، أو صوّر الاستيكر.
        </p>
      ) : null}
      {photoError ? (
        <p role="alert" className="rounded-xl bg-rose-soft px-3 py-3 text-sm text-ink">
          {photoError}
        </p>
      ) : null}
    </section>
  );
}
