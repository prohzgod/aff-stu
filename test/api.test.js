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
import { onRequestPost as generateHandler, onRequestGet as promptHandler } from "../functions/api/products/[id]/generate.js";
import { onRequestPut as packageHandler } from "../functions/api/products/[id]/package.js";
import { onRequestPut as uploadHandler } from "../functions/api/products/[id]/upload/[name].js";
import { onRequestGet as brandGet, onRequestPut as brandPut } from "../functions/api/brandkit.js";
import { onRequestPost as transcribeHandler } from "../functions/api/transcribe.js";
import { onRequestGet as editGet, onRequestPut as editPut } from "../functions/api/products/[id]/edit.js";

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

test("/media: mọi response có CSP sandbox; type ngoài danh sách an toàn bị hạ thành octet-stream", async () => {
  await putMedia();
  const ok = await media(KEY);
  assert.equal(ok.headers.get("content-security-policy"), "default-src 'none'; sandbox");
  assert.equal(ok.headers.get("content-type"), "video/mp4");
  for (const [name, type] of [["a.svg", "image/svg+xml"], ["b.html", "text/html"], ["product.json", "application/json; charset=utf-8"], ["c.bin", undefined]]) {
    const key = `p/abcdefghij/${name}`;
    await env.BUCKET.put(key, "<svg><script>alert(1)</script></svg>", { httpMetadata: type ? { contentType: type } : {} });
    const r = await media(key);
    assert.equal(r.status, 200, name);
    assert.equal(r.headers.get("content-type"), "application/octet-stream", name);
    assert.equal(r.headers.get("content-security-policy"), "default-src 'none'; sandbox", name);
    assert.match(r.headers.get("content-disposition"), /^attachment/, name);
  }
  const partial = await media(KEY, { Range: "bytes=0-1" });
  assert.equal(partial.headers.get("content-security-policy"), "default-src 'none'; sandbox");
});

// ---------- generate ----------

const generate = (id, body) => generateHandler(ctx("POST", `/api/products/${id}/generate`, { params: { id }, body, headers: body ? { "Content-Type": "application/json" } : {} }));

test("POST generate → 200, lưu gói, GET :id trả gói, list báo hasPackage", async () => {
  const { id } = await (await post(cocoonText)).json();
  const r = await generate(id);
  assert.equal(r.status, 200);
  const { package: pkg } = await r.json();
  assert.equal(pkg.source, "template");
  assert.equal(pkg.hooks.length, 6);
  const detail = await (await getHandler(ctx("GET", "/", { params: { id } }))).json();
  assert.deepEqual(detail.package, pkg);
  const { items } = await (await listHandler(ctx("GET", "/api/products"))).json();
  assert.equal(items.length, 1);
  assert.equal(items[0].hasPackage, true);
  assert.equal(items[0].title, cocoon.title);
});

test("POST generate: faceless false → 7 prompt; body rỗng hoặc faceless không phải boolean → 4", async () => {
  const { id } = await (await post(cocoonText)).json();
  assert.equal((await (await generate(id, JSON.stringify({ faceless: false }))).json()).package.videoPrompts.length, 7);
  assert.equal((await (await generate(id)).json()).package.videoPrompts.length, 4);
  assert.equal((await (await generate(id, JSON.stringify({ faceless: "no" }))).json()).package.videoPrompts.length, 4);
  assert.equal((await (await generate(id, "null")).json()).package.videoPrompts.length, 4);
});

test("POST generate: notes vào note và bị cắt còn 500 ký tự", async () => {
  const { id } = await (await post(cocoonText)).json();
  const { package: pkg } = await (await generate(id, JSON.stringify({ notes: "n".repeat(900), tone: 5 }))).json();
  assert.ok(pkg.note.includes("n".repeat(500)));
  assert.ok(!pkg.note.includes("n".repeat(501)));
});

test("POST generate body 'abc' → 400; id sai/không có/quá hạn → 404", async () => {
  const { id } = await (await post(cocoonText)).json();
  const bad = await generate(id, "abc");
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: "JSON không hợp lệ" });
  const old = Date.now() - 8 * DAY;
  await saveProduct(env.BUCKET, { id: "oldoldoldo", title: "Cũ", createdAt: new Date(old).toISOString(), indexKey: indexKey(old, "oldoldoldo") });
  for (const x of ["../x", "zzzzzzzzzz", "oldoldoldo"]) {
    const r = await generate(x);
    assert.equal(r.status, 404, x);
    assert.deepEqual(await r.json(), { error: "Không tìm thấy sản phẩm" });
  }
});

