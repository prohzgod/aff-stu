// Trình làm ảnh bìa 1080x1920 (docs/spec/hau-ky.md mục 9.6). Dùng Konva để kéo-thả chữ, sticker giá, logo.
// Nền là một frame của video hoặc một ảnh sản phẩm.

import { h, toast } from "/lib/dom.js";
import { OUTPUT, SAFE, fitRect } from "./timeline.js";
import { FONT_FAMILY, priceLabel } from "./overlays.js";

const SCALE = 0.25; // hiển thị 270x480, xuất ra 1080x1920
const AREA_W = OUTPUT.width - SAFE.left - SAFE.right;
const CENTER_X = SAFE.left + AREA_W / 2;
const TEMPLATES = {
  top: { label: "Chữ trên", textY: 230, priceY: 1180 },
  middle: { label: "Chữ giữa", textY: 760, priceY: 1180 },
  bottom: { label: "Chữ dưới", textY: 1150, priceY: 230 },
};

let konvaLoading = null;
function loadKonva() {
  konvaLoading ??= new Promise((resolve, reject) => {
    if (window.Konva) return resolve(window.Konva);
    const script = document.createElement("script");
    script.src = "/editor/vendor/konva-10.9.1.min.js";
    script.onload = () => resolve(window.Konva);
    script.onerror = () => { konvaLoading = null; reject(new Error("Không tải được trình làm ảnh bìa")); };
    document.head.append(script);
  });
  return konvaLoading;
}

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error("Không tải được ảnh"));
  img.src = src;
});

/**
 * host: phần tử chứa trình làm ảnh bìa.
 * options: { product, pkg, logo, total, fps, startTime, frameAt(t) → Promise<canvas 1080x1920>, onSave({ blob, insert }) → Promise, onClose() }
 */
