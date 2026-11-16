# Thiết kế: Module Hậu kỳ (phase 5 → 8.5)

Ngày: 16/11/2026 · Trạng thái: chờ duyệt
Spec gốc: `docs/spec/hau-ky.md` (mục 9), `docs/spec/overview.md` (mục 3, 5, 10), `docs/spec/phases.md` (phase 5–8.5).
Tài liệu này không lặp lại spec. Nó ghi những gì đã chốt trong buổi thiết kế, các quyết định bổ sung, và chỗ lệch so với spec.

## 1. Ý định và lý do

Chủ kênh có 2–4 clip 720p từ Google Flow cho mỗi sản phẩm. Hiện phải mang sang app khác để ghép, chèn chữ, phụ đề, watermark rồi mới đăng. Module này làm việc đó ngay trên trang sản phẩm, lấy sẵn nội dung từ gói đăng bài (hook, giá, chữ ảnh bìa), và cho ra một file MP4 1080x1920 kèm ảnh bìa, để từ sản phẩm đến bài đăng nằm trọn trong một app, không tốn tiền dịch vụ.

**Đã chốt với chủ dự án:**
- Laptop (Chrome/Edge) là máy dựng chính.
- Android và iPhone phải dùng trọn vẹn phần xem và đăng: thấy thành phẩm, ảnh bìa, caption trên trang sản phẩm; phát, tải, chia sẻ sang TikTok.
- Dựng trên điện thoại là phụ: không chặn, máy nào đủ khả năng thì dựng được, không thì báo rõ.
- Làm đủ cả 5 phần, theo đúng thứ tự phase trong spec.

## 2. Mục tiêu, ngoài phạm vi, điều phải tránh

**Mục tiêu**
- Trên laptop: thả clip vào, sắp thứ tự, cắt, bấm xuất, có MP4 1080x1920 phát được trên iPhone và đăng được lên TikTok, tiếng khớp hình.
- Dựng xong trên laptop, mở điện thoại thấy ngay video, ảnh bìa và caption trên cùng một trang.
- Chữ, giá, hook tự điền từ gói đăng bài; người dùng chỉ sửa khi muốn.
- Bản xem trước giống bản xuất.

**Ngoài phạm vi**
- Chuyển cảnh fade, nhạc nền, tách nền ảnh sản phẩm (phase 9 của spec).
- Nhiều track, keyframe, hiệu ứng, chỉnh màu, tốc độ.
- Render phía server; tự đăng lên TikTok; phụ đề chạy offline.
- Timeline thiết kế riêng cho cảm ứng.

**Điều phải tránh (làm được vẫn coi là hỏng)**
- Tiếng lệch hình, dù chỉ ở cuối video.
- Bản xuất khác bản xem trước (chữ lệch vị trí, sai font, mất dấu tiếng Việt).
- Clip gốc bị tải lên server.
- Trang Studio nặng hơn cho người chỉ mở trên điện thoại để đăng bài.
- Giao diện đứng hình khi đang xuất.
- Chữ hoặc phụ đề bị nút TikTok che.

## 3. Ràng buộc

- Giữ nguyên: không build step, chỉ R2, UI tiếng Việt, một `APP_TOKEN`, key chỉ ở secret.
- Pages Functions giới hạn body khoảng 100MB: file tải lên ≤ 95MB.
- `/media` chỉ phục vụ đúng loại cho ảnh raster và video, kèm CSP sandbox (quyết định sau review phase 1). `final.mp4` và `cover.png` hợp lệ; `subs.srt` sẽ được trả dưới dạng file tải về.
- Clip Flow: 720x1280, khoảng 8 giây, có tiếng AAC, fps 24 hoặc 30. **Giả định, chưa kiểm với clip thật.**
- Laptop của chủ dự án có GPU rời (RTX 3050 Ti): dùng được encoder phần cứng và WebGPU.

## 4. Các cách đã cân nhắc

