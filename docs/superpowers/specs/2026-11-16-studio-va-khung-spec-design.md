# Thiết kế: Khung spec-driven + Studio (phase 1–4)

Ngày: 16/11/2026 · Trạng thái: chờ duyệt
Spec gốc: `affiliate-studio-spec.md` (v3). Tài liệu này **không lặp lại** spec; nó ghi phạm vi đợt này, các quyết định bổ sung và những gì để người dựng tự quyết.

## 1. Ý định và lý do

Chủ kênh affiliate faceless (1 người) muốn đi từ trang sản phẩm TikTok Shop đến bài đăng hoàn chỉnh ở một chỗ, không tốn tiền API. Dự án dài nhiều phase, làm qua nhiều phiên Claude Code, nên cần một bộ khung để phiên nào cũng biết: luật là gì, đang ở đâu, việc kế tiếp là gì, vì sao đã chọn như vậy.

Đợt này gồm hai phần, làm theo thứ tự:

1. **Khung spec-driven** cho repo (làm trước, nhỏ).
2. **Module A: Studio**, tức phase 1–4 của spec gốc.

Module B (Hậu kỳ, phase 5–8.5) sẽ có buổi thiết kế riêng sau khi Studio đã dùng thật với clip Flow thật.

## 2. Mục tiêu, ngoài phạm vi, điều phải tránh

**Mục tiêu**
- Mở phiên mới, gõ `/spec next` là làm tiếp đúng việc, không phải giải thích lại.
- Hết phase 4: gửi sản phẩm từ extension, mở trên điện thoại thấy đủ sản phẩm, media, gói đăng bài; copy caption một chạm; cài được lên màn hình chính.
- Mỗi phase chỉ được coi là xong khi tiêu chí nghiệm thu (✅ trong spec mục 11) đã được kiểm tra thật.

**Ngoài phạm vi đợt này**
- Mọi thứ thuộc Hậu kỳ: `public/editor/`, `/api/transcribe`, `/api/products/:id/upload/*`, `/api/products/:id/edit`, phần brand kit phục vụ watermark/phụ đề, mục 10 "Hậu kỳ" trên trang chi tiết.
- Mục 13 của spec gốc.
- Sửa code extension (không nằm trong repo này).

**Điều phải tránh (làm được vẫn coi là hỏng)**
- Tài liệu lệch nhau: cùng một thông tin nằm ở hai file. Mỗi loại thông tin chỉ có một nơi ở.
- Khung nặng đến mức cập nhật nó tốn công hơn làm việc.
- Code đi trước spec: hành vi thay đổi mà spec không đổi theo.
- Gói đăng bài bịa công dụng/số liệu, hoặc dùng từ khẳng định điều trị.
- Thêm build step, framework, hay kho lưu trữ ngoài R2.

## 3. Ràng buộc

- Các quyết định ở spec mục 1 giữ nguyên: Cloudflare Pages + Functions, chỉ R2, 7 ngày, một `APP_TOKEN`, Gemini qua endpoint OpenAI-compatible, vanilla JS không build step, UI tiếng Việt.
- Chỉ dùng Claude Code trên repo này, nên không cần `AGENTS.md`.
- Deploy, tạo bucket, đặt secret, `wrangler login` là thao tác trên tài khoản Cloudflare của chủ dự án: Claude chuẩn bị lệnh, **không tự chạy** khi chưa được bảo.

## 4. Các cách đã cân nhắc

**Khung spec-driven**

| Cách | Đổi lại | Kết quả |
|---|---|---|
| A. Gọn: `CLAUDE.md` + `docs/spec/` + `RULES.md` + `STATE.md` + `docs/memory/` + skill `spec` | Memory bank mỏng hơn kiểu Cline | **Đã chọn** |
| B. Memory bank 6 file kiểu Cline | Một nửa lặp lại spec, tốn công cập nhật | Loại |
| C. spec-kit / OpenSpec | Quy trình nặng, chồng lên superpowers | Loại |

Chọn A vì spec đã rất chi tiết; thứ còn thiếu là trạng thái và luật, không phải thêm mô tả.

**Cách dựng Studio:** chỉ có một cách hợp lý, vì spec đã chốt nền tảng, cấu trúc thư mục, API và schema.