test("POST generate hai lần → gói sau thay gói trước, chỉ mục vẫn một mục", async () => {
  const { id } = await (await post(cocoonText)).json();
  await generate(id, JSON.stringify({ faceless: false }));
  await generate(id);
  const detail = await (await getHandler(ctx("GET", "/", { params: { id } }))).json();
  assert.equal(detail.package.videoPrompts.length, 4);
  assert.equal((await env.BUCKET.list({ prefix: "i/" })).objects.length, 1);
});

test("DELETE sau khi có gói → package.json cũng bị xoá", async () => {
  const { id } = await (await post(cocoonText)).json();
  await generate(id);
  assert.notEqual(await env.BUCKET.head(`p/${id}/package.json`), null);
  await deleteHandler(ctx("DELETE", "/", { params: { id } }));
  assert.equal(env.BUCKET._store.size, 0);
});

// ---------- phase 3: LLM, chế độ thủ công, lưu bản sửa ----------

const LLM_URL = "https://llm.example.test/v1/chat/completions";
const withLlm = (spec) => {
  Object.assign(env, { LLM_BASE_URL: "https://llm.example.test/v1", LLM_MODEL: "flash-test", LLM_API_KEY: "k" });
  globalThis.fetch = fakeFetch({ ...cdnOk(), [LLM_URL]: spec });
};
const llmAnswer = { hooks: [{ formula: "Giá sốc", spoken: "Tinh chất bí đao chỉ 217K thôi nè.", onScreen: "Chỉ 217K" }], caption: "Bí đao 217K. Bấm giỏ hàng vàng nha!" };
const putPackage = (id, body) => packageHandler(ctx("PUT", `/api/products/${id}/package`, { params: { id }, body: typeof body === "string" ? body : JSON.stringify(body), headers: { "Content-Type": "application/json" } }));
const getPrompt = (id, query = "") => promptHandler(ctx("GET", `/api/products/${id}/generate${query}`, { params: { id } }));

test("generate có cấu hình LLM → source llm, model, đã chuẩn hoá đủ 6 hook", async () => {
  withLlm({ json: { choices: [{ message: { content: JSON.stringify(llmAnswer) } }] } });
  const { id } = await (await post(cocoonText)).json();
  const { package: pkg } = await (await generate(id, JSON.stringify({ tone: "hài hước" }))).json();
  assert.equal(pkg.source, "llm");
  assert.equal(pkg.model, "flash-test");
  assert.equal(pkg.hooks.length, 6);
  assert.equal(pkg.hooks[1].spoken, "Tinh chất bí đao chỉ 217K thôi nè.");
  const call = globalThis.fetch.calls.find((c) => c.url === LLM_URL);
  assert.equal(call.headers.get("authorization"), "Bearer k");
  assert.ok(JSON.parse(call.body).messages[1].content.includes("hài hước"));
  assert.doesNotMatch(JSON.stringify(pkg), /"k"|LLM_API_KEY/);
});

test("generate khi LLM trả 429 → vẫn 200 với gói mẫu, note nói rõ lý do", async () => {
  withLlm({ json: {}, status: 429 });
  const { id } = await (await post(cocoonText)).json();
  const r = await generate(id);
  assert.equal(r.status, 200);
  const { package: pkg } = await r.json();
  assert.equal(pkg.source, "template");
  assert.match(pkg.note, /hết hạn mức/);
  assert.equal((await (await listHandler(ctx("GET", "/api/products"))).json()).items[0].hasPackage, true);
});

test("GET generate → prompt thủ công theo tuỳ chọn; id sai → 404", async () => {
  const { id } = await (await post(cocoonText)).json();
  const r = await getPrompt(id, "?tone=h%C3%A0i%20h%C6%B0%E1%BB%9Bc&notes=qu%C3%A0%20t%E1%BA%B7ng&faceless=false");
  assert.equal(r.status, 200);
  const { prompt } = await r.json();
  assert.ok(prompt.includes(cocoon.title));
  assert.ok(prompt.includes("hài hước"));
  assert.ok(prompt.includes("quà tặng"));
  assert.ok(prompt.includes('"faceless": false'));
  assert.ok((await (await getPrompt(id)).json()).prompt.includes('"faceless": true'));
  assert.equal((await getPrompt("zzzzzzzzzz")).status, 404);
  assert.equal(globalThis.fetch.calls.filter((c) => c.url === LLM_URL).length, 0);
});

