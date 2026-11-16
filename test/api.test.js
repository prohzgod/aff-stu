import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeBucket } from "./helpers/fake-bucket.js";
import { fakeFetch } from "./helpers/fake-fetch.js";
import { indexKey } from "../lib/util.js";
import { saveProduct } from "../lib/store.js";
import { onRequest as middleware } from "../functions/api/_middleware.js";
import { onRequestGet as listHandler, onRequestPost as postHandler } from "../functions/api/products/index.js";
import { onRequestGet as getHandler, onRequestDelete as deleteHandler } from "../functions/api/products/[id].js";
import { onRequestGet as mediaHandler } from "../functions/media/[[path]].js";

const cocoonText = readFileSync(new URL("./fixtures/cocoon.json", import.meta.url), "utf8");
const cocoon = JSON.parse(cocoonText);
const ORIGIN = "https://app.example.test";
const DAY = 86400000;
const jpeg = { type: "image/jpeg" }, mp4 = { type: "video/mp4" };
const cdnOk = () => {
  const map = { [cocoon.videos.header.url]: mp4 };
  for (const im of cocoon.images) map[im.original] = jpeg;
  return map;
};

let env, realFetch;
beforeEach(() => {
  env = { BUCKET: makeBucket(), APP_TOKEN: "t".repeat(32), RETENTION_DAYS: "7" };
  realFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch(cdnOk());
});
afterEach(() => { globalThis.fetch = realFetch; });

const ctx = (method, path, { headers = {}, body, params = {}, next } = {}) => ({
  request: new Request(ORIGIN + path, { method, headers, body }),
  env,
  params,
  next,
});
const auth = () => ({ Authorization: `Bearer ${env.APP_TOKEN}` });
const post = (body) => postHandler(ctx("POST", "/api/products", { body, headers: { "Content-Type": "application/json" } }));
const media = (key, headers) => mediaHandler(ctx("GET", `/media/${key}`, { headers, params: { path: key.split("/") } }));

// ---------- middleware ----------

test("OPTIONS → 204 có CORS, không cần token", async () => {
  const r = await middleware(ctx("OPTIONS", "/api/products", { next: () => assert.fail("không được gọi next") }));
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  assert.match(r.headers.get("access-control-allow-headers"), /Authorization/);
  assert.match(r.headers.get("access-control-allow-methods"), /DELETE/);
});

test("thiếu/sai token → 401 JSON, vẫn có CORS", async () => {
  for (const headers of [{}, { Authorization: "Bearer sai" }, { Authorization: env.APP_TOKEN }, { Authorization: "Bearer " }]) {
    const r = await middleware(ctx("GET", "/api/products", { headers, next: () => assert.fail("không được gọi next") }));
    assert.equal(r.status, 401);
    assert.equal(r.headers.get("access-control-allow-origin"), "*");
    assert.deepEqual(await r.json(), { error: "Token không đúng" });
  }
});

test("đúng token → gọi next() và giữ CORS trên response", async () => {
  const r = await middleware(ctx("GET", "/api/products", { headers: auth(), next: async () => new Response("ok", { status: 201 }) }));
  assert.equal(r.status, 201);
  assert.equal(await r.text(), "ok");
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
});

test("next() ném lỗi → 500 {error}, có CORS", async () => {
  const r = await middleware(ctx("GET", "/api/products", { headers: auth(), next: async () => { throw new Error("hỏng"); } }));
  assert.equal(r.status, 500);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  assert.deepEqual(await r.json(), { error: "hỏng" });
});

test("env không có APP_TOKEN → 500, không cho qua", async () => {
  env.APP_TOKEN = "";
  const r = await middleware(ctx("GET", "/api/products", { headers: { Authorization: "Bearer " }, next: () => assert.fail("không được gọi next") }));
  assert.equal(r.status, 500);
  assert.deepEqual(await r.json(), { error: "Chưa cấu hình APP_TOKEN" });
});

// ---------- products ----------