| Cách | Được gì | Mất gì | Kết quả |
|---|---|---|---|
| A. WebCodecs + Mediabunny trong Web Worker, vẽ bằng OffscreenCanvas | Nhanh hơn thời gian thực, dùng encoder phần cứng, kiểm soát từng frame, thư viện nhỏ | Phụ thuộc trình duyệt mới; phải tự lo đồng bộ tiếng | **Chọn** (cũng là lựa chọn của spec) |
| B. Quay lại canvas bằng MediaRecorder trong lúc phát | Dễ viết, chạy rộng | Chỉ chạy đúng thời gian thực, rớt frame khi máy bận, không kiểm soát bitrate và định dạng | Loại |
| C. ffmpeg.wasm | Làm được mọi thứ | Chậm hơn nhiều lần, file nặng, lõi GPL | Loại (spec đã loại) |
| D. Render trên server | Không phụ thuộc thiết bị | Phải tải clip gốc lên, cần máy chủ ngoài Cloudflare | Loại (trái ràng buộc) |

Chủ dự án giao phần "làm thế nào" cho người dựng; cách A là lựa chọn của người dựng và trùng với spec.

**Thứ tự:** phase 5 → 6 → 7 → 8 → 8.5 như spec, với một thay đổi: việc tải thành phẩm lên kho chuyển từ phase 8 lên phase 5 (xem 6.1).

## 5. Kiến trúc chung

```
public/editor/
├─ editor.js          # màn hình #/p/{id}/edit: nhập clip, danh sách đoạn, xem trước, xuất
├─ timeline.js        # logic thuần: danh sách đoạn, cắt, tính thời lượng, đổi thứ tự, kiểm hợp lệ
├─ compose.js         # logic vẽ MỘT frame lên canvas 1080x1920 (dùng chung cho xem trước và xuất)
├─ render-worker.js   # Web Worker: giải mã → compose → mã hoá → đóng gói MP4
├─ audio.js           # trộn tiếng theo timeline, chèn khoảng lặng, xuất WAV 16kHz cho phụ đề
├─ local-clips.js     # giữ file clip trên thiết bị (IndexedDB)
├─ overlays.js        # (phase 6) chữ hook, sticker giá, CTA, watermark, vùng an toàn
├─ cover-editor.js    # (phase 6) ảnh bìa, dùng Konva
├─ subtitles.js       # (phase 7) logic thuần: chia dòng, SRT, 3 kiểu hiển thị
└─ vendor/            # mediabunny, konva, websr: tự host, ghim phiên bản
```

Nguyên tắc:

1. **Một hàm vẽ cho cả xem trước lẫn xuất.** `compose.js` nhận "trạng thái tại thời điểm t" và một canvas, không biết mình đang chạy ở đâu. Xem trước gọi nó trên luồng chính với frame lấy từ thẻ `<video>`; xuất gọi nó trong worker với `VideoFrame` đã giải mã. Đây là cách giữ lời hứa "xem trước giống bản xuất".
2. **Logic thuần tách khỏi API trình duyệt** để test bằng `node --test`: timeline, chia dòng phụ đề, SRT, bố cục vùng an toàn, tính số mẫu âm thanh, ghi WAV.
3. **Chỉ nạp khi cần.** Mọi file trong `public/editor/` chỉ được import khi vào route `#/p/{id}/edit`. Trang danh sách và chi tiết không nặng thêm. Service worker không lưu sẵn thư mục này; nó tự được lưu sau lần dùng đầu.
4. **Xuất chạy trọn trong worker,** luồng chính chỉ nhận phần trăm tiến độ và nút Huỷ.

### 5.1 Thời gian và đồng bộ tiếng

- Tốc độ khung hình đầu ra: bằng fps của clip đầu tiên nếu là 24, 25 hoặc 30; clip lẫn lộn fps hoặc fps khác thì 30.
- Với mỗi frame đầu ra tại thời điểm `t`, lấy frame nguồn có thời điểm gần nhất không vượt quá `t` trong đoạn tương ứng. Cách này xử lý được clip 24fps trong video 30fps mà không cần nội suy.
- **Tiếng được giải mã rồi mã hoá lại cho cả timeline** (AAC 48kHz stereo), không passthrough. Mỗi đoạn đóng góp đúng `round(thời lượng × 48000)` mẫu: clip có tiếng thì lấy mẫu đã giải mã (cắt hoặc bù lặng cho đủ), ảnh tĩnh, ảnh bìa và clip tắt tiếng thì là khoảng lặng. Độ dài video được tính từ số frame, độ dài tiếng từ số mẫu, cả hai suy ra từ cùng một bảng thời lượng nên không trôi.
- Đây là chỗ lệch spec mục 9.2 ("giữ nguyên AAC, passthrough"). Lý do đã ghi trong `docs/memory/decisions.md`.

