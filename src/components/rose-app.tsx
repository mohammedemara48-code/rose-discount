import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronRight, ScanLine } from "lucide-react";
import mark from "@/assets/rose-mark.jpg";
import {
  FG_FROM,
  FG_TO,
  evaluate,
  parseScan,
  type Quote,
} from "@/lib/discount";
import { Scanner } from "@/components/scanner";

const HISTORY_KEY = "rose-discount-v1";
type Mode = "vas" | "other";

const VAS_EXAMPLES = ["vas0200", "vas0500", "vas1000"];
const FG_EXAMPLES = [FG_FROM, "fg00150", FG_TO];

function loadHistory(): Quote[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQuote).slice(0, 12);
  } catch {
    return [];
  }
}

function isQuote(value: unknown): value is Quote {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<Quote>;
  return typeof row.id === "string" && typeof row.code === "string" && typeof row.pay === "number";
}

function saveHistory(rows: Quote[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(rows.slice(0, 12)));
  } catch {
    /* private mode */
  }
}

export function RoseApp() {
  const [screen, setScreen] = useState<"home" | "desk">("home");
  const [mode, setMode] = useState<Mode>("vas");
  const [code, setCode] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");
  const [canForce, setCanForce] = useState(false);
  const [canSwitch, setCanSwitch] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [history, setHistory] = useState<Quote[]>([]);
  const priceRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const lastScan = useRef({ text: "", at: 0 });

  useEffect(() => {
    setHistory(loadHistory());
    if (!("serviceWorker" in navigator)) return;
    void (async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          regs
            .filter((reg) => !reg.active?.scriptURL.endsWith("/rose-sw.js"))
            .map((reg) => reg.unregister()),
        );
        await navigator.serviceWorker.register("/rose-sw.js", { scope: "/" });
      } catch {
        /* camera-only browsers still work without install */
      }
    })();
  }, []);

  function resetDesk(next: Mode) {
    setMode(next);
    setScreen("desk");
    setCode("");
    setPrice("");
    setError("");
    setCanForce(false);
    setCanSwitch(false);
    setQuote(null);
  }

  function remember(next: Quote) {
    setQuote(next);
    setHistory((prev) => {
      const rows = [next, ...prev].slice(0, 12);
      saveHistory(rows);
      return rows;
    });
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(24);
    }
  }

  function commit(nextCode: string, nextPrice: string, allowOutOfRangeFg: boolean, nextMode = mode) {
    const result = evaluate({
      mode: nextMode,
      code: nextCode,
      priceText: nextPrice,
      allowOutOfRangeFg,
    });
    if (!result.ok) {
      setQuote(null);
      setError(result.error);
      setCanForce(Boolean(result.canForceFg));
      setCanSwitch(Boolean(result.canSwitchToOther));
      return;
    }
    setError("");
    setCanForce(false);
    setCanSwitch(false);
    remember({ ...result.quote, id: crypto.randomUUID(), at: Date.now() });
  }

  function onScan(text: string) {
    const now = Date.now();
    if (text === lastScan.current.text && now - lastScan.current.at < 1600) return;
    lastScan.current = { text, at: now };

    const hit = parseScan(text);
    if (mode === "vas") {
      const shown = hit.type === "vas" || hit.type === "vas-out" ? hit.code : text.trim();
      setCode(shown);
      commit(shown, "", false);
      return;
    }
    if (hit.type === "vas") {
      setCode(hit.code);
      setPrice("");
      commit(hit.code, "", false);
      return;
    }
    if (hit.type === "fg") {
      setCode(hit.code);
      if (hit.embeddedPrice != null) {
        const printed = hit.embeddedPrice.toFixed(2);
        setPrice(printed);
        commit(hit.code, printed, false);
        return;
      }
      setQuote(null);
      setError("");
      setCanForce(false);
      setCanSwitch(false);
      priceRef.current?.focus();
      return;
    }
    if (hit.type === "other") {
      setCode(hit.code);
      setQuote(null);
      setError("");
      priceRef.current?.focus();
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    commit(code, price, false);
  }

  function openHistory(item: Quote) {
    setMode(item.family === "vas" ? "vas" : "other");
    setScreen("desk");
    setQuote(item);
    setCode(item.code === "بدون كود" ? "" : item.code);
    setPrice(item.family === "vas" ? "" : item.original.toFixed(2));
    setError("");
    setCanForce(false);
    setCanSwitch(false);
  }

  return (
    <main className="min-h-dvh bg-paper text-ink">
      <div className="safe-bottom mx-auto flex w-full max-w-md flex-col gap-5 px-5 pt-6">
        {screen === "home" ? (
          <Home
            history={history}
            onOpen={resetDesk}
            onHistory={openHistory}
            onClear={() => {
              saveHistory([]);
              setHistory([]);
            }}
          />
        ) : (
          <>
            <header className="flex items-center gap-3">
              <button
                type="button"
                className="press grid h-11 w-11 place-items-center rounded-xl border border-line bg-card"
                aria-label="رجوع"
                onClick={() => setScreen("home")}
              >
                <ChevronRight className="size-5" aria-hidden="true" />
              </button>
              <div>
                <p className="text-sm text-muted">{mode === "vas" ? "أكواد VAS" : "باقي المنتجات"}</p>
                <h1 className="text-xl font-semibold">{mode === "vas" ? "خصم 25%" : "خصم 10%"}</h1>
              </div>
            </header>

            {quote ? <Receipt quote={quote} onNext={() => {
              setQuote(null);
              setCode("");
              setPrice("");
              setError("");
              codeRef.current?.focus();
            }} /> : null}

            <Scanner onText={onScan} />

            <form className="grid gap-3" onSubmit={onSubmit}>
              <label className="grid gap-2 text-sm font-medium" htmlFor="code">
                كود المنتج
                <input
                  ref={codeRef}
                  id="code"
                  value={code}
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  placeholder={mode === "vas" ? "vas0200" : FG_FROM}
                  className="h-14 rounded-xl border border-line bg-card px-4 text-base font-medium text-ink"
                  onChange={(event) => setCode(event.target.value)}
                />
              </label>

              {mode === "other" ? (
                <label className="grid gap-2 text-sm font-medium" htmlFor="price">
                  سعر الاستيكر بالريال
                  <input
                    ref={priceRef}
                    id="price"
                    value={price}
                    inputMode="decimal"
                    autoComplete="off"
                    enterKeyHint="done"
                    placeholder="200"
                    className="h-14 rounded-xl border border-line bg-card px-4 text-base font-medium tabular-nums text-ink"
                    onChange={(event) => setPrice(event.target.value)}
                  />
                </label>
              ) : null}

              <button
                type="submit"
                className="press h-14 rounded-xl bg-rose text-base font-semibold text-on-rose"
              >
                احسب الخصم
              </button>

              <div className="flex flex-wrap gap-2">
                {(mode === "vas" ? VAS_EXAMPLES : FG_EXAMPLES).map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="press h-10 rounded-full border border-line bg-card px-3 text-sm font-medium"
                    onClick={() => {
                      setCode(example);
                      if (mode === "vas") commit(example, "", false);
                      else {
                        setQuote(null);
                        setError("");
                        priceRef.current?.focus();
                      }
                    }}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </form>

            {error ? (
              <div role="alert" className="grid gap-3 rounded-xl bg-rose-soft px-3 py-3 text-sm">
                <p>{error}</p>
                {canForce ? (
                  <button
                    type="button"
                    className="press h-11 rounded-xl bg-ink text-sm font-semibold text-on-rose"
                    onClick={() => commit(code, price, true)}
                  >
                    احسب 10% رغم ذلك
                  </button>
                ) : null}
                {canSwitch ? (
                  <button
                    type="button"
                    className="press h-11 rounded-xl bg-ink text-sm font-semibold text-on-rose"
                    onClick={() => {
                      setMode("other");
                      setError("");
                      setCanSwitch(false);
                    }}
                  >
                    حوّله لخصم 10%
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

function Home({
  history,
  onOpen,
  onHistory,
  onClear,
}: {
  history: Quote[];
  onOpen: (mode: Mode) => void;
  onHistory: (item: Quote) => void;
  onClear: () => void;
}) {
  return (
    <>
      <img src={mark} alt="ROSE" className="mx-auto w-52 max-w-full" />
      <h1 className="text-center text-2xl font-semibold text-balance">حساب الخصم</h1>

      <div className="grid gap-3">
        <button
          type="button"
          className="press flex items-center justify-between gap-4 rounded-card bg-rose p-4 text-start text-on-rose shadow-card"
          onClick={() => onOpen("vas")}
        >
          <span>
            <span className="block text-5xl font-semibold leading-none tabular-nums">25%</span>
            <span className="mt-3 block text-lg font-semibold">خصم VAS</span>
          </span>
          <ScanLine className="size-8 shrink-0" aria-hidden="true" />
        </button>

        <button
          type="button"
          className="press flex items-center justify-between gap-4 rounded-card border border-line bg-card p-4 text-start shadow-card"
          onClick={() => onOpen("other")}
        >
          <span>
            <span className="block text-5xl font-semibold leading-none tabular-nums text-rose">10%</span>
            <span className="mt-3 block text-lg font-semibold">خصم باقي المنتجات</span>
          </span>
          <ScanLine className="size-8 shrink-0 text-rose" aria-hidden="true" />
        </button>
      </div>

      {history.length > 0 ? (
        <section className="grid gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">آخر العمليات</h2>
            <button type="button" className="text-sm font-medium text-rose" onClick={onClear}>
              مسح
            </button>
          </div>
          <ul className="grid gap-2">
            {history.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="press flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-card px-3 py-3 text-start"
                  onClick={() => onHistory(item)}
                >
                  <span>
                    <span className="block text-sm font-semibold">{item.code}</span>
                    <span className="block text-sm text-muted">{item.rate === 0.25 ? "خصم 25%" : "خصم 10%"}</span>
                  </span>
                  <span className="text-base font-semibold tabular-nums text-rose">{item.pay.toFixed(2)} ر.س</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function Receipt({ quote, onNext }: { quote: Quote; onNext: () => void }) {
  const label = quote.family === "vas" ? "VAS" : quote.family === "fg" ? "FG" : "منتج";
  return (
    <article aria-live="polite" className="rise grid gap-4 rounded-card border border-line bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{label}</p>
        <p className="rounded-full bg-rose px-3 py-1 text-sm font-semibold text-on-rose">
          {quote.rate === 0.25 ? "25%" : "10%"}
        </p>
      </div>
      <p className="text-lg font-semibold tracking-wide">{quote.code}</p>
      <div>
        <p className="text-sm text-muted">تدفع</p>
        <p className="price-hero text-rose">{quote.pay.toFixed(2)}</p>
        <p className="mt-1 text-sm font-semibold">ر.س</p>
      </div>
      <dl className="grid gap-2 border-t border-line pt-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">قبل الخصم</dt>
          <dd className="font-medium tabular-nums">{quote.original.toFixed(2)} ر.س</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">قيمة الخصم</dt>
          <dd className="font-medium tabular-nums">{quote.discount.toFixed(2)} ر.س</dd>
        </div>
      </dl>
      <button type="button" className="press h-12 rounded-xl bg-ink text-sm font-semibold text-on-rose" onClick={onNext}>
        المنتج التالي
      </button>
    </article>
  );
}
