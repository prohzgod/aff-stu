# Studio Phase 2: Thư viện mẫu & gói dựng sẵn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Không cần LLM, mỗi sản phẩm vẫn có đủ gói đăng bài (6 hook, chữ ảnh bìa, prompt Google Flow, kịch bản, caption, hashtag, bình luận ghim), copy được một chạm, tải được cả gói thành .zip và chia sẻ file sang app khác.

**Architecture:** Thư viện mẫu là một module ES thuần trong `public/lib/` dùng chung cho trình duyệt và Pages Functions. `lib/generate.js` ghép sản phẩm + thư viện thành `package.json` theo schema spec mục 6.3 và lưu lên R2. Trang chi tiết đọc gói và vẽ các khối; mọi thứ copy/zip/share chạy trong trình duyệt.

**Tech Stack:** như phase 1 (Pages Functions, R2, vanilla JS ES modules, `node --test`). Không thêm dependency.

**Spec:** `docs/spec/studio.md` (mục 6.1, 6.3, 6.4 nguồn "template", 7, 8) và `docs/superpowers/specs/2026-11-16-studio-va-khung-spec-design.md`. Tiêu chí nghiệm thu: `docs/spec/phases.md`, Phase 2.

## Global Constraints

- Mọi luật trong `docs/RULES.md`. Đặc biệt luật 6: gói chỉ dùng dữ liệu có trong sản phẩm; không bịa công dụng, số liệu, chứng nhận; không có các chuỗi `trị dứt`, `chữa`, `hết mụn`, `100%`, `khỏi hẳn`, `đặc trị` trong bất kỳ trường nào của gói dựng sẵn.
- Schema gói đúng spec mục 6.3. Gói dựng sẵn có `source: "template"`, `model: null`, `note: "Gói dựng sẵn từ mẫu, chưa qua AI."`.
- 6 hook, đúng thứ tự và đúng tên công thức: `Nỗi đau`, `Giá sốc`, `Bằng chứng xã hội`, `Tò mò`, `So sánh`, `Trải nghiệm thật`. `spoken` ≤ 14 từ, `onScreen` ≤ 6 từ (đếm theo khoảng trắng). Mỗi `spoken` phải chứa tên gọi ngắn của sản phẩm.
- Prompt video viết tiếng Anh, lời thoại tiếng Việt trong ngoặc kép, mỗi prompt một clip ≤ 8 giây, bắt đầu bằng `Vertical 9:16`, kết thúc bằng `NEGATIVE` (chuỗi chính xác ở spec mục 7).
- `faceless` mặc định `true`; khi `true` chỉ dùng mẫu có cột Faceless ✓ ở spec mục 7 (`unboxing`, `how_it_works`, `product_hero`, `lifestyle_broll`).
- Giá hiển thị trong gói làm tròn kiểu `217K` (hàm `priceK`).
- Caption 1–3 câu, có CTA chứa đúng cụm `giỏ hàng`; 5–8 hashtag, có cả tiếng Việt không dấu và tiếng Anh, không trùng nhau.
- Chưa làm trong phase này: gọi LLM, chế độ thủ công (copy prompt / dán JSON), `PUT /api/products/:id/package` và tự lưu (đều thuộc phase 3). Các ô caption/hashtag/bình luận ghim sửa được trên màn hình và dùng cho copy/zip, nhưng chưa lưu lại.
- Dữ liệu sản phẩm và nội dung gói đưa vào DOM chỉ qua hàm `h()` (textContent); URL qua `safeUrl`/`mediaUrl`.
- Commit sau mỗi task trên nhánh `studio-phase-2` (tách từ nhánh chứa phase 1), chỉ khi chủ dự án đã đồng ý cho commit.

## Review Focus

1. Sản phẩm thiếu dữ liệu (không giá, không `% giảm`, không `soldCount`, không mô tả, tiêu đề 1 từ) → gói vẫn đủ 6 hook và không có chữ `undefined`, `NaN`, `null`, hay số 0 vô nghĩa ("0 đã bán", "Chỉ K"). (Task 2)
2. Sản phẩm mỹ phẩm/thực phẩm/sức khoẻ → `warnings` có cảnh báo, và không trường nào chứa từ khẳng định điều trị dù tiêu đề/mô tả gốc có chứa (vd tiêu đề "Kem trị mụn"). (Task 2)
3. Tên file tiếng Việt có dấu và file > 4GB không xảy ra, nhưng tên có dấu thì có: zip phải mở được trên Windows và iPhone với tên file đúng dấu. (Task 4)
4. Trình duyệt không có Clipboard API hoặc không ở HTTPS; không có Web Share hoặc không share được file → copy vẫn chạy qua fallback, nút Chia sẻ ẩn đi thay vì báo lỗi. (Task 5)
5. Bấm "Tạo lại" khi đã sửa caption trên màn hình → hỏi xác nhận trước khi ghi đè; bấm hai lần liên tiếp không tạo hai request chồng nhau. (Task 6)