test("POST fixture → 201 với id, url, mirrored", async () => {
  const r = await post(cocoonText);
  assert.equal(r.status, 201);
  const data = await r.json();
  assert.match(data.id, /^[a-z0-9]{10}$/);
  assert.equal(data.url, `${ORIGIN}/#/p/${data.id}`);
  assert.equal(data.mirrored, 4);
  assert.equal(data.videos.header.stored, `p/${data.id}/video_header.mp4`);
});

test("POST rồi GET list → 1 item, thumb là ảnh đã sao chép", async () => {
  const { id } = await (await post(cocoonText)).json();
  const r = await listHandler(ctx("GET", "/api/products"));
  assert.equal(r.status, 200);
  const { items } = await r.json();
  assert.equal(items.length, 1);
  assert.equal(items[0].id, id);
  assert.equal(items[0].title, cocoon.title);
  assert.equal(items[0].price, 216749);
  assert.equal(items[0].thumb, `/media/p/${id}/img_01.jpg`);
  assert.equal(items[0].hasPackage, false);
});

test("POST rồi GET :id → product, package null, expiresAt = createdAt + 7 ngày", async () => {
  const { id } = await (await post(cocoonText)).json();
  const r = await getHandler(ctx("GET", `/api/products/${id}`, { params: { id } }));
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.product.id, id);
  assert.equal(data.product.title, cocoon.title);
  assert.equal(data.product.shopName, "Cocoon Vietnam");
  assert.equal(data.product.images[0].stored, `p/${id}/img_01.jpg`);
  assert.equal(data.product.images[0].original, cocoon.images[0].original);
  assert.equal(data.package, null);
  assert.equal(Date.parse(data.expiresAt), Date.parse(data.product.createdAt) + 7 * DAY);
});

test("POST đầu vào sai → 400 kèm thông báo", async () => {
  const bad = async (body, error) => {
    const r = await post(body);
    assert.equal(r.status, 400, body);
    assert.deepEqual(await r.json(), { error });
  };
  await bad("abc", "JSON không hợp lệ");
  await bad("[1,2]", "Thiếu title hoặc images");
  await bad("null", "Thiếu title hoặc images");
  await bad(JSON.stringify({ title: "X" }), "Thiếu title hoặc images");
  await bad(JSON.stringify({ title: "X", images: [] }), "Thiếu title hoặc images");
  await bad(JSON.stringify({ title: "   ", images: [{}] }), "Thiếu title hoặc images");
  await bad(JSON.stringify({ title: 5, images: [{}] }), "Thiếu title hoặc images");
  assert.equal(env.BUCKET._store.size, 0);
});

test("POST quá lớn → 413", async () => {
  const r = await post(JSON.stringify({ title: "X", images: [{}], description: "a".repeat(2 * 1024 * 1024) }));
  assert.equal(r.status, 413);
});

test("POST không tin id/createdAt/indexKey do client gửi", async () => {
  const body = JSON.stringify({ ...cocoon, id: "hackhackha", createdAt: "2000-01-01T00:00:00Z", indexKey: "cfg/brandkit.json", thumb: "javascript:alert(1)" });
  const { id } = await (await post(body)).json();
  assert.notEqual(id, "hackhackha");
  const { product } = await (await getHandler(ctx("GET", "/", { params: { id } }))).json();
  assert.ok(Date.now() - Date.parse(product.createdAt) < 60000);
  assert.equal(product.indexKey, indexKey(Date.parse(product.createdAt), id));
  assert.equal(product.thumb, `/media/p/${id}/img_01.jpg`);
  assert.equal(await env.BUCKET.head("cfg/brandkit.json"), null);
});

test("POST khi CDN 403 toàn bộ → vẫn 201, mirrored 0, thumb là link preview gốc", async () => {
  globalThis.fetch = fakeFetch({});
  const r = await post(cocoonText);
  assert.equal(r.status, 201);
  const data = await r.json();
  assert.equal(data.mirrored, 0);
  const { items } = await (await listHandler(ctx("GET", "/api/products"))).json();
  assert.equal(items[0].thumb, cocoon.images[0].preview);
});

