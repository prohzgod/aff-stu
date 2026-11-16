// Copy, chia sẻ file và tải file: các thao tác chỉ có trong trình duyệt.

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // không có quyền hoặc không ở HTTPS: thử cách cũ bên dưới
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
  document.body.append(area);
  area.select();
  area.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  area.remove();
  return ok;
}

export function canShareFiles() {
  try {
    if (!navigator.canShare || !navigator.share) return false;
    return navigator.canShare({ files: [new File(["x"], "x.jpg", { type: "image/jpeg" })] });
  } catch {
    return false;
  }
}

// Trả "shared", "cancelled" (người dùng tự đóng bảng chia sẻ) hoặc "unsupported".
export async function shareFiles(files, text) {
  try {
    if (!navigator.canShare?.({ files })) return "unsupported";
    await navigator.share(text ? { files, text } : { files });
    return "shared";
  } catch (err) {
    return err?.name === "AbortError" ? "cancelled" : "unsupported";
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Chỉ dùng cho media của chính app.
export async function fetchAsFile(url, filename) {
  if (!/^\/media\/p\//.test(url)) throw new Error("Không tải được file");
  let res;
  try { res = await fetch(url); } catch { throw new Error("Không tải được file"); }
  if (!res.ok) throw new Error("Không tải được file");
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || "application/octet-stream" });
}
