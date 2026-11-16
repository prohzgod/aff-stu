// Sao chép ảnh/video của sản phẩm từ CDN sàn vào R2.
// Không bao giờ ném lỗi ra ngoài: mục nào lỗi thì stored = null và app dùng link gốc.

import { productKey, extFromContentType, safeMediaType } from "./util.js";

const MAX_IMAGES = 12;
const IMAGE_LIMIT = 15 * 1024 * 1024;
const VIDEO_LIMIT = 60 * 1024 * 1024;
const TIMEOUT_MS = { image: 25000, video: 60000 }; // hết giờ tính cả thời gian truyền body
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const isHttps = (u) => typeof u === "string" && /^https:\/\//i.test(u);
const pad2 = (n) => String(n).padStart(2, "0");

// Content-type sẽ lưu cho file, hoặc null nếu nguồn trả loại không được phép.
function storedType(kind, contentType) {
  const safe = safeMediaType(contentType);
  if (safe) return safe.startsWith(`${kind}/`) ? safe : null;
  const raw = String(contentType || "").split(";")[0].trim().toLowerCase();
  return kind === "video" && raw === "application/octet-stream" ? "video/mp4" : null;
}

// Đọc body nhưng dừng ngay khi vượt giới hạn, để nguồn không khai kích thước không làm tràn RAM của Worker.
async function readCapped(res, limit) {
  if (!res.body) return new ArrayBuffer(0);
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
  return out.buffer;
}

// Thử lần lượt từng URL; trả key đã lưu hoặc null.
async function fetchToBucket(bucket, fetchFn, urls, { kind, limit, headers, keyFor }) {
  for (const url of urls.filter(isHttps)) {
    try {
      const res = await fetchFn(url, { headers, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS[kind]) });
      const contentType = storedType(kind, res.headers.get("content-type"));
      const declared = Number(res.headers.get("content-length"));
      const hasLength = res.headers.has("content-length") && Number.isFinite(declared);
      if (!res.ok || !contentType || (hasLength && declared > limit)) {
        await res.body?.cancel().catch(() => {});
        continue;
      }
      let body;
      if (kind === "video" && hasLength && res.body) {
        body = res.body; // truyền thẳng, không giữ cả video trong RAM của Worker
      } else {
        body = await readCapped(res, limit);
        if (!body) continue;
      }
      const key = keyFor(contentType);
      await bucket.put(key, body, { httpMetadata: { contentType } });
      return key;
    } catch {
      // lỗi mạng, hết giờ, lỗi ghi R2: thử nguồn kế tiếp
    }
  }
  return null;
}

export async function mirrorMedia(bucket, id, input, fetchFn = fetch) {
  const headers = { "User-Agent": USER_AGENT, Accept: "*/*" };
  if (isHttps(input?.url)) headers.Referer = input.url;

  const sourceImages = Array.isArray(input?.images) ? input.images.slice(0, MAX_IMAGES) : [];
  const images = await Promise.all(
    sourceImages.map(async (img, i) => {
      if (!img || typeof img !== "object") return { stored: null };
      const stored = await fetchToBucket(bucket, fetchFn, [img.original, img.preview], {
        kind: "image",
        limit: IMAGE_LIMIT,
        headers,
        keyFor: (ct) => productKey(id, `img_${pad2(i + 1)}.${extFromContentType(ct, "jpg")}`),
      });
      return { ...img, stored };
    }),
  );

  const videos = {};
  const storedByUrl = new Map();
  for (const name of ["header", "description"]) {
    const v = input?.videos?.[name];
    if (!v || typeof v !== "object") continue;
    if (storedByUrl.has(v.url)) {
      videos[name] = { ...v, stored: storedByUrl.get(v.url) };
      continue;
    }
    const stored = await fetchToBucket(bucket, fetchFn, [v.url, v.backupUrl], {
      kind: "video",
      limit: VIDEO_LIMIT,
      headers,
      keyFor: () => productKey(id, `video_${name}.mp4`),
    });
    if (isHttps(v.url)) storedByUrl.set(v.url, stored);
    videos[name] = { ...v, stored };
  }

  const keys = new Set([...images, ...Object.values(videos)].map((m) => m.stored).filter(Boolean));
  return { images, videos, mirrored: keys.size };
}
