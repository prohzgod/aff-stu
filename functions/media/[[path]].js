// GET /media/p/{id}/{file}: phát media từ R2, không cần token, có Range (iPhone cần để phát video).
import { mediaKeyOk, safeMediaType } from "../../lib/util.js";
import { parseRange } from "../../lib/range.js";

const notFound = () => new Response("Không tìm thấy", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function onRequestGet({ request, env, params }) {
  const key = Array.isArray(params.path) ? params.path.join("/") : String(params.path || "");
  if (!mediaKeyOk(key)) return notFound();

  const head = await env.BUCKET.head(key);
  if (!head) return notFound();

  // Endpoint này không cần token và cùng origin với app, nên không được để file nào chạy script:
  // chỉ ảnh raster/video được phục vụ đúng loại, còn lại thành file tải về; CSP sandbox chặn nốt phần còn lại.
  const type = safeMediaType(head.httpMetadata?.contentType);
  const headers = new Headers({
    "Content-Type": type || "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    ETag: head.httpEtag,
  });
  if (!type) headers.set("Content-Disposition", "attachment");

  if (request.headers.get("If-None-Match") === head.httpEtag) return new Response(null, { status: 304, headers });

  const range = parseRange(request.headers.get("Range"), head.size);
  if (range === "invalid") {
    headers.set("Content-Range", `bytes */${head.size}`);
    return new Response(null, { status: 416, headers });
  }

  const obj = await env.BUCKET.get(key, range ? { range } : undefined);
  if (!obj) return notFound();

  if (range) {
    headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`);
    headers.set("Content-Length", String(range.length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(head.size));
  return new Response(obj.body, { status: 200, headers });
}
