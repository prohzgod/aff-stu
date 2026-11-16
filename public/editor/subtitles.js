// Phụ đề: chuẩn bị tiếng để phiên âm, chia dòng, chỉnh sửa, xuất SRT và vẽ lên video.
// Phần tính toán là logic thuần; phần vẽ dùng chung cho xem trước và xuất.

import { OUTPUT, SAFE } from "./timeline.js";
import { FONT_FAMILY, fitText } from "./overlays.js";

// Ba kiểu hiển thị (docs/spec/hau-ky.md mục 9.5).
export const SUBTITLE_STYLES = {
  karaoke: { label: "Karaoke (tô màu từ đang nói)", maxWords: 3, maxChars: 22, sizes: [84, 72, 60, 50], weight: 800 },
  box: { label: "Hộp nền", maxWords: 7, maxChars: 34, sizes: [56, 50, 44], weight: 600 },
  minimal: { label: "Tối giản", maxWords: 7, maxChars: 34, sizes: [60, 52, 46], weight: 600 },
};
const styleOf = (name) => SUBTITLE_STYLES[name] || SUBTITLE_STYLES.karaoke;

const GAP_BREAK = 0.6;      // nghỉ lâu hơn mức này thì sang dòng mới
const MIN_WORD = 0.05;
const MIN_LINE = 0.1;
const HIGHLIGHT = "#ffe14d";
const AREA = { x: SAFE.left, w: OUTPUT.width - SAFE.left - SAFE.right };
const CENTER_X = AREA.x + AREA.w / 2;
const BOTTOM = 1140;        // mép dưới của phụ đề: nằm phía trên sticker giá và CTA
const LINE_HEIGHT = 1.2;
const round3 = (v) => Math.round(v * 1000) / 1000;

// ---------- tiếng gửi đi phiên âm ----------

