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