---

## Cấu trúc file

```
public/lib/prompt-library.js   # NEGATIVE, 7 mẫu Flow, detectCategory, shortName, buildVideoPrompts
lib/generate.js                # priceK, templatePackage
lib/store.js                   # + savePackage (ghi package.json, bật hasPackage trong chỉ mục)
functions/api/products/[id]/generate.js
public/lib/package-text.js     # captionWithHashtags, scriptToText, packageToText
public/lib/zip.js              # makeZip (STORE, CRC32, tên UTF-8)
public/lib/share.js            # copyText, canShareFiles, shareFiles, downloadBlob
public/views/package.js        # các khối 3–9 và thanh dính đáy của trang chi tiết
public/app.js                  # gọi views/package.js; thêm nút zip + chia sẻ vào khối media
test/{prompt-library,generate,package-text,zip}.test.js
```

`public/app.js` hiện ~300 dòng; phần gói đăng bài đặt ở `public/views/package.js` để mỗi file vẫn đọc được trong một lần.

---

### Task 1: `public/lib/prompt-library.js`

**Files:**
- Create: `public/lib/prompt-library.js`
- Test: `test/prompt-library.test.js`

**Interfaces:**
- Produces:
  - `NEGATIVE: string` — chuỗi chính xác ở spec mục 7.
  - `CATEGORIES = ["beauty", "kitchen", "tech", "fashion", "home", "general"]`
  - `detectCategory(title: string, description = ""): string` — regex từ khoá tiếng Việt và tiếng Anh, không phân biệt hoa thường; không khớp → `"general"`; tiêu đề được ưu tiên hơn mô tả.
  - `shortName(title: string): string` — bỏ nội dung trong `()` `[]` `【】`, bỏ từ `COMBO`/`SET`/`[HÀNG CHÍNH HÃNG]` kiểu quảng cáo ở đầu, cắt tại ký tự đầu tiên trong `- | , +`, lấy ≤ 7 từ. Rỗng sau khi xử lý → trả 7 từ đầu của tiêu đề gốc.
  - `CATEGORY_DEFAULTS: Record<category, { creator, setting, surface, usage, hands, palette, pain }>` — mọi giá trị tiếng Anh (đi vào prompt), riêng `pain` tiếng Việt (đi vào hook).
  - `TEMPLATES: Array<{ id, name, flowMode, faceless: boolean, ingredients: string, useWhen: string, template: string }>` — đúng 7 mẫu, `id`/`name`/`flowMode`/`faceless`/`useWhen` theo bảng spec mục 7; `ingredients` tiếng Việt kiểu `"Ảnh 1 (sản phẩm)"` hoặc `"Ảnh 1 (sản phẩm) + ảnh nhân vật"`.
  - `fillTemplate(template: string, slots: Record<string, string>): string` — thay `{slot}`; slot không có giá trị → ném `Error("Thiếu slot: <tên>")`.
  - `buildVideoPrompts(product, { faceless = true, hookLine = "", overrides = {} } = {}): Array<{ id, name, flowMode, ingredients, prompt }>` — một prompt cho mỗi mẫu phù hợp; `product_visual` = `"the <shortName> exactly as shown in the reference image"`; `hook_line` = `hookLine` đặt trong ngoặc kép; `overrides` ghi đè slot mặc định của ngành.

- [ ] **Step 1: Viết test thất bại**

