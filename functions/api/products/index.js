// GET /api/products: danh sách. POST /api/products: nhận sản phẩm từ extension.
import { json, newId, indexKey, retentionDays } from "../../../lib/util.js";
import { saveProduct, listProducts } from "../../../lib/store.js";
import { mirrorMedia } from "../../../lib/mirror.js";

const MAX_BODY = 1024 * 1024; // ký tự JSON; sản phẩm thật chỉ vài chục KB

export async function onRequestGet({ env }) {
  return json({ items: await listProducts(env.BUCKET, retentionDays(env)) });
}

function pickThumb(images) {
  const stored = images.find((im) => im.stored);
  if (stored) return `/media/${stored.stored}`;
  const first = images[0] || {};
  return [first.preview, first.original].find((u) => typeof u === "string" && /^https:\/\//i.test(u)) || "";
}

export async function onRequestPost({ request, env }) {
  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: "Dữ liệu quá lớn" }, 413);

  let input;
  try {
    input = JSON.parse(text);
  } catch {
    return json({ error: "JSON không hợp lệ" }, 400);
  }
  const valid =
    input && typeof input === "object" && !Array.isArray(input) &&
    typeof input.title === "string" && input.title.trim() !== "" &&
    Array.isArray(input.images) && input.images.length > 0;
  if (!valid) return json({ error: "Thiếu title hoặc images" }, 400);

  const id = newId();
  const createdMs = Date.now();
  const { images, videos, mirrored } = await mirrorMedia(env.BUCKET, id, input, (...args) => fetch(...args));

  const product = {
    ...input,
    id,
    createdAt: new Date(createdMs).toISOString(),
    indexKey: indexKey(createdMs, id),
    images,
    videos,
    thumb: pickThumb(images),
  };
  await saveProduct(env.BUCKET, product);

  const url = `${new URL(request.url).origin}/#/p/${id}`;
  return json({ id, url, mirrored, videos }, 201);
}
