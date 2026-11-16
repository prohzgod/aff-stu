import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeBucket } from "./helpers/fake-bucket.js";
import { fakeFetch } from "./helpers/fake-fetch.js";
import { mirrorMedia } from "../lib/mirror.js";

const cocoon = JSON.parse(readFileSync(new URL("./fixtures/cocoon.json", import.meta.url)));
const ID = "abcdefghij";
const O = (n) => `https://cdn.example.test/img${n}~tplv-aphluv4xwc-origin-jpeg.jpeg`;
const PV = (n) => `https://cdn.example.test/img${n}.webp`;
const V = "https://cdn.example.test/v1.mp4", VB = "https://cdn.example.test/v1b.mp4";
const jpeg = { type: "image/jpeg" }, webp = { type: "image/webp" }, mp4 = { type: "video/mp4" };
const allOk = () => ({ [O(1)]: jpeg, [O(2)]: jpeg, [O(3)]: jpeg, [V]: mp4 });
const MB = 1024 * 1024;

test("lưu ảnh gốc, video header; description trùng không tải lại", async () => {
  const b = makeBucket(), f = fakeFetch(allOk());
  const r = await mirrorMedia(b, ID, cocoon, f);
  assert.deepEqual(r.images.map((i) => i.stored), [`p/${ID}/img_01.jpg`, `p/${ID}/img_02.jpg`, `p/${ID}/img_03.jpg`]);
  assert.equal(r.images[0].original, O(1));
  assert.equal(r.images[0].width, 800);
  assert.equal(r.videos.header.stored, `p/${ID}/video_header.mp4`);
  assert.equal(r.videos.header.duration, 19.9);
  assert.equal(r.videos.description.stored, r.videos.header.stored);
  assert.equal(r.mirrored, 4);
  assert.equal(f.calls.filter((c) => c.url.endsWith("v1.mp4")).length, 1);
  assert.equal(f.calls[0].headers.get("referer"), cocoon.url);
  assert.match(f.calls[0].headers.get("user-agent"), /Chrome\//);
  assert.equal((await b.head(`p/${ID}/img_01.jpg`)).httpMetadata.contentType, "image/jpeg");
  assert.equal((await b.head(`p/${ID}/video_header.mp4`)).httpMetadata.contentType, "video/mp4");
  assert.equal((await b.head(`p/${ID}/video_header.mp4`)).size, 8);
});

test("original 403 → dùng preview (webp)", async () => {
  const b = makeBucket(), f = fakeFetch({ ...allOk(), [O(1)]: undefined, [PV(1)]: webp });
  const r = await mirrorMedia(b, ID, cocoon, f);
  assert.equal(r.images[0].stored, `p/${ID}/img_01.webp`);
  assert.equal(r.mirrored, 4);
});

test("cả hai nguồn lỗi → stored null, các ảnh khác vẫn lưu, không ném lỗi", async () => {
  const b = makeBucket(), f = fakeFetch({ ...allOk(), [O(2)]: undefined });
  const r = await mirrorMedia(b, ID, cocoon, f);
  assert.deepEqual(r.images.map((i) => i.stored), [`p/${ID}/img_01.jpg`, null, `p/${ID}/img_03.jpg`]);
  assert.equal(r.images[1].original, O(2));
  assert.equal(r.mirrored, 3);
});

test("fetch ném lỗi mạng → stored null", async () => {
  const b = makeBucket(), f = fakeFetch({ ...allOk(), [O(1)]: { throws: true }, [PV(1)]: { throws: true } });
  const r = await mirrorMedia(b, ID, cocoon, f);
  assert.equal(r.images[0].stored, null);
  assert.equal(r.mirrored, 3);
});

test("video url lỗi → dùng backupUrl", async () => {
  const b = makeBucket(), f = fakeFetch({ ...allOk(), [V]: undefined, [VB]: mp4 });
  const r = await mirrorMedia(b, ID, cocoon, f);
  assert.equal(r.videos.header.stored, `p/${ID}/video_header.mp4`);
  assert.equal(r.videos.description.stored, `p/${ID}/video_header.mp4`);
});

test("video lỗi cả hai nguồn → stored null, description cũng null", async () => {
  const b = makeBucket(), f = fakeFetch({ ...allOk(), [V]: undefined });
  const r = await mirrorMedia(b, ID, cocoon, f);
  assert.equal(r.videos.header.stored, null);
  assert.equal(r.videos.description.stored, null);
  assert.equal(r.mirrored, 3);
});

test("ảnh content-length 16MB → bỏ; video 61MB → bỏ", async () => {
  const b = makeBucket();
  const f = fakeFetch({ ...allOk(), [O(1)]: { ...jpeg, size: 16 * MB }, [V]: { ...mp4, size: 61 * MB } });
  const r = await mirrorMedia(b, ID, cocoon, f);
  assert.equal(r.images[0].stored, null);
  assert.equal(r.videos.header.stored, null);
  assert.equal(await b.head(`p/${ID}/img_01.jpg`), null);
});

test("không có content-length: đo sau khi đọc, quá giới hạn thì bỏ", async () => {
  const b = makeBucket();
  const f = fakeFetch({ ...allOk(), [O(1)]: { ...jpeg, noLength: true, body: "y".repeat(15 * MB + 1) }, [O(2)]: { ...jpeg, noLength: true } });
  const r = await mirrorMedia(b, ID, cocoon, f);
  assert.equal(r.images[0].stored, null);
  assert.equal(r.images[1].stored, `p/${ID}/img_02.jpg`);
});

test("trang lỗi HTML trả 200 → không lưu thành ảnh", async () => {
  const b = makeBucket(), f = fakeFetch({ ...allOk(), [O(1)]: { type: "text/html" } });
  const r = await mirrorMedia(b, ID, cocoon, f);
  assert.equal(r.images[0].stored, null);
});

test("20 ảnh → chỉ 12 phần tử, img_12 là cuối", async () => {
  const b = makeBucket(), map = {};
  const images = Array.from({ length: 20 }, (_, i) => ({ original: O(i + 1), preview: PV(i + 1) }));
  for (const im of images) map[im.original] = jpeg;
  const r = await mirrorMedia(b, ID, { ...cocoon, images, videos: {} }, fakeFetch(map));
  assert.equal(r.images.length, 12);
  assert.equal(r.images[11].stored, `p/${ID}/img_12.jpg`);
  assert.equal(await b.head(`p/${ID}/img_13.jpg`), null);
});

test("không có videos, hoặc header/description là null → videos là {}", async () => {
  const f = () => fakeFetch(allOk());
  assert.deepEqual((await mirrorMedia(makeBucket(), ID, { ...cocoon, videos: undefined }, f())).videos, {});
  assert.deepEqual((await mirrorMedia(makeBucket(), ID, { ...cocoon, videos: { header: null, description: null } }, f())).videos, {});
});

test("description khác header → lưu video_description.mp4", async () => {
  const b = makeBucket(), D = "https://cdn.example.test/v2.mp4";
  const input = { ...cocoon, videos: { header: cocoon.videos.header, description: { url: D } } };
  const r = await mirrorMedia(b, ID, input, fakeFetch({ ...allOk(), [D]: mp4 }));
  assert.equal(r.videos.description.stored, `p/${ID}/video_description.mp4`);
  assert.equal(r.mirrored, 5);
});

test("chỉ có description (header null) → vẫn lưu", async () => {
  const b = makeBucket();
  const input = { ...cocoon, videos: { header: null, description: cocoon.videos.description } };
  const r = await mirrorMedia(b, ID, input, fakeFetch(allOk()));
  assert.equal(r.videos.description.stored, `p/${ID}/video_description.mp4`);
  assert.equal("header" in r.videos, false);
});

test("URL không phải https (file:, javascript:, rỗng) → không gọi fetch", async () => {
  const f = fakeFetch({});
  const images = [{ original: "file:///etc/passwd", preview: "javascript:alert(1)" }, { original: "", preview: null }, "không phải object"];
  const r = await mirrorMedia(makeBucket(), ID, { ...cocoon, images, videos: {} }, f);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(r.images.map((i) => i.stored), [null, null, null]);
});
