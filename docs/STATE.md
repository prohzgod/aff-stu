# Trạng thái

**Phase hiện tại:** 1 · Nền tảng & đồng bộ — code xong, chờ chủ dự án kiểm trên thiết bị thật
**Kế hoạch:** docs/superpowers/plans/2026-11-16-khung-spec-va-phase-1.md
**Việc kế tiếp:** chủ dự án deploy và kiểm phase 1 (các bước bên dưới); sau đó `/spec next` để lập kế hoạch phase 2

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
- `npm test`: 60/60.
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

## Các phase sau
- [ ] Phase 2: Thư viện mẫu & gói dựng sẵn
- [ ] Phase 3: LLM + chế độ thủ công
- [ ] Phase 4: PWA, lifecycle, extension, deploy
- [ ] Hậu kỳ (phase 5–8.5): cần buổi thiết kế riêng trước
