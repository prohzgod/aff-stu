// Router + các màn hình: cài đặt token, danh sách, chi tiết sản phẩm (gói đăng bài nằm ở views/package.js).
// Dữ liệu sản phẩm lấy từ trang sàn nên không đáng tin: chỉ đưa vào DOM qua textContent (hàm h),
// URL phải qua safeUrl/mediaUrl.

import { api, getToken, setToken } from "/lib/api.js";
import { h, toast } from "/lib/dom.js";
import { formatPrice, formatCount, daysLeft, mediaUrl, safeUrl } from "/lib/format.js";
import { canShareFiles, shareFiles, downloadBlob, fetchAsFile } from "/lib/share.js";
import { makeZip } from "/lib/zip.js";
import { packageToText, slug } from "/lib/package-text.js";
import { shortName } from "/lib/prompt-library.js";
import { renderPackage } from "/views/package.js";

const app = document.getElementById("app");
let renderSeq = 0;

// ---------- tiện ích DOM ----------

let leaveView = null; // hàm dọn dẹp của màn hình đang mở (vd editor dừng worker)

function show(...nodes) {
  leaveView?.();
  leaveView = null;
  app.replaceChildren(...nodes.filter(Boolean));
  window.scrollTo(0, 0);
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
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
  const guide = h("section", { class: "card install-guide" },
    h("h2", {}, "Thêm vào Màn hình chính"),
    standalone
      ? h("p", { class: "muted" }, "Bạn đang mở app từ màn hình chính.")
      : h("p", { class: "muted" }, "Cài app lên điện thoại để mở nhanh như một ứng dụng."),
    h("ul", {},
      h("li", {}, h("strong", {}, "iPhone: "), "mở bằng Safari → nút Chia sẻ → Thêm vào Màn hình chính."),
      h("li", {}, h("strong", {}, "Android: "), "mở bằng Chrome → menu ⋮ → Thêm vào màn hình chính (hoặc Cài đặt ứng dụng)."),
    ),
    h("p", { class: "hint" }, "Sau khi cài, nhập lại token một lần trong app vừa cài."),
  );
  show(form, guide);
  if (getToken()) brandSection().then((node) => { if (location.hash === "#/settings" && node) app.insertBefore(node, guide); });
}

// Thu ảnh logo về PNG cạnh dài tối đa 512px, để nằm gọn trong giới hạn 300KB của server.
async function fileToPngDataUrl(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/png");
}

