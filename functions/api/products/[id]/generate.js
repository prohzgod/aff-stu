// POST /api/products/:id/generate: sinh gói đăng bài (AI nếu đã cấu hình, không thì mẫu dựng sẵn) và lưu lại.
// GET  /api/products/:id/generate: trả prompt để dán vào Claude/Gemini chat (chế độ thủ công).
import { json, isValidId, isExpired, retentionDays } from "../../../../lib/util.js";
import { getProduct, savePackage } from "../../../../lib/store.js";
import { generatePackage, buildManualPrompt } from "../../../../lib/generate.js";

const MAX_TEXT = 500;
const text = (v) => (typeof v === "string" ? v.slice(0, MAX_TEXT) : "");
const notFound = () => json({ error: "Không tìm thấy sản phẩm" }, 404);

async function loadProduct(env, id) {
  if (!isValidId(id)) return null;
  const product = await getProduct(env.BUCKET, id);
  return product && !isExpired(product.createdAt, retentionDays(env)) ? product : null;
}

export async function onRequestGet({ request, env, params }) {
  const product = await loadProduct(env, params.id);
  if (!product) return notFound();
  const query = new URL(request.url).searchParams;
  const prompt = buildManualPrompt(product, {
    tone: text(query.get("tone")) || undefined,
    notes: text(query.get("notes")),
    faceless: query.get("faceless") !== "false",
  });
  return json({ prompt });
}

export async function onRequestPost({ request, env, params }) {
  if (!isValidId(params.id)) return notFound();

  let options = {};
  const raw = await request.text();
  if (raw.trim()) {
    try {
      options = JSON.parse(raw) ?? {};
    } catch {
      return json({ error: "JSON không hợp lệ" }, 400);
    }
    if (typeof options !== "object" || Array.isArray(options)) options = {};
  }

  const product = await loadProduct(env, params.id);
  if (!product) return notFound();

  const pkg = await generatePackage(product, {
    tone: text(options.tone) || undefined,
    notes: text(options.notes),
    faceless: typeof options.faceless === "boolean" ? options.faceless : true,
  }, env, (...args) => fetch(...args));
  await savePackage(env.BUCKET, product, pkg);
  return json({ package: pkg });
}
