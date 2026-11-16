// PUT /api/products/:id/upload/:name: nhận file thành phẩm của Hậu kỳ (body nhị phân).
// Phase 5 chỉ nhận final.mp4; cover.png và subs.srt thêm ở phase 6 và 7.
import { json, isValidId, isExpired, retentionDays } from "../../../../../lib/util.js";
import { getProduct, saveFinal } from "../../../../../lib/store.js";

// Video 60 giây ở 8 Mbps kèm tiếng nặng khoảng 62MB. Giới hạn 70MB để file vẫn nằm gọn trong RAM của Worker
// (phải đọc hết vào bộ nhớ mới kiểm được chữ ký đầu file).
const MAX_BYTES = 70 * 1024 * 1024;

// MP4: byte 4–7 là "ftyp".
const isMp4 = (b) => b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70;

export async function onRequestPut({ request, env, params }) {
  const { id, name } = params;
  if (!isValidId(id)) return json({ error: "Không tìm thấy sản phẩm" }, 404);
  if (name !== "final.mp4") return json({ error: "Tên file không được hỗ trợ" }, 400);

  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) return json({ error: "Video quá lớn (tối đa 70MB)" }, 413);

  const product = await getProduct(env.BUCKET, id);
  if (!product || isExpired(product.createdAt, retentionDays(env))) return json({ error: "Không tìm thấy sản phẩm" }, 404);

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_BYTES) return json({ error: "Video quá lớn (tối đa 70MB)" }, 413);
  if (!isMp4(bytes)) return json({ error: "File không phải MP4" }, 400);

  await saveFinal(env.BUCKET, product, bytes);
  return json({ ok: true, url: `/media/p/${id}/final.mp4`, size: bytes.length });
}
