// PUT /api/products/:id/upload/:name: nhận file thành phẩm của Hậu kỳ (body nhị phân).
// final.mp4 (phase 5), cover.png (phase 6), subs.srt (phase 7).
import { json, isValidId, isExpired, retentionDays } from "../../../../../lib/util.js";
import { getProduct, saveUpload } from "../../../../../lib/store.js";

const MB = 1024 * 1024;
// Server phải đọc cả file vào bộ nhớ mới kiểm được chữ ký đầu file, nên giới hạn nằm gọn trong RAM của Worker.
// Video 60 giây ở 8 Mbps kèm tiếng nặng khoảng 62MB.
const RULES = {
  "final.mp4": {
    max: 70 * MB, tooBig: "Video quá lớn (tối đa 70MB)", wrong: "File không phải MP4",
    check: (b) => b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70, // "ftyp"
  },
  "cover.png": {
    max: 8 * MB, tooBig: "Ảnh bìa quá lớn (tối đa 8MB)", wrong: "File không phải PNG",
    check: (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v),
  },
  "subs.srt": {
    max: MB, tooBig: "File phụ đề quá lớn (tối đa 1MB)", wrong: "File không phải SRT",
    // Văn bản UTF-8 hợp lệ, bắt đầu bằng khối SRT đầu tiên: "1", dòng thời gian, rồi chữ.
    check: (b) => {
      let text;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(b); } catch { return false; }
      return /^\uFEFF?1\r?\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\r?\n/.test(text) && !text.includes("\u0000");
    },
  },
};

export async function onRequestPut({ request, env, params }) {
  const { id, name } = params;
  if (!isValidId(id)) return json({ error: "Không tìm thấy sản phẩm" }, 404);
  const rule = Object.hasOwn(RULES, name) ? RULES[name] : null;
  if (!rule) return json({ error: "Tên file không được hỗ trợ" }, 400);

  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > rule.max) return json({ error: rule.tooBig }, 413);

  const product = await getProduct(env.BUCKET, id);
  if (!product || isExpired(product.createdAt, retentionDays(env))) return json({ error: "Không tìm thấy sản phẩm" }, 404);

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > rule.max) return json({ error: rule.tooBig }, 413);
  if (!rule.check(bytes)) return json({ error: rule.wrong }, 400);

  await saveUpload(env.BUCKET, product, name, bytes);
  return json({ ok: true, url: `/media/p/${id}/${name}`, size: bytes.length });
}
