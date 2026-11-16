// Dựng gói đăng bài (schema docs/spec/studio.md mục 6.3) từ mẫu, không cần LLM.
// Luật 6 trong docs/RULES.md: chỉ dùng dữ liệu có trong sản phẩm, không từ khẳng định điều trị.

import { detectCategory, shortName, CATEGORY_DEFAULTS, buildVideoPrompts, NEGATIVE } from "../public/lib/prompt-library.js";
import { priceK } from "../public/lib/format.js";

export { priceK };

export const HOOK_FORMULAS = ["Nỗi đau", "Giá sốc", "Bằng chứng xã hội", "Tò mò", "So sánh", "Trải nghiệm thật"];

// Từ khẳng định điều trị. Chữ "trị" đứng riêng cũng bị cấm ("trị mụn", "trị thâm"), trừ khi là "giá trị".
const FORBIDDEN_SOURCE = "trị dứt|đặc trị|điều trị|(?<!giá\\s)(?<![\\p{L}\\p{N}])trị(?![\\p{L}\\p{N}])|chữa|hết mụn|100%|khỏi hẳn";
export const FORBIDDEN = new RegExp(FORBIDDEN_SOURCE, "iu");
const FORBIDDEN_ALL = new RegExp(FORBIDDEN_SOURCE, "giu");

// Sản phẩm dễ vướng quy định quảng cáo (mỹ phẩm, thực phẩm, sức khoẻ) dù không rơi vào ngành "beauty".
const SENSITIVE = /mụn|thâm|nám|trắng da|thuốc|viên uống|collagen|vitamin|giảm cân|thực phẩm|sức khoẻ|sức khỏe/i;

const ANGLES = {
  beauty: "Cho thấy kết cấu và cách dùng, chỉ nói cảm nhận khi dùng.",
  kitchen: "Cho thấy sản phẩm chạy thật trong bếp, nhanh và gọn.",
  tech: "Cho thấy thao tác thật: bật lên, kết nối, dùng thử.",
  fashion: "Cho thấy chất liệu và form khi cầm, khi mặc.",
  home: "Cho thấy góc nhà trước và sau khi đặt sản phẩm vào.",
  general: "Cho thấy sản phẩm thật ở cự ly gần và cách dùng.",
};

const TAGS = {
  beauty: ["#lamdep", "#chamsocda", "#skincare", "#beauty"],
  kitchen: ["#dobep", "#nauan", "#kitchen", "#cooking"],
  tech: ["#congnghe", "#phukien", "#tech", "#gadget"],
  fashion: ["#thoitrang", "#phoido", "#fashion", "#ootd"],
  home: ["#nhacua", "#giadung", "#home", "#homedecor"],
  general: ["#muasam", "#dexuat", "#review", "#musthave"],
};

const tidy = (s) => String(s ?? "").replace(/\s+/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
const sanitize = (s) => tidy(String(s ?? "").replace(FORBIDDEN_ALL, " "));
const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const limitWords = (s, n) => tidy(s).split(" ").slice(0, n).join(" ");
const positive = (n) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null);
const decimal = (n, digits) => String(Number(n.toFixed(digits))).replace(".", ",");

// Số lượt mua, làm tròn xuống để chữ "Hơn …" luôn đúng.
function countK(n) {
  if (n < 1000) return String(Math.floor(n));
  if (n < 1e6) return `${Math.floor(n / 1000)}K`;
  return `${decimal(Math.floor(n / 1e5) / 10, 1)} triệu`;
}

function slugTag(text) {
  const s = String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 30);
  return s ? `#${s}` : "";
}

