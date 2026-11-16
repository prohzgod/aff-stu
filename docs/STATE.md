# Trạng thái

**Phase hiện tại:** 8 · Đồng bộ & dựng hàng loạt — code xong. Mọi phase từ 1 đến 8 đang chờ chủ dự án deploy và kiểm trên thiết bị thật (chủ dự án đã bảo làm hết các phase rồi mới test)
**Thiết kế:** docs/superpowers/specs/2026-11-16-hau-ky-design.md (đã duyệt)
**Việc kế tiếp:** Phase 8.5 (Enhance AI bằng WebSR/WebGPU)

## Checklist phase 8
- [x] `GET/PUT /api/products/:id/edit` (`edit.json`): lưu dự án dựng, chỉ giữ trường đã biết
- [x] Trình dựng tự đồng bộ sau 1,5 giây ngừng sửa; mở lại thì bản mới hơn thắng
- [x] Máy khác: đoạn nhập từ máy báo "Thiếu clip, chọn lại file", chữ và phụ đề giữ nguyên
- [x] Dựng hàng loạt `#/batch`: thiết lập chung, xuất lần lượt, lưu thẳng lên kho
- [x] Nghiệm thu phần kiểm được trên máy dev
- (Upload `final.mp4`/`cover.png`/`subs.srt`, video thành phẩm trên trang sản phẩm, brand kit: đã làm ở phase 5–7)

## Checklist phase 7
- [x] Worker tách tiếng của timeline thành WAV 16kHz mono
- [x] `POST /api/transcribe`: Groq Whisper (mốc từng từ) + LLM sửa dấu câu, sai số từ thì bỏ bản sửa
- [x] `subtitles.js`: chia dòng theo 3 kiểu, sửa chữ, dời ±0,1 giây, tách, gộp, SRT
- [x] Khối "Phụ đề" trong trình dựng; dự phòng "Dùng lời thoại từ kịch bản"
- [x] In phụ đề vào video; `subs.srt` lưu kèm khi "Lưu lên kho"; link tải trên trang sản phẩm
- [x] Kiểu phụ đề mặc định trong brand kit
- [x] Nghiệm thu phần kiểm được trên máy dev

## Checklist phase 6
- [x] `overlays.js`: chữ hook (3 giây đầu), sticker giá (3 giây cuối), CTA (2,5 giây cuối), tự thu chữ và xuống dòng, luôn trong vùng an toàn
- [x] Font Be Vietnam Pro tự host, nạp xong trước frame đầu ở cả trang và worker
- [x] Điều khiển "Chữ trên video" trong trình dựng, điền sẵn từ gói đăng bài; nút "Xem lớp UI TikTok" (chỉ trên bản xem trước)
- [x] Trình làm ảnh bìa (Konva): nền là frame video hoặc ảnh sản phẩm, chữ từ `coverTexts`, sticker giá, logo, 3 bố cục, kéo-thả
- [x] `cover.png` lưu lên kho, hiện trên trang sản phẩm; tuỳ chọn chèn làm 0,2 giây đầu video
- [x] Nghiệm thu phần kiểm được trên máy dev

## Checklist phase 5
- [x] Sửa luật 2; `example-input/` vào `.gitignore`; chép ba chỗ lệch spec vào `docs/spec/`
- [x] Bản thử kỹ thuật với clip thật (làm trong thư mục nháp, không nằm trong repo)
- [x] `timeline.js`, `audio.js`, `compose.js` (logic thuần + test)
- [x] `render-worker.js`: xuất MP4 H.264 1080x1920, tiếng AAC mã hoá lại
- [x] Editor `#/p/{id}/edit`: nhập clip/ảnh, kéo-thả và nút lên/xuống, cắt, tắt tiếng, kiểu vừa khung, xem trước, xuất có tiến độ và Huỷ
- [x] Clip giữ trên thiết bị (IndexedDB), tải lại trang còn nguyên
- [x] Brand kit tối thiểu ở trang cài đặt + watermark
- [x] `PUT /api/products/:id/upload/final.mp4`, `hasFinal`, video thành phẩm trên trang sản phẩm
- [x] Nghiệm thu phần kiểm được trên máy dev
- [ ] Chủ dự án kiểm trên Android và iPhone (xem được, tải được, chia sẻ được; thử dựng trên điện thoại)

