# Thư viện bên thứ ba (tự host, ghim phiên bản)

Theo luật 2 trong `docs/RULES.md`: chỉ dùng trong `public/editor/`, không lõi GPL.

| Thư viện | Phiên bản | Giấy phép | File | Nguồn |
|---|---|---|---|---|
| Mediabunny | 1.66.0 | MPL-2.0 | `mediabunny-1.66.0.min.mjs` | gói npm `mediabunny`, file `dist/bundles/mediabunny.min.mjs`, không sửa |
| Konva | 10.9.1 | MIT | `konva-10.9.1.min.js` | gói npm `konva`, file `konva.min.js`, không sửa. Chỉ tải khi mở trình làm ảnh bìa |
| Be Vietnam Pro | 5.3.0 (Fontsource) | OFL-1.1 | `public/fonts/be-vietnam-pro-*.woff2` (nặng 600 và 800; latin, latin-ext, vietnamese) | gói npm `@fontsource/be-vietnam-pro`, thư mục `files/` |

Nâng phiên bản: `npm pack mediabunny@<bản mới>`, chép file bundle vào đây với tên có số phiên bản, sửa đường dẫn import trong `public/editor/render-worker.js`, chạy lại `npm test` và `node scripts/ui-check.mjs`.
