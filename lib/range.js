// Phân tích header Range (một khoảng duy nhất) cho object có kích thước đã biết.
// Trả null khi không có header, "invalid" khi không thoả mãn được, hoặc { offset, length }.

export function parseRange(header, size) {
  if (header == null) return null;
  const m = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
  if (!m || (m[1] === "" && m[2] === "") || size <= 0) return "invalid";

  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (suffix <= 0) return "invalid";
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }

  const start = Number(m[1]);
  const end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start >= size || end < start) return "invalid";
  return { offset: start, length: end - start + 1 };
}
