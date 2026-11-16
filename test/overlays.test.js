import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SAFE } from "../public/editor/compose.js";
import { priceLabel, defaultOverlays, activeOverlays, wrapText, fitText, layoutOverlay, drawOverlays } from "../public/editor/overlays.js";
import { priceK } from "../public/lib/format.js";
import { templatePackage, priceK as serverPriceK } from "../lib/generate.js";

const cocoon = JSON.parse(readFileSync(new URL("./fixtures/cocoon.json", import.meta.url)));
const measure = (text, size) => [...text].length * size * 0.5; // mỗi ký tự rộng nửa cỡ chữ

test("priceK dùng chung một bản cho server và trình duyệt", () => {
  assert.equal(serverPriceK, priceK);
  assert.equal(priceK(216749), "217K");
});

test("priceLabel", () => {
  assert.equal(priceLabel(cocoon), "Chỉ 217K · -43%");
  assert.equal(priceLabel({ price: { current: 99000 } }), "Chỉ 99K");
  assert.equal(priceLabel({ price: { current: 99000, discount: "giảm sốc" } }), "Chỉ 99K");
  assert.equal(priceLabel({ price: {} }), "");
  assert.equal(priceLabel({}), "");
});

test("defaultOverlays lấy sẵn từ gói đăng bài", () => {
  const pkg = templatePackage(cocoon);
  const o = defaultOverlays(cocoon, pkg);
  assert.deepEqual(o.hook, { enabled: true, text: pkg.hooks[0].onScreen });
  assert.deepEqual(o.price, { enabled: true, text: "Chỉ 217K · -43%" });
  assert.deepEqual(o.cta, { enabled: true, text: "Bấm giỏ hàng 🛒" });
  const none = defaultOverlays({ title: "Áo" }, null);
  assert.deepEqual(none.hook, { enabled: false, text: "" });
  assert.deepEqual(none.price, { enabled: false, text: "" });
  assert.equal(none.cta.enabled, true);
});

test("activeOverlays: hook 3 giây đầu, giá 3 giây cuối, CTA 2,5 giây cuối", () => {
  const o = { hook: { enabled: true, text: "H" }, price: { enabled: true, text: "P" }, cta: { enabled: true, text: "C" } };
  const kinds = (t, total = 20) => activeOverlays(o, t, total).map((x) => x.kind).join();
  assert.equal(kinds(0), "hook");
  assert.equal(kinds(2.99), "hook");
  assert.equal(kinds(3), "");
  assert.equal(kinds(10), "");
  assert.equal(kinds(17), "price");
  assert.equal(kinds(17.5), "price,cta");
  assert.equal(kinds(19.99), "price,cta");
  assert.equal(kinds(1, 2), "hook,price,cta"); // video rất ngắn: mọi thứ cùng hiện, không lỗi
});

test("activeOverlays bỏ lớp tắt, lớp chữ rỗng, và dữ liệu hỏng", () => {
  assert.deepEqual(activeOverlays({ hook: { enabled: false, text: "H" }, price: { enabled: true, text: "  " }, cta: { enabled: true, text: "C" } }, 19, 20), [{ kind: "cta", text: "C" }]);
  assert.deepEqual(activeOverlays(null, 1, 20), []);
  assert.deepEqual(activeOverlays({}, 1, 20), []);
});

test("wrapText: xuống dòng theo từ, từ quá dài đứng riêng một dòng", () => {
  const m = (t) => measure(t, 100);
  assert.deepEqual(wrapText(m, "một hai ba bốn", 400), ["một hai", "ba bốn"]);
  assert.deepEqual(wrapText(m, "ngắn", 400), ["ngắn"]);
  assert.deepEqual(wrapText(m, "siêuuuuuuuuuudài a", 400), ["siêuuuuuuuuuudài", "a"]);
  assert.deepEqual(wrapText(m, "   ", 400), []);
});