### 5.2 Giới hạn

Tối đa 12 đoạn, tổng thời lượng ≤ 60 giây, mỗi file nhập ≤ 200MB. Vượt thì báo ngay lúc nhập, không đợi đến lúc xuất.

### 5.3 Kiểm tra khả năng thiết bị

Khi mở editor: thử `VideoEncoder.isConfigSupported` với H.264 1080x1920 và `AudioEncoder.isConfigSupported` với AAC. Không đạt thì hiện "Thiết bị này chưa xuất được video. Hãy dựng trên Chrome hoặc Edge trên máy tính" và vẫn cho xem thành phẩm đã có. **Không làm đường dự phòng WebM/VP9** (lệch spec mục 9.2): máy dựng chính là laptop Chrome vốn có H.264, và file WebM không phát được trên iPhone nên không phục vụ mục tiêu.

## 6. Từng phase

### 6.1 Phase 5: Ghép, xuất, lưu lên kho

- **Việc đầu tiên là một bản thử kỹ thuật** (bỏ đi sau khi xong): một trang trần ghép 2 clip thành MP4 1080x1920 có tiếng. Chạy trên Chrome laptop, rồi chủ dự án mở trên Android và iPhone của mình. Kết quả (chạy được không, mất bao lâu, lỗi gì) ghi vào `decisions.md` và quyết định mức hỗ trợ dựng trên điện thoại. Bản thử cũng là lúc xác nhận API thật của Mediabunny, thay cho trí nhớ của người dựng.
- Route `#/p/{id}/edit`. Nút lớn "🎬 Dựng video" ở trang chi tiết (khối 10 của spec mục 8).
- Nhập nhiều file cùng lúc (video và ảnh), kéo-thả trên máy tính. Có nút thêm nhanh ảnh và video sản phẩm đã có trên kho.
- Danh sách đoạn: kéo-thả đổi thứ tự (kèm nút lên/xuống cho bàn phím và cảm ứng), cắt đầu/cuối, bật/tắt tiếng, kiểu vừa khung (`cover` hoặc `fit + nền mờ`), ảnh tĩnh mặc định 2 giây có Ken Burns.
- Xem trước phát liền các đoạn theo thứ tự.
- Xuất theo preset TikTok (spec mục 9.8), có phần trăm tiến độ và Huỷ. Tên file `{slug}_{yyyymmdd}.mp4`.
- Watermark từ brand kit (logo hoặc @kênh), góc trên-trái, độ mờ 70%.
- **Brand kit tối thiểu:** `GET/PUT /api/brandkit` lưu `cfg/brandkit.json` gồm @kênh, vị trí watermark và logo (PNG ≤ 300KB, nhúng trong JSON dạng data URL). Phần nhập nằm ở `#/settings`. Font, màu nhấn và kiểu phụ đề thêm vào ở phase 6 và 7.
- **Lưu lên kho (chuyển từ phase 8 lên):** `PUT /api/products/:id/upload/final.mp4`, cập nhật `hasFinal` trong chỉ mục. Trang chi tiết hiện video thành phẩm ở đầu trang kèm nút tải và chia sẻ. Lý do: dựng trên laptop, đăng bằng điện thoại thì thành phẩm phải qua kho mới sang được máy kia.
- **Clip giữ trên thiết bị:** file nhập được lưu vào IndexedDB theo id sản phẩm để tải lại trang không mất; tự dọn khi sản phẩm bị xoá hoặc quá 7 ngày. Không bao giờ tải clip gốc lên.
- Giữ màn hình sáng khi xuất (Wake Lock) nếu trình duyệt hỗ trợ.

