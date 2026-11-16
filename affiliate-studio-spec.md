# Affiliate Studio: Spec cho Claude Code

> PWA chạy trên web và điện thoại, gồm 2 module trong cùng một app:
> **(A) Studio:** nhận dữ liệu sản phẩm từ Chrome extension, sinh hook + prompt video cho Google Flow + gói đăng bài TikTok.
> **(B) Hậu kỳ:** ghép các clip 720p từ Flow, chèn ảnh bìa, watermark, chữ, phụ đề tự động, xuất 1080x1920 để đăng TikTok. Xử lý ngay trên thiết bị.
> Lưu trên Cloudflare R2, **dữ liệu sản phẩm tự xoá sau 7 ngày**.
> Phiên bản spec: 16/11/2026 (v3, thêm module Hậu kỳ; clip Flow xuất 720p, app tự lên 1080p). Người dùng: 1 người (chủ kênh affiliate faceless TikTok/Facebook).

---

## 0. Bối cảnh & luồng tổng

```
[1] Chrome extension "Product Grabber" (ĐÃ CÓ)
    đọc trang TikTok Shop → JSON sản phẩm + ảnh gốc + video
        │  POST /api/products (Bearer APP_TOKEN)
        ▼
[2] Module A: Studio (Cloudflare Pages + Functions + R2)
    lưu sản phẩm + media → sinh gói đăng bài (Gemini API / mẫu dựng sẵn / Claude chat thủ công)
        │  người dùng copy prompt
        ▼
[3] Google Flow (Veo 3.1): tạo 2–4 clip, 9:16, mỗi clip ~8s → tải bản 720p (tiết kiệm credit) về máy/điện thoại
        │  người dùng thả clip vào trang sản phẩm
        ▼
[4] Module B: Hậu kỳ (trong cùng app, xử lý trên trình duyệt)
    ghép clip + ảnh sản phẩm → ảnh bìa (lấy coverTexts) → chữ hook/giá/CTA (lấy từ gói)
    → phụ đề tự động (Groq Whisper) → watermark → xuất MP4 1080x1920
        ▼
[5] Đăng TikTok: video + ảnh bìa + caption/hashtag/bình luận ghim, tất cả trên cùng một trang
```

**Vì sao gộp chung một app:** module Hậu kỳ dùng lại gần hết dữ liệu của Studio: `coverTexts` → chữ ảnh bìa, `hooks[].onScreen` → chữ 3 giây đầu, giá/% giảm → sticker giá, `script` → gợi ý phụ đề/CTA, ảnh sản phẩm → chèn vào video, thêm vào đó là cùng token, cùng kho R2, cùng trang "gói đăng bài".

## 1. Quyết định đã chốt

| Hạng mục | Quyết định |
|---|---|
| Hosting | Cloudflare Pages (static `public/`) + Pages Functions (`functions/`) |
| Lưu trữ | **Chỉ dùng R2** cho cả JSON và media. Không dùng KV/D1 |
| Thời hạn dữ liệu | **7 ngày**. R2 lifecycle rule xoá toàn bucket sau 7 ngày; app tự ẩn mục quá hạn |
| Đồng bộ web ↔ mobile | Một secret `APP_TOKEN`; nhập cùng token ở web, mobile và extension. Chưa cần đăng nhập |
| LLM | **Gemini API free tier** (key từ Google AI Studio), gọi qua endpoint OpenAI-compatible. Model đặt bằng biến môi trường |
| Không có/hết quota LLM | (a) Gói dựng sẵn từ mẫu; (b) **Chế độ thủ công**: copy prompt sang Claude (Pro) hoặc Gemini app, dán JSON kết quả về |
| Tool tạo video | **Google Flow** (Veo 3.1): Ingredients to Video / Frames to Video, 9:16, clip ~8 giây |
| Kênh | Mặc định **faceless** (có công tắc tắt) |
| Ngôn ngữ UI | Tiếng Việt |
| Xử lý video | **Ngay trên trình duyệt**: WebCodecs + Mediabunny + OffscreenCanvas trong Web Worker. Không upload video thô lên server, không dùng ffmpeg.wasm |
| Phụ đề | **Groq Whisper** qua Pages Function (free tier); dự phòng: tự nhập/sửa tay. Hậu xử lý bằng LLM (dấu câu, tên thương hiệu) |
| Lên 1080p | **Xuất 720p từ Flow để tiết kiệm credit free**; app chịu trách nhiệm lên 1080x1920. Mặc định: scale chất lượng cao + làm nét nhẹ (nhanh, mọi thiết bị). Tuỳ chọn: nút **"Enhance AI"** (WebSR, WebGPU), khuyến nghị bật khi dựng trên laptop |
| Brand kit (logo, font, màu, @kênh) | Lưu lâu dài ở `cfg/brandkit.json` trên R2 (**không** nằm trong rule xoá 7 ngày) |

**Vì sao không dùng Claude API:** gói Claude Pro chỉ dành cho chat, không kèm API/Console. Muốn dùng API phải nạp tiền riêng trên Console. Nên dùng Claude Pro ở **chế độ thủ công** (mục 6.4).

**Lưu ý Gemini free tier:** Google đã nhiều lần cắt hạn mức free trong 2025–2026 và không còn công bố RPM/RPD cố định. Model Flash/Flash-Lite vẫn có free tier, đủ cho vài chục lượt/ngày. → Model ID **phải cấu hình được** (`LLM_MODEL`). Claude Code kiểm tra model Flash free hiện tại trên https://ai.google.dev/pricing trước khi đặt mặc định. Bắt lỗi 429 → báo người dùng và chuyển sang mẫu dựng sẵn.

