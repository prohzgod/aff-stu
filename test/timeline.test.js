import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIMITS, SAMPLE_RATE, segmentDuration, totalDuration, clampTrim, moveSegment, validateTimeline,
  outputFps, buildSchedule, frameSourceTime, fitRect, kenBurnsScale, locate,
} from "../public/editor/timeline.js";

const clip = (o = {}) => ({ id: "c", type: "clip", srcDuration: 10, fps: 24, in: 0, out: 10, muted: false, fit: "cover", ...o });
const image = (o = {}) => ({ id: "i", type: "image", duration: 2, kenBurns: true, fit: "cover", ...o });

test("segmentDuration / totalDuration", () => {
  assert.equal(segmentDuration(clip({ in: 1.5, out: 4 })), 2.5);
  assert.equal(segmentDuration(image({ duration: 2 })), 2);
  assert.equal(totalDuration([clip({ in: 0, out: 3 }), image(), clip({ in: 5, out: 8 })]), 8);
  assert.equal(totalDuration([]), 0);
});

test("clampTrim giữ điểm cắt trong clip và đoạn dài tối thiểu 0,2s", () => {
  assert.deepEqual(pick(clampTrim(clip(), { in: -3, out: 99 })), { in: 0, out: 10 });
  assert.deepEqual(pick(clampTrim(clip(), { in: 4 })), { in: 4, out: 10 });
  assert.deepEqual(pick(clampTrim(clip({ in: 2, out: 6 }), { out: 1 })), { in: 2, out: 2.2 });
  assert.deepEqual(pick(clampTrim(clip({ in: 2, out: 6 }), { in: 9 })), { in: 5.8, out: 6 });
  assert.deepEqual(pick(clampTrim(clip(), { in: NaN, out: "x" })), { in: 0, out: 10 });
  const img = clampTrim(image(), { duration: 99 });
  assert.equal(img.duration, 10);
  assert.equal(clampTrim(image(), { duration: 0 }).duration, 0.2);
});
const pick = (s) => ({ in: s.in, out: s.out });

test("moveSegment không sửa mảng gốc, chỉ số sai thì trả nguyên", () => {
  const a = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.deepEqual(moveSegment(a, 0, 2).map((s) => s.id), [2, 3, 1]);
  assert.deepEqual(moveSegment(a, 2, 0).map((s) => s.id), [3, 1, 2]);
  assert.deepEqual(a.map((s) => s.id), [1, 2, 3]);
  assert.deepEqual(moveSegment(a, 5, 0).map((s) => s.id), [1, 2, 3]);
  assert.deepEqual(moveSegment(a, 0, -1).map((s) => s.id), [1, 2, 3]);
});

test("validateTimeline: rỗng, quá 12 đoạn, quá 60 giây", () => {
  assert.deepEqual(validateTimeline([]), ["Chưa có đoạn nào. Thêm clip hoặc ảnh trước khi xuất."]);
  assert.deepEqual(validateTimeline([clip()]), []);
  assert.match(validateTimeline(Array.from({ length: 13 }, () => clip({ in: 0, out: 1 })))[0], /12 đoạn/);
  assert.match(validateTimeline(Array.from({ length: 7 }, () => clip()))[0], /60 giây/);
  assert.equal(LIMITS.maxSegments, 12);
  assert.equal(LIMITS.maxSeconds, 60);
});

test("outputFps: theo clip đầu nếu 24/25/30 và các clip cùng fps, còn lại 30", () => {
  assert.equal(outputFps([clip({ fps: 24 }), image(), clip({ fps: 24 })]), 24);
  assert.equal(outputFps([clip({ fps: 25 })]), 25);
  assert.equal(outputFps([clip({ fps: 24 }), clip({ fps: 30 })]), 30);
  assert.equal(outputFps([clip({ fps: 60 })]), 30);
  assert.equal(outputFps([clip({ fps: 23.976 })]), 24);
  assert.equal(outputFps([image()]), 30);
  assert.equal(outputFps([]), 30);
});

