import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";

const ORIGIN = "https://app.example.test";
const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

// Chạy sw.js trong một môi trường giả: caches và fetch do test điều khiển.
function load({ network }) {
  const listeners = {};
  const stores = new Map();
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async put(req, res) { store.set(new URL(typeof req === "string" ? req : req.url, ORIGIN).href, res); },
        async addAll(urls) { for (const u of urls) store.set(new URL(u, ORIGIN).href, await network(new Request(new URL(u, ORIGIN)))); },
        // Cache thật trả một Response mới mỗi lần đọc, nên ở đây trả bản sao.
        async match(req) { return store.get(new URL(typeof req === "string" ? req : req.url, ORIGIN).href)?.clone(); },
      };
    },
    async match(req) {
      for (const store of stores.values()) {
        const hit = store.get(new URL(typeof req === "string" ? req : req.url, ORIGIN).href);
        if (hit) return hit;
      }
      return undefined;
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const self = {
    location: new URL(ORIGIN),
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  vm.runInNewContext(source, { self, caches, fetch: (req) => network(req), URL, Request, Response, Promise, console });
  const lifecycle = async (type) => { let p; listeners[type]({ waitUntil: (x) => { p = x; } }); await p; };
  // Trả Response nếu SW nhận xử lý, undefined nếu nó để trình duyệt tự lo.
  const request = async (path, init = {}) => {
    let p;
    const { mode = "cors", ...rest } = init; // Request của Node không cho tạo mode "navigate", nên gắn sau
    const req = new Request(path.startsWith("http") ? path : ORIGIN + path, rest);
    Object.defineProperty(req, "mode", { value: mode });
    listeners.fetch({ request: req, respondWith: (x) => { p = x; } });
    return p ? await p : undefined;
  };
  return { lifecycle, request, stores, caches };
}

const ok = (req) => new Response(`net:${new URL(req.url).pathname}`, { status: 200 });
const down = async () => { throw new TypeError("offline"); };

test("install: lưu sẵn app shell, mọi file trong danh sách đều tồn tại trong public/", async () => {
  const sw = load({ network: ok });
  await sw.lifecycle("install");
  const [name] = await sw.caches.keys();
  const urls = [...sw.stores.get(name).keys()].map((u) => new URL(u).pathname);
  for (const must of ["/", "/app.js", "/styles.css", "/lib/api.js", "/lib/dom.js", "/lib/format.js", "/views/package.js", "/lib/prompt-library.js", "/lib/zip.js", "/lib/share.js", "/lib/package-text.js", "/manifest.webmanifest"]) {
    assert.ok(urls.includes(must), must);
  }
  for (const u of urls.filter((u) => u !== "/")) assert.ok(existsSync(new URL(`../public${u}`, import.meta.url)), `thiếu file ${u}`);
  for (const u of urls) assert.doesNotMatch(u, /^\/(api|media)\//);
});

test("mọi module mà app import đều nằm trong danh sách lưu sẵn", async () => {
  const sw = load({ network: ok });
  await sw.lifecycle("install");
  const [name] = await sw.caches.keys();
  const cached = new Set([...sw.stores.get(name).keys()].map((u) => new URL(u).pathname));
  for (const file of ["app.js", "views/package.js", "lib/package-text.js", "lib/api.js"]) {
    const code = readFileSync(new URL(`../public/${file}`, import.meta.url), "utf8");
    for (const [, spec] of code.matchAll(/from\s+"([^"]+)"/g)) {
      const path = new URL(spec, `${ORIGIN}/${file}`).pathname;
      assert.ok(cached.has(path), `${file} import ${path} nhưng service worker không lưu sẵn`);
    }
  }
});

test("app shell: ưu tiên mạng, mạng hỏng thì lấy bản đã lưu", async () => {
  let network = ok;
  const sw = load({ network: (req) => network(req) });
  await sw.lifecycle("install");
  assert.equal(await (await sw.request("/app.js")).text(), "net:/app.js");
  network = (req) => new Response("mới", { status: 200 });
  assert.equal(await (await sw.request("/app.js")).text(), "mới");
  network = down;
  assert.equal(await (await sw.request("/app.js")).text(), "mới"); // bản mạng gần nhất đã được lưu lại
  assert.equal(await (await sw.request("/styles.css")).text(), "net:/styles.css");
});

test("mở app khi mất mạng: trả trang chính đã lưu", async () => {
  let network = ok;
  const sw = load({ network: (req) => network(req) });
  await sw.lifecycle("install");
  network = down;
  assert.equal(await (await sw.request("/", { mode: "navigate" })).text(), "net:/");
  assert.equal(await (await sw.request("/index.html", { mode: "navigate" })).text(), "net:/");
});

test("mất mạng và chưa lưu file đó → lỗi mạng bình thường, không trả bừa file khác", async () => {
  let network = ok;
  const sw = load({ network: (req) => network(req) });
  await sw.lifecycle("install");
  network = down;
  await assert.rejects(sw.request("/khong-co.js"));
});

test("không đụng vào /api, /media, request không phải GET, và origin khác", async () => {
  const sw = load({ network: ok });
  await sw.lifecycle("install");
  assert.equal(await sw.request("/api/products"), undefined);
  assert.equal(await sw.request("/api/products/abc/generate", { method: "POST" }), undefined);
  assert.equal(await sw.request("/media/p/abcdefghij/img_01.jpg"), undefined);
  assert.equal(await sw.request("/app.js", { method: "POST" }), undefined);
  assert.equal(await sw.request("https://cdn.example.test/a.jpg"), undefined);
  const [name] = await sw.caches.keys();
  for (const u of sw.stores.get(name).keys()) assert.doesNotMatch(new URL(u).pathname, /^\/(api|media)\//);
});

test("response lỗi (404, 500) không được lưu đè lên bản tốt", async () => {
  let network = ok;
  const sw = load({ network: (req) => network(req) });
  await sw.lifecycle("install");
  network = () => new Response("hỏng", { status: 500 });
  assert.equal((await sw.request("/app.js")).status, 500);
  network = down;
  assert.equal(await (await sw.request("/app.js")).text(), "net:/app.js");
});

test("activate: xoá cache của phiên bản cũ, giữ cache hiện tại", async () => {
  const sw = load({ network: ok });
  await sw.lifecycle("install");
  const [current] = await sw.caches.keys();
  await sw.caches.open("affiliate-studio-cu");
  await sw.caches.open("cache-cua-thu-khac");
  await sw.lifecycle("activate");
  assert.deepEqual((await sw.caches.keys()).sort(), [current, "cache-cua-thu-khac"].sort());
});
