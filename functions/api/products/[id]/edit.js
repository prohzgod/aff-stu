// GET/PUT /api/products/:id/edit: dự án dựng video (thứ tự đoạn, điểm cắt, chữ, phụ đề) để mở tiếp trên máy khác.
// Chỉ lưu mô tả, không lưu file clip: clip nhập từ máy vẫn nằm trên thiết bị đã nhập.
import { json, isValidId, isExpired, retentionDays, productKey } from "../../../../lib/util.js";
import { getProduct } from "../../../../lib/store.js";

const MAX_CHARS = 500000;
const MAX_SEGMENTS = 12;
const MAX_LINES = 400;
const FITS = ["cover", "blur"];
const STYLES = ["karaoke", "box", "minimal"];

const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;

// Trả đoạn đã lọc, hoặc null nếu sai kiểu.
function cleanSegment(seg, id) {
  if (!seg || typeof seg !== "object" || Array.isArray(seg)) return null;
  if (seg.type !== "clip" && seg.type !== "image") return null;
  if (typeof seg.sourceId !== "string" || !seg.sourceId || !FITS.includes(seg.fit)) return null;
  // Chỉ cho trỏ tới file của chính sản phẩm này trên kho.
  const r2Key = typeof seg.r2Key === "string" && seg.r2Key.startsWith(`p/${id}/`) && /^p\/[a-z0-9]+\/[\w.-]+$/.test(seg.r2Key) ? seg.r2Key : null;
  const base = {
    id: str(seg.id, 40), type: seg.type, name: str(seg.name, 200), sourceId: str(seg.sourceId, 60), r2Key, fit: seg.fit,
    width: num(seg.width) ? seg.width : 0, height: num(seg.height) ? seg.height : 0,
  };
  if (seg.type === "clip") {
    if (![seg.srcDuration, seg.fps, seg.in, seg.out].every(num) || seg.out <= seg.in) return null;
    return { ...base, srcDuration: seg.srcDuration, fps: seg.fps, hasAudio: seg.hasAudio === true, in: seg.in, out: seg.out, muted: seg.muted === true };
  }
  if (!num(seg.duration) || seg.duration <= 0) return null;
  return { ...base, duration: seg.duration, kenBurns: seg.kenBurns === true, ...(seg.isCover === true ? { isCover: true } : {}) };
}

function cleanOverlays(overlays) {
  const out = {};
  for (const kind of ["hook", "price", "cta"]) {
    const o = overlays?.[kind];
    if (o === undefined) { out[kind] = { enabled: false, text: "" }; continue; }
    if (!o || typeof o.enabled !== "boolean" || typeof o.text !== "string") return null;
    out[kind] = { enabled: o.enabled, text: o.text.slice(0, 120) };
  }
  return out;
}

function cleanSubtitles(subs) {
  if (subs === undefined) return { enabled: true, style: "karaoke", sig: "", lines: [] };
  if (!subs || typeof subs !== "object" || !STYLES.includes(subs.style) || !Array.isArray(subs.lines)) return null;
  const lines = [];
  for (const l of subs.lines) {
    if (!l || typeof l.text !== "string" || !num(l.start) || !num(l.end) || !Array.isArray(l.words)) return null;
    const words = [];
    for (const w of l.words) {
      if (!w || typeof w.w !== "string" || !num(w.start) || !num(w.end)) return null;
      words.push({ w: w.w.slice(0, 80), start: w.start, end: w.end });
    }
    lines.push({ text: l.text.slice(0, 200), start: l.start, end: l.end, words });
  }
  return { enabled: subs.enabled !== false, style: subs.style, sig: str(subs.sig, 4000), lines };
}

// Giọng đọc AI (spec mục 9.12). Chỉ thiết lập và mốc câu; file WAV nằm trên thiết bị đã tạo.
// undefined → không có giọng đọc; sai kiểu → null (từ chối).
const CLIP_VOLUMES = ["keep", "low", "off"];
function cleanVoiceover(v) {
  if (v === undefined) return undefined;
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  if (typeof v.text !== "string" || typeof v.voiceId !== "string" || typeof v.sourceId !== "string") return null;
  if (!num(v.speed) || !num(v.duration) || !CLIP_VOLUMES.includes(v.clipVolume) || !Array.isArray(v.cues) || v.cues.length > MAX_LINES) return null;
  const cues = [];
  for (const c of v.cues) {
    if (!c || !num(c.start) || !num(c.end) || typeof c.text !== "string") return null;
    cues.push({ start: c.start, end: c.end, text: c.text.slice(0, 300) });
  }
  return {
    enabled: v.enabled !== false, text: v.text.slice(0, 5000), voiceId: v.voiceId.slice(0, 100), speed: Math.min(v.speed, 2),
    clipVolume: v.clipVolume, sourceId: v.sourceId.slice(0, 60), duration: v.duration, cues,
  };
}

const notFound = () => json({ error: "Không tìm thấy sản phẩm" }, 404);

async function loadProduct(env, id) {
  if (!isValidId(id)) return null;
  const product = await getProduct(env.BUCKET, id);
  return product && !isExpired(product.createdAt, retentionDays(env)) ? product : null;
}

export async function onRequestGet({ env, params }) {
  if (!(await loadProduct(env, params.id))) return notFound();
  const obj = await env.BUCKET.get(productKey(params.id, "edit.json"));
  return json({ edit: obj ? await obj.json() : null });
}

export async function onRequestPut({ request, env, params }) {
  const { id } = params;
  if (!isValidId(id)) return notFound();
  const raw = await request.text();
  if (raw.length > MAX_CHARS) return json({ error: "Dự án quá lớn" }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: "JSON không hợp lệ" }, 400); }
  const bad = () => json({ error: "Dự án dựng không hợp lệ" }, 400);
  if (!body || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body.segments) || body.segments.length > MAX_SEGMENTS) return bad();
  if (Array.isArray(body.subtitles?.lines) && body.subtitles.lines.length > MAX_LINES) return json({ error: "Dự án quá lớn" }, 413);

  const segments = body.segments.map((s) => cleanSegment(s, id));
  const overlays = cleanOverlays(body.overlays);
  const subtitles = cleanSubtitles(body.subtitles);
  const voiceover = cleanVoiceover(body.voiceover);
  if (segments.includes(null) || !overlays || !subtitles || voiceover === null) return bad();

  if (!(await loadProduct(env, id))) return notFound();
  const edit = { segments, useWatermark: body.useWatermark !== false, overlays, subtitles, ...(voiceover ? { voiceover } : {}), updatedAt: new Date().toISOString() };
  await env.BUCKET.put(productKey(id, "edit.json"), JSON.stringify(edit), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
  return json({ edit });
}