test("PUT package {raw}: dán câu trả lời của chat AI → source manual, đã chuẩn hoá", async () => {
  const { id } = await (await post(cocoonText)).json();
  const r = await putPackage(id, { raw: "Đây nhé:\n```json\n" + JSON.stringify({ ...llmAnswer, caption: "Trị mụn 100%. Bấm giỏ hàng vàng!" }) + "\n```" });
  assert.equal(r.status, 200);
  const { package: pkg } = await r.json();
  assert.equal(pkg.source, "manual");
  assert.equal(pkg.model, null);
  assert.equal(pkg.hooks.length, 6);
  assert.doesNotMatch(pkg.caption, /trị|100%/i);
  const detail = await (await getHandler(ctx("GET", "/", { params: { id } }))).json();
  assert.deepEqual(detail.package, pkg);
  assert.equal((await (await listHandler(ctx("GET", "/api/products"))).json()).items[0].hasPackage, true);
});

test("PUT package {raw} không có JSON → 400, gói cũ giữ nguyên", async () => {
  const { id } = await (await post(cocoonText)).json();
  const { package: before } = await (await generate(id)).json();
  for (const raw of ["xin lỗi, tôi không làm được", "", "[1,2]"]) {
    const r = await putPackage(id, { raw });
    assert.equal(r.status, 400, raw);
    assert.deepEqual(await r.json(), { error: "Không đọc được JSON trong nội dung đã dán" });
  }
  assert.deepEqual((await (await getHandler(ctx("GET", "/", { params: { id } }))).json()).package, before);
});

test("PUT package sửa caption/hashtag/ghim → lưu đúng nguyên văn, có editedAt, phần khác giữ nguyên", async () => {
  const { id } = await (await post(cocoonText)).json();
  const { package: before } = await (await generate(id)).json();
  const r = await putPackage(id, { caption: "  Caption mình tự viết, trị giá 217K  ", hashtags: ["#a", "b", "#a", " "], pinnedComment: "Ghim nè" });
  assert.equal(r.status, 200);
  const { package: pkg } = await r.json();
  assert.equal(pkg.caption, "Caption mình tự viết, trị giá 217K");
  assert.deepEqual(pkg.hashtags, ["#a", "#b"]);
  assert.equal(pkg.pinnedComment, "Ghim nè");
  assert.ok(Date.now() - Date.parse(pkg.editedAt) < 60000);
  assert.deepEqual(pkg.hooks, before.hooks);
  assert.equal(pkg.source, before.source);
  const only = await (await putPackage(id, { pinnedComment: "" })).json();
  assert.equal(only.package.pinnedComment, "");
  assert.equal(only.package.caption, "Caption mình tự viết, trị giá 217K");
});

test("PUT package: đầu vào sai", async () => {
  const { id } = await (await post(cocoonText)).json();
  assert.equal((await putPackage(id, { caption: "x" })).status, 409); // chưa có gói để sửa
  await generate(id);
  assert.equal((await putPackage(id, "abc")).status, 400);
  assert.equal((await putPackage(id, {})).status, 400);
  assert.equal((await putPackage(id, { caption: 5 })).status, 400);
  assert.equal((await putPackage(id, { hashtags: "#a" })).status, 400);
  assert.equal((await putPackage(id, { caption: "x".repeat(5001) })).status, 400);
  assert.equal((await putPackage(id, { raw: "{" + "x".repeat(300000) })).status, 413);
  assert.equal((await putPackage("zzzzzzzzzz", { caption: "x" })).status, 404);
  assert.equal((await putPackage("../x", { caption: "x" })).status, 404);
});

// ---------- phase 5: tải thành phẩm lên kho, brand kit ----------

const mp4Bytes = (size = 64) => { const b = new Uint8Array(size); b.set([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]); return b; }; // "....ftypisom"
const upload = (id, name, body, headers = {}) => uploadHandler(ctx("PUT", `/api/products/${id}/upload/${name}`, { params: { id, name }, body, headers: { "Content-Type": "video/mp4", ...headers } }));

