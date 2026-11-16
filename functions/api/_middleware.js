// CORS + kiểm tra Bearer token cho mọi /api/*.
import { json } from "../../lib/util.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

// So sánh không thoát sớm, để thời gian trả lời không lộ token đúng tới ký tự nào.
function sameToken(given, expected) {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i % (a.length || 1)] ?? 0) ^ b[i];
  return diff === 0;
}

function withCors(res) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  return out;
}

export async function onRequest(ctx) {
  const { request, env } = ctx;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  if (!env.APP_TOKEN) return json({ error: "Chưa cấu hình APP_TOKEN" }, 500, CORS);

  const header = request.headers.get("Authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!given || !sameToken(given, env.APP_TOKEN)) return json({ error: "Token không đúng" }, 401, CORS);

  try {
    return withCors(await ctx.next());
  } catch (e) {
    return json({ error: e?.message || "Lỗi máy chủ" }, 500, CORS);
  }
}
