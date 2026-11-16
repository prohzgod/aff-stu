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

// Giá rút gọn dùng trong nội dung video: 216749 → "217K", 1250000 → "1,25 triệu". Dùng chung cho server và trình duyệt.
export function priceK(n) {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return "";
  if (n < 1000) return `${Math.round(n)}đ`;
  const k = Math.round(n / 1000);
  if (k < 1000) return `${k}K`;
  return `${String(Number((n / 1e6).toFixed(2))).replace(".", ",")} triệu`;
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
