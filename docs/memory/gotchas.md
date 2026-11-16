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