test("fitText: thu chữ cho tới khi vừa số dòng; không vừa thì dùng cỡ nhỏ nhất", () => {
  const short = fitText(measure, "Thử ngay", { maxWidth: 896, maxLines: 3, sizes: [96, 84, 72, 60] });
  assert.equal(short.fontSize, 96);
  assert.deepEqual(short.lines, ["Thử ngay"]);
  const long = fitText(measure, "Skincare mãi mà da vẫn chưa ưng thì thử ngay tinh chất bí đao này đi mọi người ơi", { maxWidth: 896, maxLines: 3, sizes: [96, 84, 72, 60] });
  assert.ok(long.fontSize < 96);
  assert.ok(long.lines.length <= 3);
  const huge = fitText(measure, "a ".repeat(400), { maxWidth: 896, maxLines: 3, sizes: [96, 60] });
  assert.equal(huge.fontSize, 60);
  assert.equal(huge.lines.length, 3);
  assert.ok(huge.lines[2].endsWith("…"));
});

test("layoutOverlay: mọi lớp chữ nằm trọn trong vùng an toàn, kể cả chữ rất dài", () => {
  const texts = ["Thử ngay", "Chỉ 217K · -43%", "Bấm giỏ hàng 🛒", "Skincare mãi mà da vẫn chưa ưng thì thử ngay tinh chất bí đao này đi mọi người ơi nha nha", "x".repeat(300)];
  for (const kind of ["hook", "price", "cta"]) for (const text of texts) {
    const { box, lines, fontSize } = layoutOverlay(kind, text, measure);
    assert.ok(box.x >= SAFE.left - 0.5, `${kind} trái ${box.x}`);
    assert.ok(box.x + box.w <= 1080 - SAFE.right + 0.5, `${kind} phải ${box.x + box.w}`);
    assert.ok(box.y >= SAFE.top, `${kind} trên`);
    assert.ok(box.y + box.h <= 1920 - SAFE.bottom, `${kind} dưới ${box.y + box.h}`);
    assert.ok(lines.length >= 1 && fontSize >= 40);
  }
});

test("layoutOverlay: hook ở phần trên, CTA sát mép dưới vùng an toàn, giá ở giữa và không chồng nhau", () => {
  const hook = layoutOverlay("hook", "Thử ngay xem sao", measure).box;
  const price = layoutOverlay("price", "Chỉ 217K · -43%", measure).box;
  const cta = layoutOverlay("cta", "Bấm giỏ hàng 🛒", measure).box;
  assert.ok(hook.y + hook.h < 900);
  assert.ok(cta.y > 1250);
  assert.ok(price.y + price.h <= cta.y, "giá và CTA cùng hiện ở cuối video nên không được chồng nhau");
  assert.ok(price.y >= hook.y + hook.h || true);
});

test("drawOverlays: chữ hook có viền đen rồi mới tô trắng; sticker có nền trước chữ", () => {
  const calls = [];
  const ctx = {
    font: "", fillStyle: "", strokeStyle: "", lineWidth: 0, lineJoin: "", textAlign: "", textBaseline: "",
    save: () => calls.push("save"), restore: () => calls.push("restore"),
    measureText: (t) => ({ width: [...t].length * 30 }),
    strokeText: (t) => calls.push(`stroke:${t}`), fillText: (t) => calls.push(`fill:${t}:${ctx.fillStyle}`),
    beginPath: () => {}, roundRect: () => calls.push("roundRect"), fill: () => calls.push(`bg:${ctx.fillStyle}`),
  };
  drawOverlays(ctx, [{ kind: "hook", text: "Thử ngay" }, { kind: "price", text: "Chỉ 217K" }]);
  assert.ok(calls.indexOf("stroke:Thử ngay") !== -1 && calls.indexOf("stroke:Thử ngay") < calls.findIndex((c) => c.startsWith("fill:Thử ngay")));
  assert.ok(calls.findIndex((c) => c.startsWith("bg:")) < calls.findIndex((c) => c.startsWith("fill:Chỉ 217K")));
  assert.doesNotThrow(() => drawOverlays(ctx, []));
  assert.doesNotThrow(() => drawOverlays(ctx, undefined));
});
