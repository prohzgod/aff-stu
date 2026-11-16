// R2 giả, lưu trong bộ nhớ. Chỉ có những gì code của dự án dùng tới.

async function toBytes(value) {
  if (value == null) return new Uint8Array(0);
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new Uint8Array(await new Response(value).arrayBuffer()); // ReadableStream, Blob
}

export function makeBucket({ pageSize = 1000 } = {}) {
  const store = new Map();
  let etagSeq = 0;

  const meta = (key, o) => ({
    key,
    size: o.bytes.byteLength,
    etag: o.etag,
    httpEtag: `"${o.etag}"`,
    httpMetadata: o.httpMetadata,
    customMetadata: o.customMetadata,
  });

  return {
    _store: store,

    async put(key, value, { httpMetadata = {}, customMetadata = {} } = {}) {
      const size = Object.entries(customMetadata).reduce((n, [k, v]) => n + k.length + String(v).length, 0);
      if (size > 2048) throw new Error("customMetadata vượt 2KB");
      const bytes = await toBytes(value);
      const o = { bytes, httpMetadata, customMetadata, etag: `etag${++etagSeq}` };
      store.set(key, o);
      return meta(key, o);
    },

    async head(key) {
      const o = store.get(key);
      return o ? meta(key, o) : null;
    },

    async get(key, { range } = {}) {
      const o = store.get(key);
      if (!o) return null;
      let bytes = o.bytes;
      if (range) bytes = bytes.subarray(range.offset, range.offset + range.length);
      return {
        ...meta(key, o),
        range,
        body: new Response(bytes).body,
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        text: async () => new TextDecoder().decode(bytes),
        json: async () => JSON.parse(new TextDecoder().decode(bytes)),
      };
    },

    async delete(keys) {
      for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k);
    },

    async list({ prefix = "", cursor, limit = pageSize } = {}) {
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const end = Math.min(start + Math.min(limit, pageSize), keys.length);
      const truncated = end < keys.length;
      return {
        objects: keys.slice(start, end).map((k) => meta(k, store.get(k))),
        truncated,
        cursor: truncated ? String(end) : undefined,
      };
    },
  };
}
