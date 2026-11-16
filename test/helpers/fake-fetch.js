// fetch giả: trả Response theo URL, ghi lại các lần gọi. URL không khai báo → 403.
// Giá trị trong map: { type, body?, size?, status?, throws?, noLength?, json? } hoặc mảng các giá trị đó
// (mỗi lần gọi lấy phần tử kế tiếp, phần tử cuối dùng lại).

export function fakeFetch(map) {
  const calls = [];
  const counts = new Map();
  const f = async (url, init = {}) => {
    const key = String(url);
    calls.push({ url: key, method: init.method || "GET", headers: new Headers(init.headers), body: init.body });
    let spec = map[key];
    if (Array.isArray(spec)) {
      const n = counts.get(key) || 0;
      counts.set(key, n + 1);
      spec = spec[Math.min(n, spec.length - 1)];
    }
    if (!spec) return new Response("forbidden", { status: 403 });
    if (spec.throws) throw new TypeError("network error");
    if (spec.json !== undefined) {
      return new Response(JSON.stringify(spec.json), { status: spec.status ?? 200, headers: { "content-type": "application/json" } });
    }
    const body = spec.body ?? "x".repeat(8);
    const headers = { "content-type": spec.type };
    if (!spec.noLength) headers["content-length"] = String(spec.size ?? body.length);
    return new Response(body, { status: spec.status ?? 200, headers });
  };
  f.calls = calls;
  return f;
}
