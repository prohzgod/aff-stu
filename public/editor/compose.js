// Vẽ MỘT frame 1080x1920. Dùng chung cho xem trước (luồng chính) và xuất (worker),
// để bản xem trước luôn giống bản xuất. Không import gì ngoài logic thuần.

import { OUTPUT, fitRect } from "./timeline.js";

// Vùng an toàn TikTok trên khung 1080x1920 (docs/spec/hau-ky.md mục 9.4): chừa chỗ cho giao diện của TikTok.
export const SAFE = { top: 130, bottom: 480, left: 44, right: 140 };

const WATERMARK_ALPHA = 0.7;
const LOGO_MAX_HEIGHT = 96;
const HANDLE_FONT = '600 40px "Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const HANDLE_HEIGHT = 48;

// Góc trên-trái của watermark có kích thước w x h, đặt sát mép vùng an toàn.
export function watermarkLayout(position, w, h) {
  const right = position === "tr" || position === "br";
  const bottom = position === "bl" || position === "br";
  return {
    x: right ? OUTPUT.width - SAFE.right - w : SAFE.left,
    y: bottom ? OUTPUT.height - SAFE.bottom - h : SAFE.top,
  };
}

function drawWatermark(ctx, watermark) {
  const logo = watermark?.logo;
  const handle = String(watermark?.handle ?? "").trim();
  if (!logo && !handle) return;
  ctx.save();
  ctx.globalAlpha = WATERMARK_ALPHA;
  if (logo) {
    const scale = Math.min(1, LOGO_MAX_HEIGHT / logo.height);
    const w = logo.width * scale, h = logo.height * scale;
    const { x, y } = watermarkLayout(watermark.position, w, h);
    ctx.drawImage(logo, x, y, w, h);
  } else {
    const text = handle.startsWith("@") ? handle : `@${handle}`;
    ctx.font = HANDLE_FONT;
    ctx.textBaseline = "top";
    const { x, y } = watermarkLayout(watermark.position, ctx.measureText(text).width, HANDLE_HEIGHT);
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, x, y);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// frame: {
//   source: { width, height, draw(ctx, x, y, w, h) } | null   hình nguồn của thời điểm này
//   fit: "cover" | "blur"
//   zoom: số ≥ 1 (Ken Burns cho ảnh tĩnh)
//   watermark: { handle, logo, position } | null
// }
export function composeFrame(ctx, frame) {
  const { width: W, height: H } = OUTPUT;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, W, H);

  const src = frame.source;
  if (src) {
    if (frame.fit === "blur") {
      if ("filter" in ctx) {
        const bg = fitRect(src.width, src.height, W, H, "cover");
        ctx.filter = "blur(40px) brightness(0.6)";
        // Phóng nhẹ để mép mờ không lộ viền đen.
        src.draw(ctx, bg.x - bg.w * 0.05, bg.y - bg.h * 0.05, bg.w * 1.1, bg.h * 1.1);
        ctx.filter = "none";
      } else {
        ctx.fillStyle = "#111111";
        ctx.fillRect(0, 0, W, H);
      }
      const r = fitRect(src.width, src.height, W, H, "contain");
      src.draw(ctx, r.x, r.y, r.w, r.h);
    } else {
      const r = fitRect(src.width, src.height, W, H, "cover");
      const zoom = frame.zoom > 1 ? frame.zoom : 1;
      const w = r.w * zoom, h = r.h * zoom;
      src.draw(ctx, r.x - (w - r.w) / 2, r.y - (h - r.h) / 2, w, h);
    }
  }
  drawWatermark(ctx, frame.watermark);
}