function buildHooks({ name, pain, price, discount, sold, rating }) {
  const priceHook = price && discount
    ? { spoken: `${name} đang giảm ${discount} còn ${price} thôi.`, onScreen: `Chỉ ${price} · -${discount}` }
    : price
      ? { spoken: `${name} giờ chỉ ${price} thôi nè.`, onScreen: `Chỉ ${price}` }
      : { spoken: `${name} đang có deal trong giỏ hàng.`, onScreen: "Deal trong giỏ hàng" };

  const proofHook = sold
    ? { spoken: `Hơn ${sold} người đã mua ${name} rồi đó.`, onScreen: `Hơn ${sold} người mua` }
    : rating
      ? { spoken: `${name} đang được chấm ${rating} sao.`, onScreen: `${rating} sao` }
      : { spoken: `Xem thử ${name} có gì nào.`, onScreen: "Xem thử nào" };

  const hooks = [
    { spoken: `${capitalize(pain)}? Thử ${name}.`, onScreen: "Thử ngay xem sao" },
    priceHook,
    proofHook,
    { spoken: `Ít ai để ý điểm này ở ${name}.`, onScreen: "Điểm ít ai để ý" },
    { spoken: `${name} khác gì mấy loại đang dùng?`, onScreen: "Khác gì loại cũ?" },
    { spoken: `Mình dùng thử ${name}, nói thật cảm nhận nè.`, onScreen: "Dùng thử nói thật" },
  ];
  return hooks.map((h, i) => ({
    formula: HOOK_FORMULAS[i],
    spoken: limitWords(h.spoken, 14),
    onScreen: limitWords(h.onScreen, 6),
  }));
}

export function templatePackage(product, { tone = "tự nhiên", notes = "", faceless = true, now = new Date() } = {}) {
  const rawTitle = String(product?.title ?? "");
  const rawDescription = String(product?.description ?? "");
  const clean = { ...product, title: sanitize(rawTitle), description: sanitize(rawDescription) };

  const category = detectCategory(clean.title, clean.description);
  const fullName = shortName(clean.title) || "món này";
  const name = limitWords(fullName, 4);

  const price = priceK(product?.price?.current);
  const discount = /^-?\d{1,2}%$/.test(String(product?.price?.discount ?? "")) ? String(product.price.discount).replace("-", "") : "";
  const soldCount = positive(product?.soldCount);
  const sold = soldCount && soldCount >= 100 ? countK(soldCount) : "";
  const ratingValue = positive(product?.rating);
  const rating = ratingValue && ratingValue <= 5 ? decimal(ratingValue, 1) : "";
  const shop = sanitize(product?.shopName);
  const spec = (Array.isArray(product?.specifications) ? product.specifications : [])
    .map((s) => limitWords(sanitize(s?.value).replace(/,(?=\S)/g, ", "), 12))
    .find(Boolean);

  const hooks = buildHooks({ name, pain: CATEGORY_DEFAULTS[category].pain, price, discount, sold, rating });
  const priceSticker = price ? (discount ? `Chỉ ${price} · -${discount}` : `Chỉ ${price}`) : "";
  const priceLine = price
    ? `Giá đang ${price}${discount ? `, giảm ${discount}` : ""}${sold ? `, hơn ${sold} lượt mua` : ""}.`
    : "Xem kỹ chi tiết trong giỏ hàng rồi hãy quyết định nha.";

  const script = [
    { time: "0-3s", visual: "Cận cảnh sản phẩm, chữ hook to ở giữa-trên khung hình.", voiceover: hooks[0].spoken, onScreen: hooks[0].onScreen },
    {
      time: "3-10s",
      visual: "Tay cầm sản phẩm, xoay cho thấy nhãn và chi tiết chính.",
      voiceover: tidy(`Đây là ${fullName}${shop ? ` của ${shop}` : ""}.${spec ? ` ${capitalize(spec)}.` : ""}`),
      onScreen: name,
    },
    {
      time: "10-18s",
      visual: faceless ? "Cảnh dùng thử, chỉ thấy tay và sản phẩm." : "Người dùng thử sản phẩm trước camera.",
      voiceover: priceLine,
      onScreen: priceSticker,
    },
    { time: "18-22s", visual: "Sản phẩm đứng giữa khung, mũi tên chỉ xuống giỏ hàng.", voiceover: "Thích thì bấm giỏ hàng vàng bên dưới nha.", onScreen: "Bấm giỏ hàng 🛒" },
  ];

  const hashtags = [...new Set([slugTag(name), ...TAGS[category], "#tiktokshop", "#reviewsanpham"].filter(Boolean))].slice(0, 8);

  const warnings = [];
  if (category === "beauty" || SENSITIVE.test(`${rawTitle} ${rawDescription}`)) {
    warnings.push("Mỹ phẩm, thực phẩm, sức khoẻ: chỉ nói cảm nhận và \"hỗ trợ\", không cam kết kết quả.");
  }
  const removed = [...new Set(`${rawTitle} ${rawDescription}`.match(FORBIDDEN_ALL)?.map((w) => w.toLowerCase()) ?? [])];
  if (removed.length) warnings.push(`Tiêu đề hoặc mô tả gốc có từ khẳng định công dụng (${removed.join(", ")}); đã bỏ khỏi gói.`);
  if (!price) warnings.push("Sản phẩm chưa có giá: kiểm tra lại giá trước khi đăng.");

  const noteParts = ["Gói dựng sẵn từ mẫu, chưa qua AI."];
  if (tone && tone !== "tự nhiên") noteParts.push(`Tone "${tidy(tone)}" chỉ áp dụng khi tạo bằng AI.`);
  if (tidy(notes)) noteParts.push(`Ghi chú của bạn: ${tidy(notes)}`);

  return {
    generatedAt: now.toISOString(),
    source: "template",
    model: null,
    note: noteParts.join(" "),
    angle: ANGLES[category],
    hooks,
    coverTexts: [
      limitWords(`${name} có gì?`, 6),
      price ? limitWords(discount ? `Chỉ ${price} giảm ${discount}` : `Chỉ ${price}`, 6) : "Deal trong giỏ hàng",
      "Dùng thử nói thật",
    ],
    script,
    videoPrompts: buildVideoPrompts(clean, { faceless, hookLine: hooks[0].spoken }).map(({ name: n, flowMode, ingredients, prompt }) => ({ name: n, flowMode, ingredients, prompt })),
    caption: tidy(`${fullName} ${price ? `đang ${price}${discount ? `, giảm ${discount}` : ""}` : "đang có trong giỏ hàng"}. Bấm giỏ hàng vàng để xem chi tiết nha!`),
    hashtags,
    pinnedComment: price ? `${name} đang ${price}, bấm giỏ hàng vàng để xem nha.` : `${name} có trong giỏ hàng vàng nha.`,
    warnings,
  };
}

