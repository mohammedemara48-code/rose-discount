import assert from "node:assert/strict";
import test from "node:test";
import { pickPrintedPrice } from "./sticker-price.ts";

test("reads 60 beside FG01587 and ignores the item number", () => {
  const text = "FGON687 y arr\n|\nR Je 60 oa\n- Type";
  assert.equal(pickPrintedPrice(text, 1587), 60);
});

test("reads a decimal sticker price", () => {
  assert.equal(pickPrintedPrice("price 199.50", 89), 199.5);
});

test("does not treat the item number as the price", () => {
  assert.equal(pickPrintedPrice("01587", 1587), null);
});
