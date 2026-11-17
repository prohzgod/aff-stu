// Lớp chữ trên video: chữ hook, sticker giá, CTA. Nội dung lấy sẵn từ gói đăng bài.
// Phần tính toán là logic thuần (test được); phần vẽ dùng chung cho xem trước và xuất.

import { OUTPUT, SAFE } from "./timeline.js";
import { priceK } from "../lib/format.js";

export const FONT_FAMILY = '"Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const HOOK_SECONDS = 3;
const PRICE_SECONDS = 3;
const CTA_SECONDS = 2.5;
const ACCENT = "#d6402b";

const AREA = { x: SAFE.left, w: OUTPUT.width - SAFE.left - SAFE.right };
const CENTER_X = AREA.x + AREA.w / 2;
const BOTTOM = OUTPUT.height - SAFE.bottom;

// Mỗi loại: cỡ chữ thử lần lượt, số dòng tối đa, đệm của nền (sticker), và vị trí theo chiều dọc.
const STYLES = {
  hook: { sizes: [96, 84, 72, 60], maxLines: 3, weight: 800, padX: 0, padY: 0, top: 250 },
  price: { sizes: [66, 58, 50, 42], maxLines: 1, weight: 800, padX: 40, padY: 20, bottomGap: 178 },
  // CTA: nhãn sát mép trái, phía dưới là mũi tên chỉ xuống chỗ TikTok đặt nút giỏ hàng (góc dưới bên trái, ngoài vùng an toàn).
  cta: { sizes: [54, 48, 42, 40], maxLines: 1, weight: 800, padX: 36, padY: 18, bottomGap: 12 + 56, align: "left", arrow: { height: 56, half: 34, offsetX: 110 } },
};
const LINE_HEIGHT = 1.18;

export function priceLabel(product) {
  const price = priceK(product?.price?.current);
  if (!price) return "";
  const discount = String(product?.price?.discount ?? "");
  return /^-?\d{1,2}%$/.test(discount) ? `Chỉ ${price} · -${discount.replace("-", "")}` : `Chỉ ${price}`;
}

export function defaultOverlays(product, pkg) {
  const hook = String(pkg?.hooks?.[0]?.onScreen ?? "").trim();
  const price = priceLabel(product);
  return {
    hook: { enabled: Boolean(hook), text: hook },
    price: { enabled: Boolean(price), text: price },
    cta: { enabled: true, text: "Bấm giỏ hàng 🛒" },
  };
}

// Các lớp chữ đang hiện tại thời điểm t của video dài total giây.
export function activeOverlays(overlays, t, total) {
  const on = (kind) => overlays?.[kind]?.enabled && String(overlays[kind].text ?? "").trim();
  const out = [];
  if (on("hook") && t < Math.min(HOOK_SECONDS, total)) out.push({ kind: "hook", text: overlays.hook.text.trim() });
  if (on("price") && t >= total - PRICE_SECONDS) out.push({ kind: "price", text: overlays.price.text.trim() });
  if (on("cta") && t >= total - CTA_SECONDS) out.push({ kind: "cta", text: overlays.cta.text.trim() });
  return out;
}

// measure(text) → chiều rộng. Xuống dòng theo từ.
export function wrapText(measure, text, maxWidth) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// measure(text, fontSize) → chiều rộng. Chọn cỡ chữ lớn nhất mà chữ vừa maxWidth và maxLines.
export function fitText(measure, text, { maxWidth, maxLines, sizes }) {
  for (const fontSize of sizes) {
    const lines = wrapText((t) => measure(t, fontSize), text, maxWidth);
    if (lines.length <= maxLines && lines.every((l) => measure(l, fontSize) <= maxWidth)) return { fontSize, lines };
  }
  // Không cỡ nào vừa: dùng cỡ nhỏ nhất, cắt bớt và thêm dấu ba chấm.
  const fontSize = sizes.at(-1);
  const m = (t) => measure(t, fontSize);
  const lines = wrapText(m, text, maxWidth).slice(0, maxLines).map((line) => {
    let s = line;
    while ([...s].length > 1 && m(s) > maxWidth) s = [...s].slice(0, -1).join("");
    return s;
  });
  let last = lines[lines.length - 1] ?? "";
  while ([...last].length > 1 && m(`${last}…`) > maxWidth) last = [...last].slice(0, -1).join("");
  lines[lines.length - 1] = `${last.trimEnd()}…`;
  return { fontSize, lines };
}