```js
test("NEGATIVE đúng nguyên văn spec", () => {
  assert.equal(NEGATIVE, "Avoid: warped or changing label text, extra fingers, distorted hands, packaging that changes shape or color, subtitles, captions, watermarks, logos other than the product's own.");
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
});
test("shortName", () => {
  assert.equal(shortName("COMBO Tinh chất bí đao N7 Cocoon 70ml + Nước bí đao cân bằng da 140ml"), "Tinh chất bí đao N7 Cocoon 70ml");
  assert.equal(shortName("[HÀNG CHÍNH HÃNG] Nồi chiên không dầu (5L) - bảo hành 12 tháng"), "Nồi chiên không dầu");
  assert.equal(shortName("Áo"), "Áo");
  assert.equal(shortName("(Quà tặng)"), "(Quà tặng)");
  assert.ok(shortName("một hai ba bốn năm sáu bảy tám chín mười").split(" ").length <= 7);
});
test("7 mẫu đúng bảng spec", () => {
  assert.deepEqual(TEMPLATES.map(t => t.id), ["ugc_testimonial", "problem_solution", "unboxing", "how_it_works", "product_hero", "lifestyle_broll", "before_after"]);
  assert.deepEqual(TEMPLATES.filter(t => t.faceless).map(t => t.id), ["unboxing", "how_it_works", "product_hero", "lifestyle_broll"]);
  assert.equal(TEMPLATES.find(t => t.id === "product_hero").flowMode, "Frames to Video");
  for (const t of TEMPLATES.filter(t => t.id !== "product_hero")) assert.equal(t.flowMode, "Ingredients to Video");
});
test("mọi ngành có đủ slot mặc định", () => {
  for (const c of CATEGORIES) for (const k of ["creator", "setting", "surface", "usage", "hands", "palette", "pain"]) assert.ok(CATEGORY_DEFAULTS[c][k], `${c}.${k}`);
});
test("fillTemplate báo slot thiếu", () => {
  assert.equal(fillTemplate("a {x} b", { x: "1" }), "a 1 b");
  assert.throws(() => fillTemplate("a {x}", {}), /Thiếu slot: x/);
});
test("buildVideoPrompts faceless: 4 prompt, đúng định dạng Flow", () => {
  const ps = buildVideoPrompts(cocoon, { hookLine: "Da dầu thử ngay tinh chất bí đao" });
  assert.deepEqual(ps.map(p => p.id), ["unboxing", "how_it_works", "product_hero", "lifestyle_broll"]);
  for (const p of ps) {
    assert.ok(p.prompt.startsWith("Vertical 9:16"), p.id);
    assert.ok(p.prompt.endsWith(NEGATIVE), p.id);
    assert.doesNotMatch(p.prompt, /\{[a-z_]+\}/, p.id);
    assert.doesNotMatch(p.prompt, /\b(face|woman|man|creator|she|he)\b/i, p.id);
    assert.match(p.prompt, /consistent with the reference image/, p.id);
    assert.ok(p.ingredients.includes("Ảnh 1"), p.id);
  }
});
test("buildVideoPrompts có mặt người: đủ 7, lời thoại tiếng Việt trong ngoặc kép", () => {
  const ps = buildVideoPrompts(cocoon, { faceless: false, hookLine: "Da dầu thử ngay tinh chất bí đao" });
  assert.equal(ps.length, 7);
  assert.ok(ps.find(p => p.id === "ugc_testimonial").prompt.includes('"Da dầu thử ngay tinh chất bí đao"'));
});
test("mẫu how_it_works đúng nguyên văn spec", () => {
  assert.equal(TEMPLATES.find(t => t.id === "how_it_works").template, HOW_IT_WORKS_SPEC);
});
test("overrides ghi đè slot ngành", () => {
  const ps = buildVideoPrompts(cocoon, { overrides: { surface: "a pink marble table" } });
  assert.ok(ps.find(p => p.id === "how_it_works").prompt.includes("a pink marble table"));
});
```
`cocoon` đọc từ `test/fixtures/cocoon.json`. `HOW_IT_WORKS_SPEC` là đoạn mẫu ở cuối spec mục 7, chép nguyên văn vào test.

- [ ] **Step 2: Chạy, xác nhận thất bại** — Run: `node --test test/prompt-library.test.js` · Expected: FAIL (không tìm thấy module)
- [ ] **Step 3: Viết `public/lib/prompt-library.js`.** Sáu mẫu còn lại viết theo cấu trúc spec mục 7 (Subject → Action → Setting → Camera → Lighting/Style → Audio → câu giữ nhất quán), mỗi mẫu 60–110 từ, cùng giọng với `how_it_works`. `buildVideoPrompts` nối `" " + NEGATIVE` vào cuối. Mẫu faceless không được chứa các từ bị test cấm.
- [ ] **Step 4: Chạy lại** — Run: `npm test` · Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat: thư viện 7 mẫu prompt Google Flow"`

---

### Task 2: `lib/generate.js` (gói dựng sẵn)

**Files:**
- Create: `lib/generate.js`
- Test: `test/generate.test.js`

**Interfaces:**
- Consumes: `detectCategory`, `shortName`, `CATEGORY_DEFAULTS`, `buildVideoPrompts` từ `public/lib/prompt-library.js`.
- Produces:
  - `priceK(n: number | null | undefined): string` — `216749 → "217K"`, `99000 → "99K"`, `950 → "950đ"`, `1250000 → "1,25 triệu"`, `2000000 → "2 triệu"`; không phải số dương → `""`.
  - `FORBIDDEN: RegExp` — khớp các chuỗi cấm ở Global Constraints, không phân biệt hoa thường.
  - `HOOK_FORMULAS = ["Nỗi đau", "Giá sốc", "Bằng chứng xã hội", "Tò mò", "So sánh", "Trải nghiệm thật"]`
  - `templatePackage(product, { tone = "tự nhiên", notes = "", faceless = true, now = new Date() } = {}): Package` — schema spec mục 6.3 đầy đủ; `generatedAt = now.toISOString()`.
