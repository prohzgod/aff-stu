// Chuyển gói đăng bài thành văn bản thuần: dùng cho nút copy và file goi-dang-bai.txt trong zip.

import { formatPrice, formatCount } from "./format.js";

const str = (v) => (v == null ? "" : String(v).trim());
const list = (v) => (Array.isArray(v) ? v : []);

export function captionWithHashtags(pkg) {
  const caption = str(pkg?.caption);
  const tags = list(pkg?.hashtags).map(str).filter(Boolean).join(" ");
  return [caption, tags].filter(Boolean).join("\n\n");
}

export function scriptToText(pkg) {
  return list(pkg?.script)
    .map((beat) => [
      `[${str(beat?.time)}]`,
      str(beat?.visual) && `Hình: ${str(beat.visual)}`,
      str(beat?.voiceover) && `Lời: ${str(beat.voiceover)}`,
      str(beat?.onScreen) && `Chữ: ${str(beat.onScreen)}`,
    ].filter(Boolean).join("\n"))
    .join("\n\n");
}

export function slug(text) {
  const s = str(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return s || "san-pham";
}

function productText(product) {
  const price = product?.price || {};
  const current = formatPrice(price.current);
  const original = price.original && price.original !== price.current ? formatPrice(price.original) : "";
  return [
    str(product?.title),
    current && `Giá: ${current}${original ? ` (giá gốc ${original})` : ""}${str(price.discount) ? ` ${str(price.discount)}` : ""}`,
    str(product?.shopName) && `Shop: ${str(product.shopName)}`,
    typeof product?.soldCount === "number" && `Đã bán: ${formatCount(product.soldCount)}`,
    product?.rating ? `Đánh giá: ${product.rating}` : "",
    str(product?.url) && `Link: ${str(product.url)}`,
  ].filter(Boolean).join("\n");
}

export function packageToText(product, pkg) {
  const sections = [
    ["SẢN PHẨM", productText(product)],
    ["HOOK", list(pkg?.hooks).map((h, i) => [
      `${i + 1}. ${str(h?.formula)}`,
      str(h?.spoken) && `   Lời: ${str(h.spoken)}`,
      str(h?.onScreen) && `   Chữ: ${str(h.onScreen)}`,
    ].filter(Boolean).join("\n")).join("\n")],
    ["CHỮ ẢNH BÌA", list(pkg?.coverTexts).map(str).filter(Boolean).map((t) => `- ${t}`).join("\n")],
    ["PROMPT GOOGLE FLOW", list(pkg?.videoPrompts).map((p, i) => [
      `${i + 1}. ${str(p?.name)}${str(p?.flowMode) ? ` (${str(p.flowMode)})` : ""}`,
      str(p?.ingredients) && `Ảnh nên đưa vào: ${str(p.ingredients)}`,
      str(p?.prompt),
    ].filter(Boolean).join("\n")).join("\n\n")],
    ["KỊCH BẢN", scriptToText(pkg)],
    ["CAPTION", str(pkg?.caption)],
    ["HASHTAG", list(pkg?.hashtags).map(str).filter(Boolean).join(" ")],
    ["BÌNH LUẬN GHIM", str(pkg?.pinnedComment)],
    ["LƯU Ý", list(pkg?.warnings).map(str).filter(Boolean).map((w) => `- ${w}`).join("\n")],
  ];
  return sections
    .filter(([, body]) => body)
    .map(([title, body]) => `== ${title} ==\n${body}`)
    .join("\n\n")
    .replace(/\r?\n/g, "\r\n"); // CRLF để Notepad cũ trên Windows xuống dòng đúng
}
