import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeWav, mixInto } from "../public/editor/audio.js";
import { encodeWav } from "../public/editor/subtitles.js";
import {
  CLIP_GAIN, scriptText, voiceStart, cuesToLines, healthProblem, createVoiceClient, normalizeVoiceover, voiceOverrun,
} from "../public/editor/voice.js";

// ---------- WAV ----------

// WAV giống CIT: khối LIST/INFO nằm giữa "fmt " và "data".
function wavWithList(samples, rate) {
  const plain = encodeWav(samples, rate);
  const info = new TextEncoder().encode("INFOICMT\x0d\x00\x00\x00AI-generated\x00\x00"); // độ dài lẻ → có byte đệm
  const list = new Uint8Array(8 + info.length);
  list.set(new TextEncoder().encode("LIST"), 0);
  new DataView(list.buffer).setUint32(4, info.length, true);
  list.set(info, 8);
  const out = new Uint8Array(plain.length + list.length);
  out.set(plain.subarray(0, 36), 0);
  out.set(list, 36);
  out.set(plain.subarray(36), 36 + list.length);
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  return out;
}

test("decodeWav: PCM 16-bit một kênh, bỏ qua khối LIST chen giữa", () => {
  const src = Float32Array.from([0, 0.5, -0.5, 1, -1]);
  const wav = decodeWav(wavWithList(src, 48000).buffer);
  assert.equal(wav.sampleRate, 48000);
  assert.equal(wav.channels.length, 1);
  assert.equal(wav.channels[0].length, 5);
  wav.channels[0].forEach((v, i) => assert.ok(Math.abs(v - src[i]) < 1e-4, `${v} vs ${src[i]}`));
});

