// Hàm thuần cho giao diện: không đụng DOM, dùng được cả trong test.

const HTML = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => HTML[c]);
}

const group = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export function formatCount(n) {
  return typeof n === "number" && Number.isFinite(n) ? group(n) : "";
}

export function formatPrice(n) {
  const s = formatCount(n);
  return s ? `${s}₫` : "";
}

export function daysLeft(expiresAt, now = Date.now()) {
  const ms = Date.parse(expiresAt) - now;
  return Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 86400000) : 0;
}

// Dữ liệu sản phẩm lấy từ trang sàn nên URL không đáng tin: chỉ nhận https và media của chính app.
export function safeUrl(u) {
  if (typeof u !== "string") return "";
  return /^https:\/\//i.test(u) || /^\/media\/p\//.test(u) ? u : "";
}

export function mediaUrl(item) {
  if (!item || typeof item !== "object") return "";
  if (item.stored) return safeUrl(`/media/${item.stored}`);
  return safeUrl(item.original) || safeUrl(item.preview) || safeUrl(item.url);
}