## 2. Cấu trúc thư mục

```
affiliate-studio/
├─ wrangler.toml
├─ .dev.vars                 # APP_TOKEN=..., LLM_API_KEY=... (local, không commit)
├─ functions/
│  ├─ api/_middleware.js     # CORS + kiểm tra Bearer token cho mọi /api/*
│  ├─ api/products/index.js  # GET list, POST ingest
│  ├─ api/products/[id].js   # GET chi tiết, DELETE
│  ├─ api/products/[id]/generate.js   # POST sinh gói
│  ├─ api/products/[id]/package.js    # PUT lưu bản chỉnh tay
│  ├─ api/products/[id]/upload/[name].js  # PUT upload video thành phẩm/ảnh bìa/SRT (Hậu kỳ)
│  ├─ api/transcribe.js      # POST audio → Groq Whisper → từ + timestamp (Hậu kỳ)
│  ├─ api/brandkit.js        # GET/PUT cfg/brandkit.json (+ logo)
│  └─ media/[[path]].js      # GET media từ R2, hỗ trợ Range
├─ lib/
│  ├─ util.js                # json(), newId(), key helpers, retention
│  └─ generate.js            # build prompt, gọi LLM, normalize, templatePackage()
└─ public/
   ├─ index.html, app.js, styles.css
   ├─ lib/prompt-library.js  # THƯ VIỆN MẪU, dùng chung client + server
   ├─ lib/zip.js             # tạo .zip trong trình duyệt (STORE, không nén)
   ├─ editor/                # MODULE HẬU KỲ
   │  ├─ editor.js           # UI timeline, overlay, phụ đề, xuất
   │  ├─ render-worker.js    # Web Worker: decode → compose → encode → mux
   │  ├─ compose.js          # vẽ 1 frame: scale/fit, ảnh tĩnh Ken Burns, overlay, phụ đề
   │  ├─ cover-editor.js     # editor ảnh bìa (Konva)
   │  ├─ audio.js            # tách audio 16kHz mono để gửi đi phiên âm
   │  └─ vendor/             # mediabunny, konva (tự host, pin phiên bản)
   ├─ fonts/                 # Be Vietnam Pro, Montserrat (.woff2, OFL)
   ├─ manifest.webmanifest, sw.js, icons/
```

`wrangler.toml`:
```toml
name = "affiliate-studio"
pages_build_output_dir = "./public"
compatibility_date = "<ngày gần nhất wrangler hỗ trợ>"
[vars]
RETENTION_DAYS = "7"
LLM_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"
LLM_MODEL = "<model Flash free hiện tại>"
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "affiliate-studio"
# secrets: APP_TOKEN, LLM_API_KEY, GROQ_API_KEY  (wrangler pages secret put ...)
```

## 3. Dữ liệu trên R2

| Key | Nội dung |
|---|---|
| `p/{id}/product.json` | Sản phẩm (schema mục 4) + `id`, `createdAt`, `indexKey`, đường dẫn media đã lưu |
| `p/{id}/package.json` | Gói đăng bài (schema mục 6.3) |
| `p/{id}/img_01.jpg …` | Ảnh sao chép từ CDN sàn (tối đa 12) |
| `p/{id}/video_header.mp4` | Video sản phẩm (bỏ trùng nếu header = description) |
| `i/{9999999999999 - createdMs}_{id}` | Object rỗng làm **chỉ mục**, customMetadata: `id, title (encodeURIComponent), price, platform, thumb, createdAt, hasPackage, hasFinal`. `list({prefix:"i/", include:["customMetadata"]})` trả mới nhất trước |
| `p/{id}/edit.json` | Dự án hậu kỳ: thứ tự clip, cắt đầu/cuối, overlay, phụ đề đã sửa (mục 9.9) |
| `p/{id}/final.mp4` | Video thành phẩm 1080x1920 (tuỳ chọn upload để mở trên điện thoại) |
| `p/{id}/cover.png` | Ảnh bìa 1080x1920 |
| `p/{id}/subs.srt` | Phụ đề |
| `cfg/brandkit.json`, `cfg/logo.png` | Brand kit, **giữ lâu dài** |

- `id`: 10 ký tự `[a-z0-9]` ngẫu nhiên (khó đoán, vì `/media/*` không yêu cầu token).
- Lifecycle: **2 rule theo prefix** để không xoá brand kit:
  `npx wrangler r2 bucket lifecycle add affiliate-studio expire-p p/ --expire-days 7`
  `npx wrangler r2 bucket lifecycle add affiliate-studio expire-i i/ --expire-days 7`
- Clip gốc từ Flow **không upload** (chỉ nằm trên thiết bị đang dựng). Chỉ upload thành phẩm nếu người dùng bấm "Lưu lên kho".
- Lifecycle chạy theo ngày nên có thể trễ vài giờ → API luôn lọc `isExpired(createdAt)`.

## 4. Input: JSON từ extension (đã có)

Extension đọc `<script id="__MODERN_ROUTER_DATA__">` → `loaderData[...].page_config.components_map[*]` (component `product_info`). Ảnh gốc lấy bằng cách đổi template URL thành `{origin}/{uri}~tplv-aphluv4xwc-origin-jpeg.jpeg` (≈1042px thay vì webp 800px).