// ---------- LLM, chuẩn hoá, chế độ thủ công (docs/spec/studio.md mục 6.2–6.4) ----------

const FLOW_MODES = ["Ingredients to Video", "Frames to Video", "Text to Video"];
const text = (v) => (typeof v === "string" ? v : "");
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Đọc JSON từ câu trả lời của LLM: chấp nhận rào ```json và chữ thừa trước/sau. Trả object hoặc null.
export function parseLoose(raw) {
  if (typeof raw !== "string") return null;
  const candidates = [raw.trim()];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  if (fenced) candidates.push(fenced[1].trim());
  const first = raw.indexOf("{");
  for (let last = raw.lastIndexOf("}"); first !== -1 && last > first; last = raw.lastIndexOf("}", last - 1)) {
    candidates.push(raw.slice(first, last + 1));
    if (candidates.length > 6) break;
  }
  for (const c of candidates) {
    try {
      const value = JSON.parse(c);
      if (isObject(value)) return value;
    } catch {
      // thử ứng viên kế tiếp
    }
  }
  return null;
}

const PRICE_TOKEN = /(?<![\p{L}\p{N}])\d{1,4}K(?![\p{L}\p{N}])/gu;

// Đưa kết quả của LLM (hoặc JSON người dùng dán) về đúng schema: thiếu gì lấy từ mẫu, bỏ từ cấm, siết giới hạn.
export function normalize(raw, product, options = {}) {
  const tpl = templatePackage(product, options);
  const src = isObject(raw) ? raw : {};
  const removed = new Set();
  const clean = (v) => {
    const s = text(v);
    for (const w of s.match(FORBIDDEN_ALL) ?? []) removed.add(w.toLowerCase());
    return sanitize(s);
  };

  const rawHooks = Array.isArray(src.hooks) ? src.hooks.filter(isObject) : [];
  const hooks = HOOK_FORMULAS.map((formula, i) => {
    const found = rawHooks.find((h) => text(h.formula).trim().toLowerCase() === formula.toLowerCase());
    const spoken = found ? limitWords(clean(found.spoken), 14) : "";
    if (!spoken) return tpl.hooks[i];
    return { formula, spoken, onScreen: limitWords(clean(found.onScreen), 6) || tpl.hooks[i].onScreen };
  });

  const covers = (Array.isArray(src.coverTexts) ? src.coverTexts : []).map((c) => limitWords(clean(c), 6)).filter(Boolean);
  const coverTexts = [...covers, ...tpl.coverTexts.filter((c) => !covers.includes(c))].slice(0, 3);

  const beats = (Array.isArray(src.script) ? src.script : [])
    .filter((b) => isObject(b) && (text(b.voiceover).trim() || text(b.visual).trim()))
    .map((b) => ({ time: tidy(text(b.time)), visual: clean(b.visual), voiceover: clean(b.voiceover), onScreen: clean(b.onScreen) }));
  const script = beats.length ? beats : tpl.script;

  const prompts = (Array.isArray(src.videoPrompts) ? src.videoPrompts : [])
    .filter((p) => isObject(p) && text(p.prompt).trim())
    .map((p, i) => {
      const prompt = clean(p.prompt);
      return {
        name: clean(p.name) || `Clip ${i + 1}`,
        flowMode: FLOW_MODES.includes(p.flowMode) ? p.flowMode : FLOW_MODES[0],
        ingredients: clean(p.ingredients) || "Ảnh 1 (sản phẩm)",
        prompt: /Avoid:/.test(prompt) ? prompt : `${prompt} ${NEGATIVE}`,
      };
    });
  const videoPrompts = prompts.length ? prompts : tpl.videoPrompts;

  let caption = clean(src.caption) || tpl.caption;
  if (!/giỏ hàng/i.test(caption)) caption = `${caption} Bấm giỏ hàng vàng để xem chi tiết nha!`;

  const rawTags = Array.isArray(src.hashtags) ? src.hashtags : text(src.hashtags).split(/\s+/);
  const hashtags = [];
  const addTag = (t) => {
    const tag = `#${text(t).replace(/[^\p{L}\p{N}_]/gu, "")}`;
    if (tag.length > 1 && tag.length <= 40 && hashtags.length < 8 && !hashtags.some((h) => h.toLowerCase() === tag.toLowerCase())) hashtags.push(tag);
  };
  rawTags.forEach(addTag);
  for (const t of tpl.hashtags) if (hashtags.length < 5) addTag(t); // chưa đủ 5 thì bù từ mẫu

  const pinnedComment = clean(src.pinnedComment) || tpl.pinnedComment;
  const angle = clean(src.angle) || tpl.angle;

  const warnings = [...(Array.isArray(src.warnings) ? src.warnings.map((w) => tidy(text(w))) : []), ...tpl.warnings];
  if (removed.size) warnings.push(`Nội dung được tạo có từ khẳng định công dụng (${[...removed].join(", ")}); đã bỏ khỏi gói.`);

  const price = priceK(product?.price?.current);
  if (price) {
    const soldCount = positive(product?.soldCount);
    const allowed = new Set([price, priceK(product?.price?.original), soldCount ? countK(soldCount) : ""]);
    const spokenText = [
      ...hooks.flatMap((h) => [h.spoken, h.onScreen]), ...coverTexts, caption, pinnedComment,
      ...script.flatMap((b) => [b.voiceover, b.onScreen]),
    ].join(" ");
    const odd = [...new Set(spokenText.match(PRICE_TOKEN) ?? [])].filter((t) => !allowed.has(t));
    if (odd.length) warnings.push(`Kiểm tra lại giá trong gói: ${odd.join(", ")} không khớp giá sản phẩm (${price}).`);
  }

  return { ...tpl, angle, hooks, coverTexts, script, videoPrompts, caption, hashtags, pinnedComment, warnings: [...new Set(warnings.filter(Boolean))] };
}

