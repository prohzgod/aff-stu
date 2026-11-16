# Product Grabber – TikTok Shop VN (Chrome extension)

Lấy dữ liệu từ trang sản phẩm TikTok Shop **bạn đang mở**: tên, giá, % giảm, đã bán, rating, shop, ảnh gốc (~1042px thay vì 800px webp), video sản phẩm 720x1280, mô tả, thông số, SKU.

## Cài đặt
1. Giải nén thư mục `product-grabber`.
2. Mở `chrome://extensions` → bật **Developer mode** (góc phải trên).
3. Bấm **Load unpacked** → chọn thư mục `product-grabber`.
4. Ghim icon extension lên thanh công cụ.

## Sử dụng
1. Mở trang sản phẩm dạng `https://shop.tiktok.com/vn/pdp/.../<id>`.
2. Bấm icon → popup hiện thông tin + lưới ảnh (bấm ảnh để bỏ chọn).
3. **Tải ảnh + video** → lưu vào `Downloads/tiktokshop/<productId>/` (img_01.jpg…, video_header.mp4, product.json).
4. **Copy JSON** → dán vào tool khác.
5. **Gửi sang app** → bấm ⚙, nhập Endpoint `https://<tên-app>.pages.dev/api/products` và Authorization `Bearer <APP_TOKEN>` (gõ cả chữ `Bearer `). Extension POST JSON sản phẩm tới Affiliate Studio rồi mở thẳng trang sản phẩm trong app. Endpoint khác (Supabase, n8n…) vẫn dùng được; khi đó extension chỉ báo "Đã gửi sang app".

## Lưu ý
- Nếu bạn bấm sang sản phẩm khác **trong** trang TikTok (không tải lại), dữ liệu nhúng vẫn là của sản phẩm cũ → extension sẽ báo, bấm F5 rồi thử lại.
- Link video có hạn (popup hiện giờ hết hạn) → tải ngay, đừng lưu link để dùng sau.
- Link rút gọn `vt.tiktok.com` / `tiktok.com/view/product/<id>`: mở link, nếu nó chuyển về `shop.tiktok.com/vn/pdp/...` thì dùng bình thường.
- Dữ liệu đọc từ `<script id="__MODERN_ROUTER_DATA__">` (cấu trúc kiểm tra 16/11/2026). Khi TikTok đổi cấu trúc, chỉ cần sửa `extractor.js`.

## Cấu trúc
- `manifest.json` – khai báo MV3, quyền.
- `extractor.js` – hàm `extractTikTokShopProduct()` được inject vào trang, trả JSON chuẩn hoá.
- `popup.html / popup.css / popup.js` – giao diện, tải file, gửi sang app.
- `send.js` – xử lý kết quả gửi: mở tab trang sản phẩm (chỉ khi cùng origin với endpoint), thông báo lỗi.

## JSON đầu ra (rút gọn)
```json
{
  "platform": "tiktokshop", "region": "vn", "productId": "1736…",
  "title": "COMBO Tinh chất bí đao N7…",
  "price": { "current": 216749, "original": 377952, "discount": "-43%", "currency": "VND" },
  "soldCount": 229096, "rating": 4.7, "reviewCount": 321, "shopName": "Cocoon Vietnam",
  "images": [{ "original": "https://…origin-jpeg.jpeg", "preview": "https://…webp", "width": 800, "height": 800 }],
  "videos": { "header": { "url": "https://…", "width": 720, "height": 1280, "duration": 19.9, "expiresAt": "…" } },
  "description": "THÔNG TIN SẢN PHẨM: …",
  "specifications": [{ "name": "Benefit", "value": "Kiểm soát dầu,Chăm sóc da mụn" }],
  "skus": [{ "skuId": "…", "stock": 337, "price": 216749, "originalPrice": 377952, "props": "Mặc định" }]
}
```