**Thứ tự:** Studio trước, Hậu kỳ sau (đã chọn). Lý do: Studio dùng được độc lập; Hậu kỳ rủi ro kỹ thuật cao và nên thiết kế dựa trên clip thật.

## 5. Phần 1: Khung spec-driven

### 5.1 Cấu trúc

```
CLAUDE.md                      # ≤ 40 dòng
docs/
├─ spec/
│  ├─ overview.md              # spec gốc mục 0–5, 10, 12–14
│  ├─ studio.md                # mục 6–8
│  ├─ hau-ky.md                # mục 9
│  └─ phases.md                # mục 11 (phase + tiêu chí nghiệm thu)
├─ RULES.md
├─ STATE.md
└─ memory/
   ├─ decisions.md
   └─ gotchas.md
.claude/skills/spec/SKILL.md
```

`affiliate-studio-spec.md` được **chuyển nguyên văn** vào `docs/spec/` (giữ số mục gốc để tham chiếu "mục 6.3" vẫn đúng), rồi xoá file gốc ở root. Không viết lại nội dung khi tách.

### 5.2 Mỗi file giữ gì

| File | Giữ | Không giữ | Ai sửa, khi nào |
|---|---|---|---|
| `CLAUDE.md` | Dự án là gì (3 dòng), lệnh chạy/test, sơ đồ file ở trên, `@docs/RULES.md` và `@docs/STATE.md` để tự nạp mỗi phiên | Luật, trạng thái, chi tiết spec | Hiếm khi |
| `docs/spec/*` | App **phải** làm gì | Tiến độ, lý do lịch sử | Chỉ qua `/spec change` |
| `docs/RULES.md` | Luật cứng, mỗi luật một dòng kèm lý do ngắn | Sở thích, mẹo | Khi chủ dự án đặt luật mới |
| `docs/STATE.md` | Phase hiện tại, checklist việc của phase, việc kế tiếp, vướng mắc, kết quả nghiệm thu gần nhất | Lịch sử dài (git đã giữ) | Sau mỗi việc xong |
| `docs/memory/decisions.md` | Quyết định + lý do + ngày, mới nhất ở trên | Thứ đã có trong spec | Khi có quyết định mới |
| `docs/memory/gotchas.md` | Bẫy đã gặp và cách tránh (vd CDN sàn cần Referer) | Bug đã sửa xong, không tái diễn | Khi gặp bẫy |

`RULES.md` ban đầu lấy từ spec: không build step; chỉ R2; UI tiếng Việt; không lưu key ở client; gói đăng bài chỉ dùng dữ liệu trong input, không từ khẳng định điều trị; `/media` chỉ nhận key khớp regex; không tự deploy hay đụng secret; spec đổi trước, code đổi sau.

`decisions.md` mở đầu bằng các quyết định ở mục 7 của tài liệu này, gồm cả ghi chú về audio cho Hậu kỳ (phải decode rồi encode lại, không passthrough AAC) để buổi thiết kế sau không quên.

### 5.3 Skill `spec`

Ba lệnh:

- **`/spec status`**: đọc `STATE.md`, báo phase, việc xong/còn, vướng mắc. Không sửa gì.
- **`/spec next`**:
  1. Đọc `STATE.md`, `RULES.md`, phần spec liên quan đến việc kế tiếp, `gotchas.md`.
  2. Nếu phase chưa có kế hoạch: lập kế hoạch cho phase (dùng superpowers:writing-plans), ghi đường dẫn vào `STATE.md`.
  3. Làm **một** việc kế tiếp, viết test trước cho phần logic thuần.
  4. Kiểm tra thật (chạy test, gọi API local) rồi mới đánh dấu xong.
  5. Cập nhật `STATE.md`; thêm vào `decisions.md`/`gotchas.md` nếu có gì đáng nhớ.
  6. Việc cuối của phase: chạy từng tiêu chí ✅ trong `phases.md`, ghi kết quả. Tiêu chí cần thiết bị thật (iPhone, extension) thì ghi "chờ chủ dự án kiểm" và liệt kê bước kiểm, không tự đánh dấu đạt.
- **`/spec change <mô tả>`**: sửa file spec liên quan trước, ghi vào `decisions.md`, cập nhật checklist trong `STATE.md`, rồi mới sửa code. Nếu thay đổi mâu thuẫn với `RULES.md` thì dừng lại hỏi.