const SCHEMA_EXAMPLE = `{
  "angle": "góc tiếp cận chính, 1 câu",
  "hooks": [{ "formula": "Nỗi đau", "spoken": "...", "onScreen": "..." }],
  "coverTexts": ["...", "...", "..."],
  "script": [{ "time": "0-3s", "visual": "...", "voiceover": "...", "onScreen": "..." }],
  "videoPrompts": [{ "name": "...", "flowMode": "Ingredients to Video | Frames to Video | Text to Video", "ingredients": "Ảnh 1 (sản phẩm) + ...", "prompt": "English ..." }],
  "caption": "...",
  "hashtags": ["#..."],
  "pinnedComment": "...",
  "warnings": ["..."]
}`;

function systemPrompt(faceless) {
  return [
    "Bạn viết nội dung video ngắn TikTok Shop cho một kênh affiliate Việt Nam.",
    "Viết tiếng Việt tự nhiên kiểu creator Gen Z, không văn mẫu, không sáo rỗng.",
    "CHỈ dùng dữ liệu có trong phần dữ liệu sản phẩm. Không bịa công dụng, số liệu, chứng nhận, thời gian hiệu quả. Giá ghi đúng như dữ liệu (dạng 217K).",
    'Với mỹ phẩm, thực phẩm, sức khoẻ: cấm từ khẳng định điều trị như "trị dứt", "hết mụn 100%", "chữa". Dùng "hỗ trợ", "cảm nhận". Ghi các rủi ro về câu chữ vào "warnings".',
    `Viết đúng 6 hook, mỗi công thức một hook, theo thứ tự: ${HOOK_FORMULAS.join(", ")}. Trường "formula" ghi đúng tên công thức.`,
    'Mỗi hook phải nêu loại sản phẩm ngay trong câu. "spoken" tối đa 14 từ, "onScreen" tối đa 6 từ.',
    '"coverTexts": đúng 3 dòng chữ ảnh bìa, mỗi dòng tối đa 6 từ.',
    '"script": 4 đến 6 nhịp cho video 15–40 giây; nhịp cuối kêu gọi bấm giỏ hàng.',
    '"videoPrompts": 2 đến 4 prompt cho Google Flow (Veo 3.1). Mỗi prompt là MỘT clip tối đa 8 giây, viết bằng tiếng Anh, bắt đầu bằng "Vertical 9:16", theo thứ tự: Subject, Action, Setting, Camera, Lighting/Style, Audio. Lời thoại (nếu có) viết tiếng Việt trong ngoặc kép. Thêm câu giữ nhãn và bao bì nhất quán với ảnh tham chiếu.',
    `Mỗi prompt kết thúc bằng đúng câu: ${NEGATIVE}`,
    faceless
      ? "Kênh faceless: prompt video chỉ quay tay, sản phẩm, B-roll; không có mặt người, không ai nói trước camera."
      : "Kênh có người xuất hiện: prompt video được có người nói trước camera, mô tả ngắn gọn ngoại hình và bối cảnh.",
    '"caption": 1 đến 3 câu, có lời kêu gọi "bấm giỏ hàng vàng". "hashtags": 5 đến 8 thẻ, có cả tiếng Việt và tiếng Anh. "pinnedComment": 1 câu.',
    'Áp dụng "tone" và "notes" trong dữ liệu nếu có.',
    "Trả về JSON đúng schema sau, không thêm trường khác:",
    SCHEMA_EXAMPLE,
  ].join("\n");
}