- Quy tắc nội dung:
  - Tên dùng trong hook = `shortName(title)` cắt còn ≤ 4 từ, đã loại mọi cụm khớp `FORBIDDEN` (vd "Kem trị mụn" có `trị` đứng riêng không bị cấm; "Kem đặc trị mụn" → "Kem mụn").
  - Hook `Giá sốc` dùng `priceK` và `% giảm` nếu có; không có giá → nói về "deal" không kèm số. Hook `Bằng chứng xã hội` dùng `soldCount` (làm tròn kiểu `229K`) nếu ≥ 100, không thì dùng `rating` nếu có, không thì câu trung tính không số.
  - `coverTexts`: đúng 3 chuỗi, mỗi chuỗi ≤ 6 từ.
  - `script`: 4 nhịp `0-3s`, `3-10s`, `10-18s`, `18-22s`; nhịp đầu dùng hook đầu tiên; nhịp cuối có CTA chứa `giỏ hàng`.
  - `videoPrompts`: từ `buildVideoPrompts(product, { faceless, hookLine: hooks[0].spoken })`, thêm trường `flowMode`, `ingredients`, `name`, `prompt` theo schema.
  - `pinnedComment`: 1 câu, nhắc giá (nếu có) và giỏ hàng.
  - `warnings`: ngành `beauty` luôn có cảnh báo về từ khẳng định công dụng; tiêu đề/mô tả gốc khớp `FORBIDDEN` → thêm cảnh báo nêu rõ từ đó đã bị bỏ; không có giá → cảnh báo "chưa có giá"; `notes` khác rỗng → đưa vào `note` của gói, không trộn vào nội dung.
  - `angle`: một câu tiếng Việt nêu góc tiếp cận theo ngành.

- [ ] **Step 1: Viết test thất bại**

```js
const words = (s) => s.trim().split(/\s+/).length;
const allText = (pkg) => JSON.stringify(pkg);

test("priceK", () => {
  assert.equal(priceK(216749), "217K"); assert.equal(priceK(99000), "99K"); assert.equal(priceK(950), "950đ");
  assert.equal(priceK(1250000), "1,25 triệu"); assert.equal(priceK(2000000), "2 triệu");
  for (const v of [null, undefined, 0, -5, "abc", NaN]) assert.equal(priceK(v), "");
});
test("Cocoon: đủ schema, 6 hook đúng công thức và giới hạn từ", () => {
  const pkg = templatePackage(cocoon, { now: new Date("2026-11-16T00:00:00Z") });
  assert.equal(pkg.source, "template"); assert.equal(pkg.model, null); assert.equal(pkg.generatedAt, "2026-11-16T00:00:00.000Z");
  assert.deepEqual(pkg.hooks.map(h => h.formula), HOOK_FORMULAS);
  for (const h of pkg.hooks) {
    assert.ok(words(h.spoken) <= 14, h.spoken); assert.ok(words(h.onScreen) <= 6, h.onScreen);
    assert.ok(h.spoken.toLowerCase().includes("tinh chất bí đao"), h.spoken);
  }
  assert.ok(pkg.hooks[1].spoken.includes("217K")); assert.ok(pkg.hooks[2].spoken.includes("229K"));
  assert.equal(pkg.coverTexts.length, 3); for (const c of pkg.coverTexts) assert.ok(words(c) <= 6, c);
  assert.deepEqual(pkg.script.map(s => s.time), ["0-3s", "3-10s", "10-18s", "18-22s"]);
  assert.equal(pkg.script[0].voiceover, pkg.hooks[0].spoken);
  assert.match(pkg.script[3].voiceover, /giỏ hàng/);
  assert.equal(pkg.videoPrompts.length, 4);
  for (const k of ["name", "flowMode", "ingredients", "prompt"]) assert.ok(pkg.videoPrompts[0][k], k);
  assert.match(pkg.caption, /giỏ hàng/); assert.ok(pkg.caption.split(/[.!?]\s/).length <= 3);
  assert.ok(pkg.hashtags.length >= 5 && pkg.hashtags.length <= 8);
  assert.equal(new Set(pkg.hashtags).size, pkg.hashtags.length);
  for (const t of pkg.hashtags) assert.match(t, /^#[a-z0-9_]+$/);
  assert.match(pkg.pinnedComment, /217K/); assert.match(pkg.pinnedComment, /giỏ hàng/);
  assert.ok(pkg.warnings.length >= 1);
  assert.doesNotMatch(allText(pkg), FORBIDDEN);
});
test("faceless: false → 7 prompt", () => { assert.equal(templatePackage(cocoon, { faceless: false }).videoPrompts.length, 7); });
test("sản phẩm thiếu dữ liệu: vẫn đủ gói, không có chữ rác", () => {
  const pkg = templatePackage({ title: "Áo", images: [{}] });
  assert.equal(pkg.hooks.length, 6);
  assert.doesNotMatch(allText(pkg), /undefined|NaN|null đã bán|\b0 đã bán|Chỉ K|\bK\b ·|-%/);
  assert.ok(pkg.warnings.some(w => /giá/.test(w)));
  for (const h of pkg.hooks) assert.ok(words(h.spoken) <= 14 && words(h.onScreen) <= 6);
});
test("tiêu đề có từ cấm: bị loại khỏi mọi trường và có cảnh báo", () => {
  const pkg = templatePackage({ ...cocoon, title: "Kem đặc trị mụn chữa thâm hết mụn 100%", description: "Trị dứt mụn sau 7 ngày" });
  assert.doesNotMatch(allText({ ...pkg, warnings: [] }), FORBIDDEN);
  assert.ok(pkg.warnings.some(w => /đã bỏ|đã lược/.test(w)));
});
test("soldCount nhỏ: không khoe số; có rating thì dùng rating", () => {
  const pkg = templatePackage({ ...cocoon, soldCount: 12 });
  assert.doesNotMatch(pkg.hooks[2].spoken, /12/); assert.match(pkg.hooks[2].spoken, /4[.,]7/);
});
test("notes vào note, không vào nội dung", () => {
  const pkg = templatePackage(cocoon, { notes: "nhấn mạnh quà tặng kèm" });
  assert.match(pkg.note, /nhấn mạnh quà tặng kèm/);
  assert.doesNotMatch(JSON.stringify({ ...pkg, note: "" }), /nhấn mạnh quà tặng kèm/);
});
```

