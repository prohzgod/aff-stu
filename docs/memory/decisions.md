# Quyết định

Mới nhất ở trên. Mỗi mục: quyết định, lý do. Thứ đã có trong `docs/spec/` thì không chép lại ở đây.

## 2026-11-16 · Phase 8: các quyết định khi dựng
- **Dựng hàng loạt làm theo cách hiểu của người dựng,** vì chủ dự án bảo chạy hết các phase không dừng hỏi: lô gồm các sản phẩm đã có dự án dựng trên thiết bị; "cùng một template" nghĩa là một bộ bật/tắt lớp và kiểu phụ đề áp cho cả lô, còn nội dung chữ và thứ tự đoạn là của từng sản phẩm. Cần chủ dự án xác nhận khi dùng thật.
- **Đồng bộ `edit.json`:** trình dựng lưu ngay vào `localStorage` kèm `updatedAt` và cờ `dirty`, rồi PUT sau 1,5 giây ngừng sửa. Khi mở: bản nào có `updatedAt` mới hơn thì dùng; bản trên máy còn `dirty` thì gửi lại.
- **Server lọc `edit.json`:** chỉ giữ các trường đã biết, `r2Key` chỉ được trỏ vào `p/{id}/` của chính sản phẩm đó.
- **`createWorker` tách ra `public/editor/worker-client.js`,** `project.js` chuẩn bị dự án để xuất mà không cần mở trình dựng; cả hai dùng chung cho trình dựng và dựng hàng loạt.

## 2026-11-16 · Phase 7: các quyết định khi dựng
- **Groq:** endpoint `POST https://api.groq.com/openai/v1/audio/transcriptions`, multipart, `response_format=verbose_json`, `timestamp_granularities[]=word` và `segment`. Model mặc định `whisper-large-v3` (tài liệu Groq khuyên cho đa ngôn ngữ cần chính xác); đổi bằng `GROQ_MODEL`. Giới hạn free: file 25MB; 10 phút WAV 16kHz mono là 19MB nên nằm gọn. Tài liệu không cho ví dụ về mảng `words`, nên code nhận cả `word` lẫn `text`, và nếu không có mốc từng từ thì chia đều từ trong mỗi đoạn.
- **LLM chỉ được sửa chữ, không được đổi số từ.** `applyCorrections` bỏ kết quả nếu số từ lệch. Dùng chung `callLlm` của phần sinh gói.
- **Vị trí phụ đề:** mép dưới ở y = 1140, tối đa 2 dòng, phía trên sticker giá và CTA (spec ghi y 1100–1350, đã sửa spec). Lý do: ba lớp cùng hiện ở 3 giây cuối.
- **Phụ đề không hiện trên đoạn ảnh bìa.**
- **Đổi kiểu thì chia lại dòng** từ danh sách từ (karaoke 3 từ mỗi dòng, hai kiểu kia tối đa 7 từ hoặc 34 ký tự); chữ đã sửa nằm trong từng từ nên không mất.
- **`subs.srt`** tối đa 1MB, server kiểm là văn bản UTF-8 bắt đầu bằng một khối SRT; `/media` trả nó dưới dạng file tải về.
- **Brand kit** có thêm `subtitleStyle` (mặc định `karaoke`).

## 2026-11-16 · Phase 6: các quyết định khi dựng
- **Lớp chữ có vị trí và thời điểm cố định:** hook ở trên (3 giây đầu), sticker giá phía trên CTA (3 giây cuối), CTA sát mép dưới vùng an toàn (2,5 giây cuối). Chữ dài thì tự thu cỡ rồi xuống dòng, quá dài thì cắt kèm dấu ba chấm. Phụ đề (phase 7) sẽ nằm phía trên sticker giá.
- **Đoạn ảnh bìa không bị phủ chữ hay watermark** (nó đã có chữ riêng). Mỗi video chỉ có một đoạn ảnh bìa.
- **`priceK` chuyển về `public/lib/format.js`** để trình duyệt và server dùng chung một bản; `lib/generate.js` import lại.
- **Konva chỉ tải khi mở trình làm ảnh bìa** (thẻ script chèn lúc cần), không nằm trong lần tải đầu của trình dựng.
- **Lớp UI TikTok giả chỉ vẽ lên bản xem trước,** không đi vào hàm `composeFrame`, nên không thể lọt vào file xuất.
- **Server nhận `cover.png` tối đa 8MB,** kiểm chữ ký PNG. `lib/store.js` có bảng `UPLOADS` (tên file → content-type) dùng chung cho mọi file thành phẩm.

