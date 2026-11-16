import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, formatPrice, formatCount, daysLeft, mediaUrl, safeUrl } from "../public/lib/format.js";

test("escapeHtml chặn HTML từ dữ liệu sàn", () => {
  assert.equal(escapeHtml(`<img src=x onerror="alert(1)">`), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.equal(escapeHtml("Tinh chất & 'bí đao'"), "Tinh chất &amp; &#39;bí đao&#39;");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml(217), "217");
});

test("formatPrice", () => {
  assert.equal(formatPrice(216749), "216.749₫");
  assert.equal(formatPrice(1250000), "1.250.000₫");
  assert.equal(formatPrice(null), "");
  assert.equal(formatPrice(undefined), "");
  assert.equal(formatPrice("abc"), "");
});

test("formatCount", () => {
  assert.equal(formatCount(229096), "229.096");
  assert.equal(formatCount(null), "");
});

test("daysLeft", () => {
  const now = Date.parse("2026-11-16T00:00:00Z");
  assert.equal(daysLeft("2026-11-16T01:00:00Z", now), 1);
  assert.equal(daysLeft("2026-11-23T00:00:00Z", now), 7);
  assert.equal(daysLeft("2026-11-15T00:00:00Z", now), 0);
  assert.equal(daysLeft("không phải ngày", now), 0);
});

test("mediaUrl", () => {
  assert.equal(mediaUrl({ stored: "p/a/img_01.jpg", original: "https://x/o" }), "/media/p/a/img_01.jpg");
  assert.equal(mediaUrl({ stored: null, original: "https://x/o", preview: "https://x/p" }), "https://x/o");
  assert.equal(mediaUrl({ stored: null, preview: "https://x/p" }), "https://x/p");
  assert.equal(mediaUrl({ stored: null, url: "https://x/v.mp4" }), "https://x/v.mp4");
  assert.equal(mediaUrl({ stored: null, original: "javascript:alert(1)" }), "");
  assert.equal(mediaUrl(null), "");
});

test("safeUrl chỉ nhận https và /media/", () => {
  assert.equal(safeUrl("https://shop.tiktok.com/vn/pdp/1"), "https://shop.tiktok.com/vn/pdp/1");
  assert.equal(safeUrl("/media/p/a/img_01.jpg"), "/media/p/a/img_01.jpg");
  for (const u of ["javascript:alert(1)", "data:text/html,x", "http://x", "//evil.test/x", "/api/products", "", null, 5]) {
    assert.equal(safeUrl(u), "", String(u));
  }
});