## Checklist phase 4
- [x] `manifest.webmanifest` + icon 192/512/maskable/apple-touch (vẽ bằng `scripts/make-icons.mjs`)
- [x] `public/sw.js`: network-first cho app shell, không cache `/api/*` và `/media/*`
- [x] Hướng dẫn "Thêm vào Màn hình chính" ở trang cài đặt
- [x] Extension 0.2.0: gửi xong mở thẳng trang sản phẩm trong app, báo lỗi rõ hơn
- [x] `README.md`: chạy trên máy, deploy, lifecycle 7 ngày, cấu hình, xử lý trục trặc
- [x] Nghiệm thu phần kiểm được trên máy dev

## Checklist phase 3
- [x] Gọi Gemini qua endpoint OpenAI-compatible, xử lý 429/lỗi mạng/JSON hỏng → rơi về gói dựng sẵn kèm lý do
- [x] `normalize()`: thiếu gì lấy từ mẫu, bỏ từ khẳng định điều trị, nối NEGATIVE, cảnh báo giá lạ
- [x] Chế độ thủ công: `GET /api/products/:id/generate` (prompt) + `PUT /api/products/:id/package` `{raw}`
- [x] Tự lưu caption/hashtag/bình luận ghim (debounce 600ms) qua `PUT package`
- [x] Nghiệm thu phần kiểm được trên máy dev

## Checklist phase 2
- [x] Task 1: `public/lib/prompt-library.js` (7 mẫu Flow)
- [x] Task 2: `lib/generate.js` (gói dựng sẵn)
- [x] Task 3: `savePackage` + `POST /api/products/:id/generate`
- [x] Task 4: `zip.js` + `package-text.js`
- [x] Task 5: `share.js`
- [x] Task 6: UI gói đăng bài
- [x] Task 7: Nghiệm thu phase 2 (phần kiểm được trên máy dev)

## Checklist phase 1 (kế hoạch: docs/superpowers/plans/2026-11-16-khung-spec-va-phase-1.md)
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

**2026-11-16 · Phase 8 · trên máy dev**

Đã chạy và đạt: `npm test` 222/222; `node scripts/ui-check.mjs` 117/117. Trong Chrome thật: dự án dựng lên máy chủ đủ đoạn, điểm cắt, chữ, phụ đề và không kèm dữ liệu file; dựng hàng loạt xuất và lưu được, video trên kho đúng là bản mới (149 frame, chữ hook và phụ đề tắt theo thiết lập chung, CTA còn); xoá sạch dữ liệu trên thiết bị rồi mở lại (giả lập máy khác) thì dự án về từ máy chủ, ba đoạn nhập từ máy báo thiếu clip, đoạn lấy từ kho vẫn có, chữ và phụ đề nguyên vẹn.

Tiêu chí ✅ của phase 8 ("Dựng trên laptop → mở điện thoại thấy video + ảnh bìa + caption trên cùng một trang, bấm ↗ chia sẻ thẳng sang TikTok"):
- Video, ảnh bìa, phụ đề và caption cùng nằm trên trang sản phẩm: **đạt trên máy dev**.
- Mở trên điện thoại thật và chia sẻ sang TikTok: **chờ chủ dự án kiểm**.

**Chờ chủ dự án kiểm (phase 8):**
1. Dựng trên laptop, lưu lên kho; mở trang sản phẩm trên điện thoại: thấy video, ảnh bìa, link phụ đề và caption; bấm "↗ Chia sẻ" sang TikTok.
2. Mở "Dựng video" của cùng sản phẩm trên một trình duyệt khác: các đoạn hiện "Thiếu clip, chọn lại file"; chọn lại đúng file thì dựng tiếp được.
3. Sắp clip cho 2–3 sản phẩm, vào Danh sách → "🎬 Dựng hàng loạt", bấm xuất. Xem cách chọn "thiết lập chung" có đúng ý không: đây là phần spec tả ít nhất và mình tự quyết cách làm.

**2026-11-16 · Phase 7 · trên máy dev**

