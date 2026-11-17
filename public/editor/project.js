// Đọc một dự án dựng đã lưu trên thiết bị và chuẩn bị nó để xuất mà không cần mở trình dựng (dùng cho dựng hàng loạt).

import { getClip } from "./local-clips.js";
import { totalDuration, validateTimeline } from "./timeline.js";

export function readLocalProject(productId) {
  try {
    const saved = JSON.parse(localStorage.getItem(`edit:${productId}`) || "null");
    if (!saved || !Array.isArray(saved.segments) || saved.segments.length === 0) return null;
    return saved;
  } catch {
    return null;
  }
}

export function projectSummary(project) {
  return { count: project.segments.length, seconds: totalDuration(project.segments), problems: validateTimeline(project.segments) };
}

// Tải file của từng đoạn: clip nhập từ máy lấy trong IndexedDB, file sản phẩm lấy lại từ kho.
export async function loadSources(productId, segments, voiceover = null) {
  const blobs = new Map();
  let missing = 0;
  for (const seg of segments) {
    if (blobs.has(seg.sourceId)) continue;
    let blob = null;
    try {
      blob = seg.r2Key
        ? await fetch(`/media/${seg.r2Key}`).then((r) => (r.ok ? r.blob() : null))
        : await getClip(productId, seg.sourceId);
    } catch {
      blob = null;
    }
    if (blob) blobs.set(seg.sourceId, blob);
    else missing++;
  }
  if (missing) throw new Error(`Thiếu ${missing} file clip trên thiết bị này`);
  // Giọng đọc AI cũng chỉ nằm trên thiết bị đã tạo nó.
  if (voiceover?.enabled !== false && voiceover?.sourceId) {
    const blob = await getClip(productId, voiceover.sourceId).catch(() => null);
    if (!blob) throw new Error("Thiếu file giọng đọc trên thiết bị này");
    blobs.set(voiceover.sourceId, blob);
  }
  return blobs;
}

// template: thiết lập chung cho cả lô. Giá trị null nghĩa là giữ như từng sản phẩm đã đặt.
//   { watermark: bool | null, hook: bool | null, price: bool | null, cta: bool | null, subtitles: "keep" | "off" | <kiểu> }
export function buildJob(project, blobs, brand, logoBlob, template = {}) {
  const pick = (value, own) => (typeof value === "boolean" ? value : own);
  const overlays = {};
  for (const kind of ["hook", "price", "cta"]) {
    const own = project.overlays?.[kind] || { enabled: false, text: "" };
    overlays[kind] = { ...own, enabled: pick(template[kind], own.enabled) };
  }
  const subs = project.subtitles || { enabled: false, style: "karaoke", lines: [] };
  const subtitles = template.subtitles === "off"
    ? { ...subs, enabled: false }
    : template.subtitles && template.subtitles !== "keep" ? { ...subs, enabled: true, style: template.subtitles } : subs;
  const wantMark = pick(template.watermark, project.useWatermark !== false) && brand?.watermark && (brand.handle || logoBlob);
  const voice = project.voiceover;
  const voiceBlob = voice?.enabled !== false && voice?.sourceId ? blobs.get(voice.sourceId) : null;
  return {
    voiceover: voiceBlob ? { blob: voiceBlob, clipVolume: voice.clipVolume } : null,
    segments: project.segments.map((s) => ({ ...s, blob: blobs.get(s.sourceId) })),
    watermark: wantMark ? { handle: brand.handle, position: brand.position, logoBlob: logoBlob || null } : null,
    overlays,
    subtitles: { enabled: subtitles.enabled !== false, style: subtitles.style, lines: Array.isArray(subtitles.lines) ? subtitles.lines : [] },
  };
}
