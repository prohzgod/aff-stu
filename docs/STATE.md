# Trạng thái

**Phase hiện tại:** 1 · Nền tảng & đồng bộ — code xong, chờ chủ dự án kiểm trên thiết bị thật
**Kế hoạch:** docs/superpowers/plans/2026-11-16-khung-spec-va-phase-1.md
**Việc kế tiếp:** (1) chủ dự án deploy và kiểm phase 1 theo các bước bên dưới; (2) chủ dự án duyệt kế hoạch phase 2 ở `docs/superpowers/plans/2026-11-16-phase-2-thu-vien-mau.md`, rồi `/spec next` để bắt đầu Task 1 của phase 2

## Checklist phase 1
- [x] Task 1: Khung spec-driven
- [x] Task 2: Khung dự án + lib/util.js
- [x] Task 3: lib/store.js
- [x] Task 4: lib/mirror.js
- [x] Task 5: API + /media
- [x] Task 6: UI
- [x] Task 7: Nghiệm thu phase 1 (phần kiểm được trên máy dev)

## Vướng mắc
(chưa có)

## Nghiệm thu gần nhất

**2026-11-16 · Phase 1 · trên máy dev**

Đã chạy và đạt:
- `npm test`: 65/65.
- `wrangler pages dev` + curl: 401 khi thiếu token, OPTIONS 204 có CORS, POST 201, GET danh sách/chi tiết, DELETE; sao chép một ảnh PNG thật về R2 giả lập; `/media` trả 200, 206 (`bytes=0-1`, `bytes=-100`), 416.
- `node scripts/ui-check.mjs`: 29/29 trên Chrome headless ở 375px (token, danh sách, dialog dán JSON, chi tiết, xoá, 404, token sai, tiêu đề chứa HTML hiện dạng chữ, không cuộn ngang).

Năm điểm dễ hỏng trong kế hoạch và test đang ghim:
1. HTML trong dữ liệu sàn → `format.test.js` (escapeHtml, safeUrl), ui-check "tiêu đề chứa HTML…".
2. CDN từ chối một phần → `mirror.test.js` "cả hai nguồn lỗi…", `api.test.js` "CDN 403 toàn bộ…".
3. 401 có CORS, UI về settings → `api.test.js` "thiếu/sai token…", ui-check "token sai…".
4. Range bất thường → `range.test.js`, `api.test.js` nhóm media.
5. Tiêu đề dài, mục quá hạn → `store.test.js` "tiêu đề tiếng Việt 500 ký tự…", "mục quá hạn…".

**Chờ chủ dự án kiểm** (tiêu chí ✅ của phase 1: "Gửi từ extension → mở trên điện thoại thấy đúng sản phẩm, xem được video trên iPhone"):
1. Chạy các lệnh ở `docs/spec/overview.md` mục 12: tạo bucket, 2 lifecycle rule, `secret put APP_TOKEN` (chuỗi ngẫu nhiên ≥ 32 ký tự), `pages deploy`.
2. Extension (`product-grabber/`): ⚙ → Endpoint `https://<project>.pages.dev/api/products`, Authorization `Bearer <APP_TOKEN>` (gõ cả chữ `Bearer `). Mở một sản phẩm TikTok Shop thật, bấm "Gửi sang app".
3. Mở app trên iPhone, nhập token, mở sản phẩm: ảnh hiện, video phát và tua được, tải thử một ảnh.
4. Xem dòng ghi chú trong khối "Ảnh & video". Nếu có "N file chưa lưu được về kho" tức CDN thật từ chối server: báo lại để ghi vào `docs/memory/gotchas.md` và xử lý.

## Tồn đọng nhỏ từ review phase 1 (chưa sửa, chủ dự án quyết có làm không)
- `lib/store.js`: giới hạn metadata chỉ mục đếm theo ký tự chứ chưa theo byte; `price.current` không phải số có thể làm POST lỗi 500 sau khi đã ghi file (sản phẩm mồ côi tới khi lifecycle xoá).
- `lib/mirror.js`: `url` sản phẩm chứa ký tự có dấu làm header Referer lỗi, mọi file thành "chưa lưu"; 12 ảnh tải song song có thể tốn nhiều RAM; ảnh thứ 13 trở đi bị bỏ hẳn khỏi sản phẩm.
- UI: ảnh link gốc lỗi chưa thử `preview`; video link gốc lỗi không báo; nút Xoá không khoá khi đang chờ; dialog dán JSON mất nội dung khi gặp 401 và không đóng khi bấm Back; chữ "7 ngày" viết cứng.
- `/media`: `If-None-Match` chỉ so chuỗi tuyệt đối; chưa có HEAD; vẫn phục vụ file quá 7 ngày tới khi lifecycle chạy.
- POST kiểm giới hạn 1MB sau khi đã đọc hết body.
- Gửi cùng một sản phẩm hai lần tạo hai mục (spec không nói).
- Nên thêm CSP cho `public/index.html`.
- `scripts/ui-check.mjs` viết cứng đường dẫn Chrome trên macOS.

## Các phase sau
- [ ] Phase 2: Thư viện mẫu & gói dựng sẵn
- [ ] Phase 3: LLM + chế độ thủ công
- [ ] Phase 4: PWA, lifecycle, extension, deploy
- [ ] Hậu kỳ (phase 5–8.5): cần buổi thiết kế riêng trước
