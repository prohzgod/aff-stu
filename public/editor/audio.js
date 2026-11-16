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