test("decodeWav: hai kênh xen kẽ và float 32-bit", () => {
  // stereo 16-bit
  const st = new Uint8Array(44 + 8);
  const v = new DataView(st.buffer);
  const tag = (o, t) => [...t].forEach((c, i) => (st[o + i] = c.charCodeAt(0)));
  tag(0, "RIFF"); v.setUint32(4, 44, true); tag(8, "WAVE"); tag(12, "fmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, 24000, true); v.setUint32(28, 96000, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
  tag(36, "data"); v.setUint32(40, 8, true);
  v.setInt16(44, 16384, true); v.setInt16(46, -16384, true); v.setInt16(48, 0, true); v.setInt16(50, 32767, true);
  const a = decodeWav(st);
  assert.equal(a.sampleRate, 24000);
  assert.deepEqual(a.channels.map((c) => [...c].map((x) => Math.round(x * 100) / 100)), [[0.5, 0], [-0.5, 1]]);

  // float 32
  const fl = new Uint8Array(44 + 8);
  const w = new DataView(fl.buffer);
  const tag2 = (o, t) => [...t].forEach((c, i) => (fl[o + i] = c.charCodeAt(0)));
  tag2(0, "RIFF"); w.setUint32(4, 44, true); tag2(8, "WAVE"); tag2(12, "fmt "); w.setUint32(16, 16, true);
  w.setUint16(20, 3, true); w.setUint16(22, 1, true); w.setUint32(24, 44100, true); w.setUint32(28, 176400, true); w.setUint16(32, 4, true); w.setUint16(34, 32, true);
  tag2(36, "data"); w.setUint32(40, 8, true); w.setFloat32(44, 0.25, true); w.setFloat32(48, -0.75, true);
  assert.deepEqual([...decodeWav(fl).channels[0]], [0.25, -0.75]);
});

test("decodeWav: không phải WAV hoặc định dạng lạ thì báo lỗi tiếng Việt", () => {
  assert.throws(() => decodeWav(new Uint8Array(10)), /WAV/);
  assert.throws(() => decodeWav(new TextEncoder().encode("RIFF....WAVEjunk")), /WAV/);
});

test("decodeWav: khối data khai dài hơn file thật (luồng stream) thì lấy phần có", () => {
  const wav = encodeWav(Float32Array.from([0.5, 0.5, 0.5]), 16000);
  new DataView(wav.buffer).setUint32(40, 0xffffffff, true);
  assert.equal(decodeWav(wav).channels[0].length, 3);
});

// ---------- trộn ----------

test("mixInto: cộng vào chỗ đã có, đúng vị trí bắt đầu, nhân hệ số, cắt ở cuối", () => {
  const dest = Float32Array.from([0.1, 0.1, 0.1, 0.1, 0.1]);
  const n = mixInto(dest, Float32Array.from([0.2, 0.2, 0.2, 0.2]), 10, 10, 0.2, 0.5);
  assert.equal(n, 3); // bắt đầu ở mẫu 2, chỉ còn 3 chỗ
  assert.deepEqual([...dest].map((x) => Math.round(x * 100) / 100), [0.1, 0.1, 0.2, 0.2, 0.2]);
});

test("mixInto: khác tần số thì nội suy, tổng vượt 1 thì kẹp lại", () => {
  const dest = new Float32Array(4).fill(0.9);
  mixInto(dest, Float32Array.from([0.5, 0.5]), 24000, 48000, 0, 1);
  assert.deepEqual([...dest], [1, 1, 1, Math.fround(0.9)]); // 3 mẫu đích cho 2 mẫu nguồn; mẫu cuối không bị đụng
  const neg = new Float32Array(2).fill(-0.9);
  mixInto(neg, Float32Array.from([-0.5, -0.5]), 48000, 48000, 0, 1);
  assert.deepEqual([...neg], [-1, -1]);
});

// ---------- lời đọc, mốc, phụ đề ----------

test("scriptText: nối lời thoại các nhịp bằng thẻ nghỉ; không có kịch bản thì lấy lời hook", () => {
  const pkg = { script: [{ voiceover: "Da dầu?" }, { voiceover: "" }, { voiceover: "Bấm giỏ hàng nhé!" }], hooks: [{ spoken: "Hook" }] };
  assert.equal(scriptText(pkg), "Da dầu? [nghỉ 0.3s] Bấm giỏ hàng nhé!");
  assert.equal(scriptText({ hooks: [{ spoken: "Hook nè" }] }), "Hook nè");
  assert.equal(scriptText(null), "");
});

test("voiceStart: sau đoạn ảnh bìa, khớp đúng biên frame của bảng thời lượng", () => {
  const cover = { type: "image", isCover: true, duration: 0.2 };
  const clip = { type: "clip", in: 0, out: 5, fps: 24 };
  assert.equal(voiceStart([clip], 24), 0);
  assert.equal(voiceStart([cover, clip], 24), 5 / 24);
  assert.equal(voiceStart([], 30), 0);
});

test("cuesToLines: mỗi câu thành dòng đúng mốc (cộng độ lệch), từ rải trong câu", () => {
  const cues = [{ start: 0, end: 1.372, text: "Kem chống nắng này thấm nhanh." }, { start: 1.872, end: 3.066, text: "Bấm giỏ hàng để mua nhé!" }];
  const lines = cuesToLines(cues, 0.2, "box");
  assert.equal(lines.length, 2);
  assert.equal(lines[0].text, "Kem chống nắng này thấm nhanh.");
  assert.ok(Math.abs(lines[0].start - 0.2) < 1e-9 && Math.abs(lines[0].end - 1.572) < 1e-9);
  assert.ok(Math.abs(lines[1].start - 2.072) < 1e-9);
  assert.equal(lines[1].words.length, 6);
  // karaoke chia câu dài thành nhiều dòng ngắn, vẫn nằm trong khoảng của câu
  const k = cuesToLines(cues, 0, "karaoke");
  assert.ok(k.length > 2);
  assert.ok(k.every((l) => l.start >= 0 && l.end <= 3.066 + 1e-9));
  assert.deepEqual(cuesToLines(null, 0, "box"), []);
});

test("voiceOverrun: báo số giây thừa khi giọng đọc dài hơn video", () => {
  assert.equal(voiceOverrun(0.2, 10, 8), 2.2);
  assert.equal(voiceOverrun(0, 5, 8), 0);
});

test("healthProblem: phân biệt chưa sẵn sàng, mô hình không đọc tiếng Việt, và ổn", () => {
  assert.equal(healthProblem({ status: "ok", languages: [] }), null);
  assert.equal(healthProblem({ status: "ok", languages: [{ code: "vi" }, { code: "en" }] }), null);
  assert.match(healthProblem({ status: "loading", message: "Đang tải" }), /đang tải mô hình/i);
  assert.match(healthProblem({ status: "ok", languages: [{ code: "en" }] }), /không đọc được tiếng Việt/);
});

test("normalizeVoiceover: bản lưu hỏng/thiếu trường thì về giá trị an toàn", () => {
  const d = normalizeVoiceover(null);
  assert.deepEqual(d, { enabled: true, text: "", voiceId: "", speed: 1, clipVolume: "low", sourceId: "", duration: 0, cues: [] });
  const v = normalizeVoiceover({ enabled: false, text: "x", voiceId: "Trúc Ly", speed: 9, clipVolume: "lạ", sourceId: "voice-1", duration: 3, cues: [{ start: 0, end: 1, text: "a" }, { start: "x" }] });
  assert.equal(v.speed, 1.3);
  assert.equal(v.clipVolume, "low");
  assert.equal(v.cues.length, 1);
  assert.equal(v.enabled, false);
  assert.deepEqual(CLIP_GAIN, { keep: 1, low: 0.25, off: 0 });
});

// ---------- gọi CIT (fetch giả) ----------

const reply = (status, body, type = "application/json") => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": type } });

test("createVoiceClient: synth gửi đúng body, trả WAV + mốc câu", async () => {
  const calls = [];
  const wav = encodeWav(Float32Array.from([0, 0.5]), 48000);
  const fake = async (url, init) => {
    calls.push({ url, init });
    return reply(200, { audio_base64: Buffer.from(wav).toString("base64"), format: "wav", sample_rate: 48000, duration_seconds: 2.5, cues: [{ start: 0, end: 2.5, text: "Xin chào" }] });
  };
  const client = createVoiceClient("http://127.0.0.1:8001/", fake);
  const out = await client.synth({ text: "Xin chào", voiceId: "Trúc Ly", speed: 1.1 });
  assert.equal(calls[0].url, "http://127.0.0.1:8001/api/tts/generate-with-subtitles");
  assert.deepEqual(JSON.parse(calls[0].init.body), { text: "Xin chào", voice_id: "Trúc Ly", speed: 1.1, format: "wav" });
  assert.equal(out.blob.type, "audio/wav");
  assert.equal(out.blob.size, wav.length);
  assert.equal(out.duration, 2.5);
  assert.deepEqual(out.cues, [{ start: 0, end: 2.5, text: "Xin chào" }]);
});

test("createVoiceClient: lỗi mạng, lỗi 400 có detail, 503 đều thành câu tiếng Việt dễ hiểu", async () => {
  const down = createVoiceClient("http://127.0.0.1:8001", async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(down.health(), /Chưa kết nối được CIT Voice Studio/);
  const bad = createVoiceClient("http://127.0.0.1:8001", async () => reply(400, { detail: "Voice 'X' not found" }));
  await assert.rejects(bad.synth({ text: "a" }), /Voice 'X' not found/);
  const busy = createVoiceClient("http://127.0.0.1:8001", async () => reply(503, { detail: "Model not loaded" }));
  await assert.rejects(busy.voices(), /đang tải mô hình/i);
});

test("createVoiceClient: voices trả danh sách id + nhãn", async () => {
  const client = createVoiceClient("http://127.0.0.1:8001", async () => reply(200, [{ id: "Hải Đăng", name: "Hải Đăng", description: "Nam · Bắc" }, { id: "" }, null]));
  assert.deepEqual(await client.voices(), [{ id: "Hải Đăng", label: "Hải Đăng · Nam · Bắc" }]);
});
