# Quyết định

Mới nhất ở trên. Mỗi mục: quyết định, lý do. Thứ đã có trong `docs/spec/` thì không chép lại ở đây.

## 2026-11-16 · `/media` chỉ phục vụ đúng loại cho ảnh raster và video
Sau review phase 1: `lib/mirror.js` chỉ lưu `image/jpeg|png|webp|gif|avif` và `video/mp4|webm|quicktime` (video `application/octet-stream` lưu thành `video/mp4`). `/media` trả mọi loại khác dưới dạng `application/octet-stream` kèm `Content-Disposition: attachment`, và luôn có `Content-Security-Policy: default-src 'none'; sandbox`. Lý do: `/media` không cần token và cùng origin với app giữ token trong localStorage; một file SVG có script mở trực tiếp sẽ đọc được token. Hệ quả cho phase sau: file mới muốn hiển thị trực tiếp qua `/media` phải thêm vào danh sách trong `lib/util.js`.

## 2026-11-16 · `/media` đọc được `product.json` nếu biết id
Có chủ ý, theo spec mục 10: đường dẫn chứa id ngẫu nhiên 10 ký tự và tự hết hạn. Nếu sau này cần kín hơn thì siết regex ở `mediaKeyOk` theo đuôi file.

## 2026-11-16 · File chưa lưu về kho: nút "↗ Mở" thay cho `window.open`
Spec mục 8 ghi "Download fallback `window.open`". Bản hiện tại dùng thẻ `<a target="_blank">` (cùng kết quả, không bị chặn popup). Chưa sửa câu chữ trong spec.

## 2026-11-16 · Extension nằm trong repo, sửa trực tiếp ở phase 4
Thư mục `product-grabber/` đã được đưa vào repo sau khi thiết kế được duyệt. Việc "mở tab sau khi gửi" ở phase 4 sẽ sửa thẳng `product-grabber/popup.js`, không viết hướng dẫn trong README nữa. Thay cho quyết định "Extension" bên dưới.
Lưu ý từ code extension: `videos.header` và `videos.description` có thể là `null`; popup gửi header `Authorization` đúng như người dùng nhập (phải nhập cả chữ `Bearer `).

## 2026-11-16 · Audio Hậu kỳ không passthrough AAC được
Ảnh tĩnh, cover 0,2s và clip tắt tiếng cần chèn khoảng lặng; trim giữa chừng lệch biên gói AAC. Hướng dự kiến: decode rồi encode lại audio cho cả timeline. Chưa sửa spec mục 9.2; quyết trong buổi thiết kế Hậu kỳ.

## 2026-11-16 · Model Gemini mặc định để phase 3 quyết
Người dựng tra https://ai.google.dev/pricing lúc làm phase 3, đặt `LLM_MODEL` trong `wrangler.toml`, rồi ghi kết quả vào đây. Lý do: hạn mức free đổi liên tục.

## 2026-11-16 · Chưa tạo gì của Hậu kỳ
Không tạo endpoint `edit`/`upload`/`transcribe`, không có trường `hasFinal`. Chỉ mục `i/` theo đúng schema spec mục 3 để sau này thêm `hasFinal` không phải di trú.

## 2026-11-16 · Brand kit dời sang đợt Hậu kỳ
Trong phase 1–4, `#/settings` chỉ có ô nhập token; chưa có `/api/brandkit`. Lý do: chưa có gì dùng logo/watermark.

## 2026-11-16 · Extension (đã thay, xem mục trên cùng)
Ban đầu: phần sửa extension ở phase 4 là đoạn hướng dẫn trong README vì extension không nằm trong repo.

## 2026-11-16 · Dữ liệu mẫu Cocoon
JSON ở spec mục 4 lưu thành `test/fixtures/cocoon.json`, dùng cho test và cho tiêu chí nghiệm thu phase 3. URL media trong fixture là giả (`cdn.example.test`).

## 2026-11-16 · Test bằng `node --test`
Không thêm thư viện test. Logic thuần trong `lib/` và `public/lib/` có test; handler gọi thẳng với bucket giả (`test/helpers/fake-bucket.js`); UI kiểm bằng tay. Đây không phải build step.

## 2026-11-16 · Root repo là root app
Không có thư mục con `affiliate-studio/` như sơ đồ ở spec mục 2. `wrangler.toml`, `functions/`, `lib/`, `public/`, `test/` nằm ở root.

## 2026-11-16 · Studio trước, Hậu kỳ sau
Làm phase 1–4, dùng thật vài ngày, rồi mới thiết kế Hậu kỳ dựa trên clip Flow thật. Lý do: Studio dùng được độc lập; Hậu kỳ rủi ro kỹ thuật cao (nhất là iPhone).
