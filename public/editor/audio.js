// Ghép tiếng theo timeline. Logic thuần: chỉ làm việc với Float32Array.

// Đặt một khối mẫu nguồn vào bộ đệm của timeline.
//   dest        bộ đệm một kênh của cả timeline
//   base, cap   đoạn hiện tại chiếm dest[base .. base+cap)
//   src, srcRate  khối mẫu nguồn và tần số của nó
//   offsetSeconds thời điểm của mẫu đầu khối, tính từ đầu đoạn (âm nếu khối bắt đầu trước điểm cắt)
// Khác tần số thì nội suy tuyến tính. Trả số mẫu đã ghi.
export function placeSamples(dest, base, cap, src, srcRate, offsetSeconds, destRate) {
  const n = src.length;
  if (n === 0 || cap <= 0) return 0;
  const ratio = srcRate / destRate;
  const startPos = offsetSeconds * destRate; // vị trí (trong đoạn) của mẫu nguồn đầu tiên
  const first = Math.max(0, Math.ceil(startPos - 1e-9));
  const last = Math.min(cap - 1, Math.floor(startPos + (n - 1) / ratio + 1e-9));
  let written = 0;
  for (let j = first; j <= last; j++) {
    const pos = (j - startPos) * ratio;
    const i = Math.floor(pos + 1e-9);
    const frac = pos - i;
    const a = src[Math.min(Math.max(i, 0), n - 1)];
    const value = frac > 1e-6 && i + 1 < n ? a + (src[i + 1] - a) * frac : a;
    dest[base + j] = value;
    written++;
  }
  return written;
}

// Cộng một khối mẫu nguồn (nhân hệ số `gain`) vào `dest`, bắt đầu ở giây `startSeconds`; phần vượt cuối `dest` bị bỏ.
// Khác tần số thì nội suy tuyến tính. Tổng được kẹp trong [-1, 1]. Trả số mẫu đã cộng.
export function mixInto(dest, src, srcRate, destRate, startSeconds, gain = 1) {
  const n = src.length;
  if (n === 0) return 0;
  const ratio = srcRate / destRate;
  const startPos = startSeconds * destRate;
  const first = Math.max(0, Math.ceil(startPos - 1e-9));
  const last = Math.min(dest.length - 1, Math.floor(startPos + (n - 1) / ratio + 1e-9));
  let written = 0;
  for (let j = first; j <= last; j++) {
    const pos = (j - startPos) * ratio;
    const i = Math.floor(pos + 1e-9);
    const frac = pos - i;
    const a = src[Math.min(Math.max(i, 0), n - 1)];
    const value = frac > 1e-6 && i + 1 < n ? a + (src[i + 1] - a) * frac : a;
    dest[j] = Math.max(-1, Math.min(1, dest[j] + value * gain));
    written++;
  }
  return written;
}

// Đọc file WAV (PCM 16/24/32-bit hoặc float 32-bit) thành từng kênh Float32Array.
// Đi theo từng khối RIFF vì có phần mềm (CIT Voice Studio) chèn khối LIST trước khối data.
export function decodeWav(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (bytes.length < 12 || text(0) !== "RIFF" || text(8) !== "WAVE") throw new Error("File giọng đọc không phải WAV");
  let fmt = null, data = null;
  for (let o = 12; o + 8 <= bytes.length;) {
    const id = text(o), size = view.getUint32(o + 4, true);
    const body = o + 8;
    if (id === "fmt ") {
      let format = view.getUint16(body, true);
      if (format === 0xfffe && size >= 26) format = view.getUint16(body + 24, true); // WAVE_FORMAT_EXTENSIBLE
      fmt = { format, channels: view.getUint16(body + 2, true), rate: view.getUint32(body + 4, true), bits: view.getUint16(body + 14, true) };
    } else if (id === "data") {
      data = { offset: body, length: Math.min(size, bytes.length - body) }; // luồng stream ghi độ dài giả
      break;
    }
    o = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error("File WAV thiếu phần định dạng hoặc dữ liệu");
  const { format, channels, rate, bits } = fmt;
  const width = bits / 8;
  const ok = channels > 0 && rate > 0 && ((format === 1 && [16, 24, 32].includes(bits)) || (format === 3 && bits === 32));
  if (!ok) throw new Error("Định dạng WAV này chưa đọc được (cần PCM 16/24/32-bit hoặc float 32-bit)");
  const frames = Math.floor(data.length / (width * channels));
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < channels; c++) {
      const p = data.offset + (f * channels + c) * width;
      let v;
      if (format === 3) v = view.getFloat32(p, true);
      else if (bits === 16) v = view.getInt16(p, true) / 32768;
      else if (bits === 24) v = (((bytes[p + 2] << 24) | (bytes[p + 1] << 16) | (bytes[p] << 8)) >> 8) / 8388608;
      else v = view.getInt32(p, true) / 2147483648;
      out[c][f] = v;
    }
  }
  return { sampleRate: rate, channels: out };
}