- [ ] **Step 2: Chạy, xác nhận thất bại** — Run: `node --test test/generate.test.js` · Expected: FAIL
- [ ] **Step 3: Viết `lib/generate.js`.** Mỗi công thức hook là một hàm nhận `{ name, priceText, discount, soldText, rating, pain }` và trả `{ spoken, onScreen }`; sau khi dựng, một hàm chung cắt `spoken` về ≤ 14 từ và `onScreen` về ≤ 6 từ để giới hạn luôn đúng với mọi đầu vào. Giọng văn creator tự nhiên, không văn mẫu. Hashtag: bỏ dấu tiếng Việt bằng `normalize("NFD")` + thay `đ`, ghép từ tên ngắn và ngành, cộng 2–3 thẻ tiếng Anh theo ngành.
- [ ] **Step 4: Chạy lại** — Run: `npm test` · Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat: gói đăng bài dựng sẵn từ mẫu"`

---

### Task 3: `savePackage` + `POST /api/products/:id/generate`

**Files:**
- Modify: `lib/store.js`
- Create: `functions/api/products/[id]/generate.js`
- Test: `test/store.test.js`, `test/api.test.js`

**Interfaces:**
- Consumes: `templatePackage` (Task 2); `getProduct`, `isValidId`, `isExpired`, `retentionDays`, `json`.
- Produces:
  - `savePackage(bucket, product, pkg): Promise<void>` trong `lib/store.js` — ghi `p/{id}/package.json`; ghi lại object chỉ mục tại `product.indexKey` với cùng metadata nhưng `hasPackage: "1"`.
  - `onRequestPost({ request, env, params })` → `200 { package }`. Body JSON tuỳ chọn `{ tone?, notes?, faceless? }`; body rỗng coi như `{}`; body không phải JSON → `400 { error: "JSON không hợp lệ" }`. `tone`/`notes` cắt còn ≤ 500 ký tự; `faceless` không phải boolean → `true`. Id sai/không có/quá hạn → `404 { error: "Không tìm thấy sản phẩm" }`.

- [ ] **Step 1: Viết test thất bại**

