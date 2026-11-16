# Affiliate Studio

PWA cá nhân cho kênh affiliate TikTok: nhận sản phẩm từ extension **Product Grabber**, lưu ảnh/video về kho, rồi dựng gói đăng bài (6 hook, chữ ảnh bìa, prompt Google Flow, kịch bản, caption, hashtag, bình luận ghim). Chạy trên Cloudflare Pages + Functions + R2. Dữ liệu sản phẩm tự xoá sau 7 ngày.

Trên trang sản phẩm có nút **🎬 Dựng video**: ghép các clip từ Google Flow thành một video 1080x1920 ngay trong trình duyệt (nên dùng Chrome hoặc Edge trên máy tính), rồi lưu lên kho để mở và đăng từ điện thoại.

Spec đầy đủ nằm ở `docs/spec/`. Tiến độ hiện tại ở `docs/STATE.md`.

## Chạy trên máy

Cần Node 22 trở lên.

```bash
npm install
cp .dev.vars.example .dev.vars     # sửa APP_TOKEN nếu muốn
npm run dev                        # http://localhost:8788, R2 giả lập trong .wrangler/
npm test                           # toàn bộ test
node scripts/ui-check.mjs          # kiểm giao diện bằng Chrome headless (cần npm run dev đang chạy, kho local rỗng)
```

Mở `http://localhost:8788`, nhập token trong `.dev.vars`, bấm ＋ rồi dán nội dung `test/fixtures/cocoon.json` để có một sản phẩm mẫu.

Muốn thử tạo gói bằng AI trên máy: thêm dòng `LLM_API_KEY=<key Google AI Studio>` vào `.dev.vars`.

## Deploy lên Cloudflare

Làm một lần:

```bash
npx wrangler login
npx wrangler r2 bucket create affiliate-studio
npx wrangler r2 bucket lifecycle add affiliate-studio expire-p p/ --expire-days 7
npx wrangler r2 bucket lifecycle add affiliate-studio expire-i i/ --expire-days 7
npx wrangler pages project create affiliate-studio
npx wrangler pages secret put APP_TOKEN      # chuỗi ngẫu nhiên, ít nhất 32 ký tự
npx wrangler pages secret put LLM_API_KEY    # tuỳ chọn: key Google AI Studio
npx wrangler pages secret put GROQ_API_KEY   # tuỳ chọn: key console.groq.com, cho phụ đề tự động
```

Tạo token ngẫu nhiên: `openssl rand -hex 24`.

Mỗi lần cập nhật:

```bash
npm test && npx wrangler pages deploy
```

Ghi chú:

- Hai rule lifecycle chỉ xoá `p/` (sản phẩm) và `i/` (chỉ mục). Thư mục `cfg/` dành cho brand kit sau này, không bị xoá.
- Rule chạy theo ngày nên có thể trễ vài giờ. App tự ẩn sản phẩm quá 7 ngày, không phụ thuộc rule.
- Bật R2 có thể cần thêm phương thức thanh toán dù chỉ dùng mức miễn phí (10 GB, 1 triệu lượt ghi, 10 triệu lượt đọc mỗi tháng).

## Cấu hình

| Tên | Ở đâu | Ý nghĩa |
|---|---|---|
| `APP_TOKEN` | secret | Token dùng chung cho web, điện thoại và extension |
| `LLM_API_KEY` | secret, tuỳ chọn | Key Google AI Studio. Không có thì app dùng gói dựng sẵn và chế độ thủ công |
| `GROQ_API_KEY` | secret, tuỳ chọn | Key Groq cho phụ đề tự động (Whisper). Không có thì dùng lời thoại từ kịch bản rồi sửa tay |
| `GROQ_MODEL` | `wrangler.toml`, tuỳ chọn | Mặc định `whisper-large-v3`; đổi sang `whisper-large-v3-turbo` nếu cần nhanh và rẻ hơn |
| `LLM_MODEL` | `wrangler.toml` | Model Gemini, mặc định `gemini-3.8-flash` |
| `LLM_BASE_URL` | `wrangler.toml` | Endpoint kiểu OpenAI của Gemini |
| `RETENTION_DAYS` | `wrangler.toml` | Số ngày giữ sản phẩm, mặc định 7. Đổi số này thì đổi cả hai rule lifecycle |

## Cài extension Product Grabber

1. Mở `chrome://extensions`, bật **Developer mode**, bấm **Load unpacked**, chọn thư mục `product-grabber/`.
2. Bấm icon extension → ⚙:
   - Endpoint: `https://<tên-app>.pages.dev/api/products`
   - Authorization: `Bearer <APP_TOKEN>` (gõ cả chữ `Bearer ` ở đầu)
3. Mở một trang sản phẩm TikTok Shop, bấm icon → **Gửi sang app**. Extension gửi dữ liệu rồi mở thẳng trang sản phẩm trong app.

Đã cài bản cũ thì vào `chrome://extensions` bấm nút tải lại của extension để nhận bản 0.2.0.

## Cài lên điện thoại

Mở địa chỉ app trên điện thoại, nhập token ở ⚙, rồi:

- **iPhone:** mở bằng Safari → nút Chia sẻ → **Thêm vào Màn hình chính**.
- **Android:** mở bằng Chrome → menu ⋮ → **Thêm vào màn hình chính** hoặc **Cài đặt ứng dụng**.

App cài từ màn hình chính có bộ nhớ riêng, nên cần nhập token lại một lần.

## Khi có trục trặc

| Thấy gì | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Extension báo "Gửi lỗi: Token không đúng" | Ô Authorization thiếu chữ `Bearer ` hoặc sai token | Sửa trong ⚙ của extension |
| Trang chi tiết ghi "N file chưa lưu được về kho" | CDN của sàn từ chối server, hoặc file quá lớn (ảnh trên 15MB, video trên 60MB) | Ảnh/video vẫn xem được qua link gốc; tải ngay vì link có hạn |
| Dòng nguồn ghi "AI đã hết hạn mức miễn phí (lỗi 429)" | Hết quota Gemini miễn phí | Đợi, đổi `LLM_MODEL` sang `gemini-3.5-flash-lite`, hoặc dùng chế độ thủ công |
| Dòng nguồn ghi "Không gọi được AI (http 404)" | Tên model không còn tồn tại | Tra model Flash miễn phí hiện tại, sửa `LLM_MODEL` trong `wrangler.toml`, deploy lại |
| Dòng nguồn ghi "Chưa cấu hình AI" | Chưa đặt `LLM_API_KEY` | `npx wrangler pages secret put LLM_API_KEY` rồi deploy lại |
| Phụ đề báo "Chưa cấu hình GROQ_API_KEY" | Chưa đặt key Groq | `npx wrangler pages secret put GROQ_API_KEY` rồi deploy lại, hoặc bấm "Dùng lời thoại từ kịch bản" |
| Phụ đề báo "hết hạn mức" | Hết quota Groq miễn phí | Đợi, hoặc dùng lời thoại từ kịch bản |
| Sản phẩm biến mất | Đã quá 7 ngày | Gửi lại từ extension |

## Cấu trúc

```
functions/   Pages Functions: lớp mỏng gọi sang lib/
lib/         logic phía server (lưu R2, sao chép media, sinh gói)
public/      app tĩnh, không build step (public/editor/ là trình dựng video, chỉ tải khi mở)
test/        test chạy bằng node --test
scripts/     kiểm giao diện, vẽ icon
product-grabber/   Chrome extension
docs/        spec, luật, trạng thái, quyết định
```
