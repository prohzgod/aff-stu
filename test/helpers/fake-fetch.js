// fetch giả: trả Response theo URL, ghi lại các lần gọi. URL không khai báo → 403.
// Giá trị trong map: { type, body?, size?, status?, throws?, noLength? }

export function fakeFetch(map) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url: String(url), headers: new Headers(init.headers) });
    const spec = map[String(url)];
    if (!spec) return new Response("forbidden", { status: 403 });
    if (spec.throws) throw new TypeError("network error");
    const body = spec.body ?? "x".repeat(8);
    const headers = { "content-type": spec.type };
    if (!spec.noLength) headers["content-length"] = String(spec.size ?? body.length);
    return new Response(body, { status: spec.status ?? 200, headers });
  };
  f.calls = calls;
  return f;
}