```js
// store.test.js
test("savePackage: đọc lại được, danh sách báo hasPackage, các trường chỉ mục khác giữ nguyên", async () => {
  const b = makeBucket(), now = Date.now(), p = mk("kkkkkkkkkk", now, "Có gói");
  await saveProduct(b, p); await savePackage(b, p, { caption: "x" });
  assert.deepEqual(await getPackage(b, "kkkkkkkkkk"), { caption: "x" });
  const [item] = await listProducts(b, 7, now);
  assert.equal(item.hasPackage, true); assert.equal(item.title, "Có gói"); assert.equal(item.price, 216749);
  assert.equal((await b.list({ prefix: "i/" })).objects.length, 1);
});
// api.test.js
test("POST generate → 200, lưu gói, GET :id trả gói, list báo hasPackage");
test("POST generate với { faceless: false } → 7 videoPrompts; body rỗng → 4");
test("POST generate body 'abc' → 400; id sai/không có/quá hạn → 404");
test("POST generate hai lần → gói sau thay gói trước, chỉ mục vẫn một mục");
test("DELETE sau khi có gói → package.json cũng bị xoá");
```
Viết đủ thân và assertion cho từng test theo tên.

- [ ] **Step 2: Chạy, xác nhận thất bại** — Run: `npm test` · Expected: FAIL ở các test mới
- [ ] **Step 3: Viết `savePackage` và handler.** Dùng chung hàm dựng metadata chỉ mục với `saveProduct` (thêm tham số `hasPackage`).
- [ ] **Step 4: Chạy lại** — Run: `npm test` · Expected: PASS
- [ ] **Step 5: Kiểm bằng wrangler** — `npm run dev`, POST fixture rồi `curl -X POST -H "Authorization: Bearer …" localhost:8788/api/products/<id>/generate` · Expected: 200, JSON có `"source":"template"` và 6 hook.
- [ ] **Step 6: Commit** — `git commit -m "feat: endpoint sinh gói dựng sẵn"`

---

### Task 4: `public/lib/zip.js` + `public/lib/package-text.js`

**Files:**
- Create: `public/lib/zip.js`, `public/lib/package-text.js`
- Test: `test/zip.test.js`, `test/package-text.test.js`

**Interfaces:**
- Produces (từ `zip.js`):
  - `crc32(bytes: Uint8Array): number` — unsigned 32-bit.
  - `makeZip(files: Array<{ name: string, data: Uint8Array }>, date = new Date()): Uint8Array` — phương thức STORE (không nén), tên file UTF-8 với cờ general-purpose bit 11, có central directory và end-of-central-directory. Tên trùng → thêm hậu tố ` (2)`, ` (3)` trước đuôi file. Ném `Error("File quá lớn để nén")` nếu tổng > 3,9GB.
- Produces (từ `package-text.js`):
  - `captionWithHashtags(pkg): string` — caption, một dòng trống, rồi hashtag cách nhau bằng dấu cách.
  - `scriptToText(pkg): string` — mỗi nhịp một khối `[0-3s]` + ba dòng `Hình:`, `Lời:`, `Chữ:`.
  - `packageToText(product, pkg): string` — toàn bộ gói dạng văn bản thuần tiếng Việt có tiêu đề từng phần (SẢN PHẨM, HOOK, CHỮ ẢNH BÌA, PROMPT GOOGLE FLOW, KỊCH BẢN, CAPTION, HASHTAG, BÌNH LUẬN GHIM, LƯU Ý), dùng cho `goi-dang-bai.txt` và nút "Copy cả gói". Xuống dòng bằng `\r\n` để Notepad cũ trên Windows đọc được.
  - `slug(text: string): string` — bỏ dấu, chữ thường, ký tự khác `[a-z0-9]` thành `-`, ≤ 40 ký tự; rỗng → `"san-pham"`.

- [ ] **Step 1: Viết test thất bại**

```js
// zip.test.js
test("crc32 giá trị chuẩn", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xCBF43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});
test("zip mở được bằng unzip của hệ thống, tên tiếng Việt và nội dung đúng", () => {
  const dir = mkdtempSync(join(tmpdir(), "zip-"));
  const zip = makeZip([
    { name: "gói-đăng-bài.txt", data: new TextEncoder().encode("Xin chào ấ") },
    { name: "img_01.jpg", data: new Uint8Array([1, 2, 3, 255]) },
    { name: "rỗng.txt", data: new Uint8Array(0) },
  ]);
  writeFileSync(join(dir, "a.zip"), zip);
  execFileSync("unzip", ["-q", join(dir, "a.zip"), "-d", join(dir, "out")]);
  assert.equal(readFileSync(join(dir, "out", "gói-đăng-bài.txt"), "utf8"), "Xin chào ấ");
  assert.deepEqual([...readFileSync(join(dir, "out", "img_01.jpg"))], [1, 2, 3, 255]);
  assert.equal(readFileSync(join(dir, "out", "rỗng.txt")).length, 0);
  execFileSync("unzip", ["-t", join(dir, "a.zip")]); // kiểm CRC
});
test("tên trùng được đánh số", () => { /* 2 file "a.txt" → giải nén ra "a.txt" và "a (2).txt" */ });
test("cờ UTF-8 (bit 11) bật trong local header và central directory", () => { /* đọc 2 byte tại offset 6 của local header: & 0x0800 */ });
// package-text.test.js
test("captionWithHashtags", () => { assert.equal(captionWithHashtags({ caption: "Hay quá.", hashtags: ["#a", "#b"] }), "Hay quá.\n\n#a #b"); });
test("packageToText có đủ 9 phần, dùng CRLF, không có undefined", () => { /* dùng templatePackage(cocoon) */ });
test("packageToText với gói thiếu trường (hooks: undefined, warnings: []) không ném lỗi", () => {});
test("slug", () => { assert.equal(slug("Tinh chất bí đao N7"), "tinh-chat-bi-dao-n7"); assert.equal(slug("🔥🔥"), "san-pham"); assert.ok(slug("a".repeat(100)).length <= 40); });
```
Viết đủ thân cho các test chỉ có ghi chú.

