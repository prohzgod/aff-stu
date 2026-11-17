// Kiểm phase 8.6 (Lồng tiếng AI) trong Chrome headless thật, với CIT Voice Studio thật đang chạy ở http://127.0.0.1:8001.
// Cần `npm run dev` đang chạy. Tạo một sản phẩm thử, dựng video có giọng đọc, đọc lại file xuất, rồi xoá sản phẩm.
// Chạy: node scripts/voice-check.mjs
import { spawn } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const B = "http://localhost:8788";
const CIT = "http://127.0.0.1:8001";
const TOKEN = "dev-token-doi-truoc-khi-deploy";
const PORT = 9334;
const CHROME = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].find((p) => p && existsSync(p));
if (!CHROME) throw new Error("Không tìm thấy Chrome. Đặt biến CHROME=<đường dẫn>.");

const health = await fetch(`${CIT}/health`).then((r) => r.json()).catch(() => null);
if (health?.status !== "ok") throw new Error(`CIT Voice Studio chưa sẵn sàng ở ${CIT}`);

const auth = { Authorization: `Bearer ${TOKEN}` };
const fixture = readFileSync(new URL("../test/fixtures/cocoon.json", import.meta.url), "utf8");
const { id } = await (await fetch(`${B}/api/products`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: fixture })).json();
await fetch(`${B}/api/products/${id}/generate`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: "{}" });

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "voicechk-"))}`,
  "--no-first-run", "--autoplay-policy=no-user-gesture-required", "--window-size=1280,900", "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === "page"); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0; const pending = new Map(); const errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id) pending.get(d.id)?.(d);
  if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((r) => { const i = ++seq; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
  return r.result.result.value;
};
const waitFor = async (expr, label, tries = 200) => {
  for (let i = 0; i < tries; i++) { if (await ev(expr)) return; await sleep(150); }
  throw new Error("hết giờ chờ: " + label);
};
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
const set = (sel, value, type = "change") => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event(${JSON.stringify(type)}, { bubbles: true })); })()`);
const click = (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).click()`);

// Đọc lại file xuất: độ to theo từng cửa sổ 0,1 giây của kênh trái.
const ANALYZE = `(async () => {
  const MB = await import("/editor/vendor/mediabunny-1.66.0.min.mjs");
  const blob = await (await fetch(document.querySelector(".ed-result video").src)).blob();
  const inp = new MB.Input({ formats: MB.ALL_FORMATS, source: new MB.BlobSource(blob) });
  const v = await inp.getPrimaryVideoTrack(), a = await inp.getPrimaryAudioTrack();
  const env = [];
  for await (const b of new MB.AudioBufferSink(a).buffers()) {
    const d = b.buffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) { const k = Math.floor((b.timestamp + i / b.buffer.sampleRate) * 10); env[k] = (env[k] || 0) + d[i] * d[i]; }
  }
  const rms = env.map((s) => Math.sqrt((s || 0) / 4800));
  return { w: v.displayWidth, h: v.displayHeight, vdur: await v.computeDuration(), adur: await a.computeDuration(), rms };
})()`;
const mean = (arr) => arr.reduce((s, x) => s + x, 0) / Math.max(1, arr.length);

try {
  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.navigate", { url: B });
  await waitFor("document.readyState === 'complete'", "mở app");
  await ev(`localStorage.setItem("APP_TOKEN", ${JSON.stringify(TOKEN)})`);
  await ev(`location.hash = "#/p/${id}/edit"; location.reload()`);
  await sleep(500);
  await waitFor("document.querySelector('.editor')?.dataset.ready === '1'", "mở trình dựng");

  check("khối Lồng tiếng AI có sẵn, lời đọc điền từ kịch bản, chưa tự kết nối CIT lần đầu", await ev(
    "!!document.querySelector('.ed-voice') && document.querySelector('#voice-text').value.includes('[nghỉ 0.3s]') && !!document.querySelector('[data-action=\"voice-connect\"]') && document.querySelector('[data-action=\"voice-generate\"]').disabled"));

  // CIT sai địa chỉ → báo rõ, không treo
  await ev("document.querySelector('.ed-voice details').open = true");
  await set("#voice-url", "http://127.0.0.1:8009");
  await waitFor("document.querySelector('.voice-status[data-state=\"error\"]')", "báo lỗi kết nối");
  check("CIT không chạy (sai cổng) → báo 'Chưa kết nối được CIT Voice Studio', nút Tạo giọng đọc bị khoá", await ev(
    "document.querySelector('.voice-status').textContent.includes('Chưa kết nối được CIT Voice Studio') && document.querySelector('[data-action=\"voice-generate\"]').disabled"));
  await set("#voice-url", CIT);
  await waitFor("document.querySelector('.voice-status[data-state=\"ready\"]')", "kết nối CIT");
  const voiceCount = await ev("document.querySelectorAll('#voice-id option').length");
  check("kết nối CIT thật → hiện tên mô hình và danh sách giọng", voiceCount > 1 && (await ev("document.querySelector('.voice-status').textContent")).includes(health.engine.split(" ")[0]), `${voiceCount} giọng`);

  // Một clip 8 giây, tiếng bíp 440Hz to 0,4
  await ev(`(async () => {
    const MB = await import("/editor/vendor/mediabunny-1.66.0.min.mjs");
    const fps = 24, rate = 48000, secs = 8, c = new OffscreenCanvas(720, 1280), g = c.getContext("2d");
    const out = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: "in-memory" }), target: new MB.BufferTarget() });
    const vs = new MB.CanvasSource(c, { codec: "avc", bitrate: 1500000 }), as = new MB.AudioSampleSource({ codec: "aac", bitrate: 96000 });
    out.addVideoTrack(vs, { frameRate: fps }); out.addAudioTrack(as); await out.start();
    for (let i = 0; i < secs * fps; i++) { g.fillStyle = "#227744"; g.fillRect(0, 0, 720, 1280); await vs.add(i / fps, 1 / fps); }
    for (let o = 0; o < secs * rate; o += 4800) {
      const d = new Float32Array(9600);
      for (let i = 0; i < 4800; i++) d[i] = d[4800 + i] = 0.4 * Math.sin((2 * Math.PI * 440 * (o + i)) / rate);
      const s = new MB.AudioSample({ data: d, format: "f32-planar", numberOfChannels: 2, sampleRate: rate, timestamp: o / rate }); await as.add(s); s.close();
    }
    await out.finalize();
    const dt = new DataTransfer(); dt.items.add(new File([out.target.buffer], "clip.mp4", { type: "video/mp4" }));
    const input = document.querySelector("#ed-files"); input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await waitFor("document.querySelectorAll('.seg').length === 1", "nhập clip");

  await set("#voice-text", "Da dầu mụn mà vẫn muốn lì cả ngày? [nghỉ 0.5s] Bấm giỏ hàng để xem giá nhé!", "input");
  await set("#subs-style", "box");
  await click("[data-action='voice-generate']");
  await waitFor("!!document.querySelector('.voice-info')", "tạo giọng đọc", 600);
  const info = await ev("document.querySelector('.voice-info').textContent");
  check("tạo giọng đọc → có trình nghe thử, thời lượng, số câu; mặc định tiếng clip 'Nhỏ lại'", await ev(
    "!!document.querySelector('.ed-voice audio')?.src && document.querySelector('#voice-clip-volume').value === 'low' && document.querySelector('#voice-on').checked"), info);
  const vo = await ev("JSON.parse(localStorage.getItem('edit:" + id + "')).voiceover");
  // Câu dài được chia thành nhiều dòng theo kiểu phụ đề; mỗi câu phải mở đầu đúng một dòng, đúng mốc (lệch < 0,1s).
  const rows = await ev("[...document.querySelectorAll('.sub-row')].map((r) => ({ start: Number(r.querySelector('[data-sub-start]').textContent), end: Number(r.querySelector('[data-sub-end]').textContent), text: r.querySelector('[data-sub-text]').value }))");
  const cueOk = vo.cues.length === 2 && vo.cues.every((c) => rows.some((r) => Math.abs(r.start - c.start) < 0.1 && c.text.startsWith(r.text)));
  check("phụ đề tự lấy từ mốc câu của giọng đọc (đang trống): mỗi câu bắt đầu một dòng đúng mốc, không dòng nào vượt câu", cueOk && rows.every((r) => vo.cues.some((c) => r.start >= c.start - 0.05 && r.end <= c.end + 0.05)),
    JSON.stringify({ cues: vo.cues, rows }));

  // Xem trước: giọng đọc phát cùng hình, đúng thời điểm
  await click("[data-action='play']");
  await sleep(1500);
  const pv = await ev("({ playing: !document.querySelector('.ed-voice audio').paused, at: document.querySelector('.ed-voice audio').currentTime, label: document.querySelector('.ed-time').textContent })");
  await click("[data-action='play']");
  const pvTime = parseFloat(pv.label);
  check("xem trước: giọng đọc phát cùng hình, lệch dưới 0,3s", pv.playing && Math.abs(pv.at - pvTime) < 0.3, JSON.stringify(pv));
  check("dừng xem trước thì giọng đọc dừng", await ev("document.querySelector('.ed-voice audio').paused"));
  if (process.env.SHOT) {
    await ev("document.querySelector('.ed-voice').scrollIntoView()");
    const r = await send("Page.captureScreenshot", { format: "png" });
    (await import("node:fs")).writeFileSync(process.env.SHOT, Buffer.from(r.result.data, "base64"));
  }

  // Đồng bộ lên máy chủ
  await sleep(2200);
  const remote = await (await fetch(`${B}/api/products/${id}/edit`, { headers: auth })).json();
  check("edit.json trên máy chủ có giọng đọc (lời, giọng, mốc câu), không có dữ liệu file", remote.edit?.voiceover?.sourceId === vo.sourceId && remote.edit.voiceover.cues.length === 2 && !("blob" in remote.edit.voiceover));

  // Xuất với tiếng clip "Tắt": chỉ còn giọng đọc
  await set("#voice-clip-volume", "off");
  await click("[data-action='export']");
  await waitFor("!!document.querySelector('.ed-result:not([hidden]) video')", "xuất video", 600);
  const off = await ev(ANALYZE);
  const wavEnv = await ev(`(async () => {
    const { decodeWav } = await import("/editor/audio.js");
    const { getClip } = await import("/editor/local-clips.js");
    const w = decodeWav(await (await getClip(${JSON.stringify(id)}, ${JSON.stringify(vo.sourceId)})).arrayBuffer());
    const ch = w.channels[0], per = w.sampleRate / 10, out = [];
    for (let k = 0; k * per < ch.length; k++) { let s = 0; for (let i = k * per; i < Math.min(ch.length, (k + 1) * per); i++) s += ch[i] * ch[i]; out.push(Math.sqrt(s / per)); }
    return out;
  })()`);
  // Tìm độ lệch (bước 0,1s) để đường độ to của file xuất khớp nhất với file giọng đọc.
  let best = { lag: 0, score: -Infinity };
  for (let lag = -5; lag <= 5; lag++) {
    let s = 0;
    wavEnv.forEach((x, k) => { s += x * (off.rms[k + lag] || 0); });
    if (s > best.score) best = { lag, score: s };
  }
  const voiceEnd = Math.ceil(vo.duration * 10);
  check("file xuất 1080x1920, tiếng dài bằng hình", off.w === 1080 && off.h === 1920 && Math.abs(off.adur - off.vdur) < 0.06, `${off.vdur}s / ${off.adur}s`);
  check("tiếng clip 'Tắt': có giọng đọc, sau khi đọc xong thì im lặng", mean(off.rms.slice(2, voiceEnd - 2)) > 0.02 && mean(off.rms.slice(voiceEnd + 3, 78)) < 0.003,
    `giọng ${mean(off.rms.slice(2, voiceEnd - 2)).toFixed(4)}, sau ${mean(off.rms.slice(voiceEnd + 3, 78)).toFixed(4)}`);
  check("giọng đọc trong video không lệch so với file của CIT (< 0,3s)", Math.abs(best.lag) <= 2, `lệch ${best.lag / 10}s`);

  // Xuất với "Nhỏ lại": bíp còn khoảng 25% (0,4 → RMS 0,283 → ~0,071)
  await set("#voice-clip-volume", "low");
  await click("[data-action='export']");
  await waitFor("!!document.querySelector('.ed-result:not([hidden]) video')", "xuất video lần 2", 600);
  const low = await ev(ANALYZE);
  const tail = mean(low.rms.slice(voiceEnd + 3, 78));
  check("tiếng clip 'Nhỏ lại': phần sau giọng đọc còn ~25% độ to của clip", tail > 0.06 && tail < 0.085, tail.toFixed(4));

  // Bỏ chọn giọng đọc → xuất ra tiếng clip nguyên vẹn
  await click("#voice-on");
  await click("[data-action='export']");
  await waitFor("!!document.querySelector('.ed-result:not([hidden]) video')", "xuất video lần 3", 600);
  const none = await ev(ANALYZE);
  check("bỏ 'Dùng giọng đọc trong video' → tiếng clip nguyên vẹn", Math.abs(mean(none.rms.slice(10, 70)) - 0.283) < 0.02, mean(none.rms.slice(10, 70)).toFixed(4));
  await click("#voice-on");

  // Mở lại trình dựng: giọng đọc còn, tự kết nối CIT
  await ev("location.reload()");
  await sleep(500);
  await waitFor("document.querySelector('.editor')?.dataset.ready === '1'", "mở lại trình dựng");
  await waitFor("document.querySelector('.voice-status[data-state=\"ready\"]')", "tự kết nối lại CIT");
  check("tải lại trang: giọng đọc còn nguyên, tự kết nối CIT, lời đọc đã sửa được giữ", await ev(
    "!!document.querySelector('.ed-voice audio')?.src && document.querySelector('#voice-text').value.startsWith('Da dầu mụn')"));

  // Máy khác: xoá file trên thiết bị
  await ev(`(async () => { const { deleteClip } = await import("/editor/local-clips.js"); await deleteClip(${JSON.stringify(id)}, ${JSON.stringify(vo.sourceId)}); location.reload(); })()`);
  await sleep(500);
  await waitFor("document.querySelector('.editor')?.dataset.ready === '1'", "mở lại (giả lập máy khác)");
  check("thiếu file giọng đọc (máy khác) → báo rõ và khoá nút Xuất", await ev(
    "!!document.querySelector('.voice-missing') && document.querySelector('.ed-summary + .field-error').textContent.includes('Thiếu file giọng đọc') && document.querySelector('[data-action=\"export\"]').disabled"));
  check("không có lỗi JavaScript", errors.length === 0, errors.join(" | ").slice(0, 300));
} catch (err) {
  check("chạy hết kịch bản", false, err.message);
} finally {
  await fetch(`${B}/api/products/${id}`, { method: "DELETE", headers: auth }).catch(() => {});
  ws.close();
  chrome.kill();
}

console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed}/${results.length} đạt`);
process.exit(failed ? 1 : 0);
