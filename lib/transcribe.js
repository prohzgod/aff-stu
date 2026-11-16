// Phiên âm tiếng của video bằng Groq Whisper (API kiểu OpenAI), và sửa dấu câu bằng LLM nếu có.
// Tài liệu: https://console.groq.com/docs/speech-to-text (tra ngày 16/11/2026).

import { callLlm, parseLoose } from "./generate.js";
import { applyCorrections } from "../public/editor/subtitles.js";

const DEFAULT_BASE = "https://api.groq.com/openai/v1";
const DEFAULT_MODEL = "whisper-large-v3"; // bản chính xác nhất cho đa ngôn ngữ; đổi GROQ_MODEL sang whisper-large-v3-turbo nếu cần rẻ/nhanh hơn
const TIMEOUT_MS = 60000;
const MAX_PROMPT = 600;
const MAX_WORDS_FOR_LLM = 600;

const fail = (status, error) => ({ ok: false, status, error });
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function wordsFrom(data) {
  const direct = (Array.isArray(data?.words) ? data.words : [])
    .map((x) => ({ w: String(x?.word ?? x?.text ?? "").trim(), start: num(x?.start), end: num(x?.end) }))
    .filter((x) => x.w && x.start !== null && x.end !== null);
  if (direct.length) return direct;
  // Không có mốc từng từ: chia đều các từ trong mỗi đoạn.
  const out = [];
  for (const seg of Array.isArray(data?.segments) ? data.segments : []) {
    const tokens = String(seg?.text ?? "").trim().split(/\s+/).filter(Boolean);
    const start = num(seg?.start), end = num(seg?.end);
    if (!tokens.length || start === null || end === null || end <= start) continue;
    const step = (end - start) / tokens.length;
    tokens.forEach((w, i) => out.push({ w, start: start + i * step, end: i === tokens.length - 1 ? end : start + (i + 1) * step }));
  }
  return out;
}

export async function transcribeAudio(env, wavBytes, { lang = "vi", prompt = "" } = {}, fetchFn = fetch) {
  if (!env.GROQ_API_KEY) return fail(503, "Chưa cấu hình GROQ_API_KEY nên chưa tạo phụ đề tự động được.");

  const form = new FormData();
  form.append("file", new File([wavBytes], "audio.wav", { type: "audio/wav" }));
  form.append("model", env.GROQ_MODEL || DEFAULT_MODEL);
  form.append("language", /^[a-z]{2}$/.test(lang) ? lang : "vi");
  if (prompt) form.append("prompt", String(prompt).slice(0, MAX_PROMPT)); // tên sản phẩm, thương hiệu: giúp nhận đúng tên riêng
  form.append("response_format", "verbose_json"); // bắt buộc để có mốc thời gian
  form.append("temperature", "0");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");

  let res;
  try {
    res = await fetchFn(`${String(env.GROQ_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "")}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return fail(502, "Không gọi được dịch vụ phiên âm. Thử lại sau.");
  }
  if (res.status === 429) return fail(429, "Dịch vụ phiên âm đã hết hạn mức miễn phí. Thử lại sau, hoặc dùng lời thoại từ kịch bản.");
  if (res.status === 401 || res.status === 403) return fail(502, "GROQ_API_KEY không đúng hoặc đã hết hiệu lực.");
  if (!res.ok) return fail(502, `Dịch vụ phiên âm báo lỗi (HTTP ${res.status}).`);

  let data;
  try { data = await res.json(); } catch { return fail(502, "Dịch vụ phiên âm trả về dữ liệu không đọc được."); }
  const segments = (Array.isArray(data?.segments) ? data.segments : [])
    .map((s) => ({ text: String(s?.text ?? "").trim(), start: num(s?.start), end: num(s?.end) }))
    .filter((s) => s.text && s.start !== null && s.end !== null);
  return { ok: true, words: wordsFrom(data), segments };
}

// Sửa chính tả, viết hoa, dấu câu, tên thương hiệu. Không bao giờ đổi số từ hay mốc thời gian:
// kết quả lệch số từ bị bỏ, dùng lại bản gốc.
export async function correctWords(env, words, hint = "", fetchFn = fetch) {
  if (!env.LLM_API_KEY || !env.LLM_MODEL || words.length === 0 || words.length > MAX_WORDS_FOR_LLM) return words;
  const messages = [
    {
      role: "system",
      content: [
        "Bạn sửa bản phiên âm tiếng Việt của một video bán hàng ngắn.",
        "Chỉ sửa chính tả, viết hoa, dấu câu và tên thương hiệu (theo gợi ý nếu có).",
        "Giữ nguyên số lượng và thứ tự các phần tử: không gộp, không tách, không thêm, không bớt từ. Dấu câu gắn liền vào từ đứng trước nó.",
        'Trả về JSON dạng {"words": ["...", "..."]} với đúng số phần tử như đầu vào.',
      ].join("\n"),
    },
    { role: "user", content: JSON.stringify({ hint: String(hint).slice(0, MAX_PROMPT), count: words.length, words: words.map((w) => w.w) }) },
  ];
  const result = await callLlm(env, messages, fetchFn);
  if (!result.ok) return words;
  return applyCorrections(words, parseLoose(result.text)?.words);
}
