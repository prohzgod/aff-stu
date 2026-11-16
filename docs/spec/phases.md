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