// Trộn hai kênh và hạ tần số về 16kHz bằng cách lấy trung bình từng cửa sổ.
export function toMono16k(left, right, rate) {
  const n = Math.floor((left.length * 16000) / rate);
  const out = new Float32Array(n);
  const ratio = rate / 16000;
  for (let i = 0; i < n; i++) {
    const from = Math.floor(i * ratio), to = Math.max(from + 1, Math.min(left.length, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = from; j < to; j++) sum += (left[j] + right[j]) / 2;
    out[i] = sum / (to - from);
  }
  return out;
}

// WAV PCM 16-bit một kênh.
export function encodeWav(samples, rate) {
  const out = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(out.buffer);
  const tag = (offset, text) => { for (let i = 0; i < 4; i++) out[offset + i] = text.charCodeAt(i); };
  tag(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); tag(8, "WAVE");
  tag(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  tag(36, "data"); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  return out;
}

// ---------- chia dòng ----------

const makeLine = (words) => ({
  text: words.map((w) => w.w).join(" "),
  start: words[0].start,
  end: Math.max(...words.map((w) => w.end)),
  words,
});

// words: [{ w, start, end }] từ dịch vụ phiên âm.
export function wordsToLines(words, styleName) {
  const style = styleOf(styleName);
  const clean = (Array.isArray(words) ? words : [])
    .map((x) => ({ w: String(x?.w ?? "").trim(), start: Number(x?.start), end: Number(x?.end) }))
    .filter((x) => x.w && Number.isFinite(x.start))
    .map((x) => ({ ...x, start: Math.max(0, x.start), end: Number.isFinite(x.end) && x.end > x.start ? x.end : Math.max(0, x.start) + MIN_WORD }));
  const lines = [];
  let current = [];
  for (const word of clean) {
    const prev = current.at(-1);
    const chars = current.reduce((n, w) => n + w.w.length + 1, 0) + word.w.length;
    const mustBreak = prev && (
      current.length >= style.maxWords || chars > style.maxChars ||
      word.start - prev.end > GAP_BREAK || /[.!?…]$/.test(prev.w)
    );
    if (mustBreak) { lines.push(makeLine(current)); current = []; }
    current.push(word);
  }
  if (current.length) lines.push(makeLine(current));
  return lines;
}

// Dự phòng khi không phiên âm được: rải đều lời thoại đã biết trong khoảng [start, end].
export function linesFromText(text, start, end, styleName) {
  const tokens = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || !(end > start)) return [];
  const step = (end - start) / tokens.length;
  return wordsToLines(tokens.map((w, i) => ({ w, start: start + i * step, end: i === tokens.length - 1 ? end : start + (i + 1) * step })), styleName);
}

// Dòng đang hiện và từ đang nói tại thời điểm t.
export function activeLine(lines, t) {
  const line = (Array.isArray(lines) ? lines : []).find((l) => t >= l.start && t < l.end);
  if (!line) return null;
  let wordIndex = 0;
  (line.words || []).forEach((w, i) => { if (t >= w.start) wordIndex = i; });
  return { line, wordIndex };
}

// ---------- SRT ----------

export function formatSrtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const pad = (v, n = 2) => String(v).padStart(n, "0");
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

export function toSrt(lines) {
  return (Array.isArray(lines) ? lines : [])
    .map((l) => ({ ...l, text: String(l.text ?? "").replace(/\s*[\r\n]+\s*/g, " ").replace(/-->/g, "→").trim() }))
    .filter((l) => l.text)
    .map((l, i) => `${i + 1}\r\n${formatSrtTime(l.start)} --> ${formatSrtTime(l.end)}\r\n${l.text}\r\n`)
    .join("\r\n");
}

// ---------- chỉnh sửa ----------

// Dời các từ theo khoảng thời gian mới của dòng, giữ tỉ lệ.
function retime(words, fromStart, fromEnd, toStart, toEnd) {
  const scale = (toEnd - toStart) / Math.max(fromEnd - fromStart, 1e-6);
  return (words || []).map((w) => ({ ...w, start: round3(toStart + (w.start - fromStart) * scale), end: round3(toStart + (w.end - fromStart) * scale) }));
}

export function nudgeLine(line, field, delta) {
  let { start, end } = line;
  if (field === "start") start = Math.min(Math.max(0, start + delta), end - MIN_LINE);
  else end = Math.max(end + delta, start + MIN_LINE);
  start = round3(start); end = round3(end);
  return { ...line, start, end, words: retime(line.words, line.start, line.end, start, end) };
}

export function splitLine(lines, index, wordIndex) {
  const line = lines[index];
  if (!line || !Array.isArray(line.words) || wordIndex <= 0 || wordIndex >= line.words.length) return lines;
  return [...lines.slice(0, index), makeLine(line.words.slice(0, wordIndex)), makeLine(line.words.slice(wordIndex)), ...lines.slice(index + 1)];
}

export function mergeLines(lines, index) {
  if (index < 0 || index >= lines.length - 1) return lines;
  const a = lines[index], b = lines[index + 1];
  const merged = { text: `${a.text} ${b.text}`.trim(), start: a.start, end: Math.max(a.end, b.end), words: [...(a.words || []), ...(b.words || [])] };
  return [...lines.slice(0, index), merged, ...lines.slice(index + 2)];
}

export function setLineText(line, text) {
  const tokens = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  const clean = tokens.join(" ");
  if (tokens.length === (line.words || []).length) return { ...line, text: clean, words: line.words.map((w, i) => ({ ...w, w: tokens[i] })) };
  const step = (line.end - line.start) / Math.max(tokens.length, 1);
  return {
    ...line,
    text: clean,
    words: tokens.map((w, i) => ({ w, start: i === 0 ? line.start : line.start + i * step, end: i === tokens.length - 1 ? line.end : line.start + (i + 1) * step })),
  };
}

// Kết quả sửa dấu câu của LLM chỉ được nhận khi số từ khớp, để mốc thời gian không bao giờ bị xô.
export function applyCorrections(words, corrected) {
  if (!Array.isArray(corrected) || corrected.length !== words.length) return words;
  if (!corrected.every((c) => typeof c === "string" && c.trim())) return words;
  return words.map((w, i) => ({ ...w, w: corrected[i].trim() }));
}

// ---------- vẽ ----------

export function subtitleLayout(text, styleName, measure) {
  const style = styleOf(styleName);
  const pad = styleName === "box" ? { x: 28, y: 18 } : { x: 0, y: 0 };
  const { fontSize, lines } = fitText(measure, text, { maxWidth: AREA.w - pad.x * 2, maxLines: 2, sizes: style.sizes });
  const textW = Math.max(...lines.map((l) => measure(l, fontSize)), 1);
  const w = Math.min(AREA.w, textW + pad.x * 2);
  const h = lines.length * fontSize * LINE_HEIGHT + pad.y * 2;
  return { fontSize, lines, pad, weight: style.weight, box: { x: CENTER_X - w / 2, y: BOTTOM - h, w, h } };
}

// active: kết quả của activeLine(), hoặc null.
export function drawSubtitle(ctx, active, styleName) {
  const text = String(active?.line?.text ?? "").trim();
  if (!text) return;
  const style = styleOf(styleName);
  const font = (size) => `${style.weight} ${size}px ${FONT_FAMILY}`;
  const measure = (t, size) => { ctx.font = font(size); return ctx.measureText(t).width; };
  const layout = subtitleLayout(text, styleName, measure);
  const { fontSize, lines, box, pad } = layout;

  ctx.save();
  ctx.font = font(fontSize);
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  if (styleName === "box") {
    ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 18);
    ctx.fill();
  }
  const stroke = styleName === "karaoke" ? fontSize * 0.16 : styleName === "minimal" ? fontSize * 0.1 : 0;
  const put = (t, x, y, color) => {
    if (stroke) { ctx.lineWidth = stroke; ctx.strokeStyle = "#000000"; ctx.strokeText(t, x, y); }
    ctx.fillStyle = color;
    ctx.fillText(t, x, y);
  };

  let wordCounter = 0;
  lines.forEach((line, i) => {
    const y = box.y + pad.y + fontSize * LINE_HEIGHT * (i + 0.5);
    if (styleName !== "karaoke") {
      ctx.textAlign = "center";
      put(line, CENTER_X, y, "#ffffff");
      return;
    }
    // Karaoke: vẽ từng từ để tô màu từ đang nói.
    ctx.textAlign = "left";
    const tokens = line.split(" ");
    const space = ctx.measureText(" ").width;
    const widths = tokens.map((t) => ctx.measureText(t).width);
    let x = CENTER_X - (widths.reduce((a, b) => a + b, 0) + space * (tokens.length - 1)) / 2;
    tokens.forEach((token, k) => {
      put(token, x, y, wordCounter === active.wordIndex ? HIGHLIGHT : "#ffffff");
      x += widths[k] + space;
      wordCounter++;
    });
  });
  ctx.restore();
}