Nghiệm thu: như spec phase 5, cộng thêm "dựng trên laptop, mở điện thoại thấy video trên trang sản phẩm".

### 6.2 Phase 6: Chữ, sticker và ảnh bìa

- Chữ hook (chọn 1 trong 6, mặc định 0–3 giây), sticker giá ("Chỉ 217K · -43%"), CTA cuối video. Nội dung lấy từ gói đăng bài, sửa được tại chỗ.
- Vùng an toàn TikTok theo số đo ở spec mục 9.4, và nút "Xem lớp UI TikTok" phủ giao diện giả lên bản xem trước.
- Font Be Vietnam Pro tự host. Trong worker phải nạp font xong mới vẽ frame đầu.
- Ảnh bìa: chọn frame bất kỳ từ timeline hoặc ảnh sản phẩm làm nền; chữ lấy từ `coverTexts`; sticker giá; logo; 3 bố cục mẫu; kéo-thả và đổi cỡ chữ bằng Konva. Xuất `cover.png` 1080x1920, tải lên kho, tuỳ chọn chèn làm 0,2 giây đầu video.
- Lớp chữ luôn vẽ trực tiếp ở 1080x1920, sau bước phóng hình, nên luôn nét.

### 6.3 Phase 7: Phụ đề tự động

- Worker trộn tiếng của timeline thành WAV 16kHz mono, gửi `POST /api/transcribe` (Groq `whisper-large-v3`, tiếng Việt, gợi ý tên sản phẩm và thương hiệu). Giới hạn 10 phút mỗi lần.
- Sửa dấu câu và tên thương hiệu bằng LLM nếu có key: gửi danh sách từ kèm số thứ tự, nhận lại danh sách cùng độ dài. **Nếu số từ trả về khác số từ gửi đi thì bỏ kết quả của LLM** và dùng bản gốc, để mốc thời gian không bao giờ bị xô.
- Editor phụ đề dạng danh sách: sửa chữ, chỉnh thời gian ±0,1 giây, tách và gộp dòng.
- Ba kiểu: Karaoke, Hộp nền, Tối giản. Kiểu mặc định lưu trong brand kit.
- Xuất: in vào video và tải lên `subs.srt`.
- Không có Groq hoặc hết hạn mức: nút "Dùng lời thoại từ prompt" chia đều câu thoại theo thời lượng clip để sửa tay.

### 6.4 Phase 8: Đồng bộ và dựng hàng loạt

- `GET/PUT /api/products/:id/edit` lưu `edit.json` (thứ tự đoạn, điểm cắt, overlay, phụ đề, ảnh bìa). Mở trên máy khác: đoạn nào thiếu file thì hiện "Thiếu clip, chọn lại file" và giữ nguyên mọi thứ khác.
- Dựng hàng loạt: chọn nhiều sản phẩm đã có sẵn clip trên thiết bị này, áp cùng một bộ thiết lập (kiểu chữ, kiểu phụ đề, watermark), xuất lần lượt từng video. **Đây là phần spec mô tả mỏng nhất; sẽ làm rõ lại với chủ dự án khi tới phase này, sau khi đã dùng thật các phase trước.**

### 6.5 Phase 8.5: Enhance AI

- WebSR qua WebGPU trong worker: phóng 2x rồi thu về 1080x1920, đặt sau bước giải mã và trước bước vẽ chữ.
- Nút "So sánh" dựng 2 giây đầu ở cả hai chế độ, đặt cạnh nhau.
- Tự ẩn khi không có WebGPU. Model lưu trong Cache Storage sau lần tải đầu.
- Chế độ Chuẩn (phóng chất lượng cao + làm nét nhẹ) có từ phase 5 và luôn là mặc định.

## 7. Thay đổi ở phía server