```json
{
  "ok": true, "platform": "tiktokshop", "region": "vn",
  "productId": "1736191557601166757",
  "url": "https://shop.tiktok.com/vn/pdp/1736191557601166757",
  "title": "COMBO Tinh chất bí đao N7 ...",
  "price": { "current": 216749, "original": 377952, "discount": "-43%", "currency": "VND", "display": "216.749₫" },
  "soldCount": 229096, "rating": 4.7, "reviewCount": 321, "shopName": "Cocoon Vietnam",
  "images": [{ "original": "https://...origin-jpeg.jpeg", "preview": "https://...webp", "width": 800, "height": 800 }],
  "videos": {
    "header": { "url": "https://...", "backupUrl": "https://...", "width": 720, "height": 1280, "duration": 19.9, "expiresAt": "ISO" },
    "description": { "...": "thường trùng header" }
  },
  "description": "THÔNG TIN SẢN PHẨM: ...",
  "descriptionImages": [],
  "specifications": [{ "name": "Benefit", "value": "Kiểm soát dầu,Chăm sóc da mụn" }],
  "skus": [{ "skuId": "...", "stock": 337, "price": 216749, "originalPrice": 377952, "props": "Mặc định" }],
  "grabbedAt": "ISO"
}
```

**Sửa extension (nhỏ):** sau khi `Gửi sang app` thành công, đọc `{ url }` trong response và `chrome.tabs.create({ url })` để mở thẳng trang sản phẩm trong app.

## 5. API

