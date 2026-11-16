// Tiện ích dùng chung phía server: response JSON, id, key trên R2, hạn lưu.

const DAY_MS = 86400000;
const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
const MEDIA_KEY = /^p\/[a-z0-9]+\/[\w.-]+$/;
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4" };

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export function newId() {
  // 252 = 7 * 36: bỏ byte >= 252 để mọi ký tự có xác suất bằng nhau.
  let id = "";
  while (id.length < 10) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      if (b < 252 && id.length < 10) id += ID_CHARS[b % 36];
    }
  }
  return id;
}

export function isValidId(id) {
  return typeof id === "string" && /^[a-z0-9]{10}$/.test(id);
}

export function retentionDays(env) {
  return Number(env?.RETENTION_DAYS) || 7;
}

export function expiresAt(createdAt, days) {
  return new Date(Date.parse(createdAt) + days * DAY_MS).toISOString();
}

export function isExpired(createdAt, days, now = Date.now()) {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return true;
  return now >= created + days * DAY_MS;
}

export function indexKey(createdMs, id) {
  return `i/${String(9999999999999 - createdMs).padStart(13, "0")}_${id}`;
}

export function productKey(id, file) {
  return `p/${id}/${file}`;
}

export function mediaKeyOk(key) {
  return typeof key === "string" && MEDIA_KEY.test(key) && !key.includes("..");
}

export function extFromContentType(ct, fallback) {
  const type = (ct || "").split(";")[0].trim().toLowerCase();
  return EXT[type] || fallback;
}
