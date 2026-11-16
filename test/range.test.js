import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRange } from "../lib/range.js";

test("parseRange", () => {
  assert.equal(parseRange(null, 1000), null);
  assert.deepEqual(parseRange("bytes=0-", 1000), { offset: 0, length: 1000 });
  assert.deepEqual(parseRange("bytes=0-1", 1000), { offset: 0, length: 2 });
  assert.deepEqual(parseRange("bytes=500-9999", 1000), { offset: 500, length: 500 });
  assert.deepEqual(parseRange("bytes=-200", 1000), { offset: 800, length: 200 });
  assert.deepEqual(parseRange("bytes=-5000", 1000), { offset: 0, length: 1000 });
  assert.deepEqual(parseRange(" bytes = 10 - 19 ", 1000), { offset: 10, length: 10 });
  for (const h of ["bytes=1000-", "bytes=5-2", "bytes=abc", "items=0-1", "bytes=0-1,5-6", "bytes=-0", "bytes=-", ""]) {
    assert.equal(parseRange(h, 1000), "invalid", h);
  }
  assert.equal(parseRange("bytes=0-", 0), "invalid");
});
