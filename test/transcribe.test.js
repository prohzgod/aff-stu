import { test } from "node:test";
import assert from "node:assert/strict";
import { transcribeAudio, correctWords } from "../lib/transcribe.js";
import { fakeFetch } from "./helpers/fake-fetch.js";

const GROQ = "https://api.groq.com/openai/v1/audio/transcriptions";
const LLM = "https://llm.example.test/v1/chat/completions";
const wav = new Uint8Array(100);
const verbose = { text: "Da dầu thử ngay", words: [{ word: " Da", start: 0.4, end: 0.6 }, { word: "dầu", start: 0.6, end: 0.9 }, { word: "thử", start: 0.9, end: 1.2 }, { word: "ngay", start: 1.2, end: 1.5 }], segments: [{ id: 0, start: 0.4, end: 1.5, text: " Da dầu thử ngay", tokens: [1, 2], avg_logprob: -0.1 }] };

test("transcribeAudio: gửi multipart đúng tên trường của Groq, trả từ và đoạn đã gọn", async () => {
  const f = fakeFetch({ [GROQ]: { json: verbose } });
  const r = await transcribeAudio({ GROQ_API_KEY: "gk" }, wav, { lang: "vi", prompt: "Cocoon, Niacinamide" }, f);
  assert.deepEqual(r, {
    ok: true,
    words: [{ w: "Da", start: 0.4, end: 0.6 }, { w: "dầu", start: 0.6, end: 0.9 }, { w: "thử", start: 0.9, end: 1.2 }, { w: "ngay", start: 1.2, end: 1.5 }],
    segments: [{ text: "Da dầu thử ngay", start: 0.4, end: 1.5 }],
  });
  const call = f.calls[0];
  assert.equal(call.method, "POST");
  assert.equal(call.headers.get("authorization"), "Bearer gk");
  assert.equal(call.headers.has("content-type"), false); // để fetch tự đặt boundary của multipart
  const form = call.body;
  assert.ok(form instanceof FormData);
  assert.equal(form.get("model"), "whisper-large-v3");
  assert.equal(form.get("language"), "vi");
  assert.equal(form.get("prompt"), "Cocoon, Niacinamide");
  assert.equal(form.get("response_format"), "verbose_json");
  assert.deepEqual(form.getAll("timestamp_granularities[]"), ["word", "segment"]);
  const file = form.get("file");
  assert.equal(file.name, "audio.wav");
  assert.equal(file.type, "audio/wav");
  assert.equal(file.size, 100);
});

test("transcribeAudio: model và địa chỉ cấu hình được; prompt bị cắt bớt", async () => {
  const url = "https://stt.example.test/v9/audio/transcriptions";
  const f = fakeFetch({ [url]: { json: verbose } });
  await transcribeAudio({ GROQ_API_KEY: "gk", GROQ_BASE_URL: "https://stt.example.test/v9/", GROQ_MODEL: "whisper-large-v3-turbo" }, wav, { prompt: "x".repeat(2000) }, f);
  assert.equal(f.calls[0].body.get("model"), "whisper-large-v3-turbo");
  assert.equal(f.calls[0].body.get("language"), "vi");
  assert.equal(f.calls[0].body.get("prompt").length, 600);
});

test("transcribeAudio: không có mốc từng từ thì chia đều từ trong mỗi đoạn", async () => {
  const f = fakeFetch({ [GROQ]: { json: { segments: [{ start: 2, end: 4, text: " một hai" }, { start: 5, end: 6, text: "ba" }] } } });
  const r = await transcribeAudio({ GROQ_API_KEY: "gk" }, wav, {}, f);
  assert.deepEqual(r.words, [{ w: "một", start: 2, end: 3 }, { w: "hai", start: 3, end: 4 }, { w: "ba", start: 5, end: 6 }]);
});

test("transcribeAudio: các kiểu lỗi có thông báo tiếng Việt", async () => {
  const run = (spec, env = { GROQ_API_KEY: "gk" }) => transcribeAudio(env, wav, {}, fakeFetch({ [GROQ]: spec }));
  assert.deepEqual(await run({ json: verbose }, {}), { ok: false, status: 503, error: "Chưa cấu hình GROQ_API_KEY nên chưa tạo phụ đề tự động được." });
  assert.equal((await run({ json: {}, status: 429 })).status, 429);
  assert.match((await run({ json: {}, status: 429 })).error, /hết hạn mức/);
  assert.equal((await run({ json: {}, status: 401 })).status, 502);
  assert.match((await run({ json: {}, status: 401 })).error, /GROQ_API_KEY không đúng/);
  assert.equal((await run({ json: {}, status: 500 })).status, 502);
  assert.equal((await run({ throws: true })).status, 502);
  assert.equal((await run({ type: "text/html", body: "<html>" })).status, 502);
  const empty = await run({ json: { text: "", words: [], segments: [] } });
  assert.deepEqual(empty, { ok: true, words: [], segments: [] });
});

const words = [{ w: "da", start: 0.4, end: 0.6 }, { w: "dầu", start: 0.6, end: 0.9 }, { w: "cocon", start: 0.9, end: 1.2 }];
const llmEnv = { LLM_BASE_URL: "https://llm.example.test/v1", LLM_MODEL: "flash", LLM_API_KEY: "k" };
const chat = (content) => ({ json: { choices: [{ message: { content } }] } });

test("correctWords: nhận bản sửa khi số từ khớp, giữ nguyên mốc thời gian", async () => {
  const f = fakeFetch({ [LLM]: chat('{"words":["Da","dầu,","Cocoon"]}') });
  const out = await correctWords(llmEnv, words, "Cocoon", f);
  assert.deepEqual(out, [{ w: "Da", start: 0.4, end: 0.6 }, { w: "dầu,", start: 0.6, end: 0.9 }, { w: "Cocoon", start: 0.9, end: 1.2 }]);
  const sent = JSON.parse(f.calls[0].body).messages;
  assert.match(sent[0].content, /giữ nguyên số lượng/i);
  assert.ok(sent[1].content.includes("Cocoon") && sent[1].content.includes('"cocon"'));
});

test("correctWords: số từ lệch, JSON hỏng, LLM lỗi hoặc chưa cấu hình → dùng bản gốc", async () => {
  for (const spec of [chat('{"words":["Da dầu","Cocoon"]}'), chat("xin lỗi"), { json: {}, status: 429 }, { throws: true }, chat('{"words":"sai"}')]) {
    assert.deepEqual(await correctWords(llmEnv, words, "", fakeFetch({ [LLM]: spec })), words);
  }
  const f = fakeFetch({});
  assert.deepEqual(await correctWords({}, words, "", f), words);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(await correctWords(llmEnv, [], "", f), []);
  assert.equal(f.calls.length, 0);
});
