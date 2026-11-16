import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { captionWithHashtags, scriptToText, packageToText, slug } from "../public/lib/package-text.js";
import { templatePackage } from "../lib/generate.js";

const cocoon = JSON.parse(readFileSync(new URL("./fixtures/cocoon.json", import.meta.url)));

test("captionWithHashtags", () => {
  assert.equal(captionWithHashtags({ caption: "Hay quá.", hashtags: ["#a", "#b"] }), "Hay quá.\n\n#a #b");
  assert.equal(captionWithHashtags({ caption: "  Hay quá.  ", hashtags: [] }), "Hay quá.");
  assert.equal(captionWithHashtags({ hashtags: ["#a"] }), "#a");
  assert.equal(captionWithHashtags({}), "");
  assert.equal(captionWithHashtags(null), "");
});

test("scriptToText", () => {
  const text = scriptToText({ script: [{ time: "0-3s", visual: "Cận cảnh", voiceover: "Xin chào", onScreen: "Chào" }, { time: "3-10s", visual: "Tay cầm", voiceover: "Đây là", onScreen: "" }] });
  assert.equal(text, "[0-3s]\nHình: Cận cảnh\nLời: Xin chào\nChữ: Chào\n\n[3-10s]\nHình: Tay cầm\nLời: Đây là");
  assert.equal(scriptToText({}), "");
});

test("packageToText có đủ 9 phần theo thứ tự, dùng CRLF, không có chữ rác", () => {
  const pkg = templatePackage(cocoon);
  const text = packageToText({ ...cocoon, id: "abcdefghij" }, pkg);
  const heads = ["SẢN PHẨM", "HOOK", "CHỮ ẢNH BÌA", "PROMPT GOOGLE FLOW", "KỊCH BẢN", "CAPTION", "HASHTAG", "BÌNH LUẬN GHIM", "LƯU Ý"];
  let at = -1;
  for (const h of heads) {
    const i = text.indexOf(`== ${h} ==`);
    assert.ok(i > at, h);
    at = i;
  }
  assert.doesNotMatch(text, /(?<!\r)\n/);
  assert.doesNotMatch(text, /undefined|null|NaN|\[object/);
  assert.ok(text.includes(cocoon.title));
  assert.ok(text.includes("216.749₫"));
  assert.ok(text.includes(cocoon.url));
  assert.ok(text.includes(pkg.hooks[5].spoken));
  assert.ok(text.includes(pkg.videoPrompts[3].prompt));
  assert.ok(text.includes(pkg.hashtags.join(" ")));
});

test("packageToText với gói và sản phẩm thiếu trường không ném lỗi, bỏ phần rỗng", () => {
  const text = packageToText({ title: "Áo" }, { caption: "Hay", hooks: undefined, warnings: [], script: null });
  assert.ok(text.includes("== SẢN PHẨM =="));
  assert.ok(text.includes("== CAPTION =="));
  assert.ok(!text.includes("== HOOK =="));
  assert.ok(!text.includes("== LƯU Ý =="));
  assert.doesNotMatch(text, /undefined|null|NaN/);
  assert.doesNotThrow(() => packageToText(null, null));
});

test("slug", () => {
  assert.equal(slug("Tinh chất bí đao N7"), "tinh-chat-bi-dao-n7");
  assert.equal(slug("  Đồ   ĐIỆN -- tử!! "), "do-dien-tu");
  assert.equal(slug("🔥🔥"), "san-pham");
  assert.equal(slug(undefined), "san-pham");
  assert.ok(slug("a".repeat(100)).length <= 40);
  assert.doesNotMatch(slug("một hai ba bốn năm sáu bảy tám chín mười mười một"), /-$/);
});