Mọi `/api/*`: header `Authorization: Bearer <APP_TOKEN>`. Middleware trả CORS `*` (extension gọi từ `chrome-extension://`), xử lý `OPTIONS` trước khi kiểm tra token, bọc try/catch → JSON `{error}`.

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/products` | Danh sách từ `i/` (lọc quá hạn): `{items:[{id,title,price,thumb,createdAt,expiresAt,hasPackage}]}` |
| POST | `/api/products` | Nhận JSON mục 4. Validate `title` + `images[]`. **Sao chép ngay** ảnh (original → fallback preview) và video (url → backupUrl) vào R2 với header `Referer: <url sản phẩm>` + UA trình duyệt. Lỗi thì giữ link gốc (`stored: null`). Ghi `product.json` + chỉ mục. Trả `201 {id, url:"<origin>/#/p/{id}", mirrored, videos}` |
| GET | `/api/products/:id` | `{product, package, expiresAt}`; 404 nếu không có/quá hạn |
| DELETE | `/api/products/:id` | Xoá mọi `p/{id}/*` + chỉ mục |
| POST | `/api/products/:id/generate` | Body `{tone?, notes?, faceless?, persona?}` → sinh gói (mục 6), lưu `package.json`, cập nhật `hasPackage` |
| PUT | `/api/products/:id/package` | Lưu bản người dùng sửa (caption, hashtag, ghim…) + `editedAt` |
| PUT | `/api/products/:id/upload/:name` | `name` ∈ `final.mp4 | cover.png | subs.srt`. Body nhị phân, ≤ 95MB (giới hạn body của Pages Functions ~100MB). Cập nhật `hasFinal` |
| GET/PUT | `/api/products/:id/edit` | Đọc/lưu `edit.json` (dự án hậu kỳ, để mở tiếp trên máy khác) |
| POST | `/api/transcribe` | Body `audio/wav` 16kHz mono (30s ≈ 1MB) + query `?lang=vi&prompt=<tên SP, thương hiệu>`. Gọi Groq `whisper-large-v3` với `response_format=verbose_json`, `timestamp_granularities[]=word`. Sau đó (nếu có LLM) chuẩn hoá dấu câu, sửa tên thương hiệu **giữ nguyên timestamp**. Trả `{words:[{w,start,end}], segments:[{text,start,end}]}` |
| GET/PUT | `/api/brandkit` | Logo (PNG base64 hoặc upload riêng), @tên kênh, font, màu nhấn, vị trí watermark, style phụ đề mặc định |
| GET | `/media/p/{id}/{file}` | Không cần token. Hỗ trợ `Range` → 206 (iPhone cần để phát video), `ETag`, `Cache-Control: private, max-age=86400`. Chỉ chấp nhận regex `^p\/[a-z0-9]+\/[\w.-]+$` |

Giới hạn cần nhớ: Workers free = 50 subrequest/lần gọi (12 ảnh + 2 video + LLM vẫn dư); ảnh ≤15MB, video ≤60MB.

## 6. Sinh gói đăng bài

### 6.1 Hook: 6 công thức (mỗi công thức 1 hook)
`Nỗi đau` · `Giá sốc` · `Bằng chứng xã hội` (số đã bán) · `Tò mò` · `So sánh` · `Trải nghiệm thật`

Quy tắc: hook TikTok Shop phải **nêu loại sản phẩm trong 1–3 giây đầu** (giỏ hàng đã nằm dưới video, người xem tự lọc). `spoken` ≤ 14 từ, `onScreen` ≤ 6 từ.

### 6.2 System prompt cho LLM (ý chính)
- Viết tiếng Việt tự nhiên kiểu creator Gen Z, không văn mẫu.
- **Chỉ dùng dữ liệu có trong input**; không bịa công dụng, số liệu, chứng nhận. Giá ghi đúng (làm tròn kiểu 217K).
- Mỹ phẩm/thực phẩm/sức khoẻ: cấm từ khẳng định điều trị ("trị dứt", "hết mụn 100%", "chữa"); dùng "hỗ trợ", "cảm nhận"; ghi rủi ro vào `warnings`.
- Video prompt viết **tiếng Anh**, lời thoại tiếng Việt trong **ngoặc kép**; theo định dạng Google Flow (mục 7).
- `faceless=true` → prompt chỉ có tay/sản phẩm/B-roll, không mặt người.
- Caption 1–3 câu + CTA "bấm giỏ hàng vàng"; 5–8 hashtag Việt + Anh.
- `response_format: {type: "json_object"}`, temperature ~0.9; parse lỏng (bỏ ```json fences, regex lấy `{...}`).
- Input gửi LLM: title, giá, giảm, đã bán, rating, shop, specifications (≤20), variants (≤10), description cắt 2.500 ký tự.

### 6.3 Schema output (`package.json`)
```json
{
  "generatedAt": "ISO", "source": "llm | template | manual", "model": "...", "note": "...",
  "angle": "góc tiếp cận chính",
  "hooks": [{ "formula": "Giá sốc", "spoken": "...", "onScreen": "..." }],
  "coverTexts": ["...", "...", "..."],
  "script": [{ "time": "0-3s", "visual": "...", "voiceover": "...", "onScreen": "..." }],
  "videoPrompts": [{ "name": "...", "flowMode": "Ingredients to Video | Frames to Video | Text to Video", "ingredients": "Ảnh 1 (sản phẩm) + ...", "prompt": "English ..." }],
  "caption": "...", "hashtags": ["#..."], "pinnedComment": "...",
  "warnings": ["..."]
}
```
`normalize()`: thiếu trường nào → lấy trường đó từ `templatePackage()`. Prompt video thiếu câu "Avoid:" → tự nối `NEGATIVE`.

### 6.4 Ba nguồn sinh gói
1. **Gemini API** (`LLM_API_KEY` có) → `source: "llm"`.
2. **Mẫu dựng sẵn** `templatePackage(product)` (không key/lỗi/429) → `source: "template"`, kèm `note` giải thích.
3. **Chế độ thủ công** (cho Claude Pro / Gemini app): nút *"Copy prompt cho Claude/Gemini chat"* → copy system prompt + dữ liệu + schema thành 1 khối văn bản. Người dùng dán vào claude.ai, copy JSON trả về, dán vào ô *"Dán kết quả JSON"* → parse + `normalize()` → `PUT package` với `source: "manual"`.

## 7. Thư viện prompt cho Google Flow

**Đặc thù Flow (Veo 3.1):**
- **Ingredients to Video**: đưa ảnh tham chiếu (sản phẩm, nhân vật, bối cảnh). Đã hỗ trợ **9:16 native** từ 01/2026 → dùng chế độ này để giữ đúng bao bì/nhãn.
- **Frames to Video**: ảnh đầu (và ảnh cuối) → hợp product hero, chuyển cảnh.
- **Extend**: nối tiếp clip từ giây cuối → kéo dài cảnh.
- Mỗi lần sinh ~8 giây, có âm thanh/lời thoại native → mỗi prompt = **1 clip ≤ 8s**, cảnh dài thì chia Shot 1/Shot 2 hoặc Extend.
- Flow có tuỳ chọn xuất 1080p/4K nhưng tốn thêm credit → **quy ước: luôn tải bản 720p** từ Flow, module Hậu kỳ lo phần lên 1080p.

**Cấu trúc mỗi prompt** (theo Veo prompt guide + Kling Scene/Style/Motion): Subject → Action → Setting/Ambiance → Camera (shot + movement) → Lighting/Style → Audio (lời thoại trong ngoặc kép) → câu giữ nhất quán với ảnh tham chiếu → `NEGATIVE`.

`NEGATIVE = "Avoid: warped or changing label text, extra fingers, distorted hands, packaging that changes shape or color, subtitles, captions, watermarks, logos other than the product's own."`

| id | Tên | Flow mode | Faceless | Dùng khi |
|---|---|---|---|---|
| `ugc_testimonial` | UGC review nói trước camera | Ingredients (SP + nhân vật) | ✗ | Hook trải nghiệm cá nhân |
| `problem_solution` | Vấn đề → Giải pháp (2 shot) | Ingredients | ✗ | Hook nỗi đau |
| `unboxing` | Mở hộp → dùng thử (chỉ tay) | Ingredients | ✓ | Deal, hàng mới, quà kèm |
| `how_it_works` | Demo 3 bước chỉ tay, ASMR | Ingredients | ✓ | Kênh faceless, nhấn kết cấu/cách dùng |
| `product_hero` | Push-in + orbit 180° | Frames to Video (ảnh 1 làm frame đầu) | ✓ | B-roll mở/kết |
| `lifestyle_broll` | Đang sử dụng, từ vai xuống | Ingredients | ✓ | Chèn giữa video lồng tiếng/TTS |
| `before_after` | Trước/Sau tinh tế | Ingredients | ✗ | Chỉ khi kết quả thấy được; mỹ phẩm chỉ nói cảm nhận |

Slot trong mẫu: `{creator} {setting} {surface} {usage} {hands} {palette} {pain} {hook_line} {product_visual}`.
`detectCategory(title, description)` bằng regex từ khoá → `beauty | kitchen | tech | fashion | home | general`; mỗi ngành có bộ giá trị mặc định cho các slot. `shortName(title)` rút tên ngắn (bỏ ngoặc, "COMBO", lấy ≤7 từ trước dấu `-|,+`).

Ví dụ mẫu `how_it_works`:
```
Vertical 9:16 overhead close-up on {surface}, only hands visible. Step 1: the hands pick up {product_visual} and show the label. Step 2: the hands {hands}. Step 3: the product is placed back down beside its packaging for a clean final shot. Smooth stable camera, macro detail on texture, soft diffused light, {palette}, ASMR-style satisfying feel. Audio: subtle product sounds, gentle background music, no voice. Keep the label text and packaging consistent with the reference image.
```

## 8. UI (mobile-first, vanilla JS, không build step)

**Route (hash):** `#/` danh sách · `#/p/{id}` chi tiết · `#/p/{id}/edit` hậu kỳ · `#/settings` token + brand kit.

**Danh sách:** card gồm thumbnail, tiêu đề 2 dòng, giá, badge "Đã có gói"/"Chưa tạo gói", "còn N ngày". Nút ＋ mở dialog dán JSON (dùng trên điện thoại).

**Chi tiết, thứ tự từ trên xuống:**
1. Sản phẩm: tiêu đề, giá, giá gạch, % giảm, shop, đã bán, ★, link sàn, "tự xoá sau N ngày", nút Xoá.
2. **Ảnh & video:** lưới ảnh có nhãn "Ảnh 1…", nút ⬇ từng ảnh; video player + ⬇ + **↗ Chia sẻ** (Web Share API với file → đẩy sang app TikTok/Flow trên mobile); **⬇ Tải tất cả .zip** (ảnh + video + `goi-dang-bai.txt` + `product.json`, nén trong trình duyệt).
3. Tạo gói: chọn tone, ô ghi chú, công tắc faceless (mặc định bật), nút Tạo/Tạo lại; khu "Chế độ thủ công" (copy prompt / dán JSON). Lần đầu mở mà chưa có gói → tự gọi generate.
4. **Hook:** chip công thức, lời nói + chữ màn hình, 2 nút copy.
5. **Chữ ảnh bìa:** chip bấm là copy.
6. **Prompt Google Flow:** tab *AI đề xuất* | *Thư viện mẫu* (sửa nhân vật, bối cảnh, chọn hook làm lời thoại, lọc faceless). Mỗi prompt hiện Flow mode + ảnh nên đưa vào Ingredients + nút Copy.
7. **Kịch bản:** bảng (mobile chuyển thành dạng thẻ) + Copy kịch bản.
8. **Gói đăng bài:** textarea caption / hashtag / bình luận ghim, **tự lưu (debounce 600ms) → PUT** để đồng bộ.
9. Lưu ý (warnings).
10. **Hậu kỳ:** nút lớn "🎬 Dựng video" → `#/p/{id}/edit` (mục 9). Nếu đã có thành phẩm: hiện video `final.mp4` + ảnh bìa + nút ⬇/↗ ngay đầu trang.
11. **Thanh dính đáy:** "Copy caption + hashtag" · "Copy cả gói".

Toast xác nhận mọi thao tác copy/lưu. Copy fallback `execCommand` khi không có Clipboard API. Download fallback `window.open` nếu media chưa lưu được về R2.

**PWA:** manifest (icon 192/512, maskable), service worker network-first cho app shell, **không cache** `/api/*` và `/media/*`. Hướng dẫn "Thêm vào màn hình chính" trên iPhone.

## 9. Module B: Hậu kỳ (`#/p/{id}/edit`)

### 9.1 Mục tiêu
Từ **2–4 clip Flow (720x1280, ~8s)** + ảnh/video sản phẩm → **1 video 15–40s, 1080x1920**, đã có: ảnh bìa ở frame đầu, chữ hook 3 giây đầu, sticker giá, phụ đề karaoke, watermark, CTA cuối. Kèm `cover.png` và `subs.srt`. Toàn bộ xử lý trên thiết bị (laptop hoặc điện thoại).

### 9.2 Pipeline (Web Worker)
```
Clip/ảnh đầu vào (File từ máy, hoặc media trên R2)
  → Mediabunny demux → WebCodecs VideoDecoder → VideoFrame
  → OffscreenCanvas 1080x1920:
       1. vẽ frame (fit mode: "cover" | "fit + nền blur")
       2. ảnh tĩnh: Ken Burns (zoom 100→108% trong N giây)
       3. overlay theo thời gian: chữ hook, sticker giá, CTA, watermark
       4. phụ đề (từ đang nói được tô màu)
       5. làm nét nhẹ (unsharp) khi nguồn < 1080p
  → WebCodecs VideoEncoder H.264 High, 30fps, ~8 Mbps
  → audio: giữ nguyên AAC của clip (passthrough); nối các đoạn audio theo timeline
  → Mediabunny mux MP4 (fastStart) → Blob → tải về / chia sẻ / upload R2
```
- Không dùng ffmpeg.wasm (chậm hơn native nhiều lần, file wasm nặng, core GPL).
- Thiết bị không encode được H.264 → fallback WebM (VP9) + cảnh báo.
- Xử lý **tuần tự từng video**, giải phóng `VideoFrame.close()` ngay để không tràn RAM (iPhone).
- Thanh tiến trình theo % frame; nút Huỷ.

### 9.3 Timeline (đơn giản, không cần editor chuyên nghiệp)
- Danh sách **đoạn** kéo-thả để sắp thứ tự. Loại đoạn: `clip` (video Flow/video sản phẩm), `image` (ảnh sản phẩm, mặc định 2s), `cover` (ảnh bìa, mặc định 0,2s ở đầu).
- Mỗi đoạn: cắt đầu/cuối (trim in/out), tắt/bật tiếng, fit mode.
- Chuyển cảnh: cắt thẳng (hard cut). Fade 0,2s là tuỳ chọn ở phase sau.
- Gợi ý thứ tự tự động: `cover` → clip có hook → clip demo → ảnh giá → clip product hero/CTA.
- Nhập clip: chọn nhiều file cùng lúc (`<input multiple accept="video/*,image/*">`), kéo-thả trên desktop; trên điện thoại chọn từ Thư viện ảnh.

### 9.4 Overlay lấy sẵn từ gói đăng bài
| Overlay | Nguồn dữ liệu | Mặc định |
|---|---|---|
| Chữ hook | `hooks[].onScreen` (chọn 1) | 0–3s, giữa-trên, chữ to viền đen |
| Sticker giá | `price.current`, `price.discount` | "Chỉ 217K · -43%", hiện ở đoạn ảnh giá hoặc 3s cuối |
| CTA | cố định / `script` nhịp cuối | "Bấm giỏ hàng 🛒" 2–3s cuối |
| Watermark | brand kit (logo hoặc @kênh) | góc trên-trái, opacity 70%, suốt video |
| Phụ đề | `/api/transcribe` | xem 9.5 |

**Vùng an toàn TikTok (khung 1080x1920):** chừa ~130px trên, ~480px dưới, ~140px phải (cột nút like/share), ~44px trái. Phụ đề đặt khoảng **y = 1100–1350**. Có nút "Xem lớp UI TikTok" để overlay giả lập giao diện TikTok khi preview.

Font: **Be Vietnam Pro** (OFL, đủ dấu tiếng Việt) tự host `.woff2`; phải `await document.fonts.load(...)` (và trong worker dùng `FontFace` + `self.fonts.add`) trước khi vẽ, nếu không frame đầu sẽ bị font dự phòng.

### 9.5 Phụ đề tự động
1. Worker tách audio của timeline → 16kHz mono WAV.
2. `POST /api/transcribe` (Groq Whisper, `language=vi`, `prompt` = tên sản phẩm + thương hiệu để nhận đúng tên riêng).
3. LLM hậu xử lý: thêm dấu câu, sửa chính tả/tên thương hiệu, **không đổi timestamp**.
4. Editor phụ đề dạng danh sách: sửa chữ từng dòng, kéo thời gian ±0,1s, tách/gộp dòng.
5. Style (3 preset, lưu trong brand kit): **Karaoke** (1–3 từ/dòng, tô màu từ đang nói), **Hộp nền** (2 dòng, nền đen mờ), **Tối giản** (chữ trắng viền).
6. Xuất: burn-in vào video **và** `subs.srt` riêng.
- Clip Flow có lời thoại do prompt quy định → nếu Groq lỗi/hết quota: nút "Dùng lời thoại từ prompt" để tạo phụ đề chia đều theo thời lượng clip rồi sửa tay.
- Groq free tier (tham khảo cuối 10/2026, cần kiểm tra lại): ~20 req/phút, ~2.000 req/ngày, ~28.800 giây audio/ngày. Trả phí: whisper-large-v3-turbo khoảng $0.04/giờ audio.

### 9.6 Ảnh bìa (`cover-editor.js`, Konva)
- Nền: chọn **frame bất kỳ** từ timeline (lưới thumbnail mỗi 0,5s + nút tiến/lùi từng frame) **hoặc** ảnh sản phẩm.
- Layer dựng sẵn: chữ lớn từ `coverTexts` (chọn 1 trong 3), sticker giá/% giảm, logo, có thể thêm ảnh sản phẩm tách nền (phase sau).
- Kéo-thả, đổi cỡ/màu chữ, 3 template bố cục.
- Xuất `cover.png` 1080x1920 + tuỳ chọn **chèn làm 0,2s đầu video** (để chọn đúng frame này làm cover khi đăng TikTok).

### 9.7 Lên 1080p / Enhance (đầu vào là clip 720x1280 từ Flow)
Hai chế độ, chọn ở màn hình Xuất:

| Chế độ | Cách làm | Tốc độ | Dùng khi |
|---|---|---|---|
| **Chuẩn** (mặc định) | `drawImage` 720→1080 với `imageSmoothingQuality = "high"` + unsharp nhẹ (WebGL shader, amount ~0.4, radius ~1px) | Gần realtime, mọi thiết bị | Dựng trên điện thoại, cần nhanh. Clip AI sạch, sau khi TikTok nén lại khác biệt nhỏ |
| **Enhance AI** | **WebSR** (MIT, WebGPU): upscale 2x → 1440x2560 rồi downscale về 1080x1920 (vẽ phụ đề/overlay **sau** bước này để chữ nét) | Chậm hơn nhiều; model lớn có thể <1 fps nếu không có GPU rời | Dựng trên laptop (RTX 3050 Ti), nguồn hơi mờ, video quan trọng |

- Chỉ áp dụng upscale cho **frame video/ảnh nguồn**; chữ, sticker, phụ đề, watermark luôn vẽ trực tiếp ở 1080x1920 nên luôn sắc nét bất kể chế độ.
- Trình duyệt không có WebGPU (iPhone < iOS 26, máy cũ) → ẩn nút Enhance AI, chỉ dùng Chuẩn.
- Cache model WebSR trong Cache Storage (tải 1 lần).
- Màn hình Xuất có nút **"So sánh"**: render 2 giây đầu ở cả 2 chế độ, hiển thị song song để quyết định có đáng chờ không.

### 9.8 Thông số xuất (preset "TikTok")
MP4 · H.264 High · 1080x1920 · 30fps (giữ fps nguồn nếu 24/25/30) · ~8 Mbps · AAC 48kHz stereo · `fastStart`. Tên file: `{shortName-slug}_{yyyymmdd}.mp4`.

### 9.9 `edit.json` (lưu dự án để mở tiếp trên máy khác)
```json
{
  "segments": [
    { "type": "cover", "duration": 0.2 },
    { "type": "clip", "source": "local:<tên file>|r2:<key>", "in": 0, "out": 7.5, "muted": false, "fit": "cover" },
    { "type": "image", "source": "r2:p/{id}/img_02.jpg", "duration": 2, "kenBurns": true }
  ],
  "overlays": { "hookIndex": 1, "priceSticker": true, "cta": "Bấm giỏ hàng 🛒", "watermark": true },
  "subtitles": { "style": "karaoke", "lines": [{ "text": "...", "start": 0.4, "end": 1.9, "words": [] }] },
  "cover": { "frameTime": 3.2, "textIndex": 0, "layers": [] }
}
```
Clip `local:` không có trên máy khác → editor hiện "Thiếu clip, chọn lại file" nhưng giữ nguyên overlay/phụ đề.

### 9.10 Hỗ trợ thiết bị
- Chrome/Edge desktop: đầy đủ, nhanh nhất (laptop RTX dùng encoder phần cứng qua WebCodecs).
- Android Chrome: đầy đủ.
- iPhone: **iOS/Safari 26+** (WebCodecs đủ cả audio, WebGPU có sẵn). Phải giữ màn hình mở khi xuất (dùng Wake Lock API), xử lý 1 video/lần, video ≤ 60s.
- Lúc mở editor, gọi `VideoEncoder.isConfigSupported()` với preset 1080x1920 H.264; thiết bị không đủ thì báo rõ và gợi ý dựng trên laptop.

## 10. Bảo mật & giới hạn

- `APP_TOKEN` dài ≥32 ký tự ngẫu nhiên; lưu ở `localStorage` trên thiết bị của người dùng.
- `/media` công khai nhưng đường dẫn chứa id ngẫu nhiên và tự hết hạn sau 7 ngày. Chấp nhận được cho tool cá nhân.
- Không lưu key LLM/Groq ở client; chỉ ở secret của Pages.
- `/api/transcribe` yêu cầu token như mọi `/api/*`, giới hạn audio ≤ 10 phút/lần để tránh đốt quota.
- Ảnh/video thuộc quyền người bán, chỉ dùng cho mục đích affiliate quảng bá chính sản phẩm đó.
- License thư viện: Mediabunny (MPL-2.0), Konva (MIT), WebSR (MIT): dùng được trong dự án đóng. Tránh ffmpeg core (GPL).

## 11. Kế hoạch triển khai (theo phase, có tiêu chí nghiệm thu)

**Phase 1: Nền tảng & đồng bộ (1 buổi)**
- Pages + R2 binding + middleware token/CORS; POST/GET/DELETE products; sao chép media; `/media` có Range.
- UI: settings token, danh sách, chi tiết (sản phẩm + media + tải từng file).
- ✅ Gửi từ extension → mở trên điện thoại thấy đúng sản phẩm, xem được video trên iPhone.

**Phase 2: Thư viện mẫu & gói dựng sẵn (1 buổi)**
- `prompt-library.js` (7 mẫu Flow), `templatePackage()`, toàn bộ khu gói đăng bài + copy + zip + share.
- ✅ Không cần LLM vẫn ra đủ gói; copy caption+hashtag 1 chạm; zip mở được trên Windows/iPhone.

**Phase 3: LLM + chế độ thủ công (½ buổi)**
- Gemini qua OpenAI-compatible, normalize, xử lý 429; nút Copy prompt cho Claude/Gemini chat + dán JSON; PUT package tự lưu.
- ✅ Với sản phẩm Cocoon mẫu: 6 hook đúng 6 công thức, không có từ "trị", giá đúng 217K.

**Phase 4: PWA, lifecycle, extension, deploy (½ buổi)**
- manifest + sw + icon; lệnh lifecycle 7 ngày; sửa extension mở tab sau khi gửi; README deploy.
- ✅ Cài được lên màn hình chính iPhone/Android; object cũ hơn 7 ngày biến mất khỏi list.

**Phase 5: Hậu kỳ lõi, ghép & xuất (1–2 buổi)**
- Route `#/p/{id}/edit`, nhập nhiều clip/ảnh, timeline kéo-thả, trim, fit mode; render worker (Mediabunny + WebCodecs + OffscreenCanvas), audio passthrough, xuất MP4 1080x1920; watermark từ brand kit; tải về/chia sẻ.
- ✅ Ghép 3 clip Flow 8s + 1 ảnh sản phẩm → MP4 1080x1920 ~26s phát được trên iPhone và upload được lên TikTok; tiếng không lệch hình.

**Phase 6: Overlay & ảnh bìa (1 buổi)**
- Chữ hook / sticker giá / CTA lấy từ gói; vùng an toàn + lớp UI TikTok giả lập; font tiếng Việt; cover editor Konva, chèn cover 0,2s đầu; `cover.png`.
- ✅ Chữ tiếng Việt có dấu hiển thị đúng ngay từ frame đầu; không chữ nào bị nút TikTok che.

**Phase 7: Phụ đề tự động (1 buổi)**
- Tách audio, `/api/transcribe` (Groq) + LLM sửa dấu câu, editor phụ đề, 3 style, burn-in + `subs.srt`; dự phòng "dùng lời thoại từ prompt".
- ✅ Clip có lời thoại tiếng Việt: phụ đề lệch < 0,3s; tên thương hiệu (vd "Cocoon", "Niacinamide") viết đúng sau hậu xử lý.

**Phase 8: Đồng bộ & batch (½–1 buổi)**
- Lưu `edit.json`, upload `final.mp4`/`cover.png`/`subs.srt` lên R2, hiển thị thành phẩm trên trang sản phẩm (mở trên điện thoại để đăng); brand kit trên `cfg/`; dựng hàng loạt nhiều sản phẩm cùng một template (xếp hàng, xử lý tuần tự).
- ✅ Dựng trên laptop → mở điện thoại thấy video + ảnh bìa + caption trên cùng một trang, bấm ↗ chia sẻ thẳng sang TikTok.

**Phase 8.5: Enhance AI (½–1 buổi, nên làm vì dùng clip 720p từ Flow)**
- Tích hợp WebSR vào render worker (sau decode, trước overlay), downscale 1440x2560 → 1080x1920, cache model, nút So sánh 2 giây, ẩn khi không có WebGPU.
- ✅ Trên laptop: clip 8s 720p xuất bản Enhance trong thời gian chấp nhận được (ghi lại số giây thực đo); chữ/phụ đề không bị mờ; trên iPhone không có WebGPU thì nút tự ẩn.

**Phase 9 (tuỳ chọn):** fade chuyển cảnh, nhạc nền, tách nền ảnh sản phẩm cho ảnh bìa.

## 12. Các bước deploy (để vào README)

```bash
npm i -D wrangler
npx wrangler login
npx wrangler r2 bucket create affiliate-studio
npx wrangler r2 bucket lifecycle add affiliate-studio expire-p p/ --expire-days 7
npx wrangler r2 bucket lifecycle add affiliate-studio expire-i i/ --expire-days 7
npx wrangler pages project create affiliate-studio
npx wrangler pages secret put APP_TOKEN      # chuỗi ngẫu nhiên dài
npx wrangler pages secret put LLM_API_KEY    # key Google AI Studio (tuỳ chọn)
npx wrangler pages secret put GROQ_API_KEY   # key console.groq.com (cho phụ đề)
npx wrangler pages deploy
# Local: npx wrangler pages dev  (đọc .dev.vars, R2 giả lập)
```
Cấu hình extension: ⚙ → Endpoint `https://<project>.pages.dev/api/products`, Authorization `Bearer <APP_TOKEN>`.
Lưu ý: bật R2 có thể yêu cầu thêm phương thức thanh toán dù chỉ dùng mức free (10 GB, 1M thao tác ghi, 10M thao tác đọc/tháng, egress miễn phí).

## 13. Ngoài phạm vi (để sau)

- Extractor cho Shopee/Lazada (khung extension đã sẵn, chỉ thêm hàm đọc riêng).
- Tự động gửi prompt sang Flow (Flow chưa có API công khai cho người dùng cá nhân; Veo API trả phí theo giây).
- Đăng nhập nhiều người dùng, gói trả phí.
- Worker upscale trên laptop RTX (FFmpeg + NVIDIA RTX Video Super Resolution qua Cloudflare Tunnel), chỉ cần nếu sau này dựng nhiều video quay thật bị mờ.
- Tự đăng lên TikTok qua API (Content Posting API cần duyệt app).
- Phụ đề chạy offline trong trình duyệt (transformers.js + Whisper): chất lượng tiếng Việt bản nhỏ còn yếu.

## 14. Tham khảo

- Google Veo prompt guide: https://deepmind.google/models/veo/prompt-guide/
- Veo 3.1 Ingredients to Video (9:16, Flow): https://blog.google/innovation-and-ai/technology/ai/veo-3-1-ingredients-to-video/
- Kling prompt guide: https://kling.ai/blog/kling-ai-prompt-guide
- R2 object lifecycles: https://developers.cloudflare.com/r2/buckets/object-lifecycles
- R2 pricing: https://developers.cloudflare.com/r2/pricing
- Gemini API pricing/free tier: https://ai.google.dev/pricing
- Claude Pro vs API: https://support.claude.com/en/articles/9876003
- Mediabunny (demux/mux MP4 trong trình duyệt, MPL-2.0): https://github.com/Vanilagy/mediabunny
- Kiến trúc tham khảo, upscaler WebCodecs + WebSR: https://github.com/sb2702/free-ai-video-upscaler · https://github.com/sb2702/websr
- Engine media trình duyệt của Katana (MIT, tham khảo cách dựng watermark/phụ đề/thumbnail): https://github.com/katana-video/carrot · https://katana.video/tools/
- WebCodecs / WebGPU trên Safari 26: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- Groq speech-to-text: https://console.groq.com/docs/speech-to-text
- Konva (editor ảnh bìa): https://github.com/konvajs/konva