Skill không commit; commit khi chủ dự án bảo.

## 6. Phần 2: Studio (phase 1–4)

Làm đúng spec gốc mục 2–8 và 12, trừ các phần ngoài phạm vi ở mục 2 trên. Thứ tự và tiêu chí nghiệm thu theo spec mục 11, phase 1 đến 4.

Tóm tắt phạm vi:

| Phase | Nội dung | Spec |
|---|---|---|
| 1 | Middleware token/CORS; POST/GET/DELETE products; sao chép media vào R2; `/media` có Range; UI settings token, danh sách, chi tiết (sản phẩm + media) | mục 3, 4, 5, 8 |
| 2 | `prompt-library.js` (7 mẫu), `templatePackage()`, khu gói đăng bài, copy, zip, share | mục 6.1, 6.3, 7, 8 |
| 3 | Gemini, `normalize()`, xử lý 429, chế độ thủ công, tự lưu package | mục 6.2, 6.4 |
| 4 | manifest, service worker, icon, lệnh lifecycle, README deploy | mục 8 (PWA), 12 |

## 7. Quyết định bổ sung (của Claude, chủ dự án có thể sửa)

1. **Root repo là root app.** Không tạo thư mục con `affiliate-studio/`; `wrangler.toml`, `functions/`, `lib/`, `public/` nằm ngay ở root `toptop/`.
2. **Test bằng `node --test`**, không thêm thư viện. Áp dụng cho logic thuần: `lib/util.js`, `lib/generate.js` (`normalize`, parse lỏng, làm tròn giá), `public/lib/prompt-library.js` (`detectCategory`, `shortName`, điền slot), `public/lib/zip.js`. Handler API kiểm bằng `wrangler pages dev` + curl. UI kiểm bằng tay. `package.json` chỉ có `wrangler` là devDependency; đây không phải build step.
3. **Dữ liệu mẫu:** JSON sản phẩm Cocoon ở spec mục 4 được lưu thành `test/fixtures/cocoon.json`, dùng cho test và cho tiêu chí nghiệm thu phase 3.
4. **Extension:** phần "sửa extension mở tab sau khi gửi" (phase 4) thành một đoạn hướng dẫn kèm code mẫu trong README để chủ dự án tự áp dụng. Phía app chỉ cần đảm bảo POST trả đúng `{id, url}`.
5. **Brand kit trong đợt này:** chỉ làm ô nhập token ở `#/settings`. `/api/brandkit` và phần còn lại của brand kit chuyển sang đợt Hậu kỳ, vì chưa có gì dùng tới.
6. **`edit`/`upload`/`hasFinal`:** không tạo endpoint, không tạo trường. Chỉ mục `i/` vẫn theo đúng schema spec để sau này thêm `hasFinal` không phải di trú.
7. **Model Gemini mặc định:** người dựng tra trang pricing lúc làm phase 3 rồi đặt `LLM_MODEL`, ghi kết quả vào `decisions.md`.
8. **Audio Hậu kỳ:** ghi nhận sẵn rằng passthrough AAC không đủ (ảnh tĩnh, cover 0,2s, clip tắt tiếng cần khoảng lặng; trim lệch biên gói). Chưa sửa spec; sẽ quyết trong buổi thiết kế Hậu kỳ.

## 8. Để người dựng tự quyết

- Chia file bên trong `public/app.js` (một file hay vài module ES).
- Giao diện cụ thể: màu, khoảng cách, kiểu card, miễn mobile-first và đúng thứ tự khối ở spec mục 8.
- Nội dung chữ của 7 mẫu prompt và bộ giá trị slot theo ngành (spec chỉ cho một ví dụ).
- Regex từ khoá của `detectCategory`.
- Chiến lược cache của service worker cho app shell, miễn không cache `/api/*` và `/media/*`.
- Cách gộp `compatibility_date` và phiên bản wrangler.

## 9. Thứ tự làm

1. Dựng khung (mục 5): tách spec, viết `CLAUDE.md`, `RULES.md`, `STATE.md`, `memory/`, skill `spec`.
2. Phase 1 → 2 → 3 → 4, mỗi phase qua `/spec next`, dừng ở cuối mỗi phase để chủ dự án kiểm phần cần thiết bị thật.
3. Sau phase 4: dùng thật vài ngày, rồi mở buổi thiết kế Hậu kỳ.