## 2026-11-16 · Phase 5: các quyết định khi dựng
- **Bản thử kỹ thuật không nằm trong repo.** Làm trong thư mục nháp với clip thật, rồi dựng thẳng phần thật; trang dựng video chính là thứ để chủ dự án thử trên điện thoại. Kết quả bản thử: 7s video trong 2,3s, đúng số frame.
- **Tiếng dài hơn hình khoảng 0,03s** ở cuối file do bộ mã hoá AAC đệm thêm. Không phải trôi: vị trí mẫu suy từ vị trí frame. Kiểm tra tự động cho phép lệch dưới 0,06s.
- **Cờ chỉ mục suy từ file thật.** `refreshIndex` trong `lib/store.js` đặt `hasPackage`/`hasFinal` theo việc `package.json`/`final.mp4` có tồn tại, nên hai cờ không ghi đè nhau.
- **Upload `final.mp4` tối đa 70MB** và phải có chữ ký MP4 (`ftyp`). Spec ghi 95MB; hạ xuống vì server đọc cả file vào RAM để kiểm chữ ký, và video 60s ở 8 Mbps chỉ khoảng 62MB.
- **Logo brand kit** là PNG nhúng trong `cfg/brandkit.json` (data URL, khoảng 300KB), không nhận SVG hay link ngoài. Trình duyệt thu ảnh về cạnh dài 512px trước khi gửi.
- **Trạng thái dựng lưu trên thiết bị:** danh sách đoạn ở `localStorage["edit:{id}"]`, file clip ở IndexedDB (`public/editor/local-clips.js`), tự dọn sau 7 ngày. `edit.json` trên server là việc của phase 8.
- **Đoạn lấy từ kho** (ảnh/video sản phẩm) không lưu vào IndexedDB; khi mở lại thì tải lại từ `/media`.
- **Bitrate:** hình 8 Mbps, tiếng 160 kbps, keyframe mỗi 2 giây.

## 2026-11-16 · Thiết kế Hậu kỳ đã duyệt; luật 2 đã sửa
Chủ dự án duyệt `docs/superpowers/specs/2026-11-16-hau-ky-design.md` và bảo dựng phase 5. Laptop là máy dựng chính; Android và iPhone phải xem, tải, chia sẻ thành phẩm trọn vẹn; dựng trên điện thoại là phụ. Luật 2 trong `docs/RULES.md` đã sửa để cho phép thư viện tự host trong `public/editor/vendor/`. Ba chỗ lệch spec mục 9 (tiếng mã hoá lại, bỏ WebM, upload thành phẩm ở phase 5) đã được chép vào `docs/spec/`.

## 2026-11-16 · Clip Flow thật và Mediabunny (ghi nhận trước khi dựng phase 5)
Clip mẫu của chủ dự án nằm ở `example-input/` (đã git-ignore): 720x1280, H.264 + AAC stereo 128kbps, **10 giây** (không phải 8 như spec giả định), khoảng 2,8 Mbps, 3,6MB. Chưa đọc được fps.
Mediabunny bản mới nhất lúc tra là **1.66.0**, giấy phép MPL-2.0, file dùng cho trình duyệt là `dist/bundles/mediabunny.min.mjs` (khoảng 757KB). Các lớp đã xác nhận có trong bản này: `Input`, `BlobSource`, `ALL_FORMATS`, `VideoSampleSink` (`samplesAtTimestamps`), `AudioBufferSink` (`buffers`), `Output`, `Mp4OutputFormat`, `BufferTarget`, `CanvasSource` (`add(timestamp, duration)`), `AudioBufferSource` (`add(AudioBuffer)`), `AudioSampleSource`, `canEncodeVideo`, `canEncodeAudio`, `QUALITY_HIGH`. Chưa chạy thử dòng code nào với nó.

