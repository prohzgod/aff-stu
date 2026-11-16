// Router + các màn hình của phase 1: cài đặt token, danh sách, chi tiết sản phẩm.
// Dữ liệu sản phẩm lấy từ trang sàn nên không đáng tin: chỉ đưa vào DOM qua textContent (hàm h),
// URL phải qua safeUrl/mediaUrl.

import { api, getToken, setToken } from "/lib/api.js";
import { formatPrice, formatCount, daysLeft, mediaUrl, safeUrl } from "/lib/format.js";

const app = document.getElementById("app");
const toastEl = document.getElementById("toast");
let renderSeq = 0;
let toastTimer;

// ---------- tiện ích DOM ----------

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

function show(...nodes) {
  app.replaceChildren(...nodes);
  window.scrollTo(0, 0);
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200);
}

// Ảnh từ link gốc của sàn có thể hết hạn hoặc bị chặn: thay bằng ô chữ thay vì biểu tượng ảnh vỡ.
function image(src, alt) {
  const img = h("img", { src, alt, loading: "lazy", referrerpolicy: "no-referrer" });
  img.addEventListener("error", () => img.replaceWith(h("span", { class: "noimg" }, "Không tải được ảnh")), { once: true });
  return img;
}

const loading = (text) => h("p", { class: "state" }, text);

function errorState(message, retry) {
  return h("div", { class: "state" },
    h("p", {}, message),
    retry && h("button", { class: "btn", type: "button", onclick: retry }, "Thử lại"),
  );
}

// ---------- cài đặt ----------

function viewSettings() {
  const input = h("input", {
    id: "token", type: "password", autocomplete: "off", autocapitalize: "off", spellcheck: "false",
    placeholder: "Dán APP_TOKEN", value: getToken(),
  });
  const reveal = h("button", { class: "btn ghost", type: "button", onclick: () => {
    input.type = input.type === "password" ? "text" : "password";
    reveal.textContent = input.type === "password" ? "Hiện" : "Ẩn";
  } }, "Hiện");
  const message = h("p", { class: "field-error", hidden: true });

  const form = h("form", { class: "card form", onsubmit: (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) {
      message.textContent = "Chưa nhập token.";
      message.hidden = false;
      return;
    }
    if (!setToken(value)) {
      message.textContent = "Trình duyệt không cho lưu (đang ở chế độ riêng tư?).";
      message.hidden = false;
      return;
    }
    toast("Đã lưu token");
    location.hash = "#/";
  } },
    h("h1", {}, "Cài đặt"),
    h("label", { for: "token" }, "Token của app"),
    h("div", { class: "row" }, input, reveal),
    message,
    h("p", { class: "hint" }, "Dùng cùng một token trên web, điện thoại và extension. Token chỉ lưu trên thiết bị này."),
    h("button", { class: "btn primary", type: "submit" }, "Lưu"),
  );
  show(form);
}

// ---------- danh sách ----------

function productCard(item) {
  const thumb = safeUrl(item.thumb);
  const left = daysLeft(item.expiresAt);
  return h("a", { class: "pcard", href: `#/p/${item.id}` },
    h("div", { class: "pcard-img" },
      thumb ? image(thumb, "") : h("span", { class: "noimg" }, "Chưa có ảnh"),
    ),
    h("div", { class: "pcard-body" },
      h("p", { class: "pcard-title" }, item.title),
      h("p", { class: "price" }, formatPrice(item.price)),
      h("div", { class: "badges" },
        h("span", { class: item.hasPackage ? "badge ok" : "badge" }, item.hasPackage ? "Đã có gói" : "Chưa tạo gói"),
        h("span", { class: left <= 1 ? "badge warn" : "badge" }, left > 0 ? `còn ${left} ngày` : "sắp xoá"),
      ),
    ),
  );
}

