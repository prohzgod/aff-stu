// Vẽ icon PWA (PNG) không cần thư viện: nền màu nhấn, khung video dọc 9:16 màu trắng.
// Chạy lại khi muốn đổi icon: node scripts/make-icons.mjs
import { deflateSync, crc32 } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const BG = [0xd6, 0x40, 0x2b];
const FG = [0xff, 0xff, 0xff];
const SS = 4; // lấy mẫu 4x4 mỗi điểm ảnh để mép mượt

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body) >>> 0, 8 + data.length);
  return out;
}

// Hình: khung video dọc 9:16 màu trắng, bo góc, bên trong có tam giác "play" cùng màu nền.
// scale: chiều cao khung so với cạnh icon (icon maskable cần hình nằm gọn trong vùng an toàn 80%).
function icon(size, scale) {
  const cx = size / 2, cy = size / 2;
  const hh = (size * scale) / 2;      // nửa chiều cao khung
  const hw = hh * (9 / 16) * 1.12;    // nửa chiều rộng, nới nhẹ cho dễ nhìn ở cỡ nhỏ
  const rad = hw * 0.34;              // bo góc
  const inFrame = (x, y) => {
    const dx = Math.abs(x - cx) - (hw - rad), dy = Math.abs(y - cy) - (hh - rad);
    if (dx <= 0 && dy <= 0) return true;
    if (dx > rad || dy > rad) return false;
    return dx <= 0 || dy <= 0 || dx * dx + dy * dy <= rad * rad;
  };
  const t = hw * 0.5;                 // cỡ tam giác
  const tx = cx + t * 0.12;
  const [ax, ay, bx, by, px, py] = [tx - t * 0.62, cy - t * 0.8, tx - t * 0.62, cy + t * 0.8, tx + t * 0.78, cy];
  const side = (x, y, x1, y1, x2, y2) => (x - x2) * (y1 - y2) - (x1 - x2) * (y - y2);
  const inPlay = (x, y) => {
    const d1 = side(x, y, ax, ay, bx, by), d2 = side(x, y, bx, by, px, py), d3 = side(x, y, px, py, ax, ay);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  const inside = (x, y) => inFrame(x, y) && !inPlay(x, y);
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) if (inside(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)) hits++;
      const t = hits / (SS * SS);
      const o = row + 1 + x * 4;
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(BG[c] + (FG[c] - BG[c]) * t);
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8 bit, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

const dir = new URL("../public/icons/", import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [name, size, scale] of [["icon-192.png", 192, 0.68], ["icon-512.png", 512, 0.68], ["maskable-512.png", 512, 0.52], ["apple-touch-icon.png", 180, 0.68]]) {
  writeFileSync(new URL(name, dir), icon(size, scale));
  console.log(name);
}