test("buildSchedule: frame và mẫu tiếng suy từ cùng một bảng, không hở không chồng", () => {
  const segs = [clip({ in: 0, out: 3 }), image({ duration: 1 }), clip({ in: 5, out: 8 })];
  const s = buildSchedule(segs, 24);
  assert.deepEqual(s.items.map((i) => [i.startFrame, i.frameCount]), [[0, 72], [72, 24], [96, 72]]);
  assert.equal(s.totalFrames, 168);
  assert.equal(s.totalSamples, 7 * SAMPLE_RATE);
  assert.equal(s.duration, 7);
  for (let i = 1; i < s.items.length; i++) {
    assert.equal(s.items[i].startFrame, s.items[i - 1].startFrame + s.items[i - 1].frameCount);
    assert.equal(s.items[i].startSample, s.items[i - 1].startSample + s.items[i - 1].sampleCount);
  }
});

test("buildSchedule với thời lượng lẻ: tổng mẫu tiếng luôn khớp tổng frame", () => {
  for (const fps of [24, 25, 30]) {
    const segs = [clip({ in: 0.13, out: 2.777 }), image({ duration: 0.2 }), clip({ in: 1.001, out: 9.999 }), image({ duration: 1.337 })];
    const s = buildSchedule(segs, fps);
    const last = s.items.at(-1);
    assert.equal(last.startFrame + last.frameCount, s.totalFrames);
    assert.equal(last.startSample + last.sampleCount, s.totalSamples);
    assert.ok(Math.abs(s.totalSamples / SAMPLE_RATE - s.totalFrames / fps) < 1 / SAMPLE_RATE);
    for (const it of s.items) assert.ok(it.frameCount >= 1 && it.sampleCount >= 1);
  }
});

test("frameSourceTime: tiến theo fps đầu ra, không vượt điểm cắt cuối", () => {
  const c = clip({ in: 2, out: 3 });
  assert.equal(frameSourceTime(c, 0, 24), 2);
  assert.ok(Math.abs(frameSourceTime(c, 12, 24) - 2.5) < 1e-9);
  assert.ok(frameSourceTime(c, 999, 24) < 3);
  assert.ok(frameSourceTime(c, 999, 24) > 2.9);
});

test("fitRect: cover lấp đầy, contain nằm gọn, luôn căn giữa", () => {
  assert.deepEqual(fitRect(720, 1280, 1080, 1920, "cover"), { x: 0, y: 0, w: 1080, h: 1920 });
  const wide = fitRect(1920, 1080, 1080, 1920, "cover");
  assert.equal(wide.h, 1920);
  assert.ok(wide.w > 1080 && Math.abs(wide.x + wide.w / 2 - 540) < 1e-6);
  const fit = fitRect(1920, 1080, 1080, 1920, "contain");
  assert.equal(fit.w, 1080);
  assert.ok(Math.abs(fit.h - 607.5) < 1e-6 && Math.abs(fit.y + fit.h / 2 - 960) < 1e-6);
  const sq = fitRect(800, 800, 1080, 1920, "cover");
  assert.equal(sq.h, 1920); assert.equal(sq.w, 1920);
  assert.deepEqual(fitRect(0, 0, 1080, 1920, "cover"), { x: 0, y: 0, w: 1080, h: 1920 });
});

test("kenBurnsScale: 100% → 108%", () => {
  assert.equal(kenBurnsScale(0), 1);
  assert.ok(Math.abs(kenBurnsScale(1) - 1.08) < 1e-9);
  assert.ok(Math.abs(kenBurnsScale(0.5) - 1.04) < 1e-9);
  assert.equal(kenBurnsScale(-1), 1);
  assert.ok(Math.abs(kenBurnsScale(5) - 1.08) < 1e-9);
});

test("locate: thời điểm trên timeline → đoạn nào, giây thứ mấy trong đoạn", () => {
  const segs = [clip({ in: 1, out: 3 }), image({ duration: 1 }), clip({ in: 5, out: 8 })];
  assert.deepEqual(locate(segs, 0), { index: 0, offset: 0, sourceTime: 1 });
  assert.deepEqual(locate(segs, 2.5), { index: 1, offset: 0.5, sourceTime: null });
  const l = locate(segs, 4);
  assert.equal(l.index, 2); assert.equal(l.offset, 1); assert.equal(l.sourceTime, 6);
  assert.equal(locate(segs, 99).index, 2);
  assert.equal(locate(segs, -1).index, 0);
  assert.equal(locate([], 1), null);
});
