import { test } from "node:test";
import assert from "node:assert/strict";
import { SAFE, watermarkLayout, composeFrame } from "../public/editor/compose.js";

test("vùng an toàn TikTok đúng số đo trong spec", () => {
  assert.deepEqual(SAFE, { top: 130, bottom: 480, left: 44, right: 140 });
});

test("watermarkLayout: bốn góc đều nằm trong vùng an toàn", () => {
  for (const position of ["tl", "tr", "bl", "br"]) {
    const box = watermarkLayout(position, 300, 60);
    assert.ok(box.x >= SAFE.left && box.x + 300 <= 1080 - SAFE.right, position);
    assert.ok(box.y >= SAFE.top && box.y + 60 <= 1920 - SAFE.bottom, position);
  }
  assert.deepEqual(watermarkLayout("tl", 300, 60), { x: 44, y: 130 });
  assert.deepEqual(watermarkLayout("br", 300, 60), { x: 1080 - 140 - 300, y: 1920 - 480 - 60 });
  assert.deepEqual(watermarkLayout("không rõ", 300, 60), watermarkLayout("tl", 300, 60));
});

// Canvas giả: ghi lại các lệnh vẽ để kiểm thứ tự và toạ độ.
function fakeCtx({ filter = true } = {}) {
  const calls = [];
  const ctx = {
    calls, globalAlpha: 1, fillStyle: "", font: "", textBaseline: "", shadowColor: "", shadowBlur: 0, imageSmoothingQuality: "",
    save: () => calls.push(["save"]), restore: () => calls.push(["restore"]),
    fillRect: (...a) => calls.push(["fillRect", ...a]),
    fillText: (...a) => calls.push(["fillText", ...a, ctx.globalAlpha]),
    drawImage: (...a) => calls.push(["drawImage", ...a.slice(1), ctx.globalAlpha]),
    measureText: (t) => ({ width: t.length * 20 }),
  };
  if (filter) ctx.filter = "none";
  return ctx;
}
const source = (width, height) => ({ width, height, draw: (ctx, x, y, w, h) => ctx.calls.push(["source", x, y, w, h, ctx.filter]) });

test("cover: nguồn 9:16 lấp đúng khung; zoom Ken Burns phóng quanh tâm", () => {
  const ctx = fakeCtx();
  composeFrame(ctx, { source: source(720, 1280), fit: "cover" });
  assert.deepEqual(ctx.calls.filter((c) => c[0] === "source").map((c) => c.slice(1, 5)), [[0, 0, 1080, 1920]]);
  const z = fakeCtx();
  composeFrame(z, { source: source(720, 1280), fit: "cover", zoom: 1.08 });
  const [, x, y, w, h] = z.calls.find((c) => c[0] === "source");
  assert.ok(Math.abs(w - 1080 * 1.08) < 1e-6 && Math.abs(h - 1920 * 1.08) < 1e-6);
  assert.ok(Math.abs(x + w / 2 - 540) < 1e-6 && Math.abs(y + h / 2 - 960) < 1e-6);
});

test("blur: vẽ nền mờ lấp khung trước, rồi hình nằm gọn ở giữa", () => {
  const ctx = fakeCtx();
  composeFrame(ctx, { source: source(1920, 1080), fit: "blur" });
  const draws = ctx.calls.filter((c) => c[0] === "source");
  assert.equal(draws.length, 2);
  assert.match(draws[0][5], /blur/);
  assert.ok(draws[0][3] >= 1080 && draws[0][4] >= 1920);
  assert.equal(draws[1][5], "none");
  assert.equal(draws[1][3], 1080);
  assert.ok(Math.abs(draws[1][4] - 607.5) < 1e-6);
});

test("blur trên canvas không có filter (Safari): nền tối, không vẽ nguồn hai lần", () => {
  const ctx = fakeCtx({ filter: false });
  composeFrame(ctx, { source: source(1920, 1080), fit: "blur" });
  assert.equal(ctx.calls.filter((c) => c[0] === "source").length, 1);
});

test("không có nguồn: khung đen, không ném lỗi", () => {
  const ctx = fakeCtx();
  composeFrame(ctx, { source: null, fit: "cover" });
  assert.deepEqual(ctx.calls[0], ["fillRect", 0, 0, 1080, 1920]);
});

test("watermark chữ: thêm @ nếu thiếu, độ mờ 70%, vẽ sau hình", () => {
  const ctx = fakeCtx();
  composeFrame(ctx, { source: source(720, 1280), fit: "cover", watermark: { handle: "kenhcuatoi", position: "tl" } });
  const text = ctx.calls.find((c) => c[0] === "fillText");
  assert.equal(text[1], "@kenhcuatoi");
  assert.equal(text[4], 0.7);
  assert.ok(ctx.calls.findIndex((c) => c[0] === "fillText") > ctx.calls.findIndex((c) => c[0] === "source"));
  assert.equal(ctx.globalAlpha, 1);
});

test("watermark logo: cao tối đa 96px, giữ tỉ lệ, trong vùng an toàn; có logo thì không vẽ chữ", () => {
  const ctx = fakeCtx();
  composeFrame(ctx, { source: source(720, 1280), fit: "cover", watermark: { handle: "@a", logo: { width: 400, height: 200 }, position: "tr" } });
  const img = ctx.calls.find((c) => c[0] === "drawImage");
  assert.deepEqual(img.slice(1), [1080 - 140 - 192, 130, 192, 96, 0.7]);
  assert.equal(ctx.calls.some((c) => c[0] === "fillText"), false);
});

test("watermark rỗng hoặc tắt: không vẽ gì thêm", () => {
  for (const watermark of [null, undefined, { handle: "", logo: null }, { handle: "   " }]) {
    const ctx = fakeCtx();
    composeFrame(ctx, { source: source(720, 1280), fit: "cover", watermark });
    assert.equal(ctx.calls.some((c) => c[0] === "fillText" || c[0] === "drawImage"), false);
  }
});
