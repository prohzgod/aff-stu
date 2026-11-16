// POST /api/transcribe?lang=vi&prompt=<tên sản phẩm, thương hiệu>
// Body: WAV 16kHz mono (trình dựng video tạo ra). Trả { words: [{ w, start, end }], segments, corrected }.
import { json } from "../../lib/util.js";
import { transcribeAudio, correctWords } from "../../lib/transcribe.js";

const MAX_SECONDS = 600; // tối đa 10 phút mỗi lần, để không đốt hạn mức
const MAX_BYTES = 44 + MAX_SECONDS * 32000;
const isWav = (b) => b.length > 44 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45;

export async function onRequestPost({ request, env }) {
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) return json({ error: "Đoạn tiếng dài quá 10 phút" }, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_BYTES) return json({ error: "Đoạn tiếng dài quá 10 phút" }, 413);
  if (!isWav(bytes)) return json({ error: "Dữ liệu tiếng không hợp lệ" }, 400);

  const query = new URL(request.url).searchParams;
  const prompt = (query.get("prompt") || "").slice(0, 600);
  const callFetch = (...args) => fetch(...args);

  const result = await transcribeAudio(env, bytes, { lang: query.get("lang") || "vi", prompt }, callFetch);
  if (!result.ok) return json({ error: result.error }, result.status);

  const words = await correctWords(env, result.words, prompt, callFetch);
  return json({ words, segments: result.segments, corrected: words !== result.words });
}
