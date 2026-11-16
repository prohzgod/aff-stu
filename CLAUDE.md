# Affiliate Studio

PWA cá nhân cho kênh affiliate faceless TikTok: nhận dữ liệu sản phẩm từ extension `product-grabber/`,
sinh hook + prompt Google Flow + gói đăng bài (Studio), sau này thêm dựng video trên trình duyệt (Hậu kỳ).
Chạy trên Cloudflare Pages + Functions + R2. Vanilla JS, không build step. Một người dùng.

## Lệnh

- `npm test` — chạy toàn bộ test (`node --test`)
- `npm run dev` — `wrangler pages dev` ở http://localhost:8788 (cần `.dev.vars`, chép từ `.dev.vars.example`)
- `node scripts/ui-check.mjs` — kiểm UI bằng Chrome headless ở 375px (cần `npm run dev` đang chạy, kho local rỗng)

## Thông tin nào ở đâu

| Cần biết | Đọc |
|---|---|
| App phải làm gì | `docs/spec/` (`overview`, `studio`, `hau-ky`, `phases`) |
| Luật cứng | `docs/RULES.md` |
| Đang ở đâu, việc kế tiếp | `docs/STATE.md` |
| Vì sao đã chọn như vậy | `docs/memory/decisions.md` |
| Bẫy đã gặp | `docs/memory/gotchas.md` |
| Thiết kế và kế hoạch từng đợt | `docs/superpowers/specs/`, `docs/superpowers/plans/` |

Làm việc qua skill `spec`: `/spec status`, `/spec next`, `/spec change <mô tả>`.

## Mã nguồn

- `functions/` — Pages Functions, lớp mỏng gọi sang `lib/`
- `lib/` — logic phía server, nhận `bucket` và `fetch` qua tham số để test được
- `public/` — app tĩnh; `public/lib/` là logic thuần phía client, `public/views/` là các khối giao diện lớn
- `test/` — test và `helpers/` (R2 giả, fetch giả); `scripts/` — kiểm giao diện, vẽ icon
- `product-grabber/` — Chrome extension gửi sản phẩm sang app

@docs/RULES.md
@docs/STATE.md
