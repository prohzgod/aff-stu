/* global extractTikTokShopProduct */
const $ = (id) => document.getElementById(id);
let product = null;
const selected = new Set();

const setStatus = (msg, isError = false) => {
  $("status").textContent = msg;
  $("status").className = isError ? "error" : "";
  $("status").hidden = !msg;
};

const fmtVND = (n) => (n ? n.toLocaleString("vi-VN") + "₫" : "");

// ---------- Cài đặt ----------
async function loadSettings() {
  const { endpoint = "", authHeader = "" } = await chrome.storage.local.get(["endpoint", "authHeader"]);
  $("endpoint").value = endpoint;
  $("authHeader").value = authHeader;
  $("send").hidden = !endpoint;
  return { endpoint, authHeader };
}
$("settingsBtn").onclick = () => { $("settings").hidden = !$("settings").hidden; };
$("saveSettings").onclick = async () => {
  await chrome.storage.local.set({ endpoint: $("endpoint").value.trim(), authHeader: $("authHeader").value.trim() });
  await loadSettings();
  $("settings").hidden = true;
};

// ---------- Đọc trang ----------
async function grab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https:\/\/(shop|www)\.tiktok\.com\//.test(tab.url)) {
    setStatus("Hãy mở một trang sản phẩm TikTok Shop (shop.tiktok.com/vn/pdp/...) rồi bấm lại.", true);
    return;
  }
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractTikTokShopProduct,
    });
    if (!result?.ok) { setStatus(result?.reason || "Không đọc được trang.", true); return; }
    product = result;
    render();
  } catch (e) {
    setStatus("Lỗi khi đọc trang: " + e.message, true);
  }
}

function render() {
  setStatus("");
  $("result").hidden = false;
  $("title").textContent = product.title;
  $("price").textContent = fmtVND(product.price.current);
  $("original").textContent = product.price.original !== product.price.current ? fmtVND(product.price.original) : "";
  $("discount").textContent = product.price.discount || "";
  $("extra").textContent = [
    product.shopName,
    product.soldCount ? `${product.soldCount.toLocaleString("vi-VN")} đã bán` : null,
    product.rating ? `★ ${product.rating} (${product.reviewCount})` : null,
  ].filter(Boolean).join(" • ");

  $("imgCount").textContent = product.images.length;
  const grid = $("grid");
  grid.innerHTML = "";
  product.images.forEach((img, i) => {
    selected.add(i);
    const el = document.createElement("img");
    el.src = img.preview;
    el.title = `Ảnh ${i + 1}`;
    el.onclick = () => {
      selected.has(i) ? selected.delete(i) : selected.add(i);
      el.classList.toggle("off", !selected.has(i));
    };
    grid.appendChild(el);
  });

  const v = product.videos.header || product.videos.description;
  $("videoRow").textContent = v
    ? `🎬 Có video sản phẩm ${v.width}x${v.height}, ${Math.round(v.duration)}s (link hết hạn lúc ${new Date(v.expiresAt).toLocaleString("vi-VN")}). Sẽ tải kèm.`
    : "Không có video sản phẩm.";
}

$("toggleAll").onclick = () => {
  const allOn = selected.size === product.images.length;
  document.querySelectorAll("#grid img").forEach((el, i) => {
    allOn ? selected.delete(i) : selected.add(i);
    el.classList.toggle("off", allOn);
  });
  $("toggleAll").textContent = allOn ? "Chọn hết" : "Bỏ chọn hết";
};

// ---------- Tải về ----------
function selectedProduct() {
  return { ...product, images: product.images.filter((_, i) => selected.has(i)) };
}

$("download").onclick = async () => {
  const p = selectedProduct();
  const folder = `tiktokshop/${p.productId}`;
  const jobs = p.images.map((img, i) =>
    chrome.downloads.download({ url: img.original, filename: `${folder}/img_${String(i + 1).padStart(2, "0")}.jpg`, conflictAction: "overwrite" })
  );
  const seen = new Set();
  for (const [name, v] of Object.entries(p.videos)) {
    if (v?.url && !seen.has(v.url)) {
      seen.add(v.url);
      jobs.push(chrome.downloads.download({ url: v.url, filename: `${folder}/video_${name}.mp4`, conflictAction: "overwrite" }));
    }
  }
  const json = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
  jobs.push(chrome.downloads.download({ url: URL.createObjectURL(json), filename: `${folder}/product.json`, conflictAction: "overwrite" }));

  $("download").disabled = true;
  const results = await Promise.allSettled(jobs);
  const failed = results.filter((r) => r.status === "rejected").length;
  setStatus(failed ? `Đã tải, ${failed} file lỗi.` : `Đã tải ${results.length} file vào Downloads/${folder}`, failed > 0);
  $("download").disabled = false;
};

$("copy").onclick = async () => {
  await navigator.clipboard.writeText(JSON.stringify(selectedProduct(), null, 2));
  setStatus("Đã copy JSON.");
};

// ---------- Gửi sang app ----------
$("send").onclick = async () => {
  const { endpoint, authHeader } = await loadSettings();
  if (!endpoint) return;
  $("send").disabled = true;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(authHeader ? { Authorization: authHeader } : {}) },
      body: JSON.stringify(selectedProduct()),
    });
    setStatus(res.ok ? "Đã gửi sang app." : `Gửi lỗi: HTTP ${res.status}`, !res.ok);
  } catch (e) {
    setStatus("Gửi lỗi: " + e.message, true);
  } finally {
    $("send").disabled = false;
  }
};

loadSettings().then(grab);