## 2026-11-16 · Service worker: thêm file vào app thì thêm vào `SHELL`
`public/sw.js` lưu sẵn danh sách `SHELL` viết tay (không có build step để sinh tự động). `test/sw.test.js` kiểm mọi `import` của các module chính đều nằm trong danh sách và mọi file trong danh sách đều tồn tại. Đổi cách cache thì tăng số trong `CACHE` để bản cũ bị dọn.

## 2026-11-16 · Extension chỉ mở URL cùng origin với endpoint
Sau khi gửi, extension mở `url` do server trả về, nhưng chỉ khi nó cùng origin với endpoint đã cấu hình (`product-grabber/send.js`). Lý do: endpoint là thứ người dùng tự nhập, một endpoint lạ không được phép bắt extension mở trang tuỳ ý. Endpoint không trả `url` (webhook khác) thì extension chạy như cũ.

## 2026-11-16 · Icon app: khung video dọc, không dùng tam giác play trên nền đỏ
Bản đầu (nền đỏ, tam giác play trắng) quá giống logo YouTube. Icon hiện tại là khung 9:16 trắng trên nền màu nhấn, vẽ bằng `scripts/make-icons.mjs`.

## 2026-11-16 · Model mặc định: `gemini-3.8-flash`
Tra trang pricing của Gemini API ngày 16/11/2026: `gemini-3.8-flash` (Flash mới nhất, không gắn nhãn preview) và `gemini-3.5-flash-lite` đều "Free of charge"; trang không công bố RPM/RPD cho free tier. Chọn 3.8-flash vì cần câu chữ tiếng Việt tự nhiên; nếu hay gặp 429 thì đổi `LLM_MODEL` sang `gemini-3.5-flash-lite`. Trang OpenAI-compatible không nói rõ có nhận `response_format: json_object` không, nên `callLlm` gặp 400 thì thử lại một lần không kèm nó.

## 2026-11-16 · Chữ "trị" đứng riêng cũng bị bỏ khỏi gói
Tiêu chí phase 3 đòi không có từ "trị". `FORBIDDEN` trong `lib/generate.js` nay gồm cả "trị" đứng riêng ("trị mụn", "trị thâm") và "điều trị", trừ "giá trị". Áp dụng cho gói dựng sẵn, kết quả AI và nội dung dán ở chế độ thủ công. Phần người dùng tự sửa trong ô caption/hashtag/bình luận ghim được lưu nguyên văn, không lọc.

## 2026-11-16 · Chế độ thủ công đi qua server
Thêm `GET /api/products/:id/generate` trả prompt (đã ghi vào spec mục 5) và `PUT /api/products/:id/package` nhận `{raw}`. Lý do: phần dựng prompt và `normalize()` nằm ở `lib/generate.js` phía server, trình duyệt không import được và không nên có hai bản.

## 2026-11-16 · Hậu kiểm giá trong nội dung được tạo
`normalize()` thêm cảnh báo khi nội dung có số dạng "199K" không khớp giá hiện tại, giá gốc hay số đã bán của sản phẩm. Không tự sửa số, chỉ cảnh báo.

## 2026-11-16 · Phase 2: tự lưu gói để phase 3 (đã làm ở phase 3)
`PUT /api/products/:id/package` và tự lưu (debounce) thuộc phase 3 theo spec mục 11. Ở phase 2 các ô caption/hashtag/bình luận ghim sửa được, dùng cho copy và zip, nhưng mất khi tải lại trang.

## 2026-11-16 · Gói dựng sẵn: cách viết để không bịa
`lib/generate.js` chỉ dùng tiêu đề, giá, % giảm, số đã bán (từ 100 trở lên), rating, tên shop và thông số đầu tiên. Từ khớp `FORBIDDEN` bị bỏ khỏi tiêu đề/mô tả trước khi dựng. "Nỗi đau" theo ngành viết trung tính, không gán công dụng. Khi chưa chọn hook, mẫu có người nói dùng câu "Mọi người xem thử <tên> nè".

## 2026-11-16 · `h()` và `toast()` chuyển sang `public/lib/dom.js`
Để `public/app.js` và `public/views/package.js` cùng dùng. Phần gói đăng bài nằm ở `public/views/package.js`.

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
