export const VAS_MIN = 1;
export const VAS_MAX = 1000;
export const VAS_RATE = 0.25 as const;
export const FG_MIN = 89;
export const FG_MAX = 15600;
export const OTHER_RATE = 0.1 as const;

export const VAS_FROM = "vas0001";
export const VAS_TO = "vas1000";
export const FG_FROM = "fg00089";
export const FG_TO = "fg015600";

export type Family = "vas" | "fg" | "other";

export type QuoteDraft = {
  code: string;
  family: Family;
  rate: typeof VAS_RATE | typeof OTHER_RATE;
  original: number;
  discount: number;
  pay: number;
  warning?: string;
};

export type Quote = QuoteDraft & { id: string; at: number };

type ScanHit =
  | { type: "vas"; code: string; productNo: number; price: number }
  | { type: "vas-out"; code: string; productNo: number }
  | { type: "fg"; code: string; productNo: number; inRange: boolean; embeddedPrice: number | null }
  | { type: "other"; code: string; embeddedPrice: number | null }
  | { type: "empty" };

export type EvalResult =
  | { ok: true; quote: QuoteDraft }
  | { ok: false; error: string; canForceFg?: boolean; canSwitchToOther?: boolean };

const EASTERN = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";

export function normalizeDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(EASTERN.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(PERSIAN.indexOf(d)))
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "");
}

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatSar(n: number): string {
  return `${n.toFixed(2)} ر.س`;
}

