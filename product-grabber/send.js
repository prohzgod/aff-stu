// Phần "Gửi sang app" tách khỏi popup.js để kiểm thử được. Script thường, không phải module.
var ProductGrabberSend = {
  // URL trang sản phẩm trong app do server trả về. Chỉ nhận khi cùng origin với endpoint đã cấu hình,
  // để một endpoint lạ không thể bắt extension mở trang tuỳ ý.
  appUrlFromResponse(endpoint, data) {
    try {
      if (!data || typeof data !== "object" || typeof data.url !== "string") return null;
      const target = new URL(data.url);
      const base = new URL(endpoint);
      if (target.protocol !== "https:" && target.protocol !== "http:") return null;
      return target.origin === base.origin ? target.href : null;
    } catch {
      return null;
    }
  },

  sendErrorMessage(status, data) {
    const detail = data && typeof data.error === "string" ? data.error : `HTTP ${status}`;
    const hint = status === 401 ? ". Kiểm tra ô Authorization trong ⚙ (phải có chữ Bearer ở đầu)." : "";
    return `Gửi lỗi: ${detail}${hint}`;
  },
};
