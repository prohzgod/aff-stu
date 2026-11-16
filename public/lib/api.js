// Gọi API của app kèm token. Token chỉ nằm trong localStorage của thiết bị này.

const KEY = "APP_TOKEN";

export function getToken() {
  try { return localStorage.getItem(KEY) || ""; } catch { return ""; }
}

export function setToken(token) {
  try { localStorage.setItem(KEY, token.trim()); return true; } catch { return false; }
}

export async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${getToken()}`,
        ...(body === undefined ? {} : { "Content-Type": body instanceof Blob ? body.type || "application/octet-stream" : "application/json" }),
      },
      // Blob (video thành phẩm) gửi nguyên dạng nhị phân; còn lại gửi JSON.
      body: body === undefined ? undefined : body instanceof Blob || typeof body === "string" ? body : JSON.stringify(body),
    });
  } catch {
    throw new Error("Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
  }

  let data = null;
  try { data = await res.json(); } catch { /* response không phải JSON */ }

  if (res.status === 401) {
    location.hash = "#/settings";
    const err = new Error("Token không đúng. Nhập lại token.");
    err.status = 401;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Lỗi máy chủ (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}
