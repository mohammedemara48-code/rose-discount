import { parseMoney } from "./discount.ts";

export type Point = { x: number; y: number };

type Box = { x0: number; y0: number; x1: number; y1: number };

export function pickPrintedPrice(text: string, productNo: number | null): number | null {
  const padded = productNo == null ? "" : String(productNo).padStart(5, "0");
  const found: number[] = [];
  const re = /(?<![A-Za-z0-9])(\d{1,6}(?:[.,]\d{1,2})?)(?![A-Za-z0-9])/g;
  for (const match of text.matchAll(re)) {
    const raw = match[1] ?? "";
    const price = parseMoney(raw);
    if (price == null) continue;
    const bare = raw.replace(/\D/g, "").replace(/^0+/, "") || "0";
    if (productNo != null && (bare === String(productNo) || raw === padded)) continue;
    found.push(price);
  }
  return found.length ? found[found.length - 1] : null;
}

function clampBox(box: Box, width: number, height: number): Box | null {
  const x0 = Math.max(0, Math.floor(box.x0));
  const y0 = Math.max(0, Math.floor(box.y0));
  const x1 = Math.min(width, Math.ceil(box.x1));
  const y1 = Math.min(height, Math.ceil(box.y1));
  if (x1 - x0 < 24 || y1 - y0 < 24) return null;
  return { x0, y0, x1, y1 };
}

function sidesOf(points: Point[], width: number, height: number): Box[] {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const qw = Math.max(12, maxX - minX);
  const qh = Math.max(12, maxY - minY);
  const raw = [
    { x0: maxX, y0: minY - qh * 0.8, x1: maxX + qw * 5.2, y1: maxY + qh * 1.6 },
    { x0: minX - qw * 5.2, y0: minY - qh * 0.8, x1: minX, y1: maxY + qh * 1.6 },
    { x0: minX - qw * 1.2, y0: maxY, x1: maxX + qw * 4, y1: maxY + qh * 3 },
    { x0: minX - qw * 1.2, y0: minY - qh * 3, x1: maxX + qw * 4, y1: minY },
  ];
  return raw
    .map((box) => clampBox(box, width, height))
    .filter((box): box is Box => box != null);
}

function edgeEnergy(canvas: HTMLCanvasElement, box: Box): number {
  const sw = 64;
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  const sh = Math.max(8, Math.round(bh * (sw / bw)));
  const tmp = document.createElement("canvas");
  tmp.width = sw;
  tmp.height = sh;
  const ctx = tmp.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 0;
  ctx.drawImage(canvas, box.x0, box.y0, bw, bh, 0, 0, sw, sh);
  const data = ctx.getImageData(0, 0, sw, sh).data;
  let acc = 0;
  let n = 0;
  for (let y = 0; y < sh; y += 1) {
    for (let x = 1; x < sw; x += 1) {
      const i = (y * sw + x) * 4;
      acc += Math.abs(data[i] - data[i - 4]);
      n += 1;
    }
  }
  return n ? acc / n : 0;
}

function prepareCrop(canvas: HTMLCanvasElement, box: Box): HTMLCanvasElement {
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  const scale = Math.min(3, 1600 / Math.max(bw, bh));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(bw * scale));
  out.height = Math.max(1, Math.round(bh * scale));
  const ctx = out.getContext("2d", { willReadFrequently: true });
  if (!ctx) return out;
  ctx.drawImage(canvas, box.x0, box.y0, bw, bh, 0, 0, out.width, out.height);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  let min = 255;
  let max = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const y = img.data[i] * 0.3 + img.data[i + 1] * 0.59 + img.data[i + 2] * 0.11;
    if (y < min) min = y;
    if (y > max) max = y;
  }
  const span = Math.max(1, max - min);
  for (let i = 0; i < img.data.length; i += 4) {
    const y = img.data[i] * 0.3 + img.data[i + 1] * 0.59 + img.data[i + 2] * 0.11;
    const v = Math.max(0, Math.min(255, ((y - min) * 255) / span));
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

type OcrWorker = {
  recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string } }>;
};

let workerPromise: Promise<OcrWorker> | null = null;

function ocrWorker(): Promise<OcrWorker> {
  if (!workerPromise) {
    workerPromise = import("tesseract.js").then(({ createWorker }) => createWorker("eng"));
  }
  return workerPromise;
}

export function preloadPriceReader() {
  void ocrWorker().catch(() => {
    workerPromise = null;
  });
}

export async function readPrintedPrice(
  canvas: HTMLCanvasElement,
  points: Point[],
  productNo: number | null,
): Promise<number | null> {
  const boxes = points.length >= 2 ? sidesOf(points, canvas.width, canvas.height) : [];
  const ordered = boxes
    .map((box) => ({ box, energy: edgeEnergy(canvas, box) }))
    .sort((a, b) => b.energy - a.energy)
    .slice(0, 2)
    .map((item) => item.box);
  if (!ordered.length) {
    ordered.push({
      x0: Math.round(canvas.width * 0.08),
      y0: Math.round(canvas.height * 0.28),
      x1: Math.round(canvas.width * 0.92),
      y1: Math.round(canvas.height * 0.72),
    });
  }
  try {
    const worker = await ocrWorker();
    for (const box of ordered) {
      const crop = prepareCrop(canvas, box);
      const { data } = await worker.recognize(crop);
      const price = pickPrintedPrice(data.text, productNo);
      if (price != null) return price;
    }
  } catch {
    workerPromise = null;
  }
  return null;
}
