import { test } from "node:test";
import assert from "node:assert/strict";
import {
  json, newId, isValidId, retentionDays, expiresAt, isExpired,
  indexKey, productKey, mediaKeyOk, extFromContentType, safeMediaType,
} from "../lib/util.js";

test("newId: 10 ký tự a-z0-9, khác nhau mỗi lần", () => {
  const a = newId(), b = newId();
  assert.match(a, /^[a-z0-9]{10}$/);
  assert.notEqual(a, b);
  assert.equal(isValidId(a), true);
});

test("isValidId từ chối id sai định dạng", () => {
  for (const id of ["", "abc", "ABCDEFGHIJ", "../abcdefg", "abcdefghijk", undefined]) assert.equal(isValidId(id), false);
});

test("indexKey: mới hơn xếp trước theo thứ tự chữ", () => {
  assert.ok(indexKey(2000, "aaaaaaaaaa") < indexKey(1000, "bbbbbbbbbb"));
  assert.equal(indexKey(1, "abcdefghij"), "i/9999999999998_abcdefghij");
});

test("productKey", () => {
  assert.equal(productKey("abcdefghij", "product.json"), "p/abcdefghij/product.json");
});

test("isExpired: đúng 7 ngày thì hết hạn", () => {
  const t = "2026-11-01T00:00:00.000Z", day = 86400000, base = Date.parse(t);
  assert.equal(isExpired(t, 7, base + 7 * day - 1), false);
  assert.equal(isExpired(t, 7, base + 7 * day), true);
  assert.equal(expiresAt(t, 7), "2026-11-08T00:00:00.000Z");
});

test("mediaKeyOk", () => {
  assert.equal(mediaKeyOk("p/abc123/img_01.jpg"), true);
  for (const k of ["cfg/brandkit.json", "p/abc/../x", "p/ABC/x.jpg", "i/123_abc", "p/abc/a/b.jpg", ""]) {
    assert.equal(mediaKeyOk(k), false, k);
  }
});

test("retentionDays mặc định 7", () => {
  assert.equal(retentionDays({}), 7);
  assert.equal(retentionDays({ RETENTION_DAYS: "3" }), 3);
});

test("extFromContentType", () => {
  assert.equal(extFromContentType("image/jpeg", "bin"), "jpg");
  assert.equal(extFromContentType("image/png", "jpg"), "png");
  assert.equal(extFromContentType("image/webp; charset=binary", "jpg"), "webp");
  assert.equal(extFromContentType("video/mp4", "bin"), "mp4");
  assert.equal(extFromContentType("image/gif", "jpg"), "gif");
  assert.equal(extFromContentType("image/avif", "jpg"), "avif");
  assert.equal(extFromContentType("image/svg+xml", "jpg"), "jpg");
  assert.equal(extFromContentType(null, "jpg"), "jpg");
  assert.equal(extFromContentType("text/html", "jpg"), "jpg");
});

test("json() trả UTF-8", async () => {
  const r = json({ a: "ấ" }, 201);
  assert.equal(r.status, 201);
  assert.match(r.headers.get("content-type"), /application\/json; charset=utf-8/);
  assert.deepEqual(await r.json(), { a: "ấ" });
});

test("safeMediaType: chỉ ảnh raster và video, đã chuẩn hoá", () => {
  assert.equal(safeMediaType("image/jpeg"), "image/jpeg");
  assert.equal(safeMediaType("IMAGE/PNG; charset=x"), "image/png");
  assert.equal(safeMediaType("video/mp4"), "video/mp4");
  for (const t of ["image/svg+xml", "text/html", "application/json", "application/octet-stream", "", null, undefined]) assert.equal(safeMediaType(t), null, String(t));
});