test("upload final.mp4 → lưu vào p/{id}/final.mp4, list và chi tiết báo có video, /media phát được", async () => {
  const { id } = await (await post(cocoonText)).json();
  const before = await (await getHandler(ctx("GET", "/", { params: { id } }))).json();
  assert.equal(before.final, null);
  const r = await upload(id, "final.mp4", mp4Bytes(200));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, url: `/media/p/${id}/final.mp4`, size: 200 });
  const head = await env.BUCKET.head(`p/${id}/final.mp4`);
  assert.equal(head.httpMetadata.contentType, "video/mp4");
  const { items } = await (await listHandler(ctx("GET", "/api/products"))).json();
  assert.equal(items[0].hasFinal, true);
  assert.equal(items[0].hasPackage, false);
  const detail = await (await getHandler(ctx("GET", "/", { params: { id } }))).json();
  assert.equal(detail.final.url, `/media/p/${id}/final.mp4`);
  assert.equal(detail.final.size, 200);
  assert.ok(Date.now() - Date.parse(detail.final.uploadedAt) < 60000);
  const played = await media(`p/${id}/final.mp4`, { Range: "bytes=4-7" });
  assert.equal(played.status, 206);
  assert.equal(await played.text(), "ftyp");
});

test("cờ hasPackage và hasFinal không ghi đè nhau", async () => {
  const { id } = await (await post(cocoonText)).json();
  await upload(id, "final.mp4", mp4Bytes());
  await generate(id);
  let [item] = (await (await listHandler(ctx("GET", "/api/products"))).json()).items;
  assert.deepEqual([item.hasPackage, item.hasFinal], [true, true]);
  await putPackage(id, { caption: "x" });
  await upload(id, "final.mp4", mp4Bytes(80));
  [item] = (await (await listHandler(ctx("GET", "/api/products"))).json()).items;
  assert.deepEqual([item.hasPackage, item.hasFinal], [true, true]);
  assert.equal((await env.BUCKET.list({ prefix: "i/" })).objects.length, 1);
});

test("upload: tên lạ, không phải MP4, rỗng, quá lớn, id sai đều bị từ chối và không ghi gì", async () => {
  const { id } = await (await post(cocoonText)).json();
  const count = env.BUCKET._store.size;
  for (const name of ["final.mov", "product.json", "../x", "cover.jpg", "FINAL.MP4", "subs.vtt"]) assert.equal((await upload(id, name, mp4Bytes())).status, 400, name);
  assert.equal((await upload(id, "cover.png", mp4Bytes())).status, 400); // nội dung MP4 dưới tên PNG
  const notMp4 = await upload(id, "final.mp4", new TextEncoder().encode("<html><script>alert(1)</script></html>".padEnd(64, " ")));
  assert.equal(notMp4.status, 400);
  assert.deepEqual(await notMp4.json(), { error: "File không phải MP4" });
  assert.equal((await upload(id, "final.mp4", new Uint8Array(0))).status, 400);
  assert.equal((await upload(id, "final.mp4", mp4Bytes(), { "Content-Length": String(71 * 1024 * 1024) })).status, 413);
  assert.equal((await upload("zzzzzzzzzz", "final.mp4", mp4Bytes())).status, 404);
  assert.equal((await upload("../x", "final.mp4", mp4Bytes())).status, 404);
  assert.equal(env.BUCKET._store.size, count);
});

test("xoá sản phẩm xoá luôn final.mp4", async () => {
  const { id } = await (await post(cocoonText)).json();
  await upload(id, "final.mp4", mp4Bytes());
  await deleteHandler(ctx("DELETE", "/", { params: { id } }));
  assert.equal(env.BUCKET._store.size, 0);
});

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const putBrand = (body) => brandPut(ctx("PUT", "/api/brandkit", { body: typeof body === "string" ? body : JSON.stringify(body), headers: { "Content-Type": "application/json" } }));

test("brand kit: mặc định khi chưa lưu; lưu rồi đọc lại; nằm ở cfg/ (ngoài rule xoá 7 ngày)", async () => {
  assert.deepEqual((await (await brandGet(ctx("GET", "/api/brandkit"))).json()).brandkit, { handle: "", position: "tl", watermark: true, logo: null, subtitleStyle: "karaoke" });
  const r = await putBrand({ handle: "  kenhcuatoi ", position: "br", watermark: true, logo: PNG, subtitleStyle: "box" });
  assert.equal(r.status, 200);
  const saved = (await r.json()).brandkit;
  assert.deepEqual(saved, { handle: "@kenhcuatoi", position: "br", watermark: true, logo: PNG, subtitleStyle: "box" });
  assert.deepEqual((await (await brandGet(ctx("GET", "/api/brandkit"))).json()).brandkit, saved);
  assert.notEqual(await env.BUCKET.head("cfg/brandkit.json"), null);
  assert.equal((await putBrand({ handle: "", position: "tl", watermark: false, logo: null })).status, 200);
  assert.deepEqual((await (await brandGet(ctx("GET", "/api/brandkit"))).json()).brandkit, { handle: "", position: "tl", watermark: false, logo: null, subtitleStyle: "karaoke" });
});