function llmInput(product, { tone = "tự nhiên", notes = "", faceless = true } = {}) {
  const price = product?.price || {};
  const input = {
    title: text(product?.title),
    price: priceK(price.current),
    originalPrice: priceK(price.original),
    discount: text(price.discount),
    sold: positive(product?.soldCount),
    rating: positive(product?.rating),
    reviewCount: positive(product?.reviewCount),
    shop: text(product?.shopName),
    specifications: (Array.isArray(product?.specifications) ? product.specifications : [])
      .filter(isObject).slice(0, 20).map((s) => ({ name: text(s.name), value: text(s.value) })),
    variants: (Array.isArray(product?.skus) ? product.skus : [])
      .filter(isObject).slice(0, 10).map((s) => ({ name: text(s.props), price: priceK(s.price) })),
    description: text(product?.description).slice(0, 2500),
    tone: text(tone) || "tự nhiên",
    notes: text(notes),
    faceless: faceless !== false,
  };
  for (const [k, v] of Object.entries(input)) {
    if (v === "" || v === null || (Array.isArray(v) && v.length === 0)) delete input[k];
  }
  return input;
}

export function buildMessages(product, options = {}) {
  return [
    { role: "system", content: systemPrompt(options.faceless !== false) },
    { role: "user", content: `Dữ liệu sản phẩm (JSON):\n${JSON.stringify(llmInput(product, options), null, 2)}` },
  ];
}

