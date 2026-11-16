import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, makeZip } from "../public/lib/zip.js";

const enc = (s) => new TextEncoder().encode(s);
// Dùng zipfile của Python để kiểm: `unzip` có sẵn trên macOS bỏ qua cờ UTF-8 nên làm hỏng tên có dấu.
const PY = `
import json, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None
z.extractall(sys.argv[2])
print(json.dumps(z.namelist()))
`;
let lastNames = [];
const unzipTo = (zip) => {
  const dir = mkdtempSync(join(tmpdir(), "zip-"));
  writeFileSync(join(dir, "a.zip"), zip);
  lastNames = JSON.parse(execFileSync("python3", ["-c", PY, join(dir, "a.zip"), join(dir, "out")], { encoding: "utf8" }));
  return join(dir, "out");
};

test("crc32 giá trị chuẩn", () => {
  assert.equal(crc32(enc("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test("zip mở được bằng unzip của hệ thống, tên tiếng Việt và nội dung đúng", () => {
  const out = unzipTo(makeZip([
    { name: "gói-đăng-bài.txt", data: enc("Xin chào ấ") },
    { name: "img_01.jpg", data: new Uint8Array([1, 2, 3, 255]) },
    { name: "rỗng.txt", data: new Uint8Array(0) },
  ]));
  assert.deepEqual(readdirSync(out).map((n) => n.normalize("NFC")).sort(), ["gói-đăng-bài.txt", "img_01.jpg", "rỗng.txt"].sort());
  const viet = readdirSync(out).find((n) => n.normalize("NFC") === "gói-đăng-bài.txt");
  assert.equal(readFileSync(join(out, viet), "utf8"), "Xin chào ấ");
  assert.deepEqual([...readFileSync(join(out, "img_01.jpg"))], [1, 2, 3, 255]);
  assert.equal(readFileSync(join(out, readdirSync(out).find((n) => n.normalize("NFC") === "rỗng.txt"))).length, 0);
});

test("tên trùng được đánh số", () => {
  const out = unzipTo(makeZip([{ name: "a.txt", data: enc("1") }, { name: "a.txt", data: enc("2") }, { name: "a.txt", data: enc("3") }, { name: "README", data: enc("x") }, { name: "README", data: enc("y") }]));
  assert.deepEqual(readdirSync(out).sort(), ["README", "README (2)", "a (2).txt", "a (3).txt", "a.txt"].sort());
  assert.equal(readFileSync(join(out, "a (2).txt"), "utf8"), "2");
});

test("tên có đường dẫn nguy hiểm bị làm phẳng", () => {
  const out = unzipTo(makeZip([{ name: "../../etc/passwd", data: enc("x") }, { name: "/tuyệt/đối.txt", data: enc("y") }, { name: "", data: enc("z") }]));
  assert.deepEqual(lastNames.sort(), ["file", "passwd", "đối.txt"].sort()); // tên ghi trong zip, trước khi công cụ giải nén tự làm sạch
  assert.deepEqual(readdirSync(out).map((n) => n.normalize("NFC")).sort(), ["file", "passwd", "đối.txt"].sort());
});

test("cờ UTF-8 (bit 11) bật trong local header và central directory", () => {
  const zip = makeZip([{ name: "ấ.txt", data: enc("x") }]);
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint16(6, true) & 0x0800, 0x0800);
  assert.equal(view.getUint16(8, true), 0); // STORE
  const eocd = zip.byteLength - 22;
  assert.equal(view.getUint32(eocd, true), 0x06054b50);
  const cd = view.getUint32(eocd + 16, true);
  assert.equal(view.getUint32(cd, true), 0x02014b50);
  assert.equal(view.getUint16(cd + 8, true) & 0x0800, 0x0800);
  assert.equal(view.getUint16(eocd + 10, true), 1);
});

test("zip rỗng vẫn hợp lệ", () => {
  const zip = makeZip([]);
  assert.equal(zip.byteLength, 22);
});