test("brand kit: đầu vào sai bị từ chối, bản đã lưu giữ nguyên", async () => {
  await putBrand({ handle: "@a", position: "tl", watermark: true, logo: null });
  const bad = [
    "abc",
    { handle: 5, position: "tl", watermark: true, logo: null },
    { handle: "x".repeat(41), position: "tl", watermark: true, logo: null },
    { handle: "a", position: "giữa", watermark: true, logo: null },
    { handle: "a", position: "tl", watermark: "có", logo: null },
    { handle: "a", position: "tl", watermark: true, logo: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" },
    { handle: "a", position: "tl", watermark: true, logo: "data:image/png;base64,PHN2Zz48c2NyaXB0Pg==" },
    { handle: "a", position: "tl", watermark: true, logo: "https://evil.example/logo.png" },
    { handle: "a", position: "tl", watermark: true, logo: null, subtitleStyle: "nhấp nháy" },
    { handle: "a", position: "tl", watermark: true, logo: "data:image/png;base64,iVBORw0KGgo" + "A".repeat(420000) },
  ];
  for (const body of bad) assert.equal((await putBrand(body)).status, 400, JSON.stringify(body).slice(0, 80));
  assert.equal((await (await brandGet(ctx("GET", "/api/brandkit"))).json()).brandkit.handle, "@a");
});

// ---------- phase 6: ảnh bìa ----------

const pngBytes = (size = 64) => { const b = new Uint8Array(size); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); return b; };

test("upload cover.png → lưu đúng loại, chi tiết trả cover, /media hiển thị được như ảnh", async () => {
  const { id } = await (await post(cocoonText)).json();
  assert.equal((await (await getHandler(ctx("GET", "/", { params: { id } }))).json()).cover, null);
  const r = await upload(id, "cover.png", pngBytes(300), { "Content-Type": "image/png" });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, url: `/media/p/${id}/cover.png`, size: 300 });
  const detail = await (await getHandler(ctx("GET", "/", { params: { id } }))).json();
  assert.equal(detail.cover.url, `/media/p/${id}/cover.png`);
  assert.equal(detail.final, null);
  const shown = await media(`p/${id}/cover.png`);
  assert.equal(shown.headers.get("content-type"), "image/png");
  assert.equal((await (await listHandler(ctx("GET", "/api/products"))).json()).items[0].hasFinal, false);
});

test("upload cover.png: không phải PNG hoặc quá 8MB bị từ chối", async () => {
  const { id } = await (await post(cocoonText)).json();
  const bad = await upload(id, "cover.png", new TextEncoder().encode("<svg><script>alert(1)</script></svg>".padEnd(64, " ")));
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: "File không phải PNG" });
  assert.equal((await upload(id, "cover.png", pngBytes(), { "Content-Length": String(9 * 1024 * 1024) })).status, 413);
  assert.equal(await env.BUCKET.head(`p/${id}/cover.png`), null);
});

// ---------- phase 7: phụ đề ----------

const SRT = "1\r\n00:00:00,400 --> 00:00:01,200\r\nDa dầu thử\r\n";

test("upload subs.srt → lưu được, chi tiết trả subs, /media trả về dạng file tải xuống", async () => {
  const { id } = await (await post(cocoonText)).json();
  const r = await upload(id, "subs.srt", new TextEncoder().encode(SRT), { "Content-Type": "application/x-subrip" });
  assert.equal(r.status, 200);
  const detail = await (await getHandler(ctx("GET", "/", { params: { id } }))).json();
  assert.equal(detail.subs.url, `/media/p/${id}/subs.srt`);
  const got = await media(`p/${id}/subs.srt`);
  assert.equal(got.headers.get("content-type"), "application/octet-stream");
  assert.match(got.headers.get("content-disposition"), /^attachment/);
  assert.equal(await got.text(), SRT);
});

