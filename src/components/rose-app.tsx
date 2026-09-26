import { useEffect, useRef, useState } from "react";
import mark from "@/assets/rose-mark.jpg";
import { evaluate, parseScan, type Quote } from "@/lib/discount";
import { preloadPriceReader, readPrintedPrice } from "@/lib/sticker-price";
import { Scanner, type ScanFrame } from "@/components/scanner";

type Mode = "vas" | "other";

export function RoseApp() {
  const [mode, setMode] = useState<Mode>("vas");
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [seen, setSeen] = useState("");
  const lastScan = useRef({ text: "", at: 0, ok: false });
  const job = useRef(0);

  useEffect(() => {
    preloadPriceReader();
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/rose-sw.js", { scope: "/" }).catch(() => {});
  }, []);

  function commit(nextCode: string, nextPrice: string, nextMode: Mode) {
    const result = evaluate({
      mode: nextMode,
      code: nextCode,
      priceText: nextPrice,
      allowOutOfRangeFg: false,
    });
    if (!result.ok) {
      setError(result.error);
      lastScan.current.ok = false;
      return;
    }
    setError("");
    setMode(result.quote.rate === 0.25 ? "vas" : "other");
    setQuote({ ...result.quote, id: crypto.randomUUID(), at: Date.now() });
    lastScan.current.ok = true;
    if (typeof navigator.vibrate === "function") navigator.vibrate(24);
  }

  async function onScan(text: string, frame?: ScanFrame) {
    const now = Date.now();
    const wait = lastScan.current.ok ? 3500 : 900;
    if (text === lastScan.current.text && now - lastScan.current.at < wait) return;
    lastScan.current = { text, at: now, ok: false };

    const hit = parseScan(text);
    if (hit.type === "empty") return;
    setSeen(hit.code);
    if (hit.type === "vas" || hit.type === "vas-out") {
      setReading(false);
      setMode("vas");
      commit(hit.code, "", "vas");
      return;
    }

    setMode("other");
    if (hit.embeddedPrice != null) {
      setReading(false);
      commit(hit.code, hit.embeddedPrice.toFixed(2), "other");
      return;
    }

    const current = ++job.current;
    setReading(true);
    setError("");
    const productNo = hit.type === "fg" ? hit.productNo : null;
    const price = frame ? await readPrintedPrice(frame.canvas, frame.points, productNo) : null;
    if (current !== job.current) return;
    setReading(false);
    if (price == null) {
      setQuote(null);
      setError("السعر مش ظاهر جنب الكود");
      return;
    }
    commit(hit.code, price.toFixed(2), "other");
  }

  const shownCode = quote?.code ?? (seen || "—");
  const shownPay = reading ? "…" : quote ? quote.pay.toFixed(2) : "—";

  return (
    <main className="fixed inset-0 flex flex-col bg-paper text-ink">
      <header className="flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <img src={mark} alt="ROSE" className="h-14 w-14 shrink-0 object-cover" />
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
          <button
            type="button"
            className={`press h-14 rounded-xl text-base font-semibold ${mode === "vas" ? "bg-rose text-on-rose" : "border border-line bg-card text-ink"}`}
            onClick={() => setMode("vas")}
          >
            25%
          </button>
          <button
            type="button"
            className={`press h-14 rounded-xl text-base font-semibold ${mode === "other" ? "bg-rose text-on-rose" : "border border-line bg-card text-ink"}`}
            onClick={() => setMode("other")}
          >
            10%
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 px-4 py-3">
        <Scanner onText={(text, frame) => void onScan(text, frame)} />
      </div>

      <footer className="px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div aria-live="polite" className="rounded-card border border-line bg-card px-4 py-3 shadow-card">
          <div className="flex items-end justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-semibold">{shownCode}</p>
            <p className="shrink-0 rounded-full bg-rose px-3 py-1 text-sm font-semibold text-on-rose">
              {quote ? (quote.rate === 0.25 ? "25%" : "10%") : mode === "vas" ? "25%" : "10%"}
            </p>
          </div>
          <p className="price-hero text-rose">{shownPay}</p>
          <p className="text-sm font-semibold">ر.س</p>
          <div className="mt-2 flex items-center justify-between gap-3 text-sm">
            <span className="tabular-nums text-muted">{quote && !reading ? quote.original.toFixed(2) : "—"}</span>
            <span className="tabular-nums text-muted">{quote && !reading ? `−${quote.discount.toFixed(2)}` : "—"}</span>
          </div>
          {error ? (
            <p role="alert" className="mt-2 truncate text-sm text-rose-deep">
              {error}
            </p>
          ) : null}
        </div>
      </footer>
    </main>
  );
}