async function brandSection() {
  let brand;
  try {
    ({ brandkit: brand } = await api("/api/brandkit"));
  } catch {
    return null; // token sai hoặc mất mạng: trang cài đặt vẫn dùng được để nhập token
  }
  const handle = h("input", { id: "brand-handle", type: "text", maxlength: "40", placeholder: "@tenkenh", value: brand.handle, autocapitalize: "off", spellcheck: "false" });
  const position = h("select", { id: "brand-position" },
    [["tl", "Trên, bên trái"], ["tr", "Trên, bên phải"], ["bl", "Dưới, bên trái"], ["br", "Dưới, bên phải"]]
      .map(([value, label]) => h("option", { value, selected: brand.position === value }, label)));
  const enabled = h("input", { id: "brand-watermark", type: "checkbox", checked: brand.watermark });
  const logoFile = h("input", { id: "brand-logo", type: "file", accept: "image/*", hidden: true });
  const preview = h("div", { class: "brand-logo" });
  const message = h("p", { class: "field-error", hidden: true });
  let logo = brand.logo;
  const drawLogo = () => preview.replaceChildren(...(logo
    ? [h("img", { src: logo, alt: "Logo" }), h("button", { class: "btn small", type: "button", onclick: () => { logo = null; drawLogo(); } }, "Bỏ logo")]
    : [h("span", { class: "muted" }, "Chưa có logo: watermark sẽ là @tên kênh.")]));
  drawLogo();
  logoFile.addEventListener("change", async () => {
    const file = logoFile.files[0];
    logoFile.value = "";
    if (!file) return;
    try {
      logo = await fileToPngDataUrl(file);
      message.hidden = true;
      drawLogo();
    } catch {
      message.textContent = "Không đọc được ảnh này.";
      message.hidden = false;
    }
  });
  const save = h("button", { class: "btn primary", type: "submit" }, "Lưu brand kit");
  return h("form", { class: "card form brand", onsubmit: async (e) => {
    e.preventDefault();
    save.disabled = true;
    try {
      await api("/api/brandkit", { method: "PUT", body: { handle: handle.value, position: position.value, watermark: enabled.checked, logo } });
      message.hidden = true;
      toast("Đã lưu brand kit");
    } catch (err) {
      message.textContent = err.message;
      message.hidden = false;
    } finally {
      save.disabled = false;
    }
  } },
    h("h2", {}, "Brand kit"),
    h("p", { class: "muted" }, "Dùng làm watermark khi dựng video. Lưu lâu dài, không bị xoá sau 7 ngày."),
    h("div", { class: "field" }, h("label", { for: "brand-handle" }, "Tên kênh"), handle),
    h("div", { class: "field" }, h("label", {}, "Logo"), preview, logoFile, h("div", { class: "row" }, h("button", { class: "btn small", type: "button", onclick: () => logoFile.click() }, "Chọn ảnh logo"))),
    h("div", { class: "field" }, h("label", { for: "brand-position" }, "Vị trí watermark"), position),
    h("label", { class: "check" }, enabled, "Chèn watermark vào video"),
    message,
    save,
  );
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
        item.hasFinal && h("span", { class: "badge ok" }, "Có video"),
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

// Nút chia sẻ file sang app khác (TikTok, Flow…). Chỉ có khi trình duyệt chia sẻ được file và file đã lưu về kho.
function shareButton(item, filename, label) {
  if (!item.stored || !canShareFiles()) return null;
  const button = h("button", { class: "btn small", type: "button", "aria-label": `Chia sẻ ${label}`, onclick: async () => {
    button.disabled = true;
    try {
      const result = await shareFiles([await fetchAsFile(mediaUrl(item), filename)]);
      if (result === "unsupported") toast("Thiết bị này không chia sẻ được file, hãy dùng nút Tải");
    } catch (err) {
      toast(err.message);
    } finally {
      button.disabled = false;
    }
  } }, "↗ Chia sẻ");
  return button;
}

// Gom ảnh/video đã lưu + gói đăng bài + product.json thành một file zip, nén ngay trong trình duyệt.
async function downloadZip(product, entries, pkgState, button) {
  const label = button.textContent;
  button.disabled = true;
  try {
    const stored = entries.filter((e) => e.item.stored);
    const files = [];
    let failed = 0;
    for (const [i, e] of stored.entries()) {
      button.textContent = `Đang gom ${i + 1}/${stored.length}…`;
      try {
        const file = await fetchAsFile(mediaUrl(e.item), e.filename);
        files.push({ name: e.zipName, data: new Uint8Array(await file.arrayBuffer()) });
      } catch {
        failed++;
      }
    }
    const encoder = new TextEncoder();
    const pkg = pkgState.snapshot?.() ?? pkgState.pkg;
    if (pkg) files.push({ name: "goi-dang-bai.txt", data: encoder.encode(packageToText(product, pkg)) });
    files.push({ name: "product.json", data: encoder.encode(JSON.stringify(product, null, 2)) });

    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    downloadBlob(new Blob([makeZip(files, d)], { type: "application/zip" }), `${slug(shortName(product.title))}_${stamp}.zip`);

    const skipped = entries.length - stored.length + failed;
    toast(skipped > 0 ? `Đã tạo zip, bỏ qua ${skipped} file chưa lưu về kho` : "Đã tạo zip");
  } catch (err) {
    toast(`Không tạo được zip: ${err.message}`);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
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

function mediaSection(product, pkgState) {
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

  const imageEntry = (im, i) => {
    const n = String(i + 1).padStart(2, "0");
    const ext = im.stored ? im.stored.split(".").pop() : "jpg";
    return { item: im, filename: `${product.id}_img_${n}.${ext}`, zipName: `img_${n}.${ext}`, label: `ảnh ${i + 1}` };
  };
  const videoEntry = ([name, v]) => ({ item: v, filename: `${product.id}_video_${name}.mp4`, zipName: `video_${name}.mp4`, label: "video" });
  const entries = [...images.map(imageEntry), ...uniqueVideos.map(videoEntry)];
  const zipButton = h("button", { class: "btn small push", type: "button", "data-action": "zip", onclick: () => downloadZip(product, entries, pkgState, zipButton) }, "⬇ Tải tất cả .zip");

  return h("section", { class: "card" },
    h("div", { class: "row" }, h("h2", {}, "Ảnh & video"), zipButton),
    linked > 0 && h("p", { class: "hint" }, `${linked} file chưa lưu được về kho, đang dùng link gốc của sàn (link này có thể hết hạn).`),
    images.length === 0 && uniqueVideos.length === 0 && h("p", { class: "muted" }, "Sản phẩm này không có ảnh hay video."),
    images.length > 0 && h("div", { class: "media-grid" }, images.map((im, i) => {
      const e = imageEntry(im, i);
      return h("figure", { class: "media" },
        h("div", { class: "media-img" }, image(mediaUrl(im), `Ảnh ${i + 1}`)),
        h("figcaption", {}, h("span", {}, `Ảnh ${i + 1}`), h("span", { class: "actions" }, shareButton(im, e.filename, e.label), downloadLink(im, e.filename, e.label))),
      );
    })),
    uniqueVideos.map((pair) => {
      const e = videoEntry(pair);
      return h("figure", { class: "media video" },
        h("video", { src: mediaUrl(e.item), controls: true, playsinline: true, preload: "metadata" }),
        h("figcaption", {}, h("span", {}, "Video sản phẩm"), h("span", { class: "actions" }, shareButton(e.item, e.filename, e.label), downloadLink(e.item, e.filename, e.label))),
      );
    }),
  );
}

// Màn hình dựng video. Mã của editor (và thư viện video) chỉ được tải khi vào đây.
async function viewEditor(id, seq) {
  show(loading("Đang mở trình dựng video…"));
  let data, editor;
  try {
    [data, editor] = await Promise.all([api(`/api/products/${encodeURIComponent(id)}`), import("/editor/editor.js")]);
  } catch (err) {
    if (notifyAuth(err) || seq !== renderSeq) return;
    show(err.status === 404
      ? h("div", { class: "state" }, h("p", { class: "state-title" }, "Sản phẩm không còn"), h("a", { class: "btn", href: "#/" }, "Về danh sách"))
      : errorState(err.message || "Không mở được trình dựng video", route));
    return;
  }
  if (seq !== renderSeq) return;
  const box = h("div", { class: "editor" });
  show(box);
  leaveView = editor.renderEditor(box, data.product, data.package);
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
  const finalItem = data.final && { stored: data.final.url.replace(/^\/media\//, "") };
  const finalName = `${slug(shortName(data.product.title))}.mp4`;
  const coverItem = data.cover && { stored: data.cover.url.replace(/^\/media\//, "") };
  const coverName = `${slug(shortName(data.product.title))}_bia.png`;
  const hasOutput = Boolean(data.final || data.cover);
  const finalSection = h("section", { class: "card final" },
    h("div", { class: "row" },
      h("h2", {}, hasOutput ? "Video thành phẩm" : "Hậu kỳ"),
      h("a", { class: "btn small push", href: `#/p/${data.product.id}/edit`, "data-action": "open-editor" }, hasOutput ? "🎬 Dựng lại" : "🎬 Dựng video"),
    ),
    hasOutput
      ? h("div", { class: "final-grid" },
          data.final && h("figure", { class: "final-item" },
            h("video", { class: "final-video", src: data.final.url, controls: true, playsinline: true, preload: "metadata" }),
            h("figcaption", { class: "row wrap" }, h("span", {}, "Video"), h("span", { class: "actions" }, shareButton(finalItem, finalName, "video thành phẩm"), downloadLink(finalItem, finalName, "video thành phẩm"))),
          ),
          data.cover && h("figure", { class: "final-item" },
            h("img", { class: "final-cover", src: data.cover.url, alt: "Ảnh bìa", loading: "lazy" }),
            h("figcaption", { class: "row wrap" }, h("span", {}, "Ảnh bìa"), h("span", { class: "actions" }, shareButton(coverItem, coverName, "ảnh bìa"), downloadLink(coverItem, coverName, "ảnh bìa"))),
          ),
        )
      : h("p", { class: "muted" }, "Ghép các clip từ Google Flow thành một video 1080x1920 để đăng. Nên dựng trên máy tính."),
  );
  const pkgState = { pkg: data.package };
  const packageBox = h("div", { class: "pkg" });
  show(
    h("a", { class: "back", href: "#/" }, "‹ Danh sách"),
    infoSection(data.product, data.expiresAt),
    hasOutput && finalSection,
    mediaSection(data.product, pkgState),
    packageBox,
    !hasOutput && finalSection,
  );
  renderPackage(packageBox, data.product, pkgState);
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
  const edit = /^\/p\/([a-z0-9]+)\/edit$/.exec(hash);
  if (edit) return viewEditor(edit[1], seq);
  const detail = /^\/p\/([a-z0-9]+)$/.exec(hash);
  if (detail) return viewDetail(detail[1], seq);
  if (hash === "/") return viewList(seq);
  location.hash = "#/";
}

window.addEventListener("hashchange", route);
route();

// PWA: service worker giữ app shell để mở được khi mạng chập chờn (không lưu /api và /media).
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => { /* không có SW thì app vẫn chạy bình thường */ });
}