Đã chạy và đạt: `npm test` 213/213; `node scripts/ui-check.mjs` 111/111. Trong Chrome thật: tiếng gửi đi phiên âm là WAV 16kHz mono dài đúng 6 giây và có tiếng; phụ đề từ kịch bản trải hết video; đổi kiểu thì chia lại dòng; sửa chữ, kéo dài, tách, gộp đều đúng; file xuất có phụ đề ở đầu, giữa và cuối (đọc lại điểm ảnh); `subs.srt` lưu kèm và đúng định dạng; chèn ảnh bìa sau đó thì có cảnh báo lệch thời gian.

Tiêu chí ✅ của phase 7 ("Clip có lời thoại tiếng Việt: phụ đề lệch < 0,3s; tên thương hiệu viết đúng sau hậu xử lý"):
- **Chưa kiểm được.** Máy dev không có `GROQ_API_KEY` nên chưa gọi Groq thật lần nào. Phần gọi Groq và phần sửa bằng LLM mới chạy với phản hồi giả lập (đúng tên trường theo tài liệu Groq tra ngày 16/11/2026). **Chờ chủ dự án kiểm.**

**Chờ chủ dự án kiểm (phase 7):**
1. Lấy key ở console.groq.com, thêm `GROQ_API_KEY=...` vào `.dev.vars` (hoặc `wrangler pages secret put GROQ_API_KEY`).
2. Dựng một video từ clip Flow có lời thoại tiếng Việt, bấm "Tạo phụ đề tự động". Xem trước: chữ có khớp lời không (mục tiêu lệch dưới 0,3 giây), tên thương hiệu có đúng không.
3. Nếu báo lỗi thì chép nguyên câu báo lỗi lại.

**2026-11-16 · Phase 6 · trên máy dev**

Đã chạy và đạt: `npm test` 187/187; `node scripts/ui-check.mjs` 99/99. Phần mới được kiểm trong Chrome thật bằng cách **đọc lại điểm ảnh của file xuất**: chữ hook có ở giây 1 và hết ở giây 5; sticker giá và CTA chỉ có ở cuối video; không chữ nào lấn vào cột nút bên phải hay vùng caption phía dưới; lớp UI TikTok giả không lọt vào file xuất. Ảnh bìa: lưu lên kho, trang sản phẩm hiện đúng 1080x1920, chèn vào đầu video dài 0,2 giây, lưu lần hai không nhân đôi.

Tiêu chí ✅ của phase 6:
- "Chữ tiếng Việt có dấu hiển thị đúng ngay từ frame đầu": font được nạp trước khi vẽ ở cả trang và worker (kiểm bằng `document.fonts.check` và chữ có trong frame giây 1 của file xuất). **Nhìn bằng mắt xem dấu có đúng không: chờ chủ dự án kiểm.**
- "Không chữ nào bị nút TikTok che": **đạt** theo số đo vùng an toàn của spec (kiểm bằng điểm ảnh). Trên app TikTok thật: chờ chủ dự án kiểm.

**Chờ chủ dự án kiểm (phase 6):** dựng một video có đủ chữ hook, giá, CTA; xem trên điện thoại rồi đăng thử ở chế độ riêng tư, xem chữ có bị giao diện TikTok che không. Làm một ảnh bìa, kéo chữ sang chỗ khác, lưu, và chọn frame đầu làm bìa khi đăng.

**2026-11-16 · Phase 5 · trên máy dev**

Đã chạy và đạt:
- `npm test`: 175/175.
- `node scripts/ui-check.mjs`: 83/83. Phần Hậu kỳ chạy trọn trong Chrome thật: tạo 2 clip thử (đỏ 2s, xanh 3s, có tiếng bíp), nhập, thêm ảnh sản phẩm từ kho, đổi thứ tự, cắt, xem trước có watermark, xuất, rồi **đọc lại file xuất**: MP4 H.264 1080x1920, đúng 144 frame, dài 6,000s; tiếng AAC 48kHz dài 6,036s; giây 1 là clip đỏ, giây 5 là clip xanh; hai clip có tiếng, đoạn ảnh tĩnh im lặng. Sau đó lưu lên kho, tải lại trang (3 đoạn còn nguyên), và trang sản phẩm phát được video 1080x1920 từ `/media`.
- Chạy riêng với **clip Flow thật** trong `example-input/` (720x1280, 24fps, 10s): ghép 2 đoạn của clip với 1 ảnh tĩnh ra 8,5s, 204 frame, mất 1,9s trên máy này. So với nguồn: độ to tiếng và màu điểm ảnh khớp; đoạn tắt tiếng và đoạn ảnh im lặng hoàn toàn.