export function parseMoney(raw: string): number | null {
  const s = normalizeDigits(raw).trim().replace(/\s/g, "").replace("٬", "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || n > 999999.99) return null;
  return roundMoney(n);
}

function labeledPrice(text: string): number | null {
  const m = /(?:price|amount|sar|ريال|سعر)\s*[:=]?\s*([0-9]+(?:[.,][0-9]{1,2})?)/i.exec(text);
  if (!m) return null;
  return parseMoney(m[1] ?? "");
}

function priceAfter(text: string, end: number): number | null {
  const rest = text.slice(end);
  const glued = /^\s*[|,;:/]\s*([0-9]+(?:[.,][0-9]{1,2})?)/.exec(rest);
  if (glued) return parseMoney(glued[1] ?? "");
  return labeledPrice(rest);
}

function findCode(text: string, kind: "vas" | "fg"): RegExpExecArray | null {
  const re = new RegExp(`(?:^|[^a-z0-9])${kind}[\\s\\-_]*([0-9]+)`, "i");
  return re.exec(text);
}

export function parseScan(raw: string): ScanHit {
  const text = normalizeDigits(raw).replace(/ـ/g, "").trim();
  if (!text) return { type: "empty" };

  const vas = findCode(text, "vas");
  const fg = findCode(text, "fg");
  const useVas = vas && (!fg || vas.index <= fg.index);

  if (useVas && vas) {
    const digits = vas[1] ?? "";
    const productNo = Number(digits);
    if (!Number.isInteger(productNo) || productNo < VAS_MIN || productNo > VAS_MAX) {
      return { type: "vas-out", code: `vas${digits}`, productNo };
    }
    return {
      type: "vas",
      code: `vas${String(productNo).padStart(4, "0")}`,
      productNo,
      price: productNo,
    };
  }

  if (fg) {
    const digits = fg[1] ?? "";
    const productNo = Number(digits);
    const end = fg.index + fg[0].length;
    const inRange = Number.isInteger(productNo) && productNo >= FG_MIN && productNo <= FG_MAX;
    return {
      type: "fg",
      code: `fg${digits}`,
      productNo,
      inRange,
      embeddedPrice: priceAfter(text, end),
    };
  }

  return { type: "other", code: text.slice(0, 80), embeddedPrice: labeledPrice(text) };
}

function bareVas(raw: string): ScanHit | null {
  const text = normalizeDigits(raw).trim();
  if (!/^[0-9]+$/.test(text)) return null;
  const productNo = Number(text);
  if (!Number.isInteger(productNo)) return null;
  const code = `vas${String(productNo).padStart(4, "0")}`;
  if (productNo < VAS_MIN || productNo > VAS_MAX) return { type: "vas-out", code, productNo };
  return { type: "vas", code, productNo, price: productNo };
}

function draft(
  code: string,
  family: Family,
  original: number,
  rate: typeof VAS_RATE | typeof OTHER_RATE,
  warning?: string,
): QuoteDraft {
  const base = roundMoney(original);
  const discount = roundMoney(base * rate);
  const pay = roundMoney(base - discount);
  return { code, family, rate, original: base, discount, pay, warning };
}

export function evaluate(input: {
  mode: "vas" | "other";
  code: string;
  priceText: string;
  allowOutOfRangeFg: boolean;
}): EvalResult {
  const priceText = input.priceText.trim();
  const price = priceText ? parseMoney(priceText) : null;
  if (priceText && price === null) {
    return { ok: false, error: "سعر الاستيكر غير واضح. اكتب رقمًا مثل 200 أو 199.50" };
  }

  let hit = parseScan(input.code);
  if (input.mode === "vas" && (hit.type === "empty" || hit.type === "other")) {
    const bare = bareVas(input.code);
    if (bare) hit = bare;
  }

  if (hit.type === "empty") {
    if (input.mode === "other" && price) {
      return { ok: true, quote: draft("بدون كود", "other", price, OTHER_RATE) };
    }
    return {
      ok: false,
      error: input.mode === "vas" ? "أدخل كود VAS، مثل vas0200" : "أدخل كود المنتج أو سعر الاستيكر",
    };
  }

  if (hit.type === "vas") {
    let warning: string | undefined;
    if (input.mode === "other") {
      warning = "كود VAS. السعر مأخوذ من الكود، والخصم 25%.";
    } else if (price && price !== hit.price) {
      warning = `اتحسب من الكود ${hit.price.toFixed(2)}، وليس من ${price.toFixed(2)} المكتوب.`;
    }
    return { ok: true, quote: draft(hit.code, "vas", hit.price, VAS_RATE, warning) };
  }

  if (hit.type === "vas-out") {
    return {
      ok: false,
      error: `${hit.code} خارج نطاق VAS. المسموح من ${VAS_FROM} إلى ${VAS_TO}.`,
      canSwitchToOther: true,
    };
  }

  if (input.mode === "vas") {
    return {
      ok: false,
      error: "هذا ليس كود VAS. باقي المنتجات خصمها 10%، والسعر من الاستيكر.",
      canSwitchToOther: true,
    };
  }

  if (hit.type === "fg" && !hit.inRange && !input.allowOutOfRangeFg) {
    return {
      ok: false,
      error: `${hit.code} خارج نطاق FG، من ${FG_FROM} إلى ${FG_TO}.`,
      canForceFg: true,
    };
  }

  if (
    hit.type === "other" &&
    !price &&
    hit.embeddedPrice === null &&
    /^[0-9]+(?:\.[0-9]{1,2})?$/.test(hit.code)
  ) {
    const asPrice = parseMoney(hit.code);
    if (asPrice) {
      return {
        ok: true,
        quote: draft("بدون كود", "other", asPrice, OTHER_RATE, "اتحسب كسعر استيكر بدون كود منتج."),
      };
    }
  }

  const sticker = price ?? hit.embeddedPrice;
  if (sticker === null) {
    return { ok: false, error: "اكتب سعر الاستيكر بالريال. السعر مش موجود جوه كود FG." };
  }

  const warning =
    hit.type === "fg" && !hit.inRange ? "الكود خارج النطاق المعتاد، وطُبّق خصم 10%." : undefined;
  const family: Family = hit.type === "fg" ? "fg" : "other";
  return { ok: true, quote: draft(hit.code, family, sticker, OTHER_RATE, warning) };
}