test("upload subs.srt: nội dung không phải SRT bị từ chối", async () => {
  const { id } = await (await post(cocoonText)).json();
  for (const body of ["<html><script>alert(1)</script></html>", "", "1\n00:00 --> 00:01\nx", "\u0000\u0001\u0002"]) {
    const r = await upload(id, "subs.srt", new TextEncoder().encode(body));
    assert.equal(r.status, 400, body);
  }
  assert.equal((await upload(id, "subs.srt", new TextEncoder().encode(SRT), { "Content-Length": String(2 * 1024 * 1024) })).status, 413);
  assert.equal(await env.BUCKET.head(`p/${id}/subs.srt`), null);
});

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const wavBytes = (seconds = 1) => { const b = new Uint8Array(44 + Math.round(seconds * 32000)); b.set([0x52, 0x49, 0x46, 0x46], 0); b.set([0x57, 0x41, 0x56, 0x45], 8); return b; }; // "RIFF"…"WAVE"
const transcribe = (body, query = "?lang=vi&prompt=Cocoon", headers = {}) => transcribeHandler(ctx("POST", `/api/transcribe${query}`, { body, headers: { "Content-Type": "audio/wav", ...headers } }));
const groqOk = { json: { words: [{ word: "da", start: 0.4, end: 0.6 }, { word: "dầu", start: 0.6, end: 0.9 }], segments: [{ start: 0.4, end: 0.9, text: "da dầu" }] } };

test("transcribe: có key Groq → trả words và segments; gợi ý tên riêng được chuyển tiếp", async () => {
  env.GROQ_API_KEY = "gk";
  globalThis.fetch = fakeFetch({ [GROQ_URL]: groqOk });
  const r = await transcribe(wavBytes());
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { words: [{ w: "da", start: 0.4, end: 0.6 }, { w: "dầu", start: 0.6, end: 0.9 }], segments: [{ text: "da dầu", start: 0.4, end: 0.9 }], corrected: false });
  assert.equal(globalThis.fetch.calls[0].body.get("prompt"), "Cocoon");
  assert.equal(globalThis.fetch.calls[0].headers.get("authorization"), "Bearer gk");
});

test("transcribe: có cả LLM → sửa dấu câu, mốc thời gian giữ nguyên; LLM trả lệch số từ thì dùng bản gốc", async () => {
  Object.assign(env, { GROQ_API_KEY: "gk", LLM_BASE_URL: "https://llm.example.test/v1", LLM_MODEL: "flash", LLM_API_KEY: "k" });
  globalThis.fetch = fakeFetch({ [GROQ_URL]: groqOk, [LLM_URL]: { json: { choices: [{ message: { content: '{"words":["Da","dầu."]}' } }] } } });
  const good = await (await transcribe(wavBytes())).json();
  assert.deepEqual(good.words, [{ w: "Da", start: 0.4, end: 0.6 }, { w: "dầu.", start: 0.6, end: 0.9 }]);
  assert.equal(good.corrected, true);
  globalThis.fetch = fakeFetch({ [GROQ_URL]: groqOk, [LLM_URL]: { json: { choices: [{ message: { content: '{"words":["Da dầu."]}' } }] } } });
  const bad = await (await transcribe(wavBytes())).json();
  assert.deepEqual(bad.words.map((w) => w.w), ["da", "dầu"]);
  assert.equal(bad.corrected, false);
});

test("transcribe: chưa có key → 503; Groq hết hạn mức → 429; không gọi mạng khi đầu vào sai", async () => {
  globalThis.fetch = fakeFetch({ [GROQ_URL]: groqOk });
  const noKey = await transcribe(wavBytes());
  assert.equal(noKey.status, 503);
  assert.match((await noKey.json()).error, /GROQ_API_KEY/);
  env.GROQ_API_KEY = "gk";
  assert.equal((await transcribe(new TextEncoder().encode("không phải wav".padEnd(64, " ")))).status, 400);
  assert.equal((await transcribe(new Uint8Array(0))).status, 400);
  assert.equal((await transcribe(wavBytes(), "", { "Content-Length": String(44 + 601 * 32000) })).status, 413);
  assert.equal(globalThis.fetch.calls.length, 0);
  globalThis.fetch = fakeFetch({ [GROQ_URL]: { json: {}, status: 429 } });
  const limited = await transcribe(wavBytes());
  assert.equal(limited.status, 429);
  assert.match((await limited.json()).error, /hết hạn mức/);
});

// ---------- phase 8: đồng bộ dự án dựng (edit.json) ----------