Tiêu chí ✅ của phase 5 ("Ghép 3 clip Flow 8s + 1 ảnh sản phẩm → MP4 1080x1920 ~26s phát được trên iPhone và upload được lên TikTok; tiếng không lệch hình"):
- Ghép, kích thước, số frame, độ dài tiếng: **đạt trên máy dev** (với clip thử và 1 clip thật; chưa thử đúng 3 clip thật khác nhau vì thư mục mẫu chỉ có 1 clip).
- "Phát được trên iPhone", "upload được lên TikTok", "tiếng không lệch hình khi nghe": **chờ chủ dự án kiểm**.

**Chờ chủ dự án kiểm (phase 5):**
1. Trên laptop (Chrome): `npm run dev`, mở một sản phẩm, bấm "🎬 Dựng video", thả 3 clip Flow thật và 1 ảnh, bấm "Xuất video". Xem video kết quả: nghe tiếng có khớp miệng/hành động không, nhất là ở clip cuối.
2. Bấm "Lưu lên kho". Sau khi deploy, mở trang sản phẩm trên iPhone và Android: video phát được, tua được, nút "⬇ Tải" và "↗ Chia sẻ" đưa được sang TikTok.
3. Tải video về điện thoại và đăng thử lên TikTok (để ở chế độ riêng tư).
4. Thử mở "Dựng video" ngay trên điện thoại. Nếu thấy dòng "Thiết bị này chưa xuất được video" thì đúng thiết kế; nếu không thấy thì thử xuất và báo lại kết quả (chạy được không, mất bao lâu).
5. Vào ⚙ → Brand kit: nhập @kênh, chọn logo, lưu; dựng lại và xem watermark.

**2026-11-16 · Phase 4 · trên máy dev**

Đã chạy và đạt:
- `npm test`: 143/143 (thêm `sw.test.js`: lưu sẵn app shell, ưu tiên mạng, mất mạng dùng bản đã lưu, không đụng `/api` và `/media`, không lưu response lỗi, dọn cache cũ; `extension.test.js`: chỉ mở URL cùng origin với endpoint).
- `node scripts/ui-check.mjs`: 65/65 (thêm: manifest và 4 icon tải được đúng kích thước, service worker hoạt động, cache không có `/api` hay `/media`, trang cài đặt có hướng dẫn cài app).

Tiêu chí ✅ của phase 4:
- "Cài được lên màn hình chính iPhone/Android": **chờ chủ dự án kiểm** (cần deploy lên HTTPS và thiết bị thật).
- "Object cũ hơn 7 ngày biến mất khỏi list": **đạt ở tầng app** (`store.test.js` "mục quá hạn bị ẩn…", `api.test.js` "GET :id … quá hạn → 404"). Rule lifecycle của R2 thì chủ dự án chạy lệnh trong README.

**Chưa kiểm được trên máy dev:**
- Extension chạy thật trong Chrome (mới kiểm phần logic bằng test và cú pháp).
- Mở app khi mất mạng trên điện thoại thật.

**Chờ chủ dự án kiểm (phase 4):**
1. Deploy theo `README.md`, chạy hai lệnh lifecycle.
2. Tải lại extension (bản 0.2.0), gửi một sản phẩm: tab trang sản phẩm trong app phải tự mở.
3. iPhone (Safari) và Android (Chrome): thêm vào màn hình chính, mở từ icon, nhập token, thấy danh sách.
4. Bật chế độ máy bay rồi mở app: vẫn hiện khung app và thông báo "Không kết nối được máy chủ".

**2026-11-16 · Phase 3 · trên máy dev**

Đã chạy và đạt:
- `npm test`: 132/132.
- `node scripts/ui-check.mjs`: 60/60 (thêm: sửa caption → tự lưu → tải lại trang vẫn còn; copy prompt thủ công; dán nội dung không có JSON → báo lỗi; dán JSON từ chat → gói đổi theo, đủ 6 hook).

