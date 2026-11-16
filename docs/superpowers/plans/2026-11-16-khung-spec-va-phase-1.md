# Khung spec-driven + Studio Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng bộ khung spec-driven cho repo, rồi làm phase 1 của Studio: nhận sản phẩm từ extension, sao chép media vào R2, xem được danh sách và chi tiết trên web/điện thoại.

**Architecture:** Cloudflare Pages phục vụ `public/` tĩnh; Pages Functions trong `functions/` là lớp mỏng gọi sang logic thuần trong `lib/` (nhận `bucket` và `fetch` qua tham số để test được bằng bucket giả). Mọi dữ liệu nằm trên R2; chỉ mục là object rỗng dưới prefix `i/`.

**Tech Stack:** Cloudflare Pages + Functions, R2, wrangler (devDependency duy nhất), vanilla JS ES modules không build step, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-16-studio-va-khung-spec-design.md` (thiết kế đã duyệt) và spec gốc `affiliate-studio-spec.md` (sau Task 1 nằm ở `docs/spec/`). Số mục "spec mục N" bên dưới là số mục của spec gốc.

## Global Constraints

- Không build step, không framework, không thư viện runtime. `package.json` chỉ có `wrangler` trong `devDependencies`, `"type": "module"`.
- Chỉ dùng R2 (binding `BUCKET`). Không KV, không D1.
- UI và mọi thông báo lỗi hiển thị cho người dùng bằng tiếng Việt.
- Root repo là root app: `wrangler.toml`, `functions/`, `lib/`, `public/`, `test/` nằm ngay ở root.
- `RETENTION_DAYS = "7"`. API luôn lọc `isExpired(createdAt)`, không dựa vào lifecycle.
- `id`: đúng 10 ký tự `[a-z0-9]` ngẫu nhiên.
- Mọi `/api/*` yêu cầu `Authorization: Bearer <APP_TOKEN>`; `/media/*` không cần token.
- `/media` chỉ nhận key khớp `^p\/[a-z0-9]+\/[\w.-]+$`.
- Giới hạn: tối đa 12 ảnh; ảnh ≤ 15MB; video ≤ 60MB.
- Không tạo gì thuộc Hậu kỳ: `public/editor/`, `/api/transcribe`, `/api/products/:id/upload/*`, `/api/products/:id/edit`, `/api/brandkit`, trường `hasFinal`.
- Không chạy `wrangler login`, `wrangler pages deploy`, `r2 bucket create`, `secret put`. Chỉ dùng `wrangler pages dev` local.
- Các bước "Commit" chỉ chạy nếu chủ dự án đã đồng ý cho commit khi chọn cách thực thi; khi đó làm trên nhánh `studio-phase-1`, không commit thẳng vào `main`.

## Review Focus

1. Tiêu đề/mô tả/tên shop chứa HTML (`<img onerror=…>`) do lấy từ trang sàn → phải hiện ra dưới dạng chữ, không chạy. (Task 6)
2. CDN sàn từ chối hoặc lỗi một phần ảnh/video → sản phẩm vẫn lưu, mục lỗi có `stored: null`, UI dùng link gốc. (Task 4)
3. Token sai/thiếu, kể cả từ extension → `401` dạng JSON **có header CORS** để extension đọc được lỗi; UI chuyển sang `#/settings`. (Task 5, 6)
4. `Range` bất thường trên `/media` (`bytes=0-`, hậu tố `bytes=-500`, vượt kích thước, sai cú pháp) → 206 đúng hoặc 416, không 500. iPhone không phát được video nếu sai. (Task 5)
5. Tiêu đề tiếng Việt rất dài → `customMetadata` của chỉ mục không vượt giới hạn 2KB của R2; sản phẩm quá hạn nhưng lifecycle chưa chạy → ẩn khỏi danh sách, chi tiết trả 404. (Task 3)

---

## Cấu trúc file

```
CLAUDE.md
package.json  wrangler.toml  .gitignore  .dev.vars.example
docs/spec/{overview,studio,hau-ky,phases}.md
docs/RULES.md  docs/STATE.md  docs/memory/{decisions,gotchas}.md
.claude/skills/spec/SKILL.md
lib/util.js        # json(), id, key, hạn dùng
lib/range.js       # parseRange()
lib/store.js       # đọc/ghi sản phẩm + chỉ mục trên R2
lib/mirror.js      # sao chép ảnh/video từ CDN vào R2
functions/api/_middleware.js
functions/api/products/index.js
functions/api/products/[id].js
functions/media/[[path]].js
public/index.html  public/app.js  public/styles.css
public/lib/api.js      # fetch kèm token
public/lib/format.js   # escapeHtml, formatPrice, daysLeft
test/helpers/fake-bucket.js
test/fixtures/cocoon.json
test/{util,range,store,mirror,api,format}.test.js
```

---

### Task 1: Khung spec-driven

**Files:**
- Create: `docs/spec/overview.md`, `docs/spec/studio.md`, `docs/spec/hau-ky.md`, `docs/spec/phases.md`
- Create: `CLAUDE.md`, `docs/RULES.md`, `docs/STATE.md`, `docs/memory/decisions.md`, `docs/memory/gotchas.md`, `.claude/skills/spec/SKILL.md`
- Delete: `affiliate-studio-spec.md`

**Interfaces:**
- Produces: `docs/STATE.md` theo mẫu ở Step 4 (các task sau tick checklist trong đó); `docs/memory/decisions.md` và `gotchas.md` (các task sau ghi thêm, mục mới nhất ở trên).

- [ ] **Step 1: Tách spec nguyên văn**

Cắt `affiliate-studio-spec.md` theo dòng, không sửa chữ nào, không thêm tiêu đề:

| File | Dòng của file gốc |
|---|---|
| `docs/spec/overview.md` | 1–173 (đầu file + mục 0–5), 362–370 (mục 10), 412–453 (mục 12–14) |
| `docs/spec/studio.md` | 174–264 (mục 6–8) |
| `docs/spec/hau-ky.md` | 265–361 (mục 9) |
| `docs/spec/phases.md` | 371–411 (mục 11) |

- [ ] **Step 2: Kiểm tra không mất dòng nào**

Run: `diff <(cat docs/spec/*.md | sort) <(sort affiliate-studio-spec.md) && echo OK`
Expected: `OK`. Sau đó xoá `affiliate-studio-spec.md`.

- [ ] **Step 3: Viết `docs/RULES.md`**

Mỗi luật một dòng kèm lý do trong ngoặc. Đúng 9 luật này:
1. Spec đổi trước, code đổi sau; đổi hành vi phải qua `/spec change`.
2. Không build step, không framework, không thư viện runtime (deploy là copy thư mục `public/`).
3. Chỉ lưu trên R2; không KV/D1.
4. UI và thông báo cho người dùng bằng tiếng Việt.
5. Không để key LLM/Groq ở client; chỉ `APP_TOKEN` nằm trong `localStorage`.
6. Gói đăng bài chỉ dùng dữ liệu có trong input; không bịa công dụng, số liệu, chứng nhận; không từ khẳng định điều trị ("trị dứt", "chữa", "hết 100%").
7. `/media` chỉ phục vụ key khớp `^p\/[a-z0-9]+\/[\w.-]+$`.
8. Không tự deploy, tạo bucket, đặt secret hay `wrangler login`; chuẩn bị lệnh cho chủ dự án chạy.
9. Không commit khi chưa được bảo. Chỉ đánh dấu xong sau khi đã chạy kiểm tra thật; tiêu chí cần thiết bị thật ghi "chờ chủ dự án kiểm".

- [ ] **Step 4: Viết `docs/STATE.md`**

```markdown
# Trạng thái

**Phase hiện tại:** 1 · Nền tảng & đồng bộ
**Kế hoạch:** docs/superpowers/plans/2026-11-16-khung-spec-va-phase-1.md
**Việc kế tiếp:** Task 2

## Checklist phase 1
- [x] Task 1: Khung spec-driven
- [ ] Task 2: Khung dự án + lib/util.js
- [ ] Task 3: lib/store.js
- [ ] Task 4: lib/mirror.js
- [ ] Task 5: API + /media
- [ ] Task 6: UI
- [ ] Task 7: Nghiệm thu phase 1

## Vướng mắc
(chưa có)

## Nghiệm thu gần nhất
(chưa có)

## Các phase sau
- [ ] Phase 2: Thư viện mẫu & gói dựng sẵn
- [ ] Phase 3: LLM + chế độ thủ công
- [ ] Phase 4: PWA, lifecycle, extension, deploy
- [ ] Hậu kỳ (phase 5–8.5): cần buổi thiết kế riêng trước
```

- [ ] **Step 5: Viết `docs/memory/decisions.md` và `gotchas.md`**

`decisions.md`: chép 8 quyết định ở mục 7 của bản thiết kế, mỗi quyết định dạng `## 2026-11-16 · <tên>` + 1–3 dòng (quyết định, lý do). `gotchas.md`: chỉ có tiêu đề và một dòng mô tả định dạng (`## <bẫy>` + triệu chứng + cách tránh).

- [ ] **Step 6: Viết `.claude/skills/spec/SKILL.md`**

```markdown
---
name: spec
description: Làm việc theo spec của dự án. Dùng khi người dùng gõ /spec next, /spec status, /spec change, hoặc hỏi "làm tiếp", "đang ở đâu", "đổi yêu cầu".
---

# spec

Đối số đầu tiên chọn lệnh. Không có đối số thì coi như `status`.

## status
Đọc `docs/STATE.md`. Báo: phase, việc đã xong, việc kế tiếp, vướng mắc. Không sửa file nào.

## next
1. Đọc `docs/STATE.md`, `docs/RULES.md`, `docs/memory/gotchas.md`, và phần trong `docs/spec/` liên quan tới việc kế tiếp.
2. Nếu phase hiện tại chưa có kế hoạch: dùng superpowers:writing-plans lập kế hoạch cho phase đó từ `docs/spec/phases.md`, ghi đường dẫn vào STATE, rồi dừng lại cho chủ dự án duyệt.
3. Làm đúng **một** việc kế tiếp trong checklist. Logic thuần thì viết test trước.
4. Chạy kiểm tra thật (`npm test`, gọi API local). Chưa chạy thì chưa xong.
5. Cập nhật STATE: tick việc, ghi "Việc kế tiếp". Có quyết định mới thì thêm vào `docs/memory/decisions.md`; gặp bẫy thì thêm vào `gotchas.md`.
6. Nếu đó là việc cuối của phase: chạy từng tiêu chí ✅ của phase trong `docs/spec/phases.md`, ghi kết quả vào "Nghiệm thu gần nhất". Tiêu chí cần thiết bị thật (iPhone, extension, tài khoản Cloudflare) thì ghi "chờ chủ dự án kiểm" kèm các bước kiểm; không tự đánh dấu đạt.

## change <mô tả>
1. Nếu thay đổi mâu thuẫn với `docs/RULES.md`: dừng lại, nêu luật bị đụng, hỏi chủ dự án.
2. Sửa file trong `docs/spec/` trước.
3. Thêm một mục vào `docs/memory/decisions.md` (ngày, thay đổi, lý do).
4. Cập nhật checklist trong STATE.
5. Sau đó mới sửa code, theo các bước của `next`.

## Luôn luôn
- Không commit, không deploy, không đụng secret khi chưa được bảo.
- Mỗi loại thông tin một nơi: yêu cầu ở spec, luật ở RULES, tiến độ ở STATE, lý do ở decisions.
```

- [ ] **Step 7: Viết `CLAUDE.md`** (≤ 40 dòng)

Gồm: 3 dòng dự án là gì; lệnh `npm test` và `npm run dev`; bảng "thông tin nào ở file nào" (spec, RULES, STATE, memory, skill `spec`); và hai dòng import `@docs/RULES.md`, `@docs/STATE.md`. Không chép luật hay trạng thái vào đây.

- [ ] **Step 8: Kiểm tra**

Run: `wc -l CLAUDE.md && ls docs/spec docs/memory .claude/skills/spec && test ! -e affiliate-studio-spec.md && echo OK`
Expected: `CLAUDE.md` ≤ 40 dòng, đủ 4 + 2 + 1 file, `OK`.

- [ ] **Step 9: Commit** — `git add -A && git commit -m "docs: khung spec-driven (spec, rules, state, memory, skill)"`

---

### Task 2: Khung dự án + `lib/util.js`

**Files:**
- Create: `package.json`, `wrangler.toml`, `.gitignore`, `.dev.vars.example`, `test/fixtures/cocoon.json`, `lib/util.js`
- Test: `test/util.test.js`

**Interfaces:**
- Produces (từ `lib/util.js`):
  - `json(data: any, status = 200, headers = {}): Response` — `content-type: application/json; charset=utf-8`
  - `newId(): string` — 10 ký tự `[a-z0-9]`, dùng `crypto.getRandomValues`
  - `isValidId(id: string): boolean` — `/^[a-z0-9]{10}$/`
  - `retentionDays(env): number` — `Number(env.RETENTION_DAYS) || 7`
  - `expiresAt(createdAt: string, days: number): string` — ISO
  - `isExpired(createdAt: string, days: number, now = Date.now()): boolean`
  - `indexKey(createdMs: number, id: string): string` — `` `i/${String(9999999999999 - createdMs).padStart(13, "0")}_${id}` ``
  - `productKey(id: string, file: string): string` — `` `p/${id}/${file}` ``
  - `mediaKeyOk(key: string): boolean` — regex ở Global Constraints
  - `extFromContentType(ct: string | null, fallback: string): string` — `image/jpeg→jpg`, `image/png→png`, `image/webp→webp`, `video/mp4→mp4`, còn lại `fallback`
- Produces: `test/fixtures/cocoon.json`; `npm test` chạy `node --test`; `npm run dev` chạy `wrangler pages dev`.

- [ ] **Step 1: Tạo file cấu hình**

`package.json`: `"type": "module"`, `"private": true`, scripts `test: "node --test"`, `dev: "wrangler pages dev"`. Chạy `npm i -D wrangler`.
`wrangler.toml`: đúng như spec mục 2, với `compatibility_date = "2026-11-01"` và **không** đặt `LLM_MODEL` (phase 3 mới thêm).
`.gitignore`: `node_modules/`, `.wrangler/`, `.dev.vars`.
`.dev.vars.example`: `APP_TOKEN=dev-token-doi-truoc-khi-deploy`.
`test/fixtures/cocoon.json`: JSON ở spec mục 4, điền các chỗ `...` bằng giá trị cụ thể: 3 ảnh với `original` dạng `https://cdn.example.test/img{1,2,3}~tplv-aphluv4xwc-origin-jpeg.jpeg` và `preview` dạng `.webp`; `videos.header.url = "https://cdn.example.test/v1.mp4"`, `backupUrl = "https://cdn.example.test/v1b.mp4"`; `videos.description` trùng `header`; giữ nguyên giá `216749 / 377952 / "-43%"`, `soldCount 229096`, `rating 4.7`, `shopName "Cocoon Vietnam"`.

- [ ] **Step 2: Viết test thất bại** (`test/util.test.js`)

```js
test("newId: 10 ký tự a-z0-9, khác nhau mỗi lần", () => {
  const a = newId(), b = newId();
  assert.match(a, /^[a-z0-9]{10}$/); assert.notEqual(a, b);
});
test("indexKey: mới hơn xếp trước theo thứ tự chữ", () => {
  assert.ok(indexKey(2000, "aaaaaaaaaa") < indexKey(1000, "bbbbbbbbbb"));
  assert.equal(indexKey(1, "abcdefghij"), "i/9999999999998_abcdefghij");
});
test("isExpired: đúng 7 ngày thì hết hạn", () => {
  const t = "2026-11-01T00:00:00.000Z", day = 86400000, base = Date.parse(t);
  assert.equal(isExpired(t, 7, base + 7 * day - 1), false);
  assert.equal(isExpired(t, 7, base + 7 * day), true);
  assert.equal(expiresAt(t, 7), "2026-11-08T00:00:00.000Z");
});
test("mediaKeyOk", () => {
  assert.equal(mediaKeyOk("p/abc123/img_01.jpg"), true);
  for (const k of ["cfg/brandkit.json", "p/abc/../x", "p/ABC/x.jpg", "i/123_abc", "p/abc/a/b.jpg", ""]) assert.equal(mediaKeyOk(k), false);
});
test("retentionDays mặc định 7", () => {
  assert.equal(retentionDays({}), 7); assert.equal(retentionDays({ RETENTION_DAYS: "3" }), 3);
});
test("json() trả UTF-8", async () => {
  const r = json({ a: "ấ" }, 201);
  assert.equal(r.status, 201); assert.match(r.headers.get("content-type"), /application\/json; charset=utf-8/);
  assert.deepEqual(await r.json(), { a: "ấ" });
});
```

- [ ] **Step 3: Chạy, xác nhận thất bại** — Run: `npm test` · Expected: FAIL (không tìm thấy `lib/util.js`)
- [ ] **Step 4: Viết `lib/util.js`** theo Interfaces.
- [ ] **Step 5: Chạy lại** — Run: `npm test` · Expected: PASS
- [ ] **Step 6: Commit** — `git commit -m "feat: khung dự án và lib/util"`

---

### Task 3: `lib/store.js`

**Files:**
- Create: `lib/store.js`, `test/helpers/fake-bucket.js`
- Test: `test/store.test.js`

**Interfaces:**
- Consumes: `indexKey`, `productKey`, `isExpired`, `expiresAt` từ `lib/util.js`.
- Produces `test/helpers/fake-bucket.js`: `makeBucket()` trả object giả R2 lưu trong `Map`, có `put(key, value, { httpMetadata?, customMetadata? })`, `get(key, { range? })` → `null | { body, size, httpEtag, httpMetadata, customMetadata, range, text(), json(), arrayBuffer() }`, `head(key)`, `delete(key | key[])`, `list({ prefix, cursor, limit, include })` → `{ objects: [{ key, size, customMetadata }], truncated, cursor }` (sắp theo key, tôn trọng `limit` để test phân trang).
- Produces (từ `lib/store.js`):
  - `saveProduct(bucket, product): Promise<void>` — ghi `p/{id}/product.json` và object rỗng tại `product.indexKey` với `customMetadata` `{ id, title, price, platform, thumb, createdAt, hasPackage: "0" }` (mọi giá trị là string; `title = encodeURIComponent(product.title.slice(0, 80))`; `price = String(product.price?.current ?? "")`)
  - `getProduct(bucket, id): Promise<object | null>`
  - `getPackage(bucket, id): Promise<object | null>` — đọc `p/{id}/package.json`
  - `listProducts(bucket, days: number, now = Date.now()): Promise<Array<{ id, title, price: number | null, thumb, createdAt, expiresAt, hasPackage: boolean }>>` — duyệt hết các trang `list({ prefix: "i/", include: ["customMetadata"] })`, giải mã `title`, bỏ mục quá hạn
  - `deleteProduct(bucket, id): Promise<boolean>` — xoá mọi key dưới `p/{id}/` và chỉ mục; `false` nếu không có sản phẩm

- [ ] **Step 1: Viết `test/helpers/fake-bucket.js`** theo Interfaces.

- [ ] **Step 2: Viết test thất bại** (`test/store.test.js`). `mk(id, createdMs, title)` tạo product tối thiểu với `createdAt`, `indexKey`, `price.current`.

```js
test("lưu rồi đọc lại; danh sách mới nhất trước", async () => {
  const b = makeBucket(), now = Date.parse("2026-11-16T00:00:00Z");
  await saveProduct(b, mk("aaaaaaaaaa", now - 2000, "Cũ"));
  await saveProduct(b, mk("bbbbbbbbbb", now - 1000, "Mới"));
  assert.equal((await getProduct(b, "aaaaaaaaaa")).title, "Cũ");
  const items = await listProducts(b, 7, now);
  assert.deepEqual(items.map(i => i.title), ["Mới", "Cũ"]);
  assert.equal(items[0].hasPackage, false);
  assert.equal(typeof items[0].price, "number");
});
test("mục quá hạn bị ẩn dù object còn trên R2", async () => {
  const b = makeBucket(), now = Date.parse("2026-11-16T00:00:00Z");
  await saveProduct(b, mk("cccccccccc", now - 8 * 86400000, "Hết hạn"));
  assert.deepEqual(await listProducts(b, 7, now), []);
});
test("tiêu đề tiếng Việt 500 ký tự: metadata chỉ mục dưới 2KB, đọc lại đúng 80 ký tự đầu", async () => {
  const b = makeBucket(), now = Date.now(), title = "Tinh chất bí đao ".repeat(30);
  const p = mk("dddddddddd", now, title); await saveProduct(b, p);
  const meta = (await b.head(p.indexKey)).customMetadata;
  assert.ok(Object.entries(meta).reduce((n, [k, v]) => n + k.length + v.length, 0) < 2048);
  assert.equal((await listProducts(b, 7, now))[0].title, title.slice(0, 80));
});
test("danh sách đi hết các trang", async () => {
  const b = makeBucket({ pageSize: 2 }), now = Date.now();
  for (let i = 0; i < 5; i++) await saveProduct(b, mk(`eeeeeeeee${i}`, now - i, `SP ${i}`));
  assert.equal((await listProducts(b, 7, now)).length, 5);
});
test("xoá: sạch p/{id}/ và chỉ mục; id không có trả false", async () => {
  const b = makeBucket(), p = mk("ffffffffff", Date.now(), "X");
  await saveProduct(b, p); await b.put("p/ffffffffff/img_01.jpg", "x");
  assert.equal(await deleteProduct(b, "ffffffffff"), true);
  assert.equal((await b.list({ prefix: "p/ffffffffff/" })).objects.length, 0);
  assert.equal(await b.head(p.indexKey), null);
  assert.equal(await deleteProduct(b, "zzzzzzzzzz"), false);
});
```
`makeBucket({ pageSize })` giới hạn số object mỗi lần `list`.

- [ ] **Step 3: Chạy, xác nhận thất bại** — Run: `node --test test/store.test.js` · Expected: FAIL
- [ ] **Step 4: Viết `lib/store.js`** theo Interfaces.
- [ ] **Step 5: Chạy lại** — Expected: PASS
- [ ] **Step 6: Commit** — `git commit -m "feat: lib/store đọc ghi sản phẩm và chỉ mục trên R2"`

---

### Task 4: `lib/mirror.js`

**Files:**
- Create: `lib/mirror.js`
- Test: `test/mirror.test.js`

**Interfaces:**
- Consumes: `productKey`, `extFromContentType` từ `lib/util.js`; `makeBucket` từ Task 3.
- Produces: `mirrorMedia(bucket, id: string, input: object, fetchFn = fetch): Promise<{ images, videos, mirrored: number }>`
  - `images`: tối đa 12 phần tử đầu của `input.images`, mỗi phần tử giữ nguyên các trường gốc + `stored: string | null` (key R2, vd `p/{id}/img_01.jpg`; số thứ tự 2 chữ số theo vị trí; đuôi theo content-type, mặc định `jpg`).
  - `videos`: `{ header?, description? }` giữ nguyên trường gốc + `stored`. `header` lưu thành `video_header.mp4`. `description` có `url` trùng `header.url` → không tải lại, `stored` bằng của `header`; khác thì lưu `video_description.mp4`.
  - `mirrored`: số file đã lưu được.
  - Thứ tự thử: ảnh `original` → `preview`; video `url` → `backupUrl`.
  - Mọi request gửi header `Referer: input.url` và `User-Agent` của Chrome desktop.
  - Từ chối (coi như lỗi, thử nguồn kế) khi: status không 2xx, ảnh > 15MB, video > 60MB (theo `content-length`; không có thì đo sau khi đọc), hoặc `fetchFn` ném lỗi.
  - Ảnh tải song song. Không bao giờ ném lỗi ra ngoài: lỗi → `stored: null`.
  - Ghi R2 kèm `httpMetadata.contentType`.

- [ ] **Step 1: Viết test thất bại.** `fakeFetch(map)` trả `Response` theo URL, ghi lại `calls` (url + headers); URL không có trong map → 403.

```js
test("lưu ảnh gốc, video header; description trùng không tải lại", async () => {
  // map: 3 original (image/jpeg), v1.mp4 (video/mp4)
  const r = await mirrorMedia(b, "abcdefghij", cocoon, f);
  assert.deepEqual(r.images.map(i => i.stored), ["p/abcdefghij/img_01.jpg", "p/abcdefghij/img_02.jpg", "p/abcdefghij/img_03.jpg"]);
  assert.equal(r.videos.header.stored, "p/abcdefghij/video_header.mp4");
  assert.equal(r.videos.description.stored, r.videos.header.stored);
  assert.equal(r.mirrored, 4);
  assert.equal(f.calls.filter(c => c.url.endsWith("v1.mp4")).length, 1);
  assert.equal(f.calls[0].headers.get("referer"), cocoon.url);
  assert.equal((await b.head("p/abcdefghij/img_01.jpg")).httpMetadata.contentType, "image/jpeg");
});
test("original 403 → dùng preview (webp)", async () => { /* stored kết thúc bằng img_01.webp */ });
test("cả hai nguồn lỗi → stored null, các ảnh khác vẫn lưu, không ném lỗi", async () => { /* images[1].stored === null, mirrored giảm 1 */ });
test("fetch ném lỗi mạng → stored null", async () => {});
test("video url lỗi → dùng backupUrl", async () => {});
test("ảnh content-length 16MB → bỏ; video 61MB → bỏ", async () => {});
test("20 ảnh → chỉ 12 phần tử, img_12 là cuối", async () => {});
test("không có videos → videos là {}", async () => {});
```
Mỗi test viết đủ assertion theo ghi chú trong thân.

- [ ] **Step 2: Chạy, xác nhận thất bại** — Run: `node --test test/mirror.test.js` · Expected: FAIL
- [ ] **Step 3: Viết `lib/mirror.js`.** Ảnh đọc bằng `arrayBuffer()`. Video: có `content-length` thì truyền thẳng `res.body` vào `bucket.put` (không giữ 60MB trong RAM của Worker), không có thì `arrayBuffer()`.
- [ ] **Step 4: Chạy lại** — Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat: sao chép media từ CDN vào R2"`

