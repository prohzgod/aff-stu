import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NEGATIVE, CATEGORIES, CATEGORY_DEFAULTS, TEMPLATES,
  detectCategory, shortName, fillTemplate, buildVideoPrompts,
} from "../public/lib/prompt-library.js";

const cocoon = JSON.parse(readFileSync(new URL("./fixtures/cocoon.json", import.meta.url)));

// Chép nguyên văn từ docs/spec/studio.md mục 7.
const HOW_IT_WORKS_SPEC =
  "Vertical 9:16 overhead close-up on {surface}, only hands visible. Step 1: the hands pick up {product_visual} and show the label. Step 2: the hands {hands}. Step 3: the product is placed back down beside its packaging for a clean final shot. Smooth stable camera, macro detail on texture, soft diffused light, {palette}, ASMR-style satisfying feel. Audio: subtle product sounds, gentle background music, no voice. Keep the label text and packaging consistent with the reference image.";

test("NEGATIVE đúng nguyên văn spec", () => {
  assert.equal(NEGATIVE, "Avoid: warped or changing label text, extra fingers, distorted hands, packaging that changes shape or color, subtitles, captions, watermarks, logos other than the product's own.");
});

test("spec vẫn chứa đúng đoạn mẫu và NEGATIVE mà test đang chép", () => {
  const spec = readFileSync(new URL("../docs/spec/studio.md", import.meta.url), "utf8");
  assert.ok(spec.includes(HOW_IT_WORKS_SPEC));
  assert.ok(spec.includes(NEGATIVE));
});

test("detectCategory", () => {
  assert.equal(detectCategory("COMBO Tinh chất bí đao N7 Cocoon", ""), "beauty");
  assert.equal(detectCategory("Nồi chiên không dầu 5L", ""), "kitchen");
  assert.equal(detectCategory("Tai nghe bluetooth chống ồn", ""), "tech");
  assert.equal(detectCategory("Áo thun nam cotton", ""), "fashion");
  assert.equal(detectCategory("Kệ để giày 5 tầng", ""), "home");
  assert.equal(detectCategory("Sản phẩm XYZ", ""), "general");
  assert.equal(detectCategory("Sản phẩm XYZ", "serum dưỡng da"), "beauty");
  assert.equal(detectCategory("Tai nghe bluetooth", "tặng kèm kem dưỡng"), "tech");
  assert.equal(detectCategory("SERUM VITAMIN C"), "beauty");
  assert.equal(detectCategory("Báo cáo tài chính"), "general"); // "áo" nằm trong "Báo" không được tính
  assert.equal(detectCategory(undefined, null), "general");
});

test("shortName", () => {
  assert.equal(shortName("COMBO Tinh chất bí đao N7 Cocoon 70ml + Nước bí đao cân bằng da 140ml"), "Tinh chất bí đao N7 Cocoon 70ml");
  assert.equal(shortName("[HÀNG CHÍNH HÃNG] Nồi chiên không dầu (5L) - bảo hành 12 tháng"), "Nồi chiên không dầu");
  assert.equal(shortName("Áo"), "Áo");
  assert.equal(shortName("(Quà tặng)"), "(Quà tặng)");
  assert.equal(shortName("Áo T-shirt nam, cotton 100%"), "Áo T-shirt nam");
  assert.ok(shortName("một hai ba bốn năm sáu bảy tám chín mười").split(" ").length <= 7);
  assert.equal(shortName(undefined), "");
});

test("7 mẫu đúng bảng spec", () => {
  assert.deepEqual(TEMPLATES.map((t) => t.id), ["ugc_testimonial", "problem_solution", "unboxing", "how_it_works", "product_hero", "lifestyle_broll", "before_after"]);
  assert.deepEqual(TEMPLATES.filter((t) => t.faceless).map((t) => t.id), ["unboxing", "how_it_works", "product_hero", "lifestyle_broll"]);
  assert.equal(TEMPLATES.find((t) => t.id === "product_hero").flowMode, "Frames to Video");
  for (const t of TEMPLATES.filter((t) => t.id !== "product_hero")) assert.equal(t.flowMode, "Ingredients to Video", t.id);
  for (const t of TEMPLATES) for (const k of ["name", "ingredients", "useWhen", "template"]) assert.ok(t[k], `${t.id}.${k}`);
});

test("mẫu how_it_works đúng nguyên văn spec", () => {
  assert.equal(TEMPLATES.find((t) => t.id === "how_it_works").template, HOW_IT_WORKS_SPEC);
});