Tiêu chí ✅ của phase 3 ("Với sản phẩm Cocoon mẫu: 6 hook đúng 6 công thức, không có từ 'trị', giá đúng 217K"):
- **Đạt với câu trả lời AI giả lập** (`generate.test.js` "normalize (tiêu chí phase 3)…", "generatePackage: LLM trả tốt…"): câu trả lời cố ý lộn thứ tự hook và có "trị mụn", "chữa", "100%" vẫn ra đúng 6 công thức, không còn chữ "trị", giữ 217K.
- **Chưa gọi Gemini thật lần nào** vì máy dev không có `LLM_API_KEY`. Chờ chủ dự án kiểm.

**Chờ chủ dự án kiểm (phase 3):**
1. Lấy key ở Google AI Studio, thêm `LLM_API_KEY=...` vào `.dev.vars` (local) hoặc `wrangler pages secret put LLM_API_KEY` (deploy).
2. Mở sản phẩm Cocoon, bấm "Tạo lại". Dòng nguồn phải ghi "Tạo bằng AI (gemini-3.8-flash)". Nếu ghi "Không gọi được AI (http 404)" thì tên model đã đổi: sửa `LLM_MODEL` trong `wrangler.toml`.
3. Đọc 6 hook: đúng 6 công thức, không có chữ "trị", giá 217K.
4. Chế độ thủ công: bấm "Copy prompt…", dán vào claude.ai, copy câu trả lời, dán vào ô, bấm "Dùng kết quả này".

**2026-11-16 · Phase 2 · trên máy dev**

Đã chạy và đạt:
- `npm test`: 110/110.
- `node scripts/ui-check.mjs`: 55/55 trên Chrome headless (375px và 1280px), chạy với `wrangler pages dev` thật: mở trang là tự có gói; 6 hook đúng thứ tự; copy lời hook, chữ ảnh bìa, prompt, caption + hashtag, cả gói (đọc lại clipboard để so); tab Thư viện mẫu 4/7 prompt; zip tải về mở được và có đủ file; Tạo lại hỏi xác nhận khi đã sửa; bấm hai lần chỉ một request; Clipboard API hỏng vẫn copy được.

Tiêu chí ✅ của phase 2:
- "Không cần LLM vẫn ra đủ gói": **đạt** (gói `source: "template"`, không gọi dịch vụ ngoài).
- "Copy caption+hashtag 1 chạm": **đạt** (nút ở thanh dính đáy).
- "Zip mở được trên Windows/iPhone": **chờ chủ dự án kiểm**. Trên máy dev zip mở được bằng `zipfile` của Python và có cờ tên UTF-8.

Năm điểm dễ hỏng trong kế hoạch và test đang ghim:
1. Sản phẩm thiếu dữ liệu → `generate.test.js` "sản phẩm thiếu dữ liệu…", "có giá nhưng không có % giảm".
2. Từ khẳng định điều trị → `generate.test.js` "tiêu đề có từ cấm…", "thực phẩm/sức khoẻ…".
3. Tên file có dấu trong zip → `zip.test.js` "zip mở được…", "cờ UTF-8…".
4. Không có Clipboard API / Web Share → ui-check "Clipboard API hỏng…"; nút Chia sẻ tự ẩn khi `canShareFiles()` sai (chưa có kiểm tra tự động cho trường hợp ẩn).
5. Tạo lại khi đã sửa, bấm hai lần → ui-check "Tạo lại khi đã sửa…", "bấm Tạo lại hai lần…".

**Chờ chủ dự án kiểm (phase 2):**
1. Trên điện thoại: mở một sản phẩm, bấm "Copy caption + hashtag", dán vào TikTok.
2. Bấm "⬇ Tải tất cả .zip", mở file trong app Tệp (iPhone) và trên Windows: tên `goi-dang-bai.txt` và nội dung tiếng Việt đúng dấu.
3. Bấm "↗ Chia sẻ" ở video và một ảnh: bảng chia sẻ hiện ra và gửi được sang TikTok.
4. Copy một prompt, dán vào Google Flow cùng Ảnh 1, xem clip ra có đúng sản phẩm không; nếu câu chữ mẫu cần chỉnh thì báo lại.

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

