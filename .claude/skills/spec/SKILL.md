---
name: spec
description: Làm việc theo spec của dự án. Dùng khi người dùng gõ /spec next, /spec status, /spec change, hoặc hỏi "làm tiếp", "đang ở đâu", "đổi yêu cầu".
---

# spec

Đối số đầu tiên chọn lệnh. Không có đối số thì coi như `status`.

## status
Đọc `docs/STATE.md`. Báo: phase, việc đã xong, việc kế tiếp, vướng mắc. Không sửa file nào.

## next
1. Đọc `docs/STATE.md`, `docs/RULES.md`, `docs/memory/gotchas.md`, và phần trong `docs/spec/` liên quan tới việc kế tiếp.
2. Nếu phase hiện tại chưa có kế hoạch: dùng superpowers:writing-plans lập kế hoạch cho phase đó từ `docs/spec/phases.md`, ghi đường dẫn vào STATE, rồi dừng lại cho chủ dự án duyệt.
3. Làm đúng **một** việc kế tiếp trong checklist. Logic thuần thì viết test trước.
4. Chạy kiểm tra thật (`npm test`, gọi API local). Chưa chạy thì chưa xong.
5. Cập nhật STATE: tick việc, ghi "Việc kế tiếp". Có quyết định mới thì thêm vào `docs/memory/decisions.md`; gặp bẫy thì thêm vào `docs/memory/gotchas.md`.
6. Nếu đó là việc cuối của phase: chạy từng tiêu chí ✅ của phase trong `docs/spec/phases.md`, ghi kết quả vào "Nghiệm thu gần nhất". Tiêu chí cần thiết bị thật (iPhone, extension, tài khoản Cloudflare) thì ghi "chờ chủ dự án kiểm" kèm các bước kiểm; không tự đánh dấu đạt.

## change <mô tả>
1. Nếu thay đổi mâu thuẫn với `docs/RULES.md`: dừng lại, nêu luật bị đụng, hỏi chủ dự án.
2. Sửa file trong `docs/spec/` trước.
3. Thêm một mục vào `docs/memory/decisions.md` (ngày, thay đổi, lý do).
4. Cập nhật checklist trong STATE.
5. Sau đó mới sửa code, theo các bước của `next`.

## Luôn luôn
- Không commit, không deploy, không đụng secret khi chưa được bảo.
- Mỗi loại thông tin một nơi: yêu cầu ở spec, luật ở RULES, tiến độ ở STATE, lý do ở decisions.
