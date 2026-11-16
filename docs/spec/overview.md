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
| GET | `/api/products/:id` | `{product, package, final, expiresAt}` (`final`: `{url, size, uploadedAt}` hoặc `null`); 404 nếu không có/quá hạn |
| DELETE | `/api/products/:id` | Xoá mọi `p/{id}/*` + chỉ mục |
| POST | `/api/products/:id/generate` | Body `{tone?, notes?, faceless?, persona?}` → sinh gói (mục 6), lưu `package.json`, cập nhật `hasPackage` |
| GET | `/api/products/:id/generate` | Query `?tone=&notes=&faceless=` → `{prompt}`: khối văn bản (system prompt + dữ liệu + schema) cho chế độ thủ công (mục 6.4) |
| PUT | `/api/products/:id/package` | Body `{caption?, hashtags?, pinnedComment?}`: lưu bản người dùng sửa + `editedAt`. Body `{raw}`: nội dung dán từ chat AI → parse lỏng + `normalize()` → lưu với `source: "manual"`. Trả `{package}` |
| PUT | `/api/products/:id/upload/:name` | `name` ∈ `final.mp4` (phase 5) `| cover.png` (phase 6) `| subs.srt` (phase 7). Body nhị phân; `final.mp4` ≤ 70MB và phải có chữ ký MP4. Cập nhật `hasFinal`. Trả `{ok, url, size}` |
| GET/PUT | `/api/products/:id/edit` | Đọc/lưu `edit.json` (dự án hậu kỳ, để mở tiếp trên máy khác) |
| POST | `/api/transcribe` | Body `audio/wav` 16kHz mono (30s ≈ 1MB) + query `?lang=vi&prompt=<tên SP, thương hiệu>`. Gọi Groq `whisper-large-v3` với `response_format=verbose_json`, `timestamp_granularities[]=word`. Sau đó (nếu có LLM) chuẩn hoá dấu câu, sửa tên thương hiệu **giữ nguyên timestamp**. Trả `{words:[{w,start,end}], segments:[{text,start,end}]}` |
| GET/PUT | `/api/brandkit` | `{handle, position: tl|tr|bl|br, watermark, logo}`; logo là PNG nhúng dạng data URL, tối đa khoảng 300KB. Font, màu nhấn và style phụ đề thêm ở phase 6–7 |
| GET | `/media/p/{id}/{file}` | Không cần token. Hỗ trợ `Range` → 206 (iPhone cần để phát video), `ETag`, `Cache-Control: private, max-age=86400`. Chỉ chấp nhận regex `^p\/[a-z0-9]+\/[\w.-]+$` |

Giới hạn cần nhớ: Workers free = 50 subrequest/lần gọi (12 ảnh + 2 video + LLM vẫn dư); ảnh ≤15MB, video ≤60MB.

## 10. Bảo mật & giới hạn

- `APP_TOKEN` dài ≥32 ký tự ngẫu nhiên; lưu ở `localStorage` trên thiết bị của người dùng.
- `/media` công khai nhưng đường dẫn chứa id ngẫu nhiên và tự hết hạn sau 7 ngày. Chấp nhận được cho tool cá nhân.
- Không lưu key LLM/Groq ở client; chỉ ở secret của Pages.
- `/api/transcribe` yêu cầu token như mọi `/api/*`, giới hạn audio ≤ 10 phút/lần để tránh đốt quota.
- Ảnh/video thuộc quyền người bán, chỉ dùng cho mục đích affiliate quảng bá chính sản phẩm đó.
- License thư viện: Mediabunny (MPL-2.0), Konva (MIT), WebSR (MIT): dùng được trong dự án đóng. Tránh ffmpeg core (GPL).

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