## Tồn đọng nhỏ từ phase 8 (chưa sửa)
- Đồng bộ theo kiểu "bản lưu sau cùng thắng": sửa cùng lúc trên hai máy thì bản lưu sau đè bản trước, không gộp.
- Dựng hàng loạt chỉ làm được với sản phẩm đã sắp clip trên chính thiết bị này; không tự ghép clip cho sản phẩm chưa sắp.
- Thiết lập chung của dựng hàng loạt chỉ bật/tắt các lớp và chọn kiểu phụ đề; không đổi nội dung chữ hay thứ tự đoạn.
- Ảnh bìa đã chèn làm đoạn đầu cũng là file trên thiết bị: sang máy khác phải làm lại ảnh bìa (bản `cover.png` trên kho vẫn còn).

## Tồn đọng nhỏ từ phase 7 (chưa sửa)
- Phụ đề lấy mốc theo timeline lúc tạo. Đổi thứ tự, cắt hay chèn đoạn sau đó thì chỉ có cảnh báo, chưa tự dời mốc.
- "Dùng lời thoại từ kịch bản" rải đều chữ theo thời lượng cả video, không biết clip nào nói câu nào.
- Nút "Tách" cắt ở giữa dòng, chưa chọn được vị trí cắt.
- Chưa chỉnh được màu, cỡ, vị trí phụ đề ngoài ba kiểu có sẵn.

## Tồn đọng nhỏ từ phase 6 (chưa sửa)
- Chọn frame làm nền ảnh bìa bằng thanh trượt và nút tiến/lùi từng frame; chưa có lưới thumbnail mỗi 0,5 giây như spec mục 9.6.
- Chưa đổi được màu chữ ảnh bìa (mới đổi được nội dung, cỡ, vị trí, bố cục).
- Thời điểm hiện của chữ hook/giá/CTA là cố định (3s đầu, 3s cuối, 2,5s cuối), chưa chỉnh được từng lớp.
- Vị trí các lớp chữ trên video là cố định; chỉ ảnh bìa mới kéo-thả được.
- Ảnh bìa không lưu lại bố cục để sửa tiếp: mở lại là làm mới.

## Tồn đọng nhỏ từ phase 5 (chưa sửa)
- Chưa có bước làm nét sau khi phóng 720p lên 1080p (spec mục 9.7 chế độ "Chuẩn"); hiện chỉ dùng nội suy chất lượng cao của canvas. Để dành cho phase 8.5 cùng Enhance AI.
- Xem trước dùng thẻ `<video>` nên có thể khựng nhẹ ở chỗ chuyển đoạn; bản xuất không bị.
- Chưa kiểm tự động: nút Huỷ khi đang xuất, kéo-thả đổi thứ tự bằng chuột (nút lên/xuống thì đã kiểm), chọn lại file cho đoạn thiếu clip.
- Giới hạn tải lên là 70MB (spec ghi 95MB) vì server phải đọc cả file vào RAM để kiểm chữ ký MP4.
- Trang dựng video chưa được thiết kế cho màn hình cảm ứng nhỏ (đúng thiết kế: dựng trên điện thoại là phụ).
- Chưa có review độc lập cho code phase 2–5.

## Tồn đọng nhỏ từ phase 3 (chưa sửa)
- Trường `persona` trong body generate (spec mục 5) chưa dùng.
- Hậu kiểm giá chỉ bắt dạng "199K"; giá viết kiểu "199.000đ" hoặc "199 nghìn" chưa bắt.

## Tồn đọng nhỏ từ phase 2 (chưa sửa)
- Tab "Thư viện mẫu" dựng prompt từ tiêu đề gốc trong trình duyệt, nên từ khẳng định công dụng trong tiêu đề (vd "đặc trị") chưa bị lọc ở tên sản phẩm trong prompt; tab "Đề xuất" thì đã lọc.
- Tone chỉ có tác dụng khi tạo bằng AI hoặc chế độ thủ công; gói dựng sẵn có một giọng.

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
- [ ] Phase 8.5: Enhance AI
