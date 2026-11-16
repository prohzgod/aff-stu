// Logic thuần của timeline Hậu kỳ: không đụng DOM hay WebCodecs, dùng được trong worker và trong test.
//
// Đoạn (segment):
//   clip  : { id, type: "clip", name, source, srcDuration, fps, hasAudio, in, out, muted, fit }
//   image : { id, type: "image", name, source, duration, kenBurns, fit }
// fit: "cover" (lấp đầy khung) hoặc "blur" (nằm gọn, nền là chính hình đó làm mờ).

export const OUTPUT = { width: 1080, height: 1920 };
// Vùng an toàn TikTok trên khung 1080x1920 (docs/spec/hau-ky.md mục 9.4): chừa chỗ cho giao diện của TikTok.
export const SAFE = { top: 130, bottom: 480, left: 44, right: 140 };
export const SAMPLE_RATE = 48000;
export const LIMITS = { maxSegments: 12, maxSeconds: 60, maxFileBytes: 200 * 1024 * 1024 };
export const MIN_SEGMENT = 0.2;
export const MAX_IMAGE = 10;
const KEN_BURNS_ZOOM = 0.08;

const num = (v, fallback) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function segmentDuration(seg) {
  return seg.type === "clip" ? seg.out - seg.in : seg.duration;
}

export function totalDuration(segments) {
  return segments.reduce((sum, s) => sum + segmentDuration(s), 0);
}

// Trả đoạn mới với điểm cắt hợp lệ. Sửa "in" thì "out" đứng yên và ngược lại.
export function clampTrim(seg, change) {
  if (seg.type === "image") {
    return { ...seg, duration: clamp(num(change.duration, seg.duration), MIN_SEGMENT, MAX_IMAGE) };
  }
  const max = seg.srcDuration;
  let start = clamp(num(change.in, seg.in), 0, max);
  let end = clamp(num(change.out, seg.out), 0, max);
  if (end - start < MIN_SEGMENT) {
    if ("in" in change && !("out" in change)) start = Math.max(0, end - MIN_SEGMENT);
    else end = Math.min(max, start + MIN_SEGMENT);
  }
  const round = (v) => Math.round(v * 1000) / 1000;
  return { ...seg, in: round(start), out: round(end) };
}

export function moveSegment(segments, from, to) {
  const n = segments.length;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= n || to >= n) return segments.slice();
  const next = segments.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function validateTimeline(segments) {
  if (segments.length === 0) return ["Chưa có đoạn nào. Thêm clip hoặc ảnh trước khi xuất."];
  const errors = [];
  if (segments.length > LIMITS.maxSegments) errors.push(`Tối đa ${LIMITS.maxSegments} đoạn (đang có ${segments.length}).`);
  const total = totalDuration(segments);
  if (total > LIMITS.maxSeconds + 1e-6) errors.push(`Video dài tối đa ${LIMITS.maxSeconds} giây (đang là ${total.toFixed(1)} giây).`);
  return errors;
}

// Giữ fps nguồn nếu mọi clip cùng 24, 25 hoặc 30; còn lại xuất 30.
export function outputFps(segments) {
  const rates = segments.filter((s) => s.type === "clip").map((s) => Math.round(num(s.fps, 0)));
  if (rates.length === 0) return 30;
  return [24, 25, 30].includes(rates[0]) && rates.every((r) => r === rates[0]) ? rates[0] : 30;
}

// Bảng thời lượng dùng chung cho hình và tiếng. Vị trí mẫu tiếng được suy từ vị trí frame,
// nên tiếng và hình không bao giờ lệch nhau dù thời lượng từng đoạn lẻ.
export function buildSchedule(segments, fps, sampleRate = SAMPLE_RATE) {
  const sampleAt = (frame) => Math.round((frame / fps) * sampleRate);
  const items = [];
  let frame = 0;
  segments.forEach((seg, index) => {
    const frameCount = Math.max(1, Math.round(segmentDuration(seg) * fps));
    const startSample = sampleAt(frame);
    items.push({ index, startFrame: frame, frameCount, startSample, sampleCount: sampleAt(frame + frameCount) - startSample });
    frame += frameCount;
  });
  return { items, totalFrames: frame, totalSamples: sampleAt(frame), duration: frame / fps, fps, sampleRate };
}

// Thời điểm trong clip nguồn ứng với frame thứ k của đoạn.
export function frameSourceTime(seg, k, fps) {
  const last = Math.max(seg.in, seg.out - 1 / 1000);
  return Math.min(seg.in + k / fps, last);
}

// Vị trí vẽ hình nguồn (sw x sh) vào khung (dw x dh), căn giữa.
export function fitRect(sw, sh, dw, dh, mode) {
  if (!(sw > 0) || !(sh > 0)) return { x: 0, y: 0, w: dw, h: dh };
  const scale = mode === "contain" ? Math.min(dw / sw, dh / sh) : Math.max(dw / sw, dh / sh);
  const w = sw * scale, h = sh * scale;
  return { x: (dw - w) / 2, y: (dh - h) / 2, w, h };
}

export function kenBurnsScale(progress) {
  return 1 + KEN_BURNS_ZOOM * clamp(num(progress, 0), 0, 1);
}

// Thời điểm t trên timeline nằm ở đoạn nào (dùng cho xem trước).
export function locate(segments, t) {
  if (segments.length === 0) return null;
  let start = 0;
  for (let index = 0; index < segments.length; index++) {
    const seg = segments[index];
    const dur = segmentDuration(seg);
    if (t < start + dur || index === segments.length - 1) {
      const offset = clamp(t - start, 0, dur);
      return { index, offset, sourceTime: seg.type === "clip" ? seg.in + offset : null };
    }
    start += dur;
  }
  return null;
}

// Phần đầu của timeline, dài tối đa `seconds` giây (dùng cho nút "So sánh" hai chế độ xuất).
export function headSegments(segments, seconds) {
  const out = [];
  let left = seconds;
  for (const seg of segments) {
    if (left < MIN_SEGMENT) break;
    const dur = segmentDuration(seg);
    if (dur <= left) {
      out.push({ ...seg });
      left -= dur;
    } else {
      out.push(seg.type === "clip" ? { ...seg, out: seg.in + left } : { ...seg, duration: left });
      break;
    }
  }
  return out;
}

// Hệ số phóng hình nguồn trước khi ghép: nguồn hẹp hơn khung thì phóng cho vừa chiều rộng, tối đa 2 lần.
export function enhanceScale(sourceWidth) {
  if (!(sourceWidth > 0) || sourceWidth >= OUTPUT.width) return 1;
  return Math.min(2, OUTPUT.width / sourceWidth);
}
