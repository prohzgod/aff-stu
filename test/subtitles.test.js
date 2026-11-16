import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SUBTITLE_STYLES, toMono16k, encodeWav, wordsToLines, linesFromText, activeLine, formatSrtTime, toSrt,
  nudgeLine, splitLine, mergeLines, setLineText, applyCorrections, subtitleLayout, drawSubtitle,
} from "../public/editor/subtitles.js";
import { SAFE } from "../public/editor/compose.js";

const W = (w, start, end) => ({ w, start, end });
const words = [W("Da", 0.4, 0.6), W("dầu", 0.6, 0.9), W("thử", 0.9, 1.2), W("ngay", 1.2, 1.5), W("tinh", 1.5, 1.8), W("chất", 1.8, 2.0), W("bí", 2.0, 2.2), W("đao.", 2.2, 2.6), W("Giá", 3.5, 3.8), W("chỉ", 3.8, 4.0), W("217K", 4.0, 4.6)];
const measure = (text, size) => [...text].length * size * 0.5;

test("ba kiểu phụ đề", () => {
  assert.deepEqual(Object.keys(SUBTITLE_STYLES), ["karaoke", "box", "minimal"]);
});

test("toMono16k: 48kHz stereo → 16kHz mono, lấy trung bình hai kênh", () => {
  const L = new Float32Array(48000).fill(0.5), R = new Float32Array(48000).fill(-0.1);
  const mono = toMono16k(L, R, 48000);
  assert.equal(mono.length, 16000);
  assert.ok(Math.abs(mono[0] - 0.2) < 1e-6 && Math.abs(mono[15999] - 0.2) < 1e-6);
  assert.equal(toMono16k(new Float32Array(44100), new Float32Array(44100), 44100).length, 16000);
  assert.equal(toMono16k(new Float32Array(0), new Float32Array(0), 48000).length, 0);
});

test("encodeWav: header PCM 16-bit mono 16kHz đúng chuẩn, mẫu bị kẹp trong [-1, 1]", () => {
  const wav = encodeWav(Float32Array.from([0, 1, -1, 2, -2, 0.5]), 16000);
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const tag = (o) => String.fromCharCode(...wav.subarray(o, o + 4));
  assert.equal(wav.byteLength, 44 + 12);
  assert.equal(tag(0), "RIFF"); assert.equal(tag(8), "WAVE"); assert.equal(tag(12), "fmt "); assert.equal(tag(36), "data");
  assert.equal(v.getUint32(4, true), 36 + 12);
  assert.equal(v.getUint16(20, true), 1);      // PCM
  assert.equal(v.getUint16(22, true), 1);      // mono
  assert.equal(v.getUint32(24, true), 16000);
  assert.equal(v.getUint32(28, true), 32000);  // byte mỗi giây
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), 12);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => v.getInt16(44 + i * 2, true)), [0, 32767, -32767, 32767, -32767, 16384]);
});

test("wordsToLines karaoke: tối đa 3 từ mỗi dòng, ngắt ở dấu câu và chỗ nghỉ dài", () => {
  const lines = wordsToLines(words, "karaoke");
  assert.deepEqual(lines.map((l) => l.text), ["Da dầu thử", "ngay tinh chất", "bí đao.", "Giá chỉ 217K"]);
  assert.equal(lines[0].start, 0.4); assert.equal(lines[0].end, 1.2);
  assert.equal(lines[2].end, 2.6); assert.equal(lines[3].start, 3.5);
  assert.deepEqual(lines[0].words, words.slice(0, 3));
  for (const l of lines) assert.ok(l.words.length >= 1 && l.words.length <= 3);
});

test("wordsToLines hộp nền/tối giản: dòng dài hơn, vẫn ngắt ở dấu câu", () => {
  const lines = wordsToLines(words, "box");
  assert.deepEqual(lines.map((l) => l.text), ["Da dầu thử ngay tinh chất bí", "đao.", "Giá chỉ 217K"]);
  assert.deepEqual(wordsToLines([], "box"), []);
  assert.deepEqual(wordsToLines(null, "karaoke"), []);
});

