// Lồng tiếng AI bằng CIT Voice Studio chạy trên chính máy đang dựng (docs/spec/hau-ky.md mục 9.12).
// Trình duyệt gọi thẳng CIT (mặc định http://127.0.0.1:8001); máy chủ Cloudflare không tham gia.
// Phần tính toán là logic thuần, dùng được trong worker và trong test; `fetch` được truyền vào để test.

import { segmentDuration } from "./timeline.js";
import { linesFromText } from "./subtitles.js";

export const DEFAULT_VOICE_URL = "http://127.0.0.1:8001";
// Âm lượng tiếng của clip khi có giọng đọc.
export const CLIP_GAIN = { keep: 1, low: 0.25, off: 0 };
export const CLIP_VOLUME_LABELS = { keep: "Giữ nguyên", low: "Nhỏ lại (25%)", off: "Tắt" };
export const SPEED = { min: 0.8, max: 1.3 };
const MAX_TEXT = 5000;
const MAX_CUES = 400;

const num = (v) => typeof v === "number" && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function normalizeVoiceover(v) {
  const src = v && typeof v === "object" ? v : {};
  return {
    enabled: src.enabled !== false,
    text: typeof src.text === "string" ? src.text.slice(0, MAX_TEXT) : "",
    voiceId: typeof src.voiceId === "string" ? src.voiceId.slice(0, 100) : "",
    speed: num(src.speed) ? clamp(src.speed, SPEED.min, SPEED.max) : 1,
    clipVolume: Object.hasOwn(CLIP_GAIN, src.clipVolume) ? src.clipVolume : "low",
    sourceId: typeof src.sourceId === "string" ? src.sourceId.slice(0, 60) : "",
    duration: num(src.duration) && src.duration > 0 ? src.duration : 0,
    cues: (Array.isArray(src.cues) ? src.cues : [])
      .filter((c) => c && num(c.start) && num(c.end) && c.end > c.start && typeof c.text === "string")
      .slice(0, MAX_CUES)
      .map((c) => ({ start: c.start, end: c.end, text: c.text.slice(0, 300) })),
  };
}

// Lời đọc mặc định: lời thoại các nhịp kịch bản, cách nhau một quãng nghỉ ngắn.
export function scriptText(pkg) {
  const beats = (Array.isArray(pkg?.script) ? pkg.script : []).map((b) => String(b?.voiceover ?? "").trim()).filter(Boolean);
  if (beats.length) return beats.join(" [nghỉ 0.3s] ");
  return String(pkg?.hooks?.[0]?.spoken ?? "").trim();
}

// Giọng đọc bắt đầu ngay sau đoạn ảnh bìa, đúng biên frame như bảng thời lượng (buildSchedule).
export function voiceStart(segments, fps) {
  const first = Array.isArray(segments) ? segments[0] : null;
  if (!first?.isCover) return 0;
  return Math.max(1, Math.round(segmentDuration(first) * fps)) / fps;
}

// Số giây giọng đọc vượt quá cuối video (0 nếu vừa).
export function voiceOverrun(start, duration, total) {
  return Math.max(0, Math.round((start + duration - total) * 100) / 100);
}

// Mốc câu của CIT → dòng phụ đề. Từ trong câu được rải đều theo thời lượng câu.
export function cuesToLines(cues, offset, styleName) {
  return (Array.isArray(cues) ? cues : []).flatMap((c) => linesFromText(c.text, c.start + offset, c.end + offset, styleName));
}

// Thông tin /health có dùng được để đọc tiếng Việt không. Trả câu báo lỗi, hoặc null nếu ổn.
export function healthProblem(health) {
  if (health?.status !== "ok") return `CIT Voice Studio đang tải mô hình${health?.message ? ` (${health.message})` : ""}. Chờ một lát rồi thử lại.`;
  const langs = Array.isArray(health.languages) ? health.languages : [];
  if (langs.length && !langs.some((l) => (l?.code ?? l) === "vi")) {
    return "Mô hình đang chọn trong CIT Voice Studio không đọc được tiếng Việt. Vào Cài đặt của CIT, chọn lại VieNeu-TTS.";
  }
  return null;
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function createVoiceClient(baseUrl = DEFAULT_VOICE_URL, fetchImpl = (...a) => fetch(...a)) {
  const base = String(baseUrl || DEFAULT_VOICE_URL).trim().replace(/\/+$/, "");
  async function call(path, init) {
    let res;
    try {
      res = await fetchImpl(`${base}${path}`, init);
    } catch {
      throw new Error(`Chưa kết nối được CIT Voice Studio ở ${base}. Mở ứng dụng CIT trên máy này; nếu Chrome hỏi quyền truy cập thiết bị trong mạng cục bộ thì bấm Cho phép.`);
    }
    if (res.ok) return res;
    let detail = "";
    try { const body = await res.json(); detail = typeof body?.detail === "string" ? body.detail : ""; } catch { /* không phải JSON */ }
    if (res.status === 503) throw new Error("CIT Voice Studio đang tải mô hình. Chờ một lát rồi thử lại.");
    throw new Error(`CIT Voice Studio báo lỗi ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return {
    base,
    health: async () => (await call("/health")).json(),
    voices: async () => {
      const list = await (await call("/voices")).json();
      return (Array.isArray(list) ? list : [])
        .filter((v) => v && typeof v.id === "string" && v.id)
        .map((v) => ({ id: v.id, label: [v.name || v.id, v.description].filter(Boolean).join(" · ") }));
    },
    // Đọc lời thành WAV, kèm mốc từng câu.
    synth: async ({ text, voiceId, speed = 1 }) => {
      const body = { text, ...(voiceId ? { voice_id: voiceId } : {}), speed, format: "wav" };
      const res = await call("/api/tts/generate-with-subtitles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (typeof data?.audio_base64 !== "string" || !data.audio_base64) throw new Error("CIT Voice Studio không trả về tiếng");
      const cues = (Array.isArray(data.cues) ? data.cues : [])
        .filter((c) => c && num(c.start) && num(c.end) && typeof c.text === "string")
        .map((c) => ({ start: c.start, end: c.end, text: c.text }));
      return {
        blob: new Blob([base64ToBytes(data.audio_base64)], { type: data.format === "mp3" ? "audio/mpeg" : "audio/wav" }),
        duration: num(data.duration_seconds) ? data.duration_seconds : 0,
        sampleRate: data.sample_rate,
        cues,
      };
    },
  };
}