---

### Task 5: API + `/media`

**Files:**
- Create: `lib/range.js`, `functions/api/_middleware.js`, `functions/api/products/index.js`, `functions/api/products/[id].js`, `functions/media/[[path]].js`
- Test: `test/range.test.js`, `test/api.test.js`

**Interfaces:**
- Consumes: mọi thứ từ `lib/util.js`, `lib/store.js`, `lib/mirror.js`; `makeBucket`.
- Produces:
  - `parseRange(header: string | null, size: number): null | "invalid" | { offset: number, length: number }` trong `lib/range.js` — `null` khi không có header; chỉ hỗ trợ một khoảng `bytes=a-b`, `bytes=a-`, `bytes=-n`; `b` vượt quá thì cắt về `size - 1`; `a >= size`, sai cú pháp, hoặc nhiều khoảng → `"invalid"`.
  - `_middleware.js`: `onRequest(ctx)`. Header CORS trên **mọi** response kể cả lỗi: `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: Authorization, Content-Type`, `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`. `OPTIONS` → `204` trước khi kiểm token. Thiếu `env.APP_TOKEN` → `500 {error:"Chưa cấu hình APP_TOKEN"}`. Token sai/thiếu → `401 {error:"Token không đúng"}`. `ctx.next()` ném lỗi → `500 {error: <message>}`.
  - `products/index.js`: `onRequestGet` → `200 {items}`; `onRequestPost` → `201 {id, url, mirrored, videos}` với `url = `${origin}/#/p/${id}``.
  - `products/[id].js`: `onRequestGet` → `200 {product, package, expiresAt}`; `onRequestDelete` → `200 {ok:true}`. Id sai định dạng, không có, hoặc quá hạn → `404 {error:"Không tìm thấy sản phẩm"}`.
  - `media/[[path]].js`: `onRequestGet`, key = `ctx.params.path.join("/")`.
  - Sản phẩm lưu xuống = JSON đầu vào + `id`, `createdAt` (ISO), `indexKey`, `images`/`videos` từ `mirrorMedia`, `thumb` (`/media/<stored của ảnh đầu tiên lưu được>`, không có thì `preview` hoặc `original` của ảnh đầu).
  - POST lỗi đầu vào → `400`: body không phải JSON → `{error:"JSON không hợp lệ"}`; thiếu `title` (string khác rỗng) hoặc `images` (mảng khác rỗng) → `{error:"Thiếu title hoặc images"}`.