export async function openCoverEditor(host, options) {
  const { product, pkg, logo, total, fps, startTime = 0, frameAt, onSave, onClose } = options;
  host.replaceChildren(h("p", { class: "muted" }, "Đang mở trình làm ảnh bìa…"));
  const Konva = await loadKonva();

  const texts = (Array.isArray(pkg?.coverTexts) ? pkg.coverTexts : []).filter((t) => typeof t === "string" && t.trim());
  const price = priceLabel(product);
  const productImages = (Array.isArray(product.images) ? product.images : []).filter((im) => im?.stored).slice(0, 6);

  // ----- khung vẽ -----
  const stageBox = h("div", { class: "cover-stage" });
  const stage = new Konva.Stage({ container: stageBox, width: OUTPUT.width * SCALE, height: OUTPUT.height * SCALE, scaleX: SCALE, scaleY: SCALE });
  const layer = new Konva.Layer();
  stage.add(layer);

  const background = new Konva.Image({ x: 0, y: 0, width: OUTPUT.width, height: OUTPUT.height });
  const fill = new Konva.Rect({ x: 0, y: 0, width: OUTPUT.width, height: OUTPUT.height, fill: "#111111" });
  const title = new Konva.Text({
    x: SAFE.left, y: TEMPLATES.top.textY, width: AREA_W, text: texts[0] || "Chữ ảnh bìa",
    fontFamily: FONT_FAMILY, fontStyle: "800", fontSize: 110, lineHeight: 1.12, align: "center",
    fill: "#ffffff", stroke: "#000000", strokeWidth: 16, lineJoin: "round", fillAfterStrokeEnabled: true, draggable: true,
  });
  const sticker = new Konva.Label({ y: TEMPLATES.top.priceY, draggable: true, visible: Boolean(price) });
  sticker.add(new Konva.Tag({ fill: "#d6402b", cornerRadius: 60 }));
  sticker.add(new Konva.Text({ text: price || " ", fontFamily: FONT_FAMILY, fontStyle: "800", fontSize: 76, fill: "#ffffff", padding: 30 }));
  const logoNode = new Konva.Image({ x: SAFE.left, y: SAFE.top, visible: false, draggable: true });
  layer.add(fill, background, title, sticker, logoNode);

  const centerSticker = () => sticker.x(CENTER_X - sticker.width() / 2);

  function setBackground(image, width, height) {
    const r = fitRect(width, height, OUTPUT.width, OUTPUT.height, "cover");
    background.image(image);
    background.setAttrs({ x: r.x, y: r.y, width: r.w, height: r.h });
    layer.batchDraw();
  }

  function applyTemplate(name) {
    const t = TEMPLATES[name];
    title.setAttrs({ x: SAFE.left, y: t.textY });
    sticker.y(t.priceY);
    centerSticker();
    layer.batchDraw();
  }

  // ----- điều khiển -----
  const timeLabel = h("span", { class: "muted" });
  const slider = h("input", { id: "cover-time", type: "range", min: "0", max: String(Math.max(0, total - 1 / fps)), step: String(1 / fps), value: String(startTime) });
  let frameSeq = 0;
  async function useFrame(t) {
    const seq = ++frameSeq;
    timeLabel.textContent = `${t.toFixed(2)}s`;
    const canvas = await frameAt(t);
    if (seq !== frameSeq) return;
    // Chép sang canvas riêng: canvas xem trước sẽ đổi khi người dùng tua tiếp.
    const copy = document.createElement("canvas");
    copy.width = OUTPUT.width;
    copy.height = OUTPUT.height;
    copy.getContext("2d").drawImage(canvas, 0, 0);
    setBackground(copy, OUTPUT.width, OUTPUT.height);
  }
  slider.addEventListener("input", () => useFrame(Number(slider.value)));
  const step = (dir) => {
    const next = Math.min(Number(slider.max), Math.max(0, Number(slider.value) + dir / fps));
    slider.value = String(next);
    useFrame(next);
  };

  const textInput = h("input", { id: "cover-text", type: "text", maxlength: "80", value: title.text() });
  textInput.addEventListener("input", () => { title.text(textInput.value || " "); layer.batchDraw(); });
  const textChips = texts.map((t) => h("button", { class: "chip cover-pick", type: "button", onclick: () => { textInput.value = t; title.text(t); layer.batchDraw(); } }, t));

  const size = h("input", { id: "cover-size", type: "range", min: "60", max: "170", step: "2", value: "110" });
  size.addEventListener("input", () => { const v = Number(size.value); title.setAttrs({ fontSize: v, strokeWidth: v * 0.145 }); layer.batchDraw(); });

  const priceToggle = h("input", { id: "cover-price", type: "checkbox", checked: Boolean(price), disabled: !price });
  priceToggle.addEventListener("change", () => { sticker.visible(priceToggle.checked); layer.batchDraw(); });
  const logoToggle = h("input", { id: "cover-logo", type: "checkbox", checked: Boolean(logo), disabled: !logo });
  logoToggle.addEventListener("change", () => { logoNode.visible(logoToggle.checked); layer.batchDraw(); });

  const insert = h("input", { id: "cover-insert", type: "checkbox", checked: true });
  const saveButton = h("button", { class: "btn primary", type: "button", "data-action": "save-cover" }, "Lưu ảnh bìa");
  const toBlob = () => new Promise((resolve, reject) => {
    const canvas = stage.toCanvas({ pixelRatio: 1 / SCALE });
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Không tạo được ảnh"))), "image/png");
  });
  saveButton.addEventListener("click", async () => {
    saveButton.disabled = true;
    saveButton.textContent = "Đang lưu…";
    try {
      await onSave({ blob: await toBlob(), insert: insert.checked });
      saveButton.textContent = "Đã lưu ảnh bìa ✓";
    } catch (err) {
      saveButton.textContent = "Lưu ảnh bìa";
      toast(`Chưa lưu được ảnh bìa: ${err.message}`);
    } finally {
      saveButton.disabled = false;
    }
  });

  host.replaceChildren(
    h("div", { class: "row" }, h("h2", {}, "Ảnh bìa"), h("button", { class: "btn small push", type: "button", onclick: () => { stage.destroy(); onClose?.(); } }, "Đóng")),
    h("div", { class: "cover-grid" },
      stageBox,
      h("div", { class: "cover-controls" },
        h("div", { class: "field" },
          h("label", { for: "cover-time" }, "Nền: frame của video"),
          h("div", { class: "row" },
            h("button", { class: "btn small", type: "button", "aria-label": "Lùi một frame", onclick: () => step(-1) }, "‹"),
            slider,
            h("button", { class: "btn small", type: "button", "aria-label": "Tiến một frame", onclick: () => step(1) }, "›"),
            timeLabel,
          ),
        ),
        productImages.length > 0 && h("div", { class: "field" },
          h("label", {}, "Hoặc dùng ảnh sản phẩm"),
          h("div", { class: "row wrap" }, productImages.map((im, i) => h("button", { class: "btn small", type: "button", "data-cover-image": String(i), onclick: async () => {
            try {
              frameSeq++;
              const img = await loadImage(`/media/${im.stored}`);
              setBackground(img, img.naturalWidth, img.naturalHeight);
            } catch (err) {
              toast(err.message);
            }
          } }, `Ảnh ${i + 1}`))),
        ),
        h("div", { class: "field" }, h("label", { for: "cover-text" }, "Chữ"), textInput, textChips.length > 0 && h("div", { class: "row wrap" }, textChips)),
        h("div", { class: "field" }, h("label", { for: "cover-size" }, "Cỡ chữ"), size),
        h("div", { class: "field" },
          h("label", {}, "Bố cục"),
          h("div", { class: "row wrap" }, Object.entries(TEMPLATES).map(([name, t]) => h("button", { class: "btn small", type: "button", "data-template": name, onclick: () => applyTemplate(name) }, t.label))),
        ),
        h("label", { class: "check" }, priceToggle, price ? `Sticker giá (${price})` : "Sticker giá (sản phẩm chưa có giá)"),
        h("label", { class: "check" }, logoToggle, logo ? "Logo" : "Logo (chưa có trong brand kit)"),
        h("p", { class: "hint" }, "Kéo chữ, sticker và logo trực tiếp trên ảnh để đổi vị trí."),
        h("label", { class: "check" }, insert, "Chèn làm 0,2 giây đầu video (để chọn đúng frame này làm bìa khi đăng)"),
        h("div", { class: "row wrap" },
          saveButton,
          h("button", { class: "btn", type: "button", onclick: async () => {
            const url = URL.createObjectURL(await toBlob());
            const a = h("a", { href: url, download: "cover.png" });
            document.body.append(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
          } }, "⬇ Tải ảnh bìa"),
        ),
      ),
    ),
  );

  centerSticker();
  if (logo) {
    try {
      const img = await loadImage(logo);
      const hgt = 120;
      logoNode.setAttrs({ image: img, height: hgt, width: (img.naturalWidth / img.naturalHeight) * hgt, visible: true });
    } catch { /* logo hỏng: bỏ qua */ }
  }
  await useFrame(startTime);
  layer.draw();
  host.dataset.ready = "1";
  // Cho kiểm thử tự động đọc lại trạng thái.
  host.coverState = () => ({ text: title.text(), textY: title.y(), stickerVisible: sticker.visible(), stickerX: sticker.x(), stickerW: sticker.width() });
}