test("mỗi mẫu gói trong một clip: 60–110 từ", () => {
  for (const t of TEMPLATES) {
    const n = t.template.split(/\s+/).length;
    assert.ok(n >= 60 && n <= 110, `${t.id}: ${n} từ`);
  }
});

test("mọi ngành có đủ slot mặc định", () => {
  assert.deepEqual(CATEGORIES, ["beauty", "kitchen", "tech", "fashion", "home", "general"]);
  for (const c of CATEGORIES) for (const k of ["creator", "setting", "surface", "usage", "hands", "palette", "pain"]) assert.ok(CATEGORY_DEFAULTS[c][k], `${c}.${k}`);
});

test("fillTemplate báo slot thiếu", () => {
  assert.equal(fillTemplate("a {x} b {x}", { x: "1" }), "a 1 b 1");
  assert.throws(() => fillTemplate("a {x}", {}), /Thiếu slot: x/);
  assert.throws(() => fillTemplate("a {x}", { x: "" }), /Thiếu slot: x/);
});

test("buildVideoPrompts faceless: 4 prompt, đúng định dạng Flow, ở mọi ngành", () => {
  for (const title of ["COMBO Tinh chất bí đao N7 Cocoon 70ml", "Nồi chiên không dầu", "Tai nghe bluetooth", "Áo thun nam", "Kệ để giày", "Sản phẩm XYZ"]) {
    const ps = buildVideoPrompts({ ...cocoon, title, description: "" }, { hookLine: "Da dầu thử ngay tinh chất bí đao" });
    assert.deepEqual(ps.map((p) => p.id), ["unboxing", "how_it_works", "product_hero", "lifestyle_broll"]);
    for (const p of ps) {
      assert.ok(p.prompt.startsWith("Vertical 9:16"), p.id);
      assert.ok(p.prompt.endsWith(" " + NEGATIVE), p.id);
      assert.doesNotMatch(p.prompt, /\{[a-z_]+\}/, p.id);
      assert.doesNotMatch(p.prompt, /\b(face|woman|man|creator|she|he)\b/i, `${title} / ${p.id}`);
      assert.match(p.prompt, /consistent with the reference image/, p.id);
      assert.ok(p.ingredients.includes("Ảnh 1"), p.id);
      assert.ok(p.name && p.flowMode, p.id);
    }
  }
});

test("product_visual dùng tên ngắn của sản phẩm", () => {
  const p = buildVideoPrompts(cocoon).find((x) => x.id === "how_it_works");
  assert.ok(p.prompt.includes("the Tinh chất bí đao N7 Cocoon 70ml exactly as shown in the reference image"));
});

test("buildVideoPrompts có mặt người: đủ 7, lời thoại tiếng Việt trong ngoặc kép", () => {
  const ps = buildVideoPrompts(cocoon, { faceless: false, hookLine: "Da dầu thử ngay tinh chất bí đao" });
  assert.equal(ps.length, 7);
  for (const id of ["ugc_testimonial", "problem_solution", "before_after"]) {
    assert.ok(ps.find((p) => p.id === id).prompt.includes('"Da dầu thử ngay tinh chất bí đao"'), id);
  }
  for (const p of ps) assert.doesNotMatch(p.prompt, /\{[a-z_]+\}/, p.id);
});

test("không truyền hookLine: lời thoại mặc định có tên sản phẩm, không có ngoặc kép rỗng", () => {
  const p = buildVideoPrompts(cocoon, { faceless: false }).find((x) => x.id === "ugc_testimonial");
  assert.doesNotMatch(p.prompt, /""/);
  assert.match(p.prompt, /"[^"]*Tinh chất bí đao[^"]*"/);
});

test("lời thoại có sẵn ngoặc kép không làm vỡ định dạng", () => {
  const p = buildVideoPrompts(cocoon, { faceless: false, hookLine: 'Cái "bí đao" này đỉnh' }).find((x) => x.id === "ugc_testimonial");
  assert.ok(p.prompt.includes('"Cái bí đao này đỉnh"'));
});

test("overrides ghi đè slot ngành; giá trị rỗng thì dùng mặc định", () => {
  const ps = buildVideoPrompts(cocoon, { overrides: { surface: "a pink marble table", palette: "" } });
  const p = ps.find((x) => x.id === "how_it_works").prompt;
  assert.ok(p.includes("a pink marble table"));
  assert.ok(p.includes(CATEGORY_DEFAULTS.beauty.palette));
});