- [ ] **Step 1: Test `parseRange` thất bại** (`test/range.test.js`)

```js
test("parseRange", () => {
  assert.equal(parseRange(null, 1000), null);
  assert.deepEqual(parseRange("bytes=0-", 1000), { offset: 0, length: 1000 });
  assert.deepEqual(parseRange("bytes=0-1", 1000), { offset: 0, length: 2 });
  assert.deepEqual(parseRange("bytes=500-9999", 1000), { offset: 500, length: 500 });
  assert.deepEqual(parseRange("bytes=-200", 1000), { offset: 800, length: 200 });
  assert.deepEqual(parseRange("bytes=-5000", 1000), { offset: 0, length: 1000 });
  for (const h of ["bytes=1000-", "bytes=5-2", "bytes=abc", "items=0-1", "bytes=0-1,5-6", "bytes=-0"]) assert.equal(parseRange(h, 1000), "invalid");
});
```

- [ ] **Step 2: Chạy thất bại, viết `lib/range.js`, chạy đạt.** Run: `node --test test/range.test.js`

- [ ] **Step 3: Test API thất bại** (`test/api.test.js`). Gọi thẳng các hàm handler với `{ request, env: { BUCKET: makeBucket(), APP_TOKEN: "t", RETENTION_DAYS: "7" }, params, next }`. Với POST, thay `globalThis.fetch` bằng `fakeFetch` trong `beforeEach` và khôi phục trong `afterEach`.

