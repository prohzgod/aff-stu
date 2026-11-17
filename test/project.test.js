import { test } from "node:test";
import assert from "node:assert/strict";
import { buildJob, projectSummary } from "../public/editor/project.js";

const project = () => ({
  segments: [{ id: "a", type: "clip", sourceId: "s1", in: 0, out: 3, srcDuration: 10, fps: 24, fit: "cover" }, { id: "b", type: "image", sourceId: "s2", duration: 2, fit: "cover" }],
  useWatermark: true,
  overlays: { hook: { enabled: true, text: "H" }, price: { enabled: false, text: "P" }, cta: { enabled: true, text: "C" } },
  subtitles: { enabled: true, style: "karaoke", lines: [{ text: "x", start: 0, end: 1, words: [] }] },
});
const blobs = new Map([["s1", "BLOB1"], ["s2", "BLOB2"]]);
const brand = { handle: "@kenh", position: "tr", watermark: true };

test("buildJob không có thiết lập chung: giữ nguyên như sản phẩm đã đặt, gắn đúng file cho từng đoạn", () => {
  const job = buildJob(project(), blobs, brand, null);
  assert.deepEqual(job.segments.map((s) => s.blob), ["BLOB1", "BLOB2"]);
  assert.deepEqual(job.watermark, { handle: "@kenh", position: "tr", logoBlob: null });
  assert.deepEqual([job.overlays.hook.enabled, job.overlays.price.enabled, job.overlays.cta.enabled], [true, false, true]);
  assert.equal(job.overlays.hook.text, "H");
  assert.deepEqual({ enabled: job.subtitles.enabled, style: job.subtitles.style, n: job.subtitles.lines.length }, { enabled: true, style: "karaoke", n: 1 });
});

test("buildJob với thiết lập chung: bật/tắt đè lên từng sản phẩm, chữ thì giữ của sản phẩm", () => {
  const job = buildJob(project(), blobs, brand, null, { watermark: false, hook: false, price: true, cta: null, subtitles: "box" });
  assert.equal(job.watermark, null);
  assert.deepEqual([job.overlays.hook.enabled, job.overlays.price.enabled, job.overlays.cta.enabled], [false, true, true]);
  assert.equal(job.overlays.price.text, "P");
  assert.equal(job.subtitles.style, "box");
  assert.equal(job.subtitles.enabled, true);
  assert.equal(buildJob(project(), blobs, brand, null, { subtitles: "off" }).subtitles.enabled, false);
  assert.equal(buildJob(project(), blobs, brand, null, { subtitles: "keep" }).subtitles.style, "karaoke");
});

test("buildJob: không có brand kit, brand kit tắt watermark, hoặc không có tên lẫn logo → không watermark", () => {
  assert.equal(buildJob(project(), blobs, null, null, { watermark: true }).watermark, null);
  assert.equal(buildJob(project(), blobs, { ...brand, watermark: false }, null, { watermark: true }).watermark, null);
  assert.equal(buildJob(project(), blobs, { ...brand, handle: "" }, null).watermark, null);
  assert.notEqual(buildJob(project(), blobs, { ...brand, handle: "" }, "LOGO").watermark, null);
  assert.equal(buildJob({ ...project(), useWatermark: false }, blobs, brand, null).watermark, null);
});

test("buildJob với dự án cũ thiếu trường: không ném lỗi", () => {
  const job = buildJob({ segments: project().segments }, blobs, brand, null);
  assert.deepEqual(job.overlays.hook, { enabled: false, text: "" });
  assert.deepEqual(job.subtitles.lines, []);
});

test("projectSummary", () => {
  assert.deepEqual(projectSummary(project()), { count: 2, seconds: 5, problems: [] });
  assert.equal(projectSummary({ segments: Array.from({ length: 13 }, () => project().segments[1]) }).problems.length, 1);
});

test("buildJob: giọng đọc đã tạo thì đi kèm job với mức tiếng clip; tắt hoặc thiếu file thì không", () => {
  const withVoice = { ...project(), voiceover: { enabled: true, sourceId: "v1", clipVolume: "off" } };
  const all = new Map([...blobs, ["v1", "WAV"]]);
  assert.deepEqual(buildJob(withVoice, all, brand, null).voiceover, { blob: "WAV", clipVolume: "off" });
  assert.equal(buildJob({ ...withVoice, voiceover: { ...withVoice.voiceover, enabled: false } }, all, brand, null).voiceover, null);
  assert.equal(buildJob(withVoice, blobs, brand, null).voiceover, null);
  assert.equal(buildJob(project(), blobs, brand, null).voiceover, null);
});
