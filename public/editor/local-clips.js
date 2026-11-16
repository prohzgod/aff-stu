// Giữ file clip người dùng nhập ngay trên thiết bị (IndexedDB), để tải lại trang không mất.
// Clip gốc không bao giờ được tải lên server.

const DB_NAME = "affiliate-studio";
const STORE = "clips";
const MAX_AGE_MS = 7 * 86400000;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "key" });
      store.createIndex("productId", "productId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const result = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(result?.result ?? result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const keyOf = (productId, sourceId) => `${productId}/${sourceId}`;

export function putClip(productId, sourceId, blob, name) {
  return run("readwrite", (s) => s.put({ key: keyOf(productId, sourceId), productId, blob, name, savedAt: Date.now() }));
}

export async function getClip(productId, sourceId) {
  const row = await run("readonly", (s) => s.get(keyOf(productId, sourceId)));
  return row?.blob || null;
}

export function deleteClip(productId, sourceId) {
  return run("readwrite", (s) => s.delete(keyOf(productId, sourceId)));
}

// Dọn clip đã quá 7 ngày (sản phẩm của chúng cũng đã hết hạn trên server).
export function pruneOldClips(now = Date.now()) {
  return run("readwrite", (s) => {
    s.openCursor().onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) return;
      if (now - (cursor.value.savedAt || 0) > MAX_AGE_MS) cursor.delete();
      cursor.continue();
    };
  });
}
