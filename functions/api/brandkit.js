// GET/PUT /api/brandkit: logo, @kênh, vị trí watermark, kiểu phụ đề mặc định. Lưu ở cfg/brandkit.json, không bị rule xoá 7 ngày.
import { json } from "../../lib/util.js";

const KEY = "cfg/brandkit.json";
const DEFAULT = { handle: "", position: "tl", watermark: true, logo: null, subtitleStyle: "karaoke" };
const SUBTITLE_STYLES = ["karaoke", "box", "minimal"];
const POSITIONS = ["tl", "tr", "bl", "br"];
const MAX_LOGO_CHARS = 410000; // khoảng 300KB ảnh sau khi mã hoá base64
const PNG_PREFIX = "data:image/png;base64,";
const PNG_MAGIC = "iVBORw0KGgo"; // 8 byte chữ ký PNG ở dạng base64

function parse(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { handle, position, watermark, logo, subtitleStyle = DEFAULT.subtitleStyle } = body;
  if (!SUBTITLE_STYLES.includes(subtitleStyle)) return null;
  if (typeof handle !== "string" || handle.trim().length > 40) return null;
  if (!POSITIONS.includes(position)) return null;
  if (typeof watermark !== "boolean") return null;
  if (logo !== null) {
    // Chỉ nhận PNG nhúng sẵn: không link ngoài, không SVG (có thể chứa script).
    if (typeof logo !== "string" || logo.length > MAX_LOGO_CHARS) return null;
    if (!logo.startsWith(PNG_PREFIX + PNG_MAGIC) || !/^[A-Za-z0-9+/]+=*$/.test(logo.slice(PNG_PREFIX.length))) return null;
  }
  const name = handle.trim().replace(/^@+/, "").replace(/\s+/g, "");
  return { handle: name ? `@${name}` : "", position, watermark, logo, subtitleStyle };
}

export async function onRequestGet({ env }) {
  const obj = await env.BUCKET.get(KEY);
  return json({ brandkit: obj ? { ...DEFAULT, ...(await obj.json()) } : DEFAULT });
}

export async function onRequestPut({ request, env }) {
  let body;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return json({ error: "JSON không hợp lệ" }, 400);
  }
  const brandkit = parse(body);
  if (!brandkit) return json({ error: "Brand kit không hợp lệ (logo phải là PNG tối đa 300KB)" }, 400);
  await env.BUCKET.put(KEY, JSON.stringify(brandkit), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
  return json({ brandkit });
}
