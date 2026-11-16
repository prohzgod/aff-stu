// Hàm này được inject vào trang sản phẩm (chạy trong context của trang).
// Phải tự chứa hoàn toàn: không dùng biến bên ngoài.
// Cấu trúc đã kiểm tra trên shop.tiktok.com/vn/pdp/... (11/2026):
//   <script id="__MODERN_ROUTER_DATA__" type="application/json">
//   loaderData["(region)/pdp/(product_name_slug$)/(product_id)/page"]
//     .page_config.components_map[*] với component_name = "product_info"
//       .component_data.product_info  → title, price, images, skus, desc_blocks, header_video...
//       .component_data.shop_info     → shop_name
// eslint-disable-next-line no-unused-vars
function extractTikTokShopProduct() {
  const urlId = (location.href.match(/(\d{18,20})/) || [])[1] || null;

  const fail = (reason) => ({ ok: false, reason, url: location.href });

  const el = document.getElementById("__MODERN_ROUTER_DATA__");
  if (!el) return fail("Không thấy __MODERN_ROUTER_DATA__. Trang chưa tải xong, bị captcha, hoặc không phải trang sản phẩm.");

  let data;
  try { data = JSON.parse(el.textContent); } catch (e) { return fail("Không parse được JSON của trang."); }

  const page = Object.values(data.loaderData || {}).find((v) => v && v.page_config);
  if (!page) return fail("Không thấy page_config trong loaderData.");

  const comps = Object.values(page.page_config.components_map || {});
  const infoComp = comps.find((c) => c?.component_data?.product_info?.title);
  if (!infoComp) return fail("Không thấy khối product_info.");

  const cd = infoComp.component_data;
  const pi = cd.product_info;

  // TikTok là SPA: nếu bạn bấm sang sản phẩm khác mà không tải lại trang,
  // JSON nhúng vẫn là của sản phẩm cũ.
  if (urlId && pi.product_id && String(pi.product_id) !== urlId) {
    return fail("Dữ liệu trên trang là của sản phẩm khác (do chuyển trang trong app). Hãy bấm F5 rồi thử lại.");
  }

  // Ảnh: url_list mặc định là webp 800x800. Đổi template sang ảnh gốc (thường lớn hơn, ví dụ 1042x1042).
  const images = (pi.images || []).map((img) => {
    const first = (img.url_list || [])[0] || "";
    let origin = first;
    try {
      const u = new URL(first);
      if (img.uri) origin = `${u.origin}/${img.uri}~tplv-aphluv4xwc-origin-jpeg.jpeg`;
    } catch (_) { /* giữ nguyên */ }
    return { original: origin, preview: first, width: img.width, height: img.height };
  });

  const pickVideo = (v) => {
    if (!v || !Array.isArray(v.video_infos) || !v.video_infos.length) return null;
    const best = [...v.video_infos].sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
    return {
      url: best.main_url || best.backup_url,
      backupUrl: best.backup_url || null,
      width: best.width,
      height: best.height,
      duration: v.duration,
      expiresAt: best.url_expire ? new Date(Number(best.url_expire) * 1000).toISOString() : null,
    };
  };

  const descText = (pi.desc_blocks || [])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join("\n");
  const descImages = (pi.desc_blocks || [])
    .filter((b) => b.type === "image")
    .map((b) => b.image?.url_list?.[0])
    .filter(Boolean);

  const price = pi.price || {};
  const toNumber = (s) => (s ? Number(String(s).replace(/[^\d]/g, "")) || null : null);

  const skus = (pi.skus || []).map((s) => ({
    skuId: s.sku_id,
    stock: s.stock,
    price: toNumber(s.price?.sale_price_format),
    originalPrice: toNumber(s.price?.origin_price_format),
    props: (s.sku_sale_props || []).map((p) => p.prop_value || p.value_name || p.prop_value_id).join(" / "),
  }));

  const region = (location.pathname.match(/^\/([a-z]{2})\//) || [])[1] || null;

  return {
    ok: true,
    platform: "tiktokshop",
    region,
    productId: String(pi.product_id),
    url: `https://shop.tiktok.com/${region || "vn"}/pdp/${pi.product_id}`,
    title: pi.title,
    price: {
      current: toNumber(price.real_price),
      original: toNumber(price.original_price),
      discount: price.discount || null,
      currency: price.currency || "VND",
      display: price.real_price || null,
    },
    soldCount: Number(pi.sold_count) || null,
    rating: pi.review?.product_rating ?? null,
    reviewCount: Number(pi.review?.review_count) || null,
    shopName: cd.shop_info?.shop_name || pi.seller?.name || null,
    images,
    videos: {
      header: pickVideo(pi.header_video),
      description: pickVideo(pi.desc_video),
    },
    description: descText,
    descriptionImages: descImages,
    specifications: (pi.specifications || []).map((s) => ({ name: s.name, value: s.value })),
    skus,
    grabbedAt: new Date().toISOString(),
  };
}
