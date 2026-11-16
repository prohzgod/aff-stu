// PUT /api/products/:id/package
//   { caption?, hashtags?, pinnedComment? } → lưu phần người dùng sửa tay (giữ nguyên văn) + editedAt
//   { raw }                                 → nội dung dán từ chat AI: đọc lỏng, chuẩn hoá, lưu với source "manual"
import { json, isValidId, isExpired, retentionDays } from "../../../../lib/util.js";
import { getProduct, getPackage, savePackage } from "../../../../lib/store.js";
import { parseLoose, normalize } from "../../../../lib/generate.js";

const MAX_RAW = 200000;
const MAX_CAPTION = 5000;
const MAX_PINNED = 1000;
const MAX_TAGS = 30;
const bad = (error, status = 400) => json({ error }, status);

export async function onRequestPut({ request, env, params }) {
  const { id } = params;
  const notFound = () => json({ error: "Không tìm thấy sản phẩm" }, 404);
  if (!isValidId(id)) return notFound();

  const rawBody = await request.text();
  if (rawBody.length > MAX_RAW + 1000) return bad("Dữ liệu quá lớn", 413);
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return bad("JSON không hợp lệ");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return bad("JSON không hợp lệ");

  const product = await getProduct(env.BUCKET, id);
  if (!product || isExpired(product.createdAt, retentionDays(env))) return notFound();

  if ("raw" in body) {
    if (typeof body.raw !== "string") return bad("Không đọc được JSON trong nội dung đã dán");
    const parsed = parseLoose(body.raw);
    if (!parsed) return bad("Không đọc được JSON trong nội dung đã dán");
    const pkg = { ...normalize(parsed, product), source: "manual", model: null, note: "Dán từ chat AI (chế độ thủ công)." };
    await savePackage(env.BUCKET, product, pkg);
    return json({ package: pkg });
  }

  const patch = {};
  if ("caption" in body) {
    if (typeof body.caption !== "string" || body.caption.length > MAX_CAPTION) return bad("Caption không hợp lệ");
    patch.caption = body.caption.trim();
  }
  if ("pinnedComment" in body) {
    if (typeof body.pinnedComment !== "string" || body.pinnedComment.length > MAX_PINNED) return bad("Bình luận ghim không hợp lệ");
    patch.pinnedComment = body.pinnedComment.trim();
  }
  if ("hashtags" in body) {
    if (!Array.isArray(body.hashtags) || body.hashtags.length > MAX_TAGS || body.hashtags.some((t) => typeof t !== "string" || t.length > 100)) {
      return bad("Hashtag không hợp lệ");
    }
    const tags = body.hashtags.map((t) => t.trim().replace(/^#+/, "").replace(/\s+/g, "")).filter(Boolean).map((t) => `#${t}`);
    patch.hashtags = [...new Set(tags)];
  }
  if (Object.keys(patch).length === 0) return bad("Không có gì để lưu");

  const current = await getPackage(env.BUCKET, id);
  if (!current) return bad("Chưa có gói để sửa. Hãy tạo gói trước.", 409);

  const pkg = { ...current, ...patch, editedAt: new Date().toISOString() };
  await savePackage(env.BUCKET, product, pkg);
  return json({ package: pkg });
}