```js
// middleware
test("OPTIONS → 204 có CORS, không cần token");
test("thiếu/sai token → 401 JSON, vẫn có Access-Control-Allow-Origin: *");
test("đúng token → gọi next() và giữ CORS trên response");
test("next() ném lỗi → 500 {error}");
test("env không có APP_TOKEN → 500");
// products
test("POST fixture → 201; id khớp /^[a-z0-9]{10}$/; url kết thúc bằng `/#/p/${id}`; mirrored === 4");
test("POST rồi GET list → 1 item, thumb bắt đầu bằng /media/p/");
test("POST rồi GET :id → product.title đúng, package === null, expiresAt = createdAt + 7 ngày");
test("POST body 'abc' → 400; thiếu images → 400; images: [] → 400");
test("POST khi CDN 403 toàn bộ → vẫn 201, mirrored === 0, thumb là link preview gốc");
test("GET :id sai định dạng ('../x'), không tồn tại, hoặc createdAt cũ 8 ngày → 404");
test("DELETE → 200; sau đó GET :id → 404 và list rỗng; DELETE lần hai → 404");
// media
test("GET không Range → 200, Accept-Ranges: bytes, ETag, Cache-Control: private, max-age=86400, đúng Content-Type");
test("Range bytes=0-1 → 206, Content-Range: bytes 0-1/<size>, body 2 byte");
test("Range bytes=-3 → 206, 3 byte cuối");
test("Range vượt kích thước → 416 kèm Content-Range: bytes */<size>");
test("If-None-Match khớp ETag → 304");
test("key cfg/brandkit.json, p/ab/../x, i/1_a → 404; key hợp lệ nhưng không có → 404");
```
Viết đủ thân và assertion cho từng test theo tên.

- [ ] **Step 4: Chạy, xác nhận thất bại** — Run: `node --test test/api.test.js` · Expected: FAIL
- [ ] **Step 5: Viết 4 file handler** theo Interfaces. `/media`: `head` trước để biết `size`, rồi `parseRange`, rồi `get(key, { range })`. So sánh token bằng vòng lặp XOR độ dài cố định, không dùng `===`.
- [ ] **Step 6: Chạy toàn bộ** — Run: `npm test` · Expected: PASS
- [ ] **Step 7: Kiểm bằng wrangler thật**

```bash
cp .dev.vars.example .dev.vars && npm run dev   # chạy nền, cổng 8788
curl -s -o /dev/null -w "%{http_code}\n" localhost:8788/api/products                       # 401
curl -s -H "Authorization: Bearer dev-token-doi-truoc-khi-deploy" localhost:8788/api/products  # {"items":[]}
curl -s -X POST -H "Authorization: Bearer dev-token-doi-truoc-khi-deploy" -H "Content-Type: application/json" \
  --data @test/fixtures/cocoon.json localhost:8788/api/products                            # 201, mirrored 0 (CDN giả)