const getEdit = (id) => editGet(ctx("GET", `/api/products/${id}/edit`, { params: { id } }));
const putEdit = (id, body) => editPut(ctx("PUT", `/api/products/${id}/edit`, { params: { id }, body: typeof body === "string" ? body : JSON.stringify(body), headers: { "Content-Type": "application/json" } }));
const project = () => ({
  segments: [
    { id: "a1", type: "clip", name: "do.mp4", sourceId: "s1", r2Key: null, srcDuration: 10, fps: 24, hasAudio: true, in: 0, out: 3, muted: false, fit: "cover", width: 720, height: 1280 },
    { id: "a2", type: "image", name: "Ảnh 1", sourceId: "s2", r2Key: "p/abcdefghij/img_01.jpg", duration: 2, kenBurns: true, fit: "blur", width: 800, height: 800 },
  ],
  useWatermark: true,
  overlays: { hook: { enabled: true, text: "Thử ngay" }, price: { enabled: true, text: "Chỉ 217K" }, cta: { enabled: false, text: "" } },
  subtitles: { enabled: true, style: "box", sig: "x", lines: [{ text: "Da dầu", start: 0.4, end: 0.9, words: [{ w: "Da", start: 0.4, end: 0.6 }, { w: "dầu", start: 0.6, end: 0.9 }] }] },
});

test("edit: chưa có thì trả null; lưu rồi đọc lại đúng nội dung kèm updatedAt", async () => {
  const { id } = await (await post(cocoonText)).json();
  assert.deepEqual(await (await getEdit(id)).json(), { edit: null });
  const mine = project();
  mine.segments[1].r2Key = `p/${id}/img_01.jpg`; // file của chính sản phẩm này: được giữ
  const r = await putEdit(id, mine);
  assert.equal(r.status, 200);
  const { edit } = await r.json();
  assert.ok(Date.now() - Date.parse(edit.updatedAt) < 60000);
  assert.deepEqual({ ...edit, updatedAt: undefined }, { ...mine, updatedAt: undefined });
  assert.deepEqual((await (await getEdit(id)).json()).edit, edit);
  assert.notEqual(await env.BUCKET.head(`p/${id}/edit.json`), null);
});

test("edit: chỉ giữ các trường đã biết, bỏ trường lạ và dữ liệu của file", async () => {
  const { id } = await (await post(cocoonText)).json();
  const body = project();
  body.hack = "x";
  body.segments[0].blob = "dữ liệu";
  body.segments[0].__proto__ = { evil: true };
  body.segments[1].r2Key = "cfg/brandkit.json"; // key ngoài sản phẩm này
  const { edit } = await (await putEdit(id, body)).json();
  assert.equal("hack" in edit, false);
  assert.equal("blob" in edit.segments[0], false);
  assert.equal(edit.segments[1].r2Key, null);
});

test("edit: đầu vào sai bị từ chối, bản đã lưu giữ nguyên", async () => {
  const { id } = await (await post(cocoonText)).json();
  await putEdit(id, project());
  const saved = (await (await getEdit(id)).json()).edit;
  const bad = [
    "abc", [], { segments: "x" },
    { ...project(), segments: Array.from({ length: 13 }, () => project().segments[0]) },
    { ...project(), segments: [{ ...project().segments[0], type: "khác" }] },
    { ...project(), segments: [{ ...project().segments[0], in: "0" }] },
    { ...project(), subtitles: { ...project().subtitles, style: "lạ" } },
    { ...project(), overlays: { hook: { enabled: "có", text: "x" } } },
  ];
  for (const body of bad) assert.equal((await putEdit(id, body)).status, 400, JSON.stringify(body).slice(0, 60));
  assert.equal((await putEdit(id, { ...project(), subtitles: { ...project().subtitles, lines: Array.from({ length: 5000 }, () => project().subtitles.lines[0]) } })).status, 413);
  assert.deepEqual((await (await getEdit(id)).json()).edit, saved);
  assert.equal((await getEdit("zzzzzzzzzz")).status, 404);
  assert.equal((await putEdit("../x", project())).status, 404);
});

test("edit: xoá sản phẩm xoá luôn edit.json", async () => {
  const { id } = await (await post(cocoonText)).json();
  await putEdit(id, project());
  await deleteHandler(ctx("DELETE", "/", { params: { id } }));
  assert.equal(env.BUCKET._store.size, 0);
});
