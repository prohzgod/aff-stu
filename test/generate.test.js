import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  priceK, FORBIDDEN, HOOK_FORMULAS, templatePackage,
  parseLoose, normalize, buildMessages, buildManualPrompt, callLlm, generatePackage,
} from "../lib/generate.js";
import { NEGATIVE } from "../public/lib/prompt-library.js";
import { fakeFetch } from "./helpers/fake-fetch.js";

const cocoon = JSON.parse(readFileSync(new URL("./fixtures/cocoon.json", import.meta.url)));
const words = (s) => s.trim().split(/\s+/).length;
const allText = (pkg) => JSON.stringify(pkg);
const JUNK = /undefined|NaN|null đã bán|(?<!\d)0 đã bán|Chỉ K|(?<![\d])K ·|-%|\(\)|\s{2,}|\s[.,!?]/;

test("priceK", () => {
  assert.equal(priceK(216749), "217K");
  assert.equal(priceK(99000), "99K");
  assert.equal(priceK(950), "950đ");
  assert.equal(priceK(1250000), "1,25 triệu");
  assert.equal(priceK(2000000), "2 triệu");
  assert.equal(priceK(999600), "1 triệu");
  for (const v of [null, undefined, 0, -5, "abc", NaN, Infinity]) assert.equal(priceK(v), "");
});