- [ ] **Step 2: Chạy, xác nhận thất bại** — Run: `node --test test/zip.test.js test/package-text.test.js` · Expected: FAIL
- [ ] **Step 3: Viết hai module.** Zip: local file header (chữ ký `0x04034b50`), central directory header (`0x02014b50`), EOCD (`0x06054b50`), version needed 20, method 0, thời gian DOS từ `date`.
- [ ] **Step 4: Chạy lại** — Run: `npm test` · Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat: tạo zip trong trình duyệt và xuất gói dạng văn bản"`

---

### Task 5: `public/lib/share.js`

**Files:**
- Create: `public/lib/share.js`

**Interfaces:**
- Produces:
  - `copyText(text: string): Promise<boolean>` — `navigator.clipboard.writeText` nếu có; lỗi hoặc không có → textarea ẩn + `document.execCommand("copy")`; trả `false` nếu cả hai hỏng.
  - `canShareFiles(): boolean` — `navigator.canShare` tồn tại và nhận một `File` thử.
  - `shareFiles(files: File[], text?: string): Promise<"shared" | "cancelled" | "unsupported">` — người dùng huỷ (`AbortError`) → `"cancelled"`, không coi là lỗi.
  - `downloadBlob(blob: Blob, filename: string): void` — `<a download>` + `URL.revokeObjectURL` sau 10 giây.
  - `fetchAsFile(url: string, filename: string): Promise<File>` — chỉ dùng cho URL `/media/…` của chính app; lỗi → ném `Error("Không tải được file")`.

Module này chỉ gọi API trình duyệt nên không có unit test; nó được kiểm ở Task 6 qua `scripts/ui-check.mjs`.

- [ ] **Step 1: Viết `public/lib/share.js`** theo Interfaces.
- [ ] **Step 2: Kiểm cú pháp** — Run: `node --check public/lib/share.js` · Expected: không in gì.
- [ ] **Step 3: Commit** — `git commit -m "feat: copy, chia sẻ file, tải blob"`

---

### Task 6: UI gói đăng bài

**Files:**
- Create: `public/views/package.js`
- Modify: `public/app.js` (trang chi tiết gọi `renderPackage`; khối media thêm nút), `public/styles.css`, `scripts/ui-check.mjs`

**Interfaces:**
- Consumes: `api`, `h`/`toast` (chuyển `h`, `toast` sang `public/lib/dom.js` để hai file cùng dùng), `copyText`, `canShareFiles`, `shareFiles`, `downloadBlob`, `fetchAsFile`, `makeZip`, `packageToText`, `captionWithHashtags`, `scriptToText`, `slug`, `TEMPLATES`, `buildVideoPrompts`.
- Produces: `renderPackage(container: HTMLElement, product, pkg | null): void` trong `public/views/package.js`.

Nội dung, theo thứ tự khối ở spec mục 8:

