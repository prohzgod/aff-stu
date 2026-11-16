import { test } from "node:test";
import assert from "node:assert/strict";
import { placeSamples } from "../public/editor/audio.js";

const ramp = (n) => Float32Array.from({ length: n }, (_, i) => i + 1);

test("cùng tần số: chép đúng vị trí, cắt ở biên đoạn", () => {
  const dest = new Float32Array(10);
  assert.equal(placeSamples(dest, 2, 5, ramp(4), 48000, 0, 48000), 4);
  assert.deepEqual([...dest], [0, 0, 1, 2, 3, 4, 0, 0, 0, 0]);
  const d2 = new Float32Array(10);
  placeSamples(d2, 2, 3, ramp(6), 48000, 0, 48000); // đoạn chỉ có 3 mẫu
  assert.deepEqual([...d2], [0, 0, 1, 2, 3, 0, 0, 0, 0, 0]);
});

test("khối bắt đầu trước điểm cắt đầu: bỏ phần thừa phía trước", () => {
  const dest = new Float32Array(6);
  placeSamples(dest, 0, 6, ramp(5), 48000, -2 / 48000, 48000);
  assert.deepEqual([...dest], [3, 4, 5, 0, 0, 0]);
});

test("khối nằm sau trong đoạn: đặt theo thời điểm", () => {
  const dest = new Float32Array(8);
  placeSamples(dest, 1, 7, ramp(2), 48000, 3 / 48000, 48000);
  assert.deepEqual([...dest], [0, 0, 0, 0, 1, 2, 0, 0]);
});

test("khác tần số (24kHz → 48kHz): nội suy tuyến tính, độ dài gấp đôi", () => {
  const dest = new Float32Array(8);
  const n = placeSamples(dest, 0, 8, Float32Array.from([0, 1, 2, 3]), 24000, 0, 48000);
  assert.equal(n, 7);
  assert.deepEqual([...dest].map((v) => +v.toFixed(3)), [0, 0.5, 1, 1.5, 2, 2.5, 3, 0]);
});

test("44,1kHz → 48kHz: 1 giây nguồn lấp gần đủ 48000 mẫu, không ghi ra ngoài đoạn", () => {
  const dest = new Float32Array(48000 + 10);
  const src = new Float32Array(44100).fill(0.5);
  const n = placeSamples(dest, 5, 48000, src, 44100, 0, 48000);
  assert.ok(n >= 47998 && n <= 48000, String(n));
  assert.equal(dest[4], 0);
  assert.equal(dest[48005], 0);
  assert.ok(Math.abs(dest[24000] - 0.5) < 1e-6);
});

test("đầu vào rỗng hoặc nằm hẳn ngoài đoạn: không ghi gì", () => {
  const dest = new Float32Array(4);
  assert.equal(placeSamples(dest, 0, 4, new Float32Array(0), 48000, 0, 48000), 0);
  assert.equal(placeSamples(dest, 0, 4, ramp(3), 48000, 1, 48000), 0);
  assert.equal(placeSamples(dest, 0, 4, ramp(3), 48000, -1, 48000), 0);
  assert.deepEqual([...dest], [0, 0, 0, 0]);
});