test("wordsToLines bỏ từ rỗng và sửa mốc thời gian lộn xộn", () => {
  const lines = wordsToLines([W(" ", 0, 0.1), W("Một", 1, 0.5), W("hai", 0.9, 1.4)], "karaoke");
  assert.equal(lines.length, 1);
  assert.equal(lines[0].text, "Một hai");
  assert.ok(lines[0].words.every((w) => w.end > w.start));
  assert.ok(lines[0].end > lines[0].start);
});

test("linesFromText: chia đều lời thoại theo số từ trong khoảng thời gian", () => {
  const lines = linesFromText("Da dầu thử ngay tinh chất bí đao. Giá chỉ 217K thôi nè", 0, 6, "karaoke");
  assert.equal(lines.map((l) => l.text).join(" "), "Da dầu thử ngay tinh chất bí đao. Giá chỉ 217K thôi nè");
  assert.equal(lines[0].start, 0);
  assert.ok(Math.abs(lines.at(-1).end - 6) < 1e-6);
  for (let i = 1; i < lines.length; i++) assert.ok(lines[i].start >= lines[i - 1].end - 1e-9);
  assert.equal(lines.flatMap((l) => l.words).length, 13);
  assert.deepEqual(linesFromText("   ", 0, 5, "box"), []);
  assert.deepEqual(linesFromText("chữ", 3, 3, "box"), []);
});

test("activeLine: dòng và từ đang nói tại thời điểm t", () => {
  const lines = wordsToLines(words, "karaoke");
  assert.equal(activeLine(lines, 0.1), null);
  assert.deepEqual(pick(activeLine(lines, 0.7)), { text: "Da dầu thử", wordIndex: 1 });
  assert.deepEqual(pick(activeLine(lines, 2.5)), { text: "bí đao.", wordIndex: 1 });
  assert.equal(activeLine(lines, 3.0), null); // khoảng nghỉ giữa hai câu
  assert.deepEqual(pick(activeLine(lines, 4.59)), { text: "Giá chỉ 217K", wordIndex: 2 });
  assert.equal(activeLine(lines, 99), null);
  assert.equal(activeLine([], 1), null);
});
const pick = (a) => ({ text: a.line.text, wordIndex: a.wordIndex });

test("SRT: định dạng thời gian và nội dung", () => {
  assert.equal(formatSrtTime(0), "00:00:00,000");
  assert.equal(formatSrtTime(3.4567), "00:00:03,457");
  assert.equal(formatSrtTime(3725.5), "01:02:05,500");
  assert.equal(formatSrtTime(-1), "00:00:00,000");
  const srt = toSrt([{ text: "Da dầu thử", start: 0.4, end: 1.2 }, { text: "ngay nào", start: 1.2, end: 2 }]);
  assert.equal(srt, "1\r\n00:00:00,400 --> 00:00:01,200\r\nDa dầu thử\r\n\r\n2\r\n00:00:01,200 --> 00:00:02,000\r\nngay nào\r\n");
  assert.equal(toSrt([]), "");
  assert.equal(toSrt([{ text: "  ", start: 0, end: 1 }, { text: "a\nb --> c", start: 1, end: 2 }]), "1\r\n00:00:01,000 --> 00:00:02,000\r\na b → c\r\n");
});

test("chỉnh dòng: dịch thời gian ±0,1 giây không âm, không đảo đầu cuối", () => {
  const line = { text: "a b", start: 1, end: 2, words: [W("a", 1, 1.5), W("b", 1.5, 2)] };
  assert.equal(nudgeLine(line, "start", -0.1).start, 0.9);
  assert.equal(nudgeLine(line, "end", 0.1).end, 2.1);
  assert.equal(nudgeLine({ ...line, start: 0.05 }, "start", -0.1).start, 0);
  assert.ok(nudgeLine(line, "start", 5).start < 2);
  assert.ok(nudgeLine(line, "end", -5).end > 1);
});