function pasteDialog() {
  const textarea = h("textarea", { rows: "9", placeholder: "Dán JSON sản phẩm (nút Copy JSON trong extension)", spellcheck: "false" });
  const message = h("p", { class: "field-error", hidden: true });
  const submit = h("button", { class: "btn primary", type: "submit" }, "Thêm sản phẩm");
  const fail = (text) => { message.textContent = text; message.hidden = false; };

  const dialog = h("dialog", { class: "dialog" },
    h("form", { class: "form", onsubmit: async (e) => {
      e.preventDefault();
      const text = textarea.value.trim();
      if (!text) return fail("Chưa dán gì.");
      try { JSON.parse(text); } catch { return fail("Đây không phải JSON hợp lệ. Hãy dùng nút Copy JSON trong extension."); }
      submit.disabled = true;
      submit.textContent = "Đang lưu ảnh và video…";
      message.hidden = true;
      try {
        const { id } = await api("/api/products", { method: "POST", body: text });
        dialog.close();
        toast("Đã thêm sản phẩm");
        location.hash = `#/p/${id}`;
      } catch (err) {
        if (notifyAuth(err)) dialog.close();
        else fail(err.message);
      } finally {
        submit.disabled = false;
        submit.textContent = "Thêm sản phẩm";
      }
    } },
      h("h2", {}, "Thêm sản phẩm"),
      textarea,
      message,
      h("div", { class: "row end" },
        h("button", { class: "btn ghost", type: "button", onclick: () => dialog.close() }, "Huỷ"),
        submit,
      ),
    ),
  );
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

async function viewList(seq) {
  show(loading("Đang tải danh sách…"));
  let items;
  try {
    ({ items } = await api("/api/products"));
  } catch (err) {
    if (notifyAuth(err)) return;
    if (seq === renderSeq) show(errorState(err.message, route));
    return;
  }
  if (seq !== renderSeq) return;

  const add = h("button", { class: "fab", type: "button", "aria-label": "Thêm sản phẩm bằng JSON", onclick: pasteDialog }, "＋");
  if (!items.length) {
    show(h("div", { class: "state" },
      h("p", { class: "state-title" }, "Chưa có sản phẩm"),
      h("p", {}, "Gửi từ extension, hoặc bấm ＋ để dán JSON."),
    ), add);
    return;
  }
  show(h("div", { class: "grid" }, items.map(productCard)), add);
}

// ---------- chi tiết ----------

function downloadLink(item, filename, label) {
  const url = mediaUrl(item);
  if (!url) return null;
  // File đã lưu về kho thì tải thẳng; chưa lưu thì mở link gốc ở tab mới.
  return item.stored
    ? h("a", { class: "btn small", href: url, download: filename, "aria-label": `Tải ${label}` }, "⬇ Tải")
    : h("a", { class: "btn small", href: url, target: "_blank", rel: "noopener noreferrer", "aria-label": `Mở ${label}` }, "↗ Mở");
}

function infoSection(product, expiresAt) {
  const price = product.price || {};
  const left = daysLeft(expiresAt);
  const shopUrl = safeUrl(product.url);
  const facts = [
    product.shopName,
    typeof product.soldCount === "number" ? `${formatCount(product.soldCount)} đã bán` : null,
    product.rating ? `★ ${product.rating}${product.reviewCount ? ` (${formatCount(product.reviewCount)})` : ""}` : null,
  ].filter(Boolean);

  return h("section", { class: "card" },
    h("h1", { class: "ptitle" }, product.title),
    h("p", { class: "price-row" },
      h("span", { class: "price big" }, formatPrice(price.current)),
      price.original && price.original !== price.current && h("s", { class: "muted" }, formatPrice(price.original)),
      price.discount && h("span", { class: "badge sale" }, price.discount),
    ),
    facts.length > 0 && h("p", { class: "muted" }, facts.join(" · ")),
    h("div", { class: "row wrap" },
      shopUrl && h("a", { class: "btn small", href: shopUrl, target: "_blank", rel: "noopener noreferrer" }, "↗ Xem trên sàn"),
      h("span", { class: left <= 1 ? "badge warn" : "badge" }, left > 0 ? `Tự xoá sau ${left} ngày` : "Sắp bị xoá"),
      h("button", { class: "btn small danger push", type: "button", onclick: () => removeProduct(product) }, "Xoá"),
    ),
  );
}

async function removeProduct(product) {
  if (!confirm("Xoá sản phẩm này cùng toàn bộ ảnh, video và gói đăng bài của nó?")) return;
  try {
    await api(`/api/products/${product.id}`, { method: "DELETE" });
    toast("Đã xoá sản phẩm");
    location.hash = "#/";
  } catch (err) {
    toast(err.message);
  }
}

function mediaSection(product) {
  const images = (Array.isArray(product.images) ? product.images : []).filter((im) => mediaUrl(im));
  const videos = Object.entries(product.videos || {}).filter(([, v]) => v && mediaUrl(v));
  // header và description thường là cùng một video: chỉ hiện một lần.
  const seen = new Set();
  const uniqueVideos = videos.filter(([, v]) => {
    const url = mediaUrl(v);
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
  const linked = [...images, ...uniqueVideos.map(([, v]) => v)].filter((m) => !m.stored).length;

  return h("section", { class: "card" },
    h("h2", {}, "Ảnh & video"),
    linked > 0 && h("p", { class: "hint" }, `${linked} file chưa lưu được về kho, đang dùng link gốc của sàn (link này có thể hết hạn).`),
    images.length === 0 && uniqueVideos.length === 0 && h("p", { class: "muted" }, "Sản phẩm này không có ảnh hay video."),
    images.length > 0 && h("div", { class: "media-grid" }, images.map((im, i) => {
      const n = String(i + 1).padStart(2, "0");
      const ext = im.stored ? im.stored.split(".").pop() : "jpg";
      return h("figure", { class: "media" },
        h("div", { class: "media-img" }, image(mediaUrl(im), `Ảnh ${i + 1}`)),
        h("figcaption", {}, h("span", {}, `Ảnh ${i + 1}`), downloadLink(im, `${product.id}_img_${n}.${ext}`, `ảnh ${i + 1}`)),
      );
    })),
    uniqueVideos.map(([name, v]) => h("figure", { class: "media video" },
      h("video", { src: mediaUrl(v), controls: true, playsinline: true, preload: "metadata" }),
      h("figcaption", {}, h("span", {}, "Video sản phẩm"), downloadLink(v, `${product.id}_video_${name}.mp4`, "video")),
    )),
  );
}

async function viewDetail(id, seq) {
  show(loading("Đang tải sản phẩm…"));
  let data;
  try {
    data = await api(`/api/products/${encodeURIComponent(id)}`);
  } catch (err) {
    if (notifyAuth(err) || seq !== renderSeq) return;
    if (err.status === 404) {
      show(h("div", { class: "state" },
        h("p", { class: "state-title" }, "Sản phẩm không còn"),
        h("p", {}, "Đã bị xoá hoặc quá 7 ngày."),
        h("a", { class: "btn", href: "#/" }, "Về danh sách"),
      ));
    } else {
      show(errorState(err.message, route));
    }
    return;
  }
  if (seq !== renderSeq) return;
  show(
    h("a", { class: "back", href: "#/" }, "‹ Danh sách"),
    infoSection(data.product, data.expiresAt),
    mediaSection(data.product),
  );
}

// ---------- router ----------

// api() đã chuyển sang #/settings khi gặp 401; ở đây chỉ nói cho người dùng biết vì sao.
function notifyAuth(err) {
  if (err.status === 401) toast(err.message);
  return err.status === 401;
}

function route() {
  const seq = ++renderSeq;
  const hash = location.hash.replace(/^#/, "") || "/";
  if (hash === "/settings") return viewSettings();
  if (!getToken()) {
    location.hash = "#/settings";
    return;
  }
  const detail = /^\/p\/([a-z0-9]+)$/.exec(hash);
  if (detail) return viewDetail(detail[1], seq);
  if (hash === "/") return viewList(seq);
  location.hash = "#/";
}

window.addEventListener("hashchange", route);
route();
