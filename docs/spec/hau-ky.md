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
  → audio: giải mã, ghép theo timeline (đoạn ảnh/tắt tiếng là khoảng lặng), mã hoá lại AAC 48kHz stereo
  → Mediabunny mux MP4 (fastStart) → Blob → tải về / chia sẻ / upload R2
```
- Không dùng ffmpeg.wasm (chậm hơn native nhiều lần, file wasm nặng, core GPL).
- Thiết bị không encode được H.264 → báo rõ và gợi ý dựng trên Chrome/Edge máy tính (không có đường dự phòng WebM: file WebM không phát được trên iPhone).
- Tiếng không passthrough: vị trí mẫu tiếng suy từ vị trí frame của cùng một bảng thời lượng, nên tiếng không lệch hình. Bộ mã hoá AAC thêm khoảng 0,03 giây đệm ở cuối file.
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
| CTA | cố định / `script` nhịp cuối | "Bấm giỏ hàng 🛒" 2–3s cuối, **góc dưới bên trái** kèm mũi tên chỉ xuống chỗ TikTok đặt nút giỏ hàng (đổi 17/11/2026, trước đó nằm giữa) |
| Watermark | brand kit (logo hoặc @kênh) | góc trên-trái, opacity 70%, suốt video |
| Phụ đề | `/api/transcribe`, hoặc mốc câu của giọng đọc AI | xem 9.5, 9.12 |

**Vùng an toàn TikTok (khung 1080x1920):** chừa ~130px trên, ~480px dưới, ~140px phải (cột nút like/share), ~44px trái. Phụ đề đặt với mép dưới ở **y = 1140** (tối đa 2 dòng), phía trên sticker giá (giữa khung, khoảng y 1144–1262) và CTA (nhãn sát mép trái, khoảng y 1272–1372, mũi tên xuống tới y 1428), để ba lớp không chồng nhau ở cuối video. Có nút "Xem lớp UI TikTok" để overlay giả lập giao diện TikTok khi preview.

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

**Như đã dựng (17/11/2026):**
- Bước làm đẹp chạy trong worker cho mọi frame clip và ảnh **hẹp hơn 1080** (`public/editor/enhance.js`); nguồn đủ rộng thì ghép thẳng. Clip có cờ xoay không qua bước này.
- Chuẩn: một lượt WebGL2 vừa phóng lên rộng 1080 vừa làm nét (unsharp 0,4, bán kính 1 điểm ảnh đầu ra). Thiết bị không có WebGL2 trong worker thì ghép thẳng như phase 5.
- Enhance AI: WebSR 0.1.1, mạng `websr/cnn-m` (125KB), phóng 2 lần rồi hàm ghép thu về khung 1080x1920. Không khởi động được thì báo lỗi và gợi ý dùng Chuẩn, không tự rơi về Chuẩn.
- Mục "Chất lượng" và nút "So sánh 2 giây đầu" nằm ngay trên nút Xuất; thiết bị không có WebGPU thì ẩn cả hai. Đoạn so sánh không kèm chữ, phụ đề, watermark; có ô "Xem cỡ thật" và ước lượng thời gian xuất cả video.
- Chế độ đã chọn không được lưu (mở lại là Chuẩn) và không nằm trong `edit.json`. Dựng hàng loạt luôn dùng Chuẩn.

**Thông báo khi xuất xong (thêm 17/11/2026):** lần đầu bấm Xuất, app xin quyền thông báo của trình duyệt. Xuất xong (hoặc lỗi) mà tab đang ẩn hay cửa sổ không được chọn thì hiện thông báo của trình duyệt, bấm vào thì quay lại tab. Dựng hàng loạt báo một lần khi cả lô xong. Không có quyền hoặc trình duyệt không hỗ trợ thì bỏ qua, không báo lỗi. Đang nhìn tab thì chỉ có toast trong trang.

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

**Như đã dựng (16/11/2026):** `edit.json` lưu `{segments, useWatermark, overlays: {hook, price, cta}, subtitles: {enabled, style, sig, lines}, updatedAt}`; mỗi đoạn có `sourceId` và `r2Key` (thay cho chuỗi `source`), ảnh bìa là một đoạn `image` có `isCover`. Bản mới hơn (theo `updatedAt`) thắng.
Từ phase 8.6 có thêm `voiceover: {enabled, text, voiceId, speed, clipVolume: "keep"|"low"|"off", sourceId, duration, cues: [{start, end, text}]}`; `sourceId` trỏ tới file WAV trong IndexedDB của thiết bị đã tạo.

### 9.11 Dựng hàng loạt (`#/batch`)
Liệt kê các sản phẩm đã có dự án dựng và đủ file clip trên thiết bị này. Chọn sản phẩm, chọn thiết lập chung (watermark, chữ hook, sticker giá, lời kêu gọi: giữ/bật/tắt; phụ đề: giữ/tắt/bật theo một kiểu), rồi xuất lần lượt từng video và lưu thẳng lên kho (kèm `subs.srt` nếu có phụ đề). Nội dung chữ vẫn là của từng sản phẩm. Một video lỗi không làm dừng cả lô.

