# Thư viện bên thứ ba (tự host, ghim phiên bản)

Theo luật 2 trong `docs/RULES.md`: chỉ dùng trong `public/editor/`, không lõi GPL.

| Thư viện | Phiên bản | Giấy phép | File | Nguồn |
|---|---|---|---|---|
| Mediabunny | 1.66.0 | MPL-2.0 | `mediabunny-1.66.0.min.mjs` | gói npm `mediabunny`, file `dist/bundles/mediabunny.min.mjs`, không sửa |

Nâng phiên bản: `npm pack mediabunny@<bản mới>`, chép file bundle vào đây với tên có số phiên bản, sửa đường dẫn import trong `public/editor/render-worker.js`, chạy lại `npm test` và `node scripts/ui-check.mjs`.
