# Thư viện bên thứ ba (tự host, ghim phiên bản)

Theo luật 2 trong `docs/RULES.md`: chỉ dùng trong `public/editor/`, không lõi GPL.

| Thư viện | Phiên bản | Giấy phép | File | Nguồn |
|---|---|---|---|---|
| Mediabunny | 1.66.0 | MPL-2.0 | `mediabunny-1.66.0.min.mjs` | gói npm `mediabunny`, file `dist/bundles/mediabunny.min.mjs`, không sửa |
| Konva | 10.9.1 | MIT | `konva-10.9.1.min.js` | gói npm `konva`, file `konva.min.js`, không sửa. Chỉ tải khi mở trình làm ảnh bìa |
| WebSR | 0.1.1 | MIT | `websr-0.1.1.js` (giấy phép: `websr-LICENSE.txt`) | gói npm `@websr/websr`, file `dist/websr.js` (bản UMD), không sửa. Chỉ tải khi xuất ở chế độ Enhance AI |
| Trọng số WebSR `websr/cnn-m` | v0.1.0 | MIT (cùng repo WebSR) | `weights/websr-cnn-m-v0.1.0.bin` (125KB) | repo `github.com/sb2702/websr`, tag `v0.1.0`, file `weights/websr/cnn-m.bin`. sha256 `f5d1c334dd486640c562fc6390cb89a6258f1c057d58fd8d56c36d18ac1c3cf1`, khớp bảng trong tài liệu WebSR |
| Be Vietnam Pro | 5.3.0 (Fontsource) | OFL-1.1 | `public/fonts/be-vietnam-pro-*.woff2` (nặng 600 và 800; latin, latin-ext, vietnamese) | gói npm `@fontsource/be-vietnam-pro`, thư mục `files/` |

Nâng phiên bản: `npm pack mediabunny@<bản mới>`, chép file bundle vào đây với tên có số phiên bản, sửa đường dẫn import trong `public/editor/render-worker.js`, chạy lại `npm test` và `node scripts/ui-check.mjs`.

WebSR: đường dẫn thư viện, trọng số và tên mạng nằm ở đầu `public/editor/enhance.js`. Trọng số không nằm trong gói npm; tải từ repo theo tag rồi so sha256 với tài liệu WebSR trước khi chép vào. Đổi file trọng số thì đổi luôn tên file (trình duyệt giữ bản cũ trong Cache Storage `as-models-v1` theo đường dẫn).