### 9.12 Lồng tiếng AI (CIT Voice Studio)
CIT Voice Studio là phần mềm TTS tiếng Việt chạy offline trên laptop của chủ dự án, API ở `http://127.0.0.1:8001` (tài liệu: `http://127.0.0.1:8001/cit-voice-studio.md`, bản 1.0.6). Dùng để đọc lời thoại kịch bản thành giọng nói cho video.

- **Trình duyệt gọi thẳng CIT**, không qua Pages Functions (máy chủ Cloudflare không thấy được máy của chủ dự án). CIT cho phép CORS. Chỉ hỗ trợ CIT chạy **cùng máy** với trình duyệt (không cần khoá); gọi CIT qua mạng LAN cần khoá API thì chưa làm (luật 5: chỉ `APP_TOKEN` nằm trong `localStorage`).
- Địa chỉ CIT mặc định `http://127.0.0.1:8001`, đổi được trong khối Lồng tiếng (nhớ trên thiết bị).
- Khối **"Lồng tiếng AI"** trong trình dựng:
  1. Gọi `GET /health`: không kết nối được → báo "Chưa kết nối được CIT Voice Studio…" kèm cách xử lý; `status` khác `ok` → "CIT đang tải mô hình"; `languages` khác rỗng và không có `vi` → "Mô hình đang chọn trong CIT không đọc được tiếng Việt".
  2. `GET /voices` → ô chọn giọng (giọng đầu danh sách là mặc định). Tốc độ đọc 0,8–1,3.
  3. Lời đọc: điền sẵn từ `script[].voiceover` của gói đăng bài (nối các nhịp, cách nhau `[nghỉ 0.3s]`), sửa được. Dùng được thẻ `[nghỉ 1s]`, `[cười]`.
  4. "Tạo giọng đọc" → `POST /api/tts/generate-with-subtitles` (`format: "wav"`). Giữ file WAV trên thiết bị (IndexedDB, như clip nhập từ máy), nghe thử được.
  5. Giọng đọc bắt đầu ngay sau đoạn ảnh bìa (nếu có), không thì từ giây 0. Dài hơn video thì phần thừa bị cắt và có cảnh báo kèm số giây.
  6. **Tiếng của clip khi có giọng đọc**: chọn "Giữ nguyên" / "Nhỏ lại (25%)" / "Tắt"; mặc định "Nhỏ lại".
  7. **Phụ đề từ giọng đọc**: nút "Dùng mốc câu của giọng đọc" ở khối Phụ đề: mỗi câu của CIT thành dòng phụ đề đúng mốc (từ trong câu rải đều theo thời lượng câu). Không cần Groq.
- Xem trước phát giọng đọc cùng hình; xuất video thì worker giải mã WAV, trộn vào tiếng timeline rồi mã hoá AAC như bình thường.
- Mở trên máy khác: lời đọc, giọng, tốc độ còn nguyên; file giọng đọc thiếu thì báo "Thiếu file giọng đọc, bấm Tạo giọng đọc" (giọng đọc không tải lên kho, chỉ nằm trong video thành phẩm).
- **Ghi nhãn AI:** CIT yêu cầu cho người nghe biết đây là giọng AI (Luật AI 134/2025, Điều 11); thẻ `AI-generated` trong WAV mất khi mã hoá lại. Trình dựng nhắc: "Video có giọng đọc AI: khi đăng TikTok, bật nhãn 'Nội dung do AI tạo'." Không tự sửa caption (luật 6).

### 9.10 Hỗ trợ thiết bị
- Chrome/Edge desktop: đầy đủ, nhanh nhất (laptop RTX dùng encoder phần cứng qua WebCodecs).
- Android Chrome: đầy đủ.
- iPhone: **iOS/Safari 26+** (WebCodecs đủ cả audio, WebGPU có sẵn). Phải giữ màn hình mở khi xuất (dùng Wake Lock API), xử lý 1 video/lần, video ≤ 60s.
- Lúc mở editor, gọi `VideoEncoder.isConfigSupported()` với preset 1080x1920 H.264; thiết bị không đủ thì báo rõ và gợi ý dựng trên laptop.