// Vị trí và cỡ chữ của một lớp, luôn nằm trong vùng an toàn.
export function layoutOverlay(kind, text, measure) {
  const style = STYLES[kind] || STYLES.hook;
  const { fontSize, lines } = fitText(measure, text, { maxWidth: AREA.w - style.padX * 2, maxLines: style.maxLines, sizes: style.sizes });
  const textW = Math.max(...lines.map((l) => measure(l, fontSize)), 1);
  const w = Math.min(AREA.w, textW + style.padX * 2);
  const h = lines.length * fontSize * LINE_HEIGHT + style.padY * 2;
  const y = style.top !== undefined ? style.top : BOTTOM - style.bottomGap - h;
  const x = style.align === "left" ? AREA.x : CENTER_X - w / 2;
  const layout = { kind, fontSize, lines, weight: style.weight, padY: style.padY, box: { x, y, w, h } };
  if (style.arrow) {
    // Mũi tên đi từ mép dưới nhãn xuống sát mép dưới vùng an toàn; x là trục, half là nửa bề rộng đầu mũi tên.
    const half = style.arrow.half;
    layout.arrow = { x: x + Math.max(half, Math.min(style.arrow.offsetX, w - half)), top: y + h, bottom: y + h + style.arrow.height, half };
  }
  return layout;
}

// Mũi tên trắng viền tối, chỉ thẳng xuống: thân ngắn rồi tới đầu tam giác.
function drawArrow(ctx, { x, top, bottom, half }) {
  const neck = bottom - half * 1.1; // chỗ thân nối vào đầu mũi tên
  const stem = half * 0.42;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x - stem, top - 2);
  ctx.lineTo(x + stem, top - 2);
  ctx.lineTo(x + stem, neck);
  ctx.lineTo(x + half, neck);
  ctx.lineTo(x, bottom);
  ctx.lineTo(x - half, neck);
  ctx.lineTo(x - stem, neck);
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
}

export function drawOverlays(ctx, list) {
  if (!Array.isArray(list) || list.length === 0) return;
  const font = (size, weight) => `${weight} ${size}px ${FONT_FAMILY}`;
  for (const item of list) {
    const weight = (STYLES[item.kind] || STYLES.hook).weight;
    const measure = (text, size) => { ctx.font = font(size, weight); return ctx.measureText(text).width; };
    const layout = layoutOverlay(item.kind, item.text, measure);
    const { box, fontSize, lines } = layout;
    ctx.save();
    ctx.font = font(fontSize, weight);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (item.kind !== "hook") {
      ctx.fillStyle = item.kind === "price" ? ACCENT : "#ffffff";
      ctx.beginPath();
      ctx.roundRect(box.x, box.y, box.w, box.h, box.h / 2);
      ctx.fill();
    }
    if (layout.arrow) drawArrow(ctx, layout.arrow);
    const centerX = box.x + box.w / 2;
    lines.forEach((line, i) => {
      const y = box.y + layout.padY + fontSize * LINE_HEIGHT * (i + 0.5);
      if (item.kind === "hook") {
        ctx.lineJoin = "round";
        ctx.lineWidth = fontSize * 0.16;
        ctx.strokeStyle = "#000000";
        ctx.strokeText(line, centerX, y);
        ctx.fillStyle = "#ffffff";
      } else {
        ctx.fillStyle = item.kind === "price" ? "#ffffff" : "#111111";
      }
      ctx.fillText(line, centerX, y);
    });
    ctx.restore();
  }
}

// Giao diện TikTok giả, chỉ phủ lên bản xem trước để thấy chỗ nào bị che. Không bao giờ có trong bản xuất.
export function drawTikTokUi(ctx) {
  const { width: W, height: H } = OUTPUT;
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fillRect(0, 0, W, SAFE.top);
  ctx.fillRect(0, H - SAFE.bottom, W, SAFE.bottom);
  ctx.fillRect(W - SAFE.right, SAFE.top, SAFE.right, H - SAFE.top - SAFE.bottom);
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.font = `600 34px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Đang Follow   |   Dành cho bạn", W / 2, 78);
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(W - 70, 900 + i * 130, i === 0 ? 48 : 40, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.textAlign = "left";
  ctx.fillText("@tenkenh", 44, H - 400);
  ctx.font = `400 30px ${FONT_FAMILY}`;
  ctx.fillText("Caption của video hiện ở đây…", 44, H - 345);
  ctx.fillStyle = "#f5b301";
  ctx.beginPath();
  ctx.roundRect(44, H - 290, 420, 64, 12);
  ctx.fill();
  ctx.fillStyle = "#111111";
  ctx.fillText("🛒 Giỏ hàng · Sản phẩm", 64, H - 257);
  ctx.restore();
}