```
Expected: đúng như chú thích; GET list sau đó có 1 item. Nếu import `../../../lib/*.js` từ `functions/` không bundle được, ghi vào `docs/memory/gotchas.md` và sửa đường dẫn.

- [ ] **Step 8: Commit** — `git commit -m "feat: API sản phẩm, middleware token/CORS, /media có Range"`

---

### Task 6: UI

**Files:**
- Create: `public/index.html`, `public/app.js`, `public/styles.css`, `public/lib/api.js`, `public/lib/format.js`
- Test: `test/format.test.js`

**Interfaces:**
- Consumes: API ở Task 5.
- Produces (từ `public/lib/format.js`, thuần, không đụng DOM):
  - `escapeHtml(s: any): string` — thay `& < > " '`; `null/undefined` → `""`
  - `formatPrice(n: number | null): string` — `216749 → "216.749₫"`; `null` → `""`
  - `daysLeft(expiresAt: string, now = Date.now()): number` — làm tròn lên, tối thiểu 0
  - `mediaUrl(item: { stored: string | null, original?, preview?, url? }): string` — `/media/<stored>` nếu có, không thì `original ?? preview ?? url`
- Produces (từ `public/lib/api.js`): `getToken()`, `setToken(t)`, `api(path, { method, body }?)` → JSON đã parse; gắn `Authorization`; `401` → xoá hướng hiện tại, chuyển `location.hash = "#/settings"` và ném lỗi; lỗi khác ném `Error(<error từ server>)`.

- [ ] **Step 1: Test `format.js` thất bại**

```js
test("escapeHtml chặn HTML từ dữ liệu sàn", () => {
  assert.equal(escapeHtml(`<img src=x onerror="alert(1)">`), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.equal(escapeHtml("Tinh chất & 'bí đao'"), "Tinh chất &amp; &#39;bí đao&#39;");
  assert.equal(escapeHtml(null), "");
});
test("formatPrice", () => { assert.equal(formatPrice(216749), "216.749₫"); assert.equal(formatPrice(null), ""); });
test("daysLeft", () => {
  const now = Date.parse("2026-11-16T00:00:00Z");
  assert.equal(daysLeft("2026-11-16T01:00:00Z", now), 1);
  assert.equal(daysLeft("2026-11-23T00:00:00Z", now), 7);
  assert.equal(daysLeft("2026-11-15T00:00:00Z", now), 0);
});
test("mediaUrl", () => {
  assert.equal(mediaUrl({ stored: "p/a/img_01.jpg", original: "https://x/o" }), "/media/p/a/img_01.jpg");
  assert.equal(mediaUrl({ stored: null, original: "https://x/o", preview: "https://x/p" }), "https://x/o");
});
```

- [ ] **Step 2: Chạy thất bại, viết `format.js`, chạy đạt.** Run: `node --test test/format.test.js`

- [ ] **Step 3: Viết `public/lib/api.js`** theo Interfaces. Token lưu ở `localStorage["APP_TOKEN"]`.

- [ ] **Step 4: Viết `index.html`, `app.js`, `styles.css`**

`index.html`: `lang="vi"`, viewport mobile, `<script type="module" src="/app.js">`, một `<main id="app">` và một vùng toast.
`app.js`: router theo `hashchange` cho ba route. Mọi dữ liệu từ sản phẩm đưa vào DOM qua `textContent` hoặc `escapeHtml`; URL ảnh/video/link sàn chỉ gán vào `src`/`href` khi bắt đầu bằng `https://` hoặc `/media/`.

| Route | Nội dung (spec mục 8) |
|---|---|
| `#/settings` | Ô nhập token + nút Lưu (toast "Đã lưu token"), rồi về `#/`. Chưa có token thì mọi route chuyển về đây. |
| `#/` | Lưới card: thumbnail, tiêu đề 2 dòng, giá, badge "Chưa tạo gói"/"Đã có gói", "còn N ngày". Trạng thái: đang tải, rỗng ("Chưa có sản phẩm. Gửi từ extension hoặc bấm ＋"), lỗi (thông báo + nút Thử lại). Nút ＋ mở `<dialog>` dán JSON → `POST /api/products` → mở `#/p/{id}`; JSON sai hiện lỗi ngay trong dialog. |
| `#/p/{id}` | Khối 1: tiêu đề, giá, giá gạch, % giảm, shop, đã bán, ★, link sàn (`target="_blank" rel="noopener"`), "tự xoá sau N ngày", nút Xoá (hỏi `confirm` trước, xong về `#/`). Khối 2: lưới ảnh nhãn "Ảnh 1…" mỗi ảnh có nút ⬇; video `<video controls playsinline preload="metadata">` + nút ⬇. 404 → "Sản phẩm không còn (đã xoá hoặc quá 7 ngày)" + link về danh sách. |

Nút ⬇: `<a download>` khi media đã lưu (`stored` khác null); chưa lưu thì `window.open(url)`. Các khối 3–11 của spec mục 8 thuộc phase sau, **không** làm.
`styles.css`: mobile-first, lưới 2 cột trên điện thoại, vùng chạm ≥ 44px, tôn trọng `prefers-color-scheme`.

- [ ] **Step 5: Kiểm bằng trình duyệt**

Chạy `npm run dev`, mở `http://localhost:8788`. Kiểm lần lượt: chưa có token → vào settings; nhập token → danh sách rỗng; ＋ dán `cocoon.json` → vào trang chi tiết, thấy đủ khối 1 và 2, ảnh hiện qua link gốc; sửa `title` trong JSON thành `<img src=x onerror=alert(1)>` rồi dán → tiêu đề hiện nguyên văn dạng chữ, không có hộp thoại; Xoá → về danh sách. Thu hẹp cửa sổ còn 375px: không cuộn ngang.
Expected: tất cả đúng. Ghi kết quả từng mục vào STATE.

- [ ] **Step 6: Commit** — `git commit -m "feat: UI settings, danh sách, chi tiết sản phẩm"`

---

### Task 7: Nghiệm thu phase 1

**Files:**
- Modify: `docs/STATE.md`, `docs/memory/gotchas.md` (nếu có bẫy)

- [ ] **Step 1: Chạy lại toàn bộ** — Run: `npm test` · Expected: PASS, 0 fail.
- [ ] **Step 2: Đối chiếu Review Focus.** Với mỗi dòng trong 5 dòng, chỉ ra tên test đang ghim nó; thiếu thì viết thêm test ở task sở hữu.
- [ ] **Step 3: Ghi nghiệm thu vào `docs/STATE.md`.** Tiêu chí của phase 1 ("Gửi từ extension → mở trên điện thoại thấy đúng sản phẩm, xem được video trên iPhone") cần deploy và thiết bị thật → ghi "chờ chủ dự án kiểm" kèm các bước:
  1. Chạy các lệnh ở spec mục 12 (tạo bucket, 2 lifecycle rule, `secret put APP_TOKEN`, `pages deploy`).
  2. Extension: Endpoint `https://<project>.pages.dev/api/products`, `Bearer <APP_TOKEN>`; gửi một sản phẩm thật.
  3. Mở app trên iPhone, nhập token, mở sản phẩm, phát video (kiểm Range), tải một ảnh.
  4. Xác nhận ảnh hiện từ `/media/…` (đã sao chép được từ CDN thật). Nếu CDN từ chối, ghi vào `gotchas.md`.
- [ ] **Step 4: Cập nhật STATE:** tick Task 2–7, "Việc kế tiếp: lập kế hoạch phase 2 (`/spec next`)".
- [ ] **Step 5: Commit** — `git commit -m "docs: nghiệm thu phase 1"`