test("GET :id sai định dạng, không tồn tại, hoặc quá hạn → 404", async () => {
  const old = Date.now() - 8 * DAY;
  await saveProduct(env.BUCKET, { id: "oldoldoldo", title: "Cũ", createdAt: new Date(old).toISOString(), indexKey: indexKey(old, "oldoldoldo") });
  for (const id of ["../x", "ABCDEFGHIJ", "zzzzzzzzzz", "oldoldoldo", ""]) {
    const r = await getHandler(ctx("GET", "/", { params: { id } }));
    assert.equal(r.status, 404, id);
    assert.deepEqual(await r.json(), { error: "Không tìm thấy sản phẩm" });
  }
});

test("DELETE → 200; sau đó GET → 404, list rỗng, R2 sạch; DELETE lần hai → 404", async () => {
  const { id } = await (await post(cocoonText)).json();
  const r = await deleteHandler(ctx("DELETE", "/", { params: { id } }));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  assert.equal((await getHandler(ctx("GET", "/", { params: { id } }))).status, 404);
  assert.deepEqual((await (await listHandler(ctx("GET", "/api/products"))).json()).items, []);
  assert.equal(env.BUCKET._store.size, 0);
  assert.equal((await deleteHandler(ctx("DELETE", "/", { params: { id } }))).status, 404);
  assert.equal((await deleteHandler(ctx("DELETE", "/", { params: { id: "../x" } }))).status, 404);
});

// ---------- media ----------

const KEY = "p/abcdefghij/video_header.mp4";
const putMedia = () => env.BUCKET.put(KEY, "0123456789", { httpMetadata: { contentType: "video/mp4" } });

test("GET không Range → 200 đủ header", async () => {
  await putMedia();
  const r = await media(KEY);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "0123456789");
  assert.equal(r.headers.get("content-type"), "video/mp4");
  assert.equal(r.headers.get("content-length"), "10");
  assert.equal(r.headers.get("accept-ranges"), "bytes");
  assert.equal(r.headers.get("cache-control"), "private, max-age=86400");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.ok(r.headers.get("etag"));
});

test("Range bytes=0-1 → 206, 2 byte đầu", async () => {
  await putMedia();
  const r = await media(KEY, { Range: "bytes=0-1" });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get("content-range"), "bytes 0-1/10");
  assert.equal(r.headers.get("content-length"), "2");
  assert.equal(await r.text(), "01");
});

test("Range bytes=-3 → 206, 3 byte cuối; bytes=4- → từ byte 4", async () => {
  await putMedia();
  const a = await media(KEY, { Range: "bytes=-3" });
  assert.equal(a.status, 206);
  assert.equal(a.headers.get("content-range"), "bytes 7-9/10");
  assert.equal(await a.text(), "789");
  const b = await media(KEY, { Range: "bytes=4-" });
  assert.equal(b.headers.get("content-range"), "bytes 4-9/10");
  assert.equal(await b.text(), "456789");
});

test("Range vượt kích thước hoặc sai cú pháp → 416 kèm Content-Range", async () => {
  await putMedia();
  for (const h of ["bytes=10-", "bytes=abc", "bytes=5-2"]) {
    const r = await media(KEY, { Range: h });
    assert.equal(r.status, 416, h);
    assert.equal(r.headers.get("content-range"), "bytes */10");
  }
});

test("If-None-Match khớp ETag → 304", async () => {
  await putMedia();
  const etag = (await media(KEY)).headers.get("etag");
  const r = await media(KEY, { "If-None-Match": etag });
  assert.equal(r.status, 304);
  assert.equal(await r.text(), "");
});

test("key ngoài p/ hoặc không có → 404", async () => {
  await env.BUCKET.put("cfg/brandkit.json", "{}");
  await env.BUCKET.put("i/123_abc", "");
  for (const key of ["cfg/brandkit.json", "i/123_abc", "p/ab/../x", "p/abcdefghij/khong-co.jpg", "p/abcdefghij"]) {
    assert.equal((await media(key)).status, 404, key);
  }
  assert.equal((await mediaHandler(ctx("GET", "/media/", { params: {} }))).status, 404);
});
