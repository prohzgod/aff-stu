// Đọc/ghi sản phẩm và chỉ mục trên R2. Mọi hàm nhận bucket qua tham số.

import { productKey, isExpired, expiresAt } from "./util.js";

const TITLE_MAX = 80; // ký tự, trước khi encode: giữ customMetadata dưới giới hạn 2KB của R2
const THUMB_MAX = 600;

async function readJson(bucket, key) {
  const obj = await bucket.get(key);
  return obj ? obj.json() : null;
}

async function listAll(bucket, options) {
  const objects = [];
  let cursor;
  do {
    const page = await bucket.list({ ...options, cursor });
    objects.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return objects;
}

function indexMetadata(product, { hasPackage = false, hasFinal = false } = {}) {
  const thumb = typeof product.thumb === "string" && product.thumb.length <= THUMB_MAX ? product.thumb : "";
  return {
    id: product.id,
    title: encodeURIComponent(Array.from(String(product.title ?? "")).slice(0, TITLE_MAX).join("")),
    price: String(product.price?.current ?? ""),
    platform: String(product.platform ?? "").slice(0, 40),
    thumb,
    createdAt: product.createdAt,
    hasPackage: hasPackage ? "1" : "0",
    hasFinal: hasFinal ? "1" : "0",
  };
}

export async function saveProduct(bucket, product) {
  await bucket.put(productKey(product.id, "product.json"), JSON.stringify(product), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  await bucket.put(product.indexKey, "", { customMetadata: indexMetadata(product) });
}

// Ghi lại object chỉ mục với cờ suy từ chính các file đang có (R2 không sửa metadata tại chỗ được).
// Suy từ file thật nên cờ hasPackage và hasFinal không bao giờ ghi đè nhau.
async function refreshIndex(bucket, product) {
  const [pkg, final] = await Promise.all([
    bucket.head(productKey(product.id, "package.json")),
    bucket.head(productKey(product.id, "final.mp4")),
  ]);
  await bucket.put(product.indexKey, "", {
    customMetadata: indexMetadata(product, { hasPackage: Boolean(pkg), hasFinal: Boolean(final) }),
  });
}

export async function savePackage(bucket, product, pkg) {
  await bucket.put(productKey(product.id, "package.json"), JSON.stringify(pkg), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  await refreshIndex(bucket, product);
}

// File thành phẩm của Hậu kỳ mà server nhận: tên file → content-type.
export const UPLOADS = { "final.mp4": "video/mp4", "cover.png": "image/png" };

export async function saveUpload(bucket, product, name, body) {
  const obj = await bucket.put(productKey(product.id, name), body, {
    httpMetadata: { contentType: UPLOADS[name] },
    customMetadata: { uploadedAt: new Date().toISOString() },
  });
  await refreshIndex(bucket, product);
  return obj;
}

// Thông tin một file thành phẩm, hoặc null nếu chưa có.
export async function getUpload(bucket, id, name) {
  const key = productKey(id, name);
  const head = await bucket.head(key);
  if (!head) return null;
  return { url: `/media/${key}`, size: head.size, uploadedAt: head.customMetadata?.uploadedAt || null };
}

export function getProduct(bucket, id) {
  return readJson(bucket, productKey(id, "product.json"));
}

export function getPackage(bucket, id) {
  return readJson(bucket, productKey(id, "package.json"));
}

export async function listProducts(bucket, days, now = Date.now()) {
  const objects = await listAll(bucket, { prefix: "i/", include: ["customMetadata"] });
  const items = [];
  for (const { customMetadata: m } of objects) {
    if (!m?.id || isExpired(m.createdAt, days, now)) continue;
    let title = m.title || "";
    try { title = decodeURIComponent(title); } catch { /* giữ nguyên chuỗi đã encode */ }
    items.push({
      id: m.id,
      title,
      price: m.price === "" || m.price == null ? null : Number(m.price),
      thumb: m.thumb || "",
      createdAt: m.createdAt,
      expiresAt: expiresAt(m.createdAt, days),
      hasPackage: m.hasPackage === "1",
      hasFinal: m.hasFinal === "1",
    });
  }
  return items;
}

export async function deleteProduct(bucket, id) {
  const product = await getProduct(bucket, id);
  if (!product) return false;
  const objects = await listAll(bucket, { prefix: productKey(id, "") });
  const keys = objects.map((o) => o.key);
  if (product.indexKey) keys.push(product.indexKey);
  for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000));
  return true;
}
