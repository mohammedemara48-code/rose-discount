import assert from "node:assert/strict";
import test from "node:test";
import { evaluate, parseScan } from "./discount.ts";

test("vas0200 is 200 with 25% off", () => {
  const result = evaluate({ mode: "vas", code: "vas0200", priceText: "", allowOutOfRangeFg: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.quote.code, "vas0200");
  assert.equal(result.quote.original, 200);
  assert.equal(result.quote.discount, 50);
  assert.equal(result.quote.pay, 150);
  assert.equal(result.quote.rate, 0.25);
});

test("VAS1000 pays 750", () => {
  const result = evaluate({ mode: "vas", code: "VAS1000", priceText: "", allowOutOfRangeFg: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.quote.pay, 750);
});

test("vas0001 pays 0.75", () => {
  const result = evaluate({ mode: "vas", code: "vas0001", priceText: "", allowOutOfRangeFg: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.quote.original, 1);
  assert.equal(result.quote.discount, 0.25);
  assert.equal(result.quote.pay, 0.75);
});

test("bare 200 in VAS mode", () => {
  const result = evaluate({ mode: "vas", code: "200", priceText: "", allowOutOfRangeFg: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.quote.code, "vas0200");
  assert.equal(result.quote.pay, 150);
});

test("arabic digits", () => {
  const result = evaluate({ mode: "vas", code: "vas٠٢٠٠", priceText: "", allowOutOfRangeFg: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.quote.pay, 150);
});

test("url containing vas code", () => {
  const hit = parseScan("https://shop.example/q/vas0200");
  assert.equal(hit.type, "vas");
  if (hit.type !== "vas") return;
  assert.equal(hit.price, 200);
});

test("vas out of range", () => {
  const result = evaluate({ mode: "vas", code: "vas1001", priceText: "", allowOutOfRangeFg: false });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.canSwitchToOther, true);
});

test("fg00089 needs sticker price then 10%", () => {
  const missing = evaluate({ mode: "other", code: "fg00089", priceText: "", allowOutOfRangeFg: false });
  assert.equal(missing.ok, false);
  const result = evaluate({ mode: "other", code: "fg00089", priceText: "200", allowOutOfRangeFg: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.quote.code, "fg00089");
  assert.equal(result.quote.original, 200);
  assert.equal(result.quote.discount, 20);
  assert.equal(result.quote.pay, 180);
  assert.equal(result.quote.family, "fg");
});

test("fg01587 sticker 60 pays 54", () => {
  const result = evaluate({ mode: "other", code: "FG01587", priceText: "60", allowOutOfRangeFg: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.quote.code, "fg01587");
  assert.equal(result.quote.original, 60);
  assert.equal(result.quote.discount, 6);
  assert.equal(result.quote.pay, 54);
});

test("fg015600 is in range", () => {
  const result = evaluate({ mode: "other", code: "fg015600", priceText: "100", allowOutOfRangeFg: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.quote.pay, 90);
});

test("fg out of range can be forced", () => {
  const blocked = evaluate({ mode: "other", code: "fg00088", priceText: "100", allowOutOfRangeFg: false });
  assert.equal(blocked.ok, false);
  if (blocked.ok) return;
  assert.equal(blocked.canForceFg, true);
  const forced = evaluate({ mode: "other", code: "fg00088", priceText: "100", allowOutOfRangeFg: true });
  assert.equal(forced.ok, true);
});

test("embedded fg price", () => {
  const result = evaluate({ mode: "other", code: "fg00089|250", priceText: "", allowOutOfRangeFg: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.quote.original, 250);
  assert.equal(result.quote.pay, 225);
});

test("VAS scanned inside 10% mode still takes 25% from the code", () => {
  const result = evaluate({ mode: "other", code: "vas0200", priceText: "10", allowOutOfRangeFg: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.quote.family, "vas");
  assert.equal(result.quote.pay, 150);
  assert.match(result.quote.warning ?? "", /25%/);
});

test("sticker-only 10%", () => {
  const result = evaluate({ mode: "other", code: "", priceText: "50", allowOutOfRangeFg: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.quote.pay, 45);
  assert.equal(result.quote.code, "بدون كود");
});
