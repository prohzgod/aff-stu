// Thông báo của trình duyệt khi một việc chạy lâu (xuất video) xong lúc người dùng đang ở tab hay cửa sổ khác.
// Không có quyền hoặc trình duyệt không hỗ trợ thì lặng lẽ bỏ qua: đây chỉ là tiện ích thêm.

const ICON = "/icons/icon-192.png";

export function shouldNotify({ permission, hidden, focused }) {
  return permission === "granted" && (Boolean(hidden) || !focused);
}

// Gọi trong lúc xử lý một cú bấm của người dùng (trình duyệt chỉ cho hỏi quyền khi đó).
export async function askNotifyPermission(api = globalThis.Notification) {
  if (!api) return "unsupported";
  if (api.permission !== "default") return api.permission;
  try {
    return await api.requestPermission();
  } catch {
    return "default";
  }
}

// Trả true nếu đã hiện thông báo. env chỉ để test.
export async function notifyDone(title, body = "", env = {}) {
  const api = "Notification" in env ? env.Notification : globalThis.Notification;
  const doc = env.document ?? globalThis.document;
  if (!api || !shouldNotify({ permission: api.permission, hidden: doc?.hidden, focused: doc?.hasFocus?.() })) return false;
  const options = { body, icon: ICON, tag: "affiliate-studio-export" };
  try {
    // Chrome trên Android không cho `new Notification`: phải đi qua service worker.
    const registration = "registration" in env ? env.registration : await globalThis.navigator?.serviceWorker?.getRegistration?.();
    if (registration?.showNotification) {
      await registration.showNotification(title, options);
      return true;
    }
    const note = new api(title, options);
    note.onclick = () => { globalThis.focus?.(); note.close?.(); };
    return true;
  } catch {
    return false;
  }
}
