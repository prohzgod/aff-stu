import { test } from "node:test";
import assert from "node:assert/strict";
import { makeBucket } from "./helpers/fake-bucket.js";
import { indexKey } from "../lib/util.js";
import { saveProduct, getProduct, getPackage, listProducts, deleteProduct } from "../lib/store.js";

const DAY = 86400000;
const mk = (id, createdMs, title) => ({
  id,
  title,
  platform: "tiktokshop",
  price: { current: 216749 },
  thumb: `/media/p/${id}/img_01.jpg`,
  createdAt: new Date(createdMs).toISOString(),
  indexKey: indexKey(createdMs, id),
});

test("lưu rồi đọc lại; danh sách mới nhất trước", async () => {
  const b = makeBucket(), now = Date.parse("2026-11-16T00:00:00Z");
  await saveProduct(b, mk("aaaaaaaaaa", now - 2000, "Cũ"));
  await saveProduct(b, mk("bbbbbbbbbb", now - 1000, "Mới"));
  assert.equal((await getProduct(b, "aaaaaaaaaa")).title, "Cũ");
  const items = await listProducts(b, 7, now);
  assert.deepEqual(items.map((i) => i.title), ["Mới", "Cũ"]);
  assert.equal(items[0].id, "bbbbbbbbbb");
  assert.equal(items[0].hasPackage, false);
  assert.equal(items[0].price, 216749);
  assert.equal(items[0].thumb, "/media/p/bbbbbbbbbb/img_01.jpg");
  assert.equal(items[0].expiresAt, new Date(now - 1000 + 7 * DAY).toISOString());
});

test("getProduct / getPackage trả null khi không có", async () => {
  const b = makeBucket();
  assert.equal(await getProduct(b, "zzzzzzzzzz"), null);
  assert.equal(await getPackage(b, "zzzzzzzzzz"), null);
});

test("getPackage đọc package.json", async () => {
  const b = makeBucket();
  await b.put("p/aaaaaaaaaa/package.json", JSON.stringify({ caption: "x" }));
  assert.deepEqual(await getPackage(b, "aaaaaaaaaa"), { caption: "x" });
});

test("mục quá hạn bị ẩn dù object còn trên R2", async () => {
  const b = makeBucket(), now = Date.parse("2026-11-16T00:00:00Z");
  await saveProduct(b, mk("cccccccccc", now - 8 * DAY, "Hết hạn"));
  assert.deepEqual(await listProducts(b, 7, now), []);
});

test("tiêu đề tiếng Việt 500 ký tự: metadata chỉ mục dưới 2KB, đọc lại đúng 80 ký tự đầu", async () => {
  const b = makeBucket(), now = Date.now(), title = "Tinh chất bí đao ".repeat(30);
  const p = mk("dddddddddd", now, title);
  await saveProduct(b, p);
  const meta = (await b.head(p.indexKey)).customMetadata;
  assert.ok(Object.entries(meta).reduce((n, [k, v]) => n + k.length + v.length, 0) < 2048);
  assert.equal((await listProducts(b, 7, now))[0].title, title.slice(0, 80));
  assert.equal((await getProduct(b, "dddddddddd")).title, title);
});

test("thumb là link CDN rất dài: vẫn lưu được, thumb trong danh sách rỗng", async () => {
  const b = makeBucket(), now = Date.now();
  const p = { ...mk("gggggggggg", now, "X"), thumb: "https://cdn.example.test/" + "a".repeat(3000) };
  await saveProduct(b, p);
  assert.equal((await listProducts(b, 7, now))[0].thumb, "");
});

test("sản phẩm không có giá: price là null", async () => {
  const b = makeBucket(), now = Date.now();
  const p = mk("hhhhhhhhhh", now, "X");
  delete p.price;
  await saveProduct(b, p);
  assert.equal((await listProducts(b, 7, now))[0].price, null);
});

test("danh sách đi hết các trang", async () => {
  const b = makeBucket({ pageSize: 2 }), now = Date.now();
  for (let i = 0; i < 5; i++) await saveProduct(b, mk(`eeeeeeeee${i}`, now - i, `SP ${i}`));
  assert.equal((await listProducts(b, 7, now)).length, 5);
});

test("xoá: sạch p/{id}/ và chỉ mục; id không có trả false", async () => {
  const b = makeBucket({ pageSize: 1 }), p = mk("ffffffffff", Date.now(), "X");
  await saveProduct(b, p);
  await b.put("p/ffffffffff/img_01.jpg", "x");
  await b.put("p/ffffffffffx/product.json", "{}"); // id khác có chung tiền tố
  assert.equal(await deleteProduct(b, "ffffffffff"), true);
  assert.equal((await b.list({ prefix: "p/ffffffffff/" })).objects.length, 0);
  assert.equal(await b.head(p.indexKey), null);
  assert.notEqual(await b.head("p/ffffffffffx/product.json"), null);
  assert.equal(await deleteProduct(b, "zzzzzzzzzz"), false);
});

test("emoji nằm đúng chỗ cắt 80 ký tự: vẫn lưu được", async () => {
  const b = makeBucket(), now = Date.now(), title = "a".repeat(79) + "🔥🔥";
  await saveProduct(b, mk("jjjjjjjjjj", now, title));
  assert.equal((await listProducts(b, 7, now))[0].title, "a".repeat(79) + "🔥");
});
