import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// send.js là script thường của extension (không phải module), nên nạp bằng vm.
const ctx = { URL };
vm.runInNewContext(readFileSync(new URL("../product-grabber/send.js", import.meta.url), "utf8"), ctx);
const { appUrlFromResponse, sendErrorMessage } = ctx.ProductGrabberSend;
const EP = "https://studio.pages.dev/api/products";

test("appUrlFromResponse: chỉ nhận url cùng origin với endpoint", () => {
  assert.equal(appUrlFromResponse(EP, { id: "abcdefghij", url: "https://studio.pages.dev/#/p/abcdefghij" }), "https://studio.pages.dev/#/p/abcdefghij");
  assert.equal(appUrlFromResponse("http://localhost:8788/api/products", { url: "http://localhost:8788/#/p/abcdefghij" }), "http://localhost:8788/#/p/abcdefghij");
  for (const data of [
    { url: "https://evil.example/#/p/abcdefghij" },
    { url: "javascript:alert(1)" },
    { url: "chrome://settings" },
    { url: "//evil.example/x" },
    { url: 5 }, {}, null, "chuỗi",
  ]) assert.equal(appUrlFromResponse(EP, data), null, JSON.stringify(data));
  assert.equal(appUrlFromResponse("không phải url", { url: "https://studio.pages.dev/" }), null);
});

test("sendErrorMessage: ưu tiên lỗi tiếng Việt từ app, có gợi ý cho 401", () => {
  assert.equal(sendErrorMessage(401, { error: "Token không đúng" }), "Gửi lỗi: Token không đúng. Kiểm tra ô Authorization trong ⚙ (phải có chữ Bearer ở đầu).");
  assert.equal(sendErrorMessage(400, { error: "Thiếu title hoặc images" }), "Gửi lỗi: Thiếu title hoặc images");
  assert.equal(sendErrorMessage(502, null), "Gửi lỗi: HTTP 502");
  assert.equal(sendErrorMessage(500, { error: { a: 1 } }), "Gửi lỗi: HTTP 500");
});

test("popup.html nạp send.js trước popup.js; manifest tăng phiên bản", () => {
  const html = readFileSync(new URL("../product-grabber/popup.html", import.meta.url), "utf8");
  assert.ok(html.indexOf('src="send.js"') !== -1 && html.indexOf('src="send.js"') < html.indexOf('src="popup.js"'));
  const manifest = JSON.parse(readFileSync(new URL("../product-grabber/manifest.json", import.meta.url), "utf8"));
  assert.notEqual(manifest.version, "0.1.0");
  const popup = readFileSync(new URL("../product-grabber/popup.js", import.meta.url), "utf8");
  assert.match(popup, /chrome\.tabs\.create/);
  assert.match(popup, /appUrlFromResponse/);
});
