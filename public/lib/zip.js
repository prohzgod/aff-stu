// Tạo file .zip ngay trong trình duyệt. Phương thức STORE (không nén): ảnh và video vốn đã nén sẵn.
// Tên file ghi bằng UTF-8 và bật cờ bit 11 để Windows và iPhone hiện đúng dấu tiếng Việt.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const MAX_TOTAL = 3.9 * 1024 * 1024 * 1024; // zip thường (không ZIP64) giới hạn 4GB
const UTF8_FLAG = 0x0800;

// Chỉ giữ tên file, bỏ mọi phần đường dẫn, để giải nén không ghi ra ngoài thư mục đích.
function flatten(name) {
  const base = String(name ?? "").split(/[\\/]/).filter((part) => part && part !== "." && part !== "..").pop();
  return base || "file";
}

function uniqueNames(files) {
  const seen = new Map();
  return files.map((f) => {
    const name = flatten(f.name);
    const count = (seen.get(name) || 0) + 1;
    seen.set(name, count);
    if (count === 1) return name;
    const dot = name.lastIndexOf(".");
    return dot > 0 ? `${name.slice(0, dot)} (${count})${name.slice(dot)}` : `${name} (${count})`;
  });
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export function makeZip(files, date = new Date()) {
  const encoder = new TextEncoder();
  const names = uniqueNames(files).map((n) => encoder.encode(n));
  const stamp = dosDateTime(date);

  let total = 22;
  files.forEach((f, i) => { total += 30 + 46 + names[i].length * 2 + f.data.length; });
  if (total > MAX_TOTAL) throw new Error("File quá lớn để nén");

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  const entries = [];
  let pos = 0;

  files.forEach((f, i) => {
    const name = names[i];
    const crc = crc32(f.data);
    entries.push({ name, crc, size: f.data.length, offset: pos });
    view.setUint32(pos, 0x04034b50, true);
    view.setUint16(pos + 4, 20, true); // version needed
    view.setUint16(pos + 6, UTF8_FLAG, true);
    view.setUint16(pos + 8, 0, true); // STORE
    view.setUint16(pos + 10, stamp.time, true);
    view.setUint16(pos + 12, stamp.date, true);
    view.setUint32(pos + 14, crc, true);
    view.setUint32(pos + 18, f.data.length, true);
    view.setUint32(pos + 22, f.data.length, true);
    view.setUint16(pos + 26, name.length, true);
    view.setUint16(pos + 28, 0, true);
    out.set(name, pos + 30);
    out.set(f.data, pos + 30 + name.length);
    pos += 30 + name.length + f.data.length;
  });

  const cdStart = pos;
  for (const e of entries) {
    view.setUint32(pos, 0x02014b50, true);
    view.setUint16(pos + 4, 20, true); // version made by
    view.setUint16(pos + 6, 20, true); // version needed
    view.setUint16(pos + 8, UTF8_FLAG, true);
    view.setUint16(pos + 10, 0, true);
    view.setUint16(pos + 12, stamp.time, true);
    view.setUint16(pos + 14, stamp.date, true);
    view.setUint32(pos + 16, e.crc, true);
    view.setUint32(pos + 20, e.size, true);
    view.setUint32(pos + 24, e.size, true);
    view.setUint16(pos + 28, e.name.length, true);
    // extra, comment, disk, attrs trong/ngoài: để 0
    view.setUint32(pos + 42, e.offset, true);
    out.set(e.name, pos + 46);
    pos += 46 + e.name.length;
  }

  view.setUint32(pos, 0x06054b50, true);
  view.setUint16(pos + 8, entries.length, true);
  view.setUint16(pos + 10, entries.length, true);
  view.setUint32(pos + 12, pos - cdStart, true);
  view.setUint32(pos + 16, cdStart, true);
  return out;
}