| Thêm | Phase | Ghi chú |
|---|---|---|
| `GET/PUT /api/brandkit` | 5 | `cfg/brandkit.json`, không bị rule 7 ngày xoá |
| `PUT /api/products/:id/upload/:name` | 5 (`final.mp4`), 6 (`cover.png`), 7 (`subs.srt`) | Kiểm tên nằm trong danh sách, kiểm kích thước ≤ 95MB, kiểm chữ ký đầu file đúng loại; ghi `hasFinal` |
| `hasFinal` trong chỉ mục và trong `GET /api/products` | 5 | Card danh sách có badge "Có video" |
| `POST /api/transcribe` | 7 | Cần secret `GROQ_API_KEY` |
| `GET/PUT /api/products/:id/edit` | 8 | Giới hạn 500KB |

`deleteProduct` đã xoá mọi thứ dưới `p/{id}/` nên không cần sửa.

## 8. Thay đổi luật

`docs/RULES.md` luật 2 hiện ghi "không thư viện runtime", mâu thuẫn với spec mục 9. Sửa thành:

> Không build step, không framework. Thư viện bên thứ ba chỉ được dùng trong `public/editor/`, phải tự host trong `public/editor/vendor/`, ghim phiên bản, và ghi tên, phiên bản, giấy phép vào `public/editor/vendor/README.md`. Cấm lõi GPL.

## 9. Kiểm thử

- **Logic thuần** (`node --test`): timeline, số mẫu âm thanh theo bảng thời lượng, chọn frame nguồn theo thời điểm, bố cục vùng an toàn, chia dòng phụ đề, SRT, ghi WAV, kiểm `edit.json`.
- **Pipeline thật** (`scripts/ui-check.mjs`, Chrome headless): tự tạo clip thử ngay trong trình duyệt (khung màu có đánh số frame và tiếng bíp), chạy xuất, rồi đọc lại file kết quả để khẳng định: 1080x1920, đúng thời lượng trong ±1 frame, đúng số frame, có track tiếng dài bằng video trong ±20ms, frame đầu của mỗi đoạn đúng màu của clip tương ứng.
- **Thiết bị thật** (chủ dự án): phát trên iPhone, tải lên TikTok, nghe tiếng có lệch không. Ghi "chờ chủ dự án kiểm" như các phase trước.

## 10. Quyết định của người dựng (chủ dự án có thể sửa)

1. Tải thành phẩm lên kho chuyển từ phase 8 lên phase 5.
2. Tiếng luôn mã hoá lại, không passthrough.
3. Bỏ đường dự phòng WebM/VP9.
4. Phase 5 mở đầu bằng một bản thử kỹ thuật bỏ đi.
5. Clip nhập được giữ trong IndexedDB trên thiết bị.
6. Brand kit tối thiểu (logo, @kênh, vị trí watermark) làm ở phase 5; logo nhúng trong JSON, giới hạn 300KB.
7. Sửa luật 2 như mục 8.
8. Thư mục `public/editor/` chỉ nạp khi vào editor; service worker không lưu sẵn.
9. Giới hạn: 12 đoạn, 60 giây, 200MB mỗi file.
10. LLM sửa phụ đề: sai số từ thì bỏ kết quả.
11. Server kiểm chữ ký đầu file khi nhận upload.

## 11. Để người dựng tự quyết

- Giao diện cụ thể của danh sách đoạn và thanh cắt.
- Cách chia việc giữa luồng chính và worker khi xem trước.
- Tham số làm nét, tốc độ Ken Burns, cỡ chữ mặc định.
- Cấu trúc bên trong IndexedDB.
- Câu chữ thông báo lỗi.
- Phiên bản cụ thể của từng thư viện (chọn bản ổn định mới nhất lúc làm, ghi vào `vendor/README.md`).

## 12. Thứ tự làm

1. Sửa luật 2; cập nhật `docs/spec/hau-ky.md` cho ba chỗ lệch (tiếng, WebM, upload ở phase 5) và ghi `decisions.md`.
2. Phase 5: bản thử kỹ thuật → dừng cho chủ dự án chạy trên điện thoại → lập kế hoạch phase 5 → làm.
3. Phase 6, 7, 8, 8.5: mỗi phase một kế hoạch riêng qua `/spec next`, dừng ở cuối mỗi phase để kiểm trên thiết bị thật.
