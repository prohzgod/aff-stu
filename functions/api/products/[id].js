// GET /api/products/:id: chi tiết. DELETE: xoá sản phẩm và mọi file của nó.
import { json, isValidId, isExpired, expiresAt, retentionDays } from "../../../lib/util.js";
import { getProduct, getPackage, getUpload, deleteProduct } from "../../../lib/store.js";

const notFound = () => json({ error: "Không tìm thấy sản phẩm" }, 404);

export async function onRequestGet({ env, params }) {
  const { id } = params;
  if (!isValidId(id)) return notFound();
  const days = retentionDays(env);
  const product = await getProduct(env.BUCKET, id);
  if (!product || isExpired(product.createdAt, days)) return notFound();
  return json({
    product,
    package: await getPackage(env.BUCKET, id),
    final: await getUpload(env.BUCKET, id, "final.mp4"),
    cover: await getUpload(env.BUCKET, id, "cover.png"),
    expiresAt: expiresAt(product.createdAt, days),
  });
}

export async function onRequestDelete({ env, params }) {
  const { id } = params;
  if (!isValidId(id)) return notFound();
  return (await deleteProduct(env.BUCKET, id)) ? json({ ok: true }) : notFound();
}