| Khối | Hành vi |
|---|---|
| 2. Ảnh & video (thêm) | Nút **⬇ Tải tất cả .zip**: gom ảnh/video đã lưu (`stored` khác null) + `goi-dang-bai.txt` (nếu đã có gói) + `product.json`; tên `{slug(shortName)}_{yyyymmdd}.zip`; hiện tiến độ "Đang gom 3/5…"; file chưa lưu về kho bị bỏ qua và toast nói rõ bỏ qua mấy file. Nút **↗ Chia sẻ** cạnh video và từng ảnh, chỉ hiện khi `canShareFiles()` và file đã lưu. |
| 3. Tạo gói | Chọn tone (`tự nhiên`, `hài hước`, `chuyên gia`, `gấp gáp`), ô ghi chú, công tắc faceless (mặc định bật), nút **Tạo gói** / **Tạo lại**. Chưa có gói khi mở trang → tự gọi generate một lần. Đang tạo: nút khoá, chữ "Đang tạo…". Tạo lại khi các ô ở khối 8 đã bị sửa → `confirm("Tạo lại sẽ thay nội dung bạn đã sửa. Tiếp tục?")`. Lỗi → thông báo trong khối + nút Thử lại. Dòng nhỏ ghi nguồn gói (`note`). |
| 4. Hook | Mỗi hook một thẻ: chip công thức, lời nói, chữ màn hình, hai nút copy. |
| 5. Chữ ảnh bìa | Chip, bấm là copy. |
| 6. Prompt Google Flow | Tab **Đề xuất** (từ `pkg.videoPrompts`) và **Thư viện mẫu** (dựng tại chỗ bằng `buildVideoPrompts`: chọn hook làm lời thoại, sửa bối cảnh/bề mặt, lọc faceless). Mỗi prompt: tên, Flow mode, "Ảnh nên đưa vào", nội dung trong khối cuộn được, nút Copy. |
| 7. Kịch bản | Bảng trên màn rộng, thẻ trên điện thoại (< 640px); nút Copy kịch bản. |
| 8. Gói đăng bài | Ba textarea: caption, hashtag, bình luận ghim; mỗi ô một nút copy. Sửa tại chỗ, chưa lưu; dòng nhỏ "Thay đổi ở đây chưa được lưu lại (sẽ có ở bản sau)". |
| 9. Lưu ý | Danh sách `warnings`; rỗng thì ẩn khối. |
| 11. Thanh dính đáy | **Copy caption + hashtag** · **Copy cả gói**, dùng giá trị hiện tại của các textarea. Chỉ hiện khi đã có gói. `main` có padding đáy đủ để thanh không che nội dung. |

Mọi lần copy: toast "Đã copy" hoặc "Không copy được, hãy bôi đen và copy tay".

- [ ] **Step 1: Thêm kiểm tra vào `scripts/ui-check.mjs`** (chạy trước, phải FAIL): sau khi mở trang chi tiết, chờ khối hook xuất hiện với 6 thẻ; đủ 6 chip công thức đúng thứ tự; bấm một chip chữ ảnh bìa → toast "Đã copy"; tab Thư viện mẫu với faceless bật có 4 prompt, tắt có 7; sửa caption rồi bấm "Copy caption + hashtag" → `navigator.clipboard.readText()` (cấp quyền qua CDP `Browser.grantPermissions`) trả đúng caption đã sửa + hashtag; bấm Tạo lại sau khi sửa → có hộp xác nhận; bấm nút zip → bắt sự kiện tải qua `Browser.setDownloadBehavior` vào thư mục tạm rồi `unzip -t` file đó; card ở danh sách đổi badge thành "Đã có gói"; không cuộn ngang ở 375px; không lỗi JavaScript.
- [ ] **Step 2: Chạy, xác nhận thất bại** — Run: `node scripts/ui-check.mjs` · Expected: các kiểm tra mới FAIL, 29 kiểm tra cũ PASS.
- [ ] **Step 3: Viết `public/lib/dom.js`, `public/views/package.js`, sửa `app.js` và `styles.css`.**
- [ ] **Step 4: Chạy lại** — Run: `npm test && node scripts/ui-check.mjs` · Expected: tất cả PASS.
- [ ] **Step 5: Xem ảnh chụp** màn chi tiết ở 375px và 1280px; sửa chỗ chồng lấn, tràn chữ.
- [ ] **Step 6: Commit** — `git commit -m "feat: UI gói đăng bài, copy, zip, chia sẻ"`

---

### Task 7: Nghiệm thu phase 2

**Files:**
- Modify: `docs/STATE.md`, `docs/memory/decisions.md`, `docs/memory/gotchas.md`

- [ ] **Step 1:** `npm test` và `node scripts/ui-check.mjs` · Expected: tất cả PASS.
- [ ] **Step 2:** Đối chiếu 5 dòng Review Focus với tên test đang ghim; thiếu thì thêm test ở task sở hữu.
- [ ] **Step 3:** Ghi nghiệm thu vào STATE. Tiêu chí phase 2 ("Không cần LLM vẫn ra đủ gói; copy caption+hashtag 1 chạm; zip mở được trên Windows/iPhone"): hai ý đầu kiểm được trên máy dev; "zip mở được trên Windows/iPhone" và nút Chia sẻ trên điện thoại ghi "chờ chủ dự án kiểm" kèm bước kiểm.
- [ ] **Step 4:** Ghi vào `decisions.md`: tự lưu và `PUT package` để phase 3; `h`/`toast` chuyển sang `public/lib/dom.js`.
- [ ] **Step 5: Commit** — `git commit -m "docs: nghiệm thu phase 2"`
