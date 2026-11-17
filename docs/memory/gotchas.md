# Bẫy đã gặp

Mỗi mục: `## <bẫy>`, rồi triệu chứng và cách tránh. Bug đã sửa xong và không tái diễn thì không ghi.

## Chưa kiểm với CDN thật của TikTok Shop
Triệu chứng nếu hỏng: trang chi tiết ghi "N file chưa lưu được về kho", ảnh/video dùng link gốc.
`lib/mirror.js` mới chỉ chạy với fetch giả và một ảnh công khai. Ba chỗ có thể vướng trên Cloudflare thật: CDN chặn IP/Referer của Worker; content-type ngoài danh sách cho phép (xem `EXT` trong `lib/util.js`); video truyền thẳng `res.body` vào R2 cần `content-length`, nếu CDN trả chunked thì R2 từ chối và mục đó thành `stored: null`.

## `node --test` trần chạy cả file helper
Node 22 coi mọi file trong `test/` là test. Script `npm test` vì vậy dùng glob `test/*.test.js`; helper để trong `test/helpers/`.

## Kho local của `wrangler pages dev` giữ dữ liệu giữa các lần chạy
`scripts/ui-check.mjs` cần kho rỗng lúc bắt đầu (nó chờ trạng thái "Chưa có sản phẩm"). Lần chạy trước hỏng giữa chừng thì xoá sản phẩm còn sót qua API, hoặc xoá `.wrangler/state`.

## Test với nguồn dữ liệu vô tận phải có giới hạn thời gian
Một test đọc stream không có điểm dừng sẽ treo cả `npm test` nếu code đọc hết body. Script test vì vậy có `--test-timeout=30000`.

## `unzip` có sẵn trên macOS làm hỏng tên file có dấu
Info-ZIP 6.0 của macOS bỏ qua cờ UTF-8 (bit 11) nên báo "Illegal byte sequence" với zip hợp lệ. Test zip vì vậy giải nén bằng `zipfile` của Python. Finder, Windows Explorer và app Tệp trên iPhone đọc cờ này đúng.

## `document.execCommand("copy")` cần thao tác thật của người dùng
Gọi `.click()` bằng script thì cách copy dự phòng trả `false`. Trong `scripts/ui-check.mjs` phải bấm bằng chuột qua CDP (`Input.dispatchMouseEvent`) mới kiểm được.

## Mediabunny 1.66: vài điều dễ vấp
- `CanvasSink` nếu truyền cả `width` và `height` thì bắt buộc có `fit` (vd `"fill"`), không thì ném lỗi.
- Trong Web Worker không có `AudioBuffer`, nên phải dùng `AudioSampleSink`/`AudioSampleSource` với `AudioSample` (định dạng `f32-planar`), không dùng `AudioBufferSink`/`AudioBufferSource`.
- `Request` của Node không tạo được `mode: "navigate"`; test service worker phải gắn thuộc tính đó sau khi tạo.

## Clip Flow thật dài 10 giây, 24fps
Spec giả định 8 giây. Giới hạn 60 giây của timeline nghĩa là tối đa 6 clip nguyên vẹn.

## Máy dev Windows (từ 17/11/2026): Node 20, không có Python
- `npm test` báo "Could not find 'test\*.test.js'": Node 20 không tự mở rộng glob và cmd không mở rộng giúp. Chạy trong Git Bash: `node --test --test-timeout=30000 test/*.test.js`.
- `npm run dev` không chạy: wrangler 4 cần Node ≥ 22.12. Cần cài Node 22 (chủ dự án quyết).
- 3 test trong `zip.test.js` và bước đọc zip của `ui-check.mjs` cần `python3`; máy không có thì trượt (ui-check ghi "BỎ QUA").
- `ui-check.mjs`, `voice-check.mjs` trên Node 20 phải chạy với `node --experimental-websocket`.
- ui-check "Copy caption + hashtag dùng nội dung đã sửa" trượt trên Windows; có thể do clipboard Windows đổi `\n` thành `\r\n` (chưa xác minh).

## CIT Voice Studio: gọi từ trang HTTPS sang `http://127.0.0.1`
Chrome coi `127.0.0.1` là an toàn nên không chặn mixed content, nhưng Chrome bản mới hỏi quyền "truy cập thiết bị trong mạng cục bộ" khi trang công khai (`*.pages.dev`) gọi vào máy. Từ chối thì `fetch` ném lỗi mạng giống như CIT chưa mở. Trên `localhost:8788` thì không hỏi. Trình dựng vì vậy chỉ tự kết nối CIT sau lần đầu người dùng bấm "Kết nối". Safari có thể chặn hẳn; dựng bằng Chrome/Edge.