// Một khối văn bản để dán vào Claude/Gemini chat (chế độ thủ công).
export function buildManualPrompt(product, options = {}) {
  const [system, user] = buildMessages(product, options);
  return `${system.content}\n\n${user.content}\n\nChỉ trả về đúng một khối JSON theo schema trên, không giải thích thêm.`;
}

const LLM_TIMEOUT_MS = 45000;

// Gọi endpoint chat completions kiểu OpenAI. Trả { ok: true, text } hoặc { ok: false, reason }.
export async function callLlm(env, messages, fetchFn = fetch) {
  const url = `${String(env.LLM_BASE_URL || "").replace(/\/+$/, "")}/chat/completions`;
  const send = (withFormat) => fetchFn(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.LLM_API_KEY}` },
    body: JSON.stringify({
      model: env.LLM_MODEL,
      messages,
      temperature: 0.9,
      ...(withFormat ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });
  try {
    let res = await send(true);
    // Có model không nhận response_format: thử lại một lần không kèm nó (kết quả vẫn được đọc lỏng).
    if (res.status === 400) {
      await res.body?.cancel().catch(() => {});
      res = await send(false);
    }
    if (res.status === 429) return { ok: false, reason: "429" };
    if (!res.ok) return { ok: false, reason: `http ${res.status}` };
    let data;
    try { data = await res.json(); } catch { return { ok: false, reason: "empty" }; }
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === "string" && content.trim() ? { ok: true, text: content } : { ok: false, reason: "empty" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

// Sinh gói: thử LLM nếu đã cấu hình, không được thì dùng mẫu và ghi rõ lý do vào note.
export async function generatePackage(product, options = {}, env = {}, fetchFn = fetch, now = new Date()) {
  const opts = { ...options, now };
  const fallback = (reason) => {
    const tpl = templatePackage(product, opts);
    return { ...tpl, note: `${reason} ${tpl.note}` };
  };
  if (!env.LLM_API_KEY || !env.LLM_MODEL) return fallback("Chưa cấu hình AI (thiếu LLM_API_KEY hoặc LLM_MODEL).");

  const result = await callLlm(env, buildMessages(product, options), fetchFn);
  if (!result.ok) {
    return fallback(result.reason === "429"
      ? "AI đã hết hạn mức miễn phí (lỗi 429). Thử lại sau, hoặc dùng chế độ thủ công."
      : result.reason === "empty"
        ? "AI trả về không đúng định dạng."
        : `Không gọi được AI (${result.reason}).`);
  }
  const parsed = parseLoose(result.text);
  if (!parsed) return fallback("AI trả về không đúng định dạng.");

  const notes = tidy(options.notes);
  return {
    ...normalize(parsed, product, opts),
    source: "llm",
    model: env.LLM_MODEL,
    note: `Tạo bằng AI (${env.LLM_MODEL}).${notes ? ` Ghi chú của bạn: ${notes}` : ""}`,
  };
}