test("Cocoon: đủ schema, 6 hook đúng công thức và giới hạn từ", () => {
  const pkg = templatePackage(cocoon, { now: new Date("2026-11-16T00:00:00Z") });
  assert.equal(pkg.source, "template");
  assert.equal(pkg.model, null);
  assert.equal(pkg.generatedAt, "2026-11-16T00:00:00.000Z");
  assert.equal(pkg.note, "Gói dựng sẵn từ mẫu, chưa qua AI.");
  assert.ok(pkg.angle);
  assert.deepEqual(pkg.hooks.map((h) => h.formula), HOOK_FORMULAS);
  for (const h of pkg.hooks) {
    assert.ok(words(h.spoken) <= 14, h.spoken);
    assert.ok(words(h.onScreen) <= 6, h.onScreen);
    assert.ok(h.spoken.toLowerCase().includes("tinh chất bí đao"), h.spoken);
  }
  assert.ok(pkg.hooks[1].spoken.includes("217K"));
  assert.ok(pkg.hooks[1].spoken.includes("43%"));
  assert.ok(pkg.hooks[2].spoken.includes("229K"));
  assert.equal(pkg.coverTexts.length, 3);
  for (const c of pkg.coverTexts) assert.ok(c && words(c) <= 6, c);
  assert.deepEqual(pkg.script.map((s) => s.time), ["0-3s", "3-10s", "10-18s", "18-22s"]);
  for (const s of pkg.script) for (const k of ["visual", "voiceover"]) assert.ok(s[k], `${s.time}.${k}`);
  assert.equal(pkg.script[0].voiceover, pkg.hooks[0].spoken);
  assert.match(pkg.script[3].voiceover, /giỏ hàng/);
  assert.equal(pkg.videoPrompts.length, 4);
  for (const p of pkg.videoPrompts) for (const k of ["name", "flowMode", "ingredients", "prompt"]) assert.ok(p[k], k);
  assert.match(pkg.caption, /giỏ hàng/);
  assert.ok(pkg.caption.split(/[.!?]\s/).length <= 3);
  assert.ok(pkg.hashtags.length >= 5 && pkg.hashtags.length <= 8);
  assert.equal(new Set(pkg.hashtags).size, pkg.hashtags.length);
  for (const t of pkg.hashtags) assert.match(t, /^#[a-z0-9_]+$/);
  assert.match(pkg.pinnedComment, /217K/);
  assert.match(pkg.pinnedComment, /giỏ hàng/);
  assert.ok(pkg.warnings.length >= 1);
  assert.doesNotMatch(allText(pkg), FORBIDDEN);
  assert.doesNotMatch(allText({ ...pkg, videoPrompts: [] }), JUNK);
});

test("faceless: false → 7 prompt, lời thoại là hook đầu tiên", () => {
  const pkg = templatePackage(cocoon, { faceless: false });
  assert.equal(pkg.videoPrompts.length, 7);
  assert.ok(pkg.videoPrompts[0].prompt.includes(`"${pkg.hooks[0].spoken.replace(/["“”]/g, "")}"`));
});

test("sản phẩm thiếu dữ liệu: vẫn đủ gói, không có chữ rác", () => {
  for (const product of [{ title: "Áo", images: [{}] }, { title: "🔥", images: [{}], price: {}, soldCount: 0, rating: 0, specifications: [{}] }]) {
    const pkg = templatePackage(product);
    assert.equal(pkg.hooks.length, 6);
    assert.doesNotMatch(allText({ ...pkg, videoPrompts: [] }), JUNK);
    assert.ok(pkg.warnings.some((w) => /giá/.test(w)));
    for (const h of pkg.hooks) assert.ok(h.spoken && h.onScreen && words(h.spoken) <= 14 && words(h.onScreen) <= 6, h.spoken);
    assert.ok(pkg.hashtags.length >= 5 && pkg.hashtags.length <= 8);
    for (const t of pkg.hashtags) assert.match(t, /^#[a-z0-9_]+$/);
    assert.match(pkg.caption, /giỏ hàng/);
  }
});

test("tiêu đề rất dài: hook vẫn trong giới hạn từ", () => {
  const pkg = templatePackage({ ...cocoon, title: "Siêu phẩm máy xay sinh tố đa năng cầm tay mini sạc pin không dây thế hệ mới nhất" });
  for (const h of pkg.hooks) assert.ok(words(h.spoken) <= 14 && words(h.onScreen) <= 6, h.spoken);
});

test("tiêu đề có từ cấm: bị loại khỏi mọi trường và có cảnh báo", () => {
  const pkg = templatePackage({ ...cocoon, title: "Kem đặc trị mụn chữa thâm hết mụn 100%", description: "Trị dứt mụn sau 7 ngày", specifications: [{ name: "Công dụng", value: "Chữa mụn khỏi hẳn" }] });
  assert.doesNotMatch(allText({ ...pkg, warnings: [] }), FORBIDDEN);
  assert.ok(pkg.warnings.some((w) => /đã bỏ/.test(w)));
  assert.ok(pkg.hooks[0].spoken.includes("Kem mụn thâm"));
});

test("soldCount nhỏ: không khoe số; có rating thì dùng rating", () => {
  const pkg = templatePackage({ ...cocoon, soldCount: 12 });
  assert.doesNotMatch(pkg.hooks[2].spoken, /12/);
  assert.match(pkg.hooks[2].spoken, /4[.,]7/);
});

test("không có số đã bán lẫn rating: câu trung tính, không số", () => {
  const pkg = templatePackage({ ...cocoon, soldCount: undefined, rating: undefined });
  assert.doesNotMatch(pkg.hooks[2].spoken, /\d{2,}/);
});

test("có giá nhưng không có % giảm", () => {
  const pkg = templatePackage({ ...cocoon, price: { current: 99000 } });
  assert.ok(pkg.hooks[1].spoken.includes("99K"));
  assert.doesNotMatch(allText({ ...pkg, videoPrompts: [] }), JUNK);
});

test("ngành không phải mỹ phẩm/sức khoẻ và đủ giá: không có cảnh báo thừa", () => {
  assert.deepEqual(templatePackage({ ...cocoon, title: "Tai nghe bluetooth chống ồn", description: "", specifications: [] }).warnings, []);
});

test("thực phẩm/sức khoẻ cũng có cảnh báo", () => {
  assert.ok(templatePackage({ ...cocoon, title: "Viên uống collagen", description: "" }).warnings.length >= 1);
});

test("notes vào note, không vào nội dung", () => {
  const pkg = templatePackage(cocoon, { notes: "nhấn mạnh quà tặng kèm" });
  assert.match(pkg.note, /nhấn mạnh quà tặng kèm/);
  assert.doesNotMatch(JSON.stringify({ ...pkg, note: "" }), /nhấn mạnh quà tặng kèm/);
});

// ---------- phase 3: LLM, normalize, chế độ thủ công ----------

const LLM_URL = "https://llm.example.test/v1/chat/completions";
const llmEnv = { LLM_BASE_URL: "https://llm.example.test/v1/", LLM_MODEL: "flash-test", LLM_API_KEY: "k-123" };
const chat = (content) => ({ json: { choices: [{ message: { role: "assistant", content } }] } });

// Một câu trả lời "xấu" điển hình của LLM: hook lộn thứ tự, có từ khẳng định điều trị, prompt thiếu Avoid.
const messy = () => ({
  angle: "Nhấn vào giá và cảm nhận khi dùng",
  hooks: [
    { formula: "Giá sốc", spoken: "Tinh chất bí đao Cocoon chỉ còn 217K, giảm 43% luôn nè.", onScreen: "217K thôi" },
    { formula: "Nỗi đau", spoken: "Da dầu mụn hoài? Tinh chất bí đao này trị mụn dứt điểm luôn đó mọi người ơi nha nha nha.", onScreen: "Trị mụn một hai ba bốn năm sáu bảy" },
    { formula: "Trải nghiệm thật", spoken: "Mình xài tinh chất bí đao hai tuần rồi nè.", onScreen: "Xài thử 2 tuần" },
  ],
  coverTexts: ["Bí đao 217K"],
  script: [{ time: "0-3s", visual: "Cận cảnh chai", voiceover: "Da dầu thử ngay", onScreen: "Thử ngay" }],
  videoPrompts: [{ name: "Demo", flowMode: "Ingredients to Video", ingredients: "Ảnh 1 (sản phẩm)", prompt: "Vertical 9:16 close-up of hands holding the bottle." }],
  caption: "Tinh chất bí đao 217K, chữa mụn 100%. Bấm giỏ hàng vàng nha!",
  hashtags: ["skincare", "#Cocoon", "#skincare", "#da dầu"],
  pinnedComment: "Giá 217K trong giỏ hàng vàng nha",
});

test("parseLoose: JSON thuần, có rào ```json, có chữ thừa trước sau", () => {
  assert.deepEqual(parseLoose('{"a":1}'), { a: 1 });
  assert.deepEqual(parseLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseLoose('Đây là kết quả:\n```\n{"a":{"b":"}"}}\n```\nChúc bạn may mắn {nhé}'), { a: { b: "}" } });
  assert.deepEqual(parseLoose('Kết quả: {"a":1} hết.'), { a: 1 });
  for (const bad of ["", "không có gì", "[1,2]", "{hỏng", null, undefined, 5, '"chuỗi"']) assert.equal(parseLoose(bad), null, String(bad));
});

test("normalize (tiêu chí phase 3): 6 hook đúng 6 công thức, không có từ trị, giá 217K", () => {
  const pkg = normalize(messy(), cocoon);
  assert.deepEqual(pkg.hooks.map((h) => h.formula), HOOK_FORMULAS);
  assert.ok(pkg.hooks[1].spoken.includes("217K"));
  assert.equal(pkg.hooks[5].spoken, "Mình xài tinh chất bí đao hai tuần rồi nè.");
  for (const h of pkg.hooks) assert.ok(words(h.spoken) <= 14 && words(h.onScreen) <= 6, h.spoken);
  assert.doesNotMatch(allText({ ...pkg, warnings: [] }), /trị/i);
  assert.doesNotMatch(allText({ ...pkg, warnings: [] }), FORBIDDEN);
  assert.ok(pkg.warnings.some((w) => /đã bỏ/.test(w)));
  assert.equal(pkg.angle, "Nhấn vào giá và cảm nhận khi dùng");
});

test("normalize: trường thiếu lấy từ mẫu; prompt thiếu Avoid được nối NEGATIVE", () => {
  const tpl = templatePackage(cocoon);
  const pkg = normalize(messy(), cocoon);
  assert.equal(pkg.coverTexts.length, 3);
  assert.equal(pkg.coverTexts[0], "Bí đao 217K");
  assert.deepEqual(pkg.script.map((s) => s.time), ["0-3s"]);
  assert.equal(pkg.videoPrompts.length, 1);
  assert.ok(pkg.videoPrompts[0].prompt.endsWith(" " + NEGATIVE));
  assert.match(pkg.caption, /giỏ hàng/);
  const empty = normalize({}, cocoon);
  assert.deepEqual(empty.hooks, tpl.hooks);
  assert.deepEqual(empty.videoPrompts, tpl.videoPrompts);
  assert.equal(empty.caption, tpl.caption);
  assert.equal(empty.pinnedComment, tpl.pinnedComment);
  assert.deepEqual(normalize(null, cocoon).hooks, tpl.hooks);
  assert.deepEqual(normalize("chuỗi", cocoon).script, tpl.script);
});

test("normalize: hashtag có dấu #, không khoảng trắng, không trùng, 5–8 thẻ", () => {
  const pkg = normalize(messy(), cocoon);
  assert.ok(pkg.hashtags.length >= 5 && pkg.hashtags.length <= 8);
  assert.equal(new Set(pkg.hashtags.map((t) => t.toLowerCase())).size, pkg.hashtags.length);
  for (const t of pkg.hashtags) assert.match(t, /^#[^\s#]+$/u);
  assert.equal(pkg.hashtags[0], "#skincare");
  assert.ok(pkg.hashtags.includes("#dadầu"));
  assert.equal(normalize({ ...messy(), hashtags: Array.from({ length: 20 }, (_, i) => `#t${i}`) }, cocoon).hashtags.length, 8);
});

test("normalize: kiểu dữ liệu sai không làm hỏng gói", () => {
  const pkg = normalize({ hooks: "sai", coverTexts: [1, null, { a: 1 }], script: [null, "x", { time: "0-3s" }], videoPrompts: [{ name: "Thiếu prompt" }, "x"], caption: 5, hashtags: "#a #b", warnings: "không phải mảng" }, cocoon);
  const tpl = templatePackage(cocoon);
  assert.deepEqual(pkg.hooks, tpl.hooks);
  assert.deepEqual(pkg.coverTexts, tpl.coverTexts);
  assert.deepEqual(pkg.script, tpl.script);
  assert.deepEqual(pkg.videoPrompts, tpl.videoPrompts);
  assert.equal(pkg.caption, tpl.caption);
  assert.doesNotMatch(allText({ ...pkg, videoPrompts: [] }), /undefined|NaN|\[object/);
});

test("normalize: giá lạ trong nội dung → cảnh báo kiểm tra giá; giá đúng thì không", () => {
  const wrong = normalize({ ...messy(), caption: "Chỉ 199K thôi. Bấm giỏ hàng vàng nha!" }, cocoon);
  assert.ok(wrong.warnings.some((w) => /199K/.test(w) && /giá/i.test(w)));
  const right = normalize({ ...messy(), caption: "Chỉ 217K, giá gốc 378K. Bấm giỏ hàng vàng nha!" }, cocoon);
  assert.ok(!right.warnings.some((w) => /kiểm tra lại giá/i.test(w)));
});

test("normalize: warnings của LLM được giữ, gộp với cảnh báo của hệ thống, không trùng", () => {
  const pkg = normalize({ ...messy(), warnings: ["Không nói về kết quả sau bao lâu.", "Không nói về kết quả sau bao lâu."] }, cocoon);
  assert.equal(pkg.warnings.filter((w) => w === "Không nói về kết quả sau bao lâu.").length, 1);
  assert.ok(pkg.warnings.length >= 2);
});

test("buildMessages: system có luật, user có đúng dữ liệu được phép gửi", () => {
  const big = { ...cocoon, description: "m".repeat(5000), specifications: Array.from({ length: 30 }, (_, i) => ({ name: `n${i}`, value: `v${i}` })), skus: Array.from({ length: 15 }, (_, i) => ({ skuId: `s${i}`, props: `Loại ${i}`, price: 1000 + i, stock: 5 })), images: cocoon.images, videos: cocoon.videos };
  const [system, user] = buildMessages(big, { tone: "hài hước", notes: "nhấn quà tặng", faceless: true });
  assert.equal(system.role, "system");
  assert.equal(user.role, "user");
  for (const f of HOOK_FORMULAS) assert.ok(system.content.includes(f), f);
  for (const must of ["tiếng Việt", "giỏ hàng", "JSON", "Avoid:", "14", "videoPrompts", "pinnedComment", "warnings", "hỗ trợ"]) assert.ok(system.content.includes(must), must);
  assert.match(system.content, /không.*mặt người|chỉ.*tay/i);
  const data = JSON.parse(user.content.slice(user.content.indexOf("{")));
  assert.equal(data.title, big.title);
  assert.equal(data.price, "217K");
  assert.equal(data.originalPrice, "378K");
  assert.equal(data.discount, "-43%");
  assert.equal(data.sold, 229096);
  assert.equal(data.rating, 4.7);
  assert.equal(data.shop, "Cocoon Vietnam");
  assert.equal(data.specifications.length, 20);
  assert.equal(data.variants.length, 10);
  assert.equal(data.description.length, 2500);
  assert.equal(data.tone, "hài hước");
  assert.equal(data.notes, "nhấn quà tặng");
  assert.equal(data.faceless, true);
  assert.doesNotMatch(user.content, /cdn\.example\.test|expiresAt|skuId/);
  const [systemFace] = buildMessages(cocoon, { faceless: false });
  assert.notEqual(systemFace.content, system.content);
});

test("buildManualPrompt: một khối văn bản có luật, dữ liệu và yêu cầu chỉ trả JSON", () => {
  const text = buildManualPrompt(cocoon, { tone: "tự nhiên", notes: "", faceless: true });
  assert.equal(typeof text, "string");
  assert.ok(text.includes(cocoon.title));
  assert.ok(text.includes("217K"));
  assert.ok(text.includes('"hooks"'));
  assert.match(text, /chỉ trả.*JSON/i);
  for (const f of HOOK_FORMULAS) assert.ok(text.includes(f), f);
});

test("callLlm: gửi đúng định dạng OpenAI-compatible", async () => {
  const f = fakeFetch({ [LLM_URL]: chat('{"a":1}') });
  const r = await callLlm(llmEnv, [{ role: "user", content: "hi" }], f);
  assert.deepEqual(r, { ok: true, text: '{"a":1}' });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].method, "POST");
  assert.equal(f.calls[0].headers.get("authorization"), "Bearer k-123");
  assert.equal(f.calls[0].headers.get("content-type"), "application/json");
  const body = JSON.parse(f.calls[0].body);
  assert.equal(body.model, "flash-test");
  assert.deepEqual(body.messages, [{ role: "user", content: "hi" }]);
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.equal(body.temperature, 0.9);
});

test("callLlm: 400 vì response_format → thử lại một lần không có response_format", async () => {
  const f = fakeFetch({ [LLM_URL]: [{ json: { error: { message: "response_format unsupported" } }, status: 400 }, chat('{"a":1}')] });
  const r = await callLlm(llmEnv, [{ role: "user", content: "hi" }], f);
  assert.equal(r.ok, true);
  assert.equal(f.calls.length, 2);
  assert.equal("response_format" in JSON.parse(f.calls[1].body), false);
});

test("callLlm: các kiểu lỗi", async () => {
  const run = (spec) => callLlm(llmEnv, [], fakeFetch({ [LLM_URL]: spec }));
  assert.deepEqual(await run({ json: {}, status: 429 }), { ok: false, reason: "429" });
  assert.deepEqual(await run({ json: {}, status: 503 }), { ok: false, reason: "http 503" });
  assert.deepEqual(await run({ throws: true }), { ok: false, reason: "network" });
  assert.deepEqual(await run({ json: { choices: [] } }), { ok: false, reason: "empty" });
  assert.deepEqual(await run({ type: "text/html", body: "<html>" }), { ok: false, reason: "empty" });
});

test("generatePackage: không có key hoặc model → mẫu, không gọi mạng", async () => {
  for (const env of [{}, { ...llmEnv, LLM_API_KEY: "" }, { ...llmEnv, LLM_MODEL: "" }]) {
    const f = fakeFetch({});
    const pkg = await generatePackage(cocoon, {}, env, f);
    assert.equal(pkg.source, "template");
    assert.equal(f.calls.length, 0);
    assert.match(pkg.note, /Chưa cấu hình AI/);
  }
});

test("generatePackage: LLM trả tốt → source llm, model, đã chuẩn hoá", async () => {
  const f = fakeFetch({ [LLM_URL]: chat("```json\n" + JSON.stringify(messy()) + "\n```") });
  const pkg = await generatePackage(cocoon, { tone: "hài hước" }, llmEnv, f, new Date("2026-11-16T00:00:00Z"));
  assert.equal(pkg.source, "llm");
  assert.equal(pkg.model, "flash-test");
  assert.equal(pkg.generatedAt, "2026-11-16T00:00:00.000Z");
  assert.deepEqual(pkg.hooks.map((h) => h.formula), HOOK_FORMULAS);
  assert.doesNotMatch(allText({ ...pkg, warnings: [] }), /trị/i);
  assert.ok(JSON.parse(f.calls[0].body).messages[1].content.includes("hài hước"));
});

test("generatePackage: 429, lỗi mạng, JSON hỏng → mẫu kèm lý do", async () => {
  const cases = [[{ json: {}, status: 429 }, /hết hạn mức/], [{ throws: true }, /Không gọi được AI/], [chat("xin lỗi tôi không thể"), /không đúng định dạng/], [{ json: {}, status: 500 }, /Không gọi được AI/]];
  for (const [spec, re] of cases) {
    const pkg = await generatePackage(cocoon, {}, llmEnv, fakeFetch({ [LLM_URL]: spec }));
    assert.equal(pkg.source, "template");
    assert.equal(pkg.model, null);
    assert.match(pkg.note, re);
    assert.equal(pkg.hooks.length, 6);
  }
});