test("tách và gộp dòng giữ nguyên từ và mốc thời gian", () => {
  const lines = wordsToLines(words, "box");
  const split = splitLine(lines, 0, 3);
  assert.deepEqual(split.map((l) => l.text), ["Da dầu thử", "ngay tinh chất bí", "đao.", "Giá chỉ 217K"]);
  assert.equal(split[0].end, 1.2); assert.equal(split[1].start, 1.2);
  assert.deepEqual(mergeLines(split, 0).map((l) => l.text), lines.map((l) => l.text));
  assert.equal(mergeLines(split, 0)[0].end, lines[0].end);
  assert.deepEqual(splitLine(lines, 0, 0), lines);   // tách ở đầu: không làm gì
  assert.deepEqual(splitLine(lines, 1, 5), lines);   // dòng một từ: không tách được
  assert.deepEqual(mergeLines(lines, lines.length - 1), lines);
});

test("sửa chữ một dòng: chia lại mốc từ trong khoảng của dòng", () => {
  const line = wordsToLines(words, "karaoke")[0];
  const edited = setLineText(line, "Da dầu mụn thử ngay");
  assert.equal(edited.text, "Da dầu mụn thử ngay");
  assert.equal(edited.words.length, 5);
  assert.equal(edited.words[0].start, line.start);
  assert.ok(Math.abs(edited.words[4].end - line.end) < 1e-9);
  assert.equal(setLineText(line, "Da  dầu   thử").words[1].start, line.words[1].start); // cùng số từ: giữ mốc cũ
});

test("applyCorrections: chỉ nhận khi số từ khớp, mốc thời gian không đổi", () => {
  const fixed = applyCorrections(words.slice(0, 3), ["Da", "dầu,", "thử"]);
  assert.deepEqual(fixed.map((w) => w.w), ["Da", "dầu,", "thử"]);
  assert.deepEqual(fixed.map((w) => [w.start, w.end]), words.slice(0, 3).map((w) => [w.start, w.end]));
  assert.deepEqual(applyCorrections(words.slice(0, 3), ["Da dầu", "thử"]), words.slice(0, 3));
  assert.deepEqual(applyCorrections(words.slice(0, 3), ["Da", "", "thử"]), words.slice(0, 3));
  assert.deepEqual(applyCorrections(words.slice(0, 3), "không phải mảng"), words.slice(0, 3));
  assert.deepEqual(applyCorrections(words.slice(0, 3), ["Da", 5, "thử"]), words.slice(0, 3));
});

test("subtitleLayout: nằm trong vùng an toàn và phía trên sticker giá, với mọi kiểu và chữ rất dài", () => {
  for (const style of Object.keys(SUBTITLE_STYLES)) for (const text of ["Da dầu thử", "x".repeat(200), "một hai ba bốn năm sáu bảy tám chín mười mười một mười hai"]) {
    const { box } = subtitleLayout(text, style, measure);
    assert.ok(box.x >= SAFE.left - 0.5 && box.x + box.w <= 1080 - SAFE.right + 0.5, `${style} ngang`);
    assert.ok(box.y >= 700, `${style} trên ${box.y}`);
    assert.ok(box.y + box.h <= 1140, `${style} dưới ${box.y + box.h}`);
  }
});

test("drawSubtitle karaoke: từ đang nói đổi màu; không có dòng thì không vẽ", () => {
  const calls = [];
  const ctx = {
    font: "", fillStyle: "", strokeStyle: "", lineWidth: 0, lineJoin: "", textAlign: "", textBaseline: "",
    save() {}, restore() {}, beginPath() {}, roundRect() {}, fill: () => calls.push(["bg", ctx.fillStyle]),
    measureText: (t) => ({ width: [...t].length * 30 }),
    strokeText: () => {}, fillText: (t) => calls.push(["fill", t, ctx.fillStyle]),
  };
  const line = wordsToLines(words, "karaoke")[0];
  drawSubtitle(ctx, { line, wordIndex: 1 }, "karaoke");
  const fills = calls.filter((c) => c[0] === "fill");
  assert.deepEqual(fills.map((c) => c[1]), ["Da", "dầu", "thử"]);
  assert.notEqual(fills[1][2], fills[0][2]);
  assert.equal(fills[0][2], fills[2][2]);
  calls.length = 0;
  drawSubtitle(ctx, { line, wordIndex: 0 }, "box");
  assert.equal(calls[0][0], "bg");
  calls.length = 0;
  drawSubtitle(ctx, null, "karaoke");
  drawSubtitle(ctx, { line: { text: " ", words: [] }, wordIndex: -1 }, "minimal");
  assert.equal(calls.length, 0);
});
