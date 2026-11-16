// Service worker: giữ app shell để mở được khi mạng chập chờn.
// Ưu tiên mạng (luôn lấy bản mới nhất khi có mạng), mạng hỏng mới dùng bản đã lưu.
// KHÔNG bao giờ lưu /api/* và /media/*: dữ liệu sản phẩm phải luôn mới và tự hết hạn sau 7 ngày.

const CACHE = "affiliate-studio-v1";
const PREFIX = "affiliate-studio-";
const SHELL = [
  "/",
  "/app.js",
  "/styles.css",
  "/manifest.webmanifest",
  "/lib/api.js",
  "/lib/dom.js",
  "/lib/format.js",
  "/lib/package-text.js",
  "/lib/prompt-library.js",
  "/lib/share.js",
  "/lib/zip.js",
  "/views/package.js",
  "/icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith(PREFIX) && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = (await cache.match(request)) || (request.mode === "navigate" ? await cache.match("/") : undefined);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/")) return;
  event.respondWith(networkFirst(request));
});
