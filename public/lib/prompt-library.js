// Thư viện mẫu prompt cho Google Flow (Veo 3.1). Dùng chung cho trình duyệt và Pages Functions:
// module thuần, không đụng DOM, không import gì.
// Quy ước (docs/spec/studio.md mục 7): prompt tiếng Anh, lời thoại tiếng Việt trong ngoặc kép,
// mỗi prompt một clip ≤ 8 giây, 9:16, kết thúc bằng NEGATIVE.

export const NEGATIVE =
  "Avoid: warped or changing label text, extra fingers, distorted hands, packaging that changes shape or color, subtitles, captions, watermarks, logos other than the product's own.";

const CONSISTENT = "Keep the label text and packaging consistent with the reference image.";
const ONE_IMAGE = "Ảnh 1 (sản phẩm)";
const WITH_PERSON = "Ảnh 1 (sản phẩm) + ảnh nhân vật (nếu có)";

export const CATEGORIES = ["beauty", "kitchen", "tech", "fashion", "home", "general"];

// Thứ tự kiểm quan trọng: "bàn phím" phải ra tech trước khi "bàn" ra home,
// "hộp đựng thực phẩm" ra kitchen trước "hộp đựng", "kệ để giày" ra home trước "giày".
const KEYWORDS = [
  ["beauty", ["tinh chất", "serum", "kem dưỡng", "dưỡng da", "dưỡng ẩm", "sữa rửa mặt", "toner", "nước hoa hồng", "mặt nạ", "son", "chống nắng", "tẩy trang", "mỹ phẩm", "dầu gội", "sữa tắm", "nước hoa", "skincare", "makeup", "phấn", "mascara", "kem nền", "cushion", "lotion"]],
  ["kitchen", ["nồi", "chảo", "bếp", "máy xay", "dao", "thớt", "hộp đựng thực phẩm", "bình giữ nhiệt", "ly", "cốc", "chén", "bát", "đĩa", "muỗng", "lò vi sóng", "máy ép", "ấm siêu tốc", "kitchen"]],
  ["tech", ["tai nghe", "bluetooth", "sạc", "cáp", "điện thoại", "loa", "chuột", "bàn phím", "pin dự phòng", "đồng hồ thông minh", "camera", "usb", "laptop", "ốp lưng", "smartwatch"]],
  ["home", ["kệ", "tủ", "ghế", "bàn", "đèn", "chăn", "ga giường", "gối", "nệm", "rèm", "thảm", "móc treo", "hộp đựng", "giá treo", "máy hút bụi", "quạt", "lau nhà"]],
  ["fashion", ["áo", "quần", "váy", "đầm", "giày", "dép", "túi xách", "balo", "mũ", "nón", "kính", "thắt lưng", "vớ", "tất", "đồ lót"]],
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// \b không hiểu chữ có dấu, nên tự dựng ranh giới từ bằng lớp ký tự Unicode.
const MATCHERS = KEYWORDS.map(([category, words]) => [
  category,
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.map(escapeRe).join("|")})(?![\\p{L}\\p{N}])`, "iu"),
]);

function categoryOf(text) {
  const s = String(text ?? "");
  for (const [category, re] of MATCHERS) if (re.test(s)) return category;
  return null;
}

export function detectCategory(title, description = "") {
  return categoryOf(title) || categoryOf(description) || "general";
}

const firstWords = (s, n) => s.trim().split(/\s+/).filter(Boolean).slice(0, n).join(" ");

export function shortName(title) {
  const original = String(title ?? "").trim();
  let s = original
    .replace(/\([^)]*\)|\[[^\]]*\]|【[^】]*】/g, " ")
    .replace(/^\s*(?:combo|set)\s+/i, "");
  // Cắt tại dấu ngăn cách đầu tiên. Gạch nối chỉ tính khi có khoảng trắng bên cạnh, để "T-shirt" còn nguyên.
  s = s.split(/[|,+]|\s-|-\s/)[0];
  return firstWords(s, 7) || firstWords(original, 7);
}

// Giá trị tiếng Anh đi vào prompt; riêng pain tiếng Việt đi vào hook.
export const CATEGORY_DEFAULTS = {
  beauty: {
    creator: "a Vietnamese woman in her twenties with natural makeup",
    setting: "a bright bathroom vanity",
    surface: "a white marble countertop",
    usage: "dispense a small amount and smooth it over the back of one hand",
    hands: "open the cap and press out a small amount to show the texture",
    palette: "soft pastel tones",
    pain: "skincare mãi mà da vẫn chưa ưng",
  },
  kitchen: {
    creator: "a young Vietnamese home cook",
    setting: "a tidy modern kitchen",
    surface: "a wooden kitchen counter",
    usage: "use it once to prepare a simple dish",
    hands: "demonstrate the main function once, slowly",
    palette: "warm natural tones",
    pain: "nấu nướng mỗi ngày tốn thời gian quá",
  },
  tech: {
    creator: "a young Vietnamese office worker",
    setting: "a minimal desk setup",
    surface: "a dark matte desk",
    usage: "connect it and use it for a moment",
    hands: "press the main button and show it switching on",
    palette: "cool neutral tones with a subtle blue accent",
    pain: "đồ công nghệ cũ dùng bực mình hoài",
  },
  fashion: {
    creator: "a stylish young Vietnamese adult",
    setting: "a bright bedroom with a full-length mirror",
    surface: "a clean white bedsheet",
    usage: "hold it up and adjust how it sits",
    hands: "unfold it and run fingers along the fabric to show the material",
    palette: "clean neutral tones",
    pain: "mặc hoài mấy bộ cũ chán ghê",
  },
  home: {
    creator: "a young Vietnamese homemaker",
    setting: "a cozy, tidy living room",
    surface: "a light wooden floor",
    usage: "set it in place and use it once",
    hands: "position it and point out the key detail",
    palette: "warm cozy tones",
    pain: "nhà cửa bừa bộn, thiếu chỗ để đồ",
  },
  general: {
    creator: "a friendly young Vietnamese adult",
    setting: "a bright, tidy room at home",
    surface: "a clean white table",
    usage: "pick it up and use it once as intended",
    hands: "turn it around and show the main detail up close",
    palette: "clean neutral tones",
    pain: "tìm hoài chưa ra món ưng ý",
  },
};

export const TEMPLATES = [
  {
    id: "ugc_testimonial",
    name: "UGC review nói trước camera",
    flowMode: "Ingredients to Video",
    faceless: false,
    ingredients: WITH_PERSON,
    useWhen: "Hook trải nghiệm cá nhân",
    template:
      `Vertical 9:16 selfie-style medium close-up of {creator} in {setting}, holding {product_visual} up at shoulder height so the label points at the lens. The speaker looks straight into the camera and says in Vietnamese: {hook_line} Then a small smile and a slight tilt of the product toward the lens. Handheld phone-camera feel with slight natural shake, soft daylight, {palette}, authentic user-generated look. Audio: clear natural voice, light room tone, no music. ${CONSISTENT}`,
  },
  {
    id: "problem_solution",
    name: "Vấn đề → Giải pháp (2 shot)",
    flowMode: "Ingredients to Video",
    faceless: false,
    ingredients: WITH_PERSON,
    useWhen: "Hook nỗi đau",
    template:
      `Vertical 9:16, two quick shots in {setting}. Shot 1: {creator} looks mildly frustrated with an everyday hassle, turns to the camera and says in Vietnamese: {hook_line} Shot 2: the same person picks up {product_visual} and shows the label to the camera, then the hands {usage}, and the expression turns relaxed. Handheld medium shots, natural light, {palette}, relatable everyday tone. Audio: clear natural voice, soft background music. ${CONSISTENT}`,
  },
  {
    id: "unboxing",
    name: "Mở hộp → dùng thử (chỉ tay)",
    flowMode: "Ingredients to Video",
    faceless: true,
    ingredients: ONE_IMAGE,
    useWhen: "Deal, hàng mới, quà kèm",
    template:
      `Vertical 9:16 top-down shot on {surface}, only hands visible. The hands slide a sealed parcel into frame, cut the tape and lift out {product_visual}, then turn it slowly so the front label catches the light and set it down next to the open box. Slight handheld feel with a gentle push-in on the reveal, natural window light, {palette}, crisp and satisfying. Audio: paper rustle, tape peel, soft upbeat background music, no voice. ${CONSISTENT}`,
  },
  {
    id: "how_it_works",
    name: "Demo 3 bước chỉ tay, ASMR",
    flowMode: "Ingredients to Video",
    faceless: true,
    ingredients: ONE_IMAGE,
    useWhen: "Kênh faceless, nhấn kết cấu/cách dùng",
    template:
      `Vertical 9:16 overhead close-up on {surface}, only hands visible. Step 1: the hands pick up {product_visual} and show the label. Step 2: the hands {hands}. Step 3: the product is placed back down beside its packaging for a clean final shot. Smooth stable camera, macro detail on texture, soft diffused light, {palette}, ASMR-style satisfying feel. Audio: subtle product sounds, gentle background music, no voice. ${CONSISTENT}`,
  },
  {
    id: "product_hero",
    name: "Push-in + orbit 180°",
    flowMode: "Frames to Video",
    faceless: true,
    ingredients: "Ảnh 1 (sản phẩm) làm frame đầu",
    useWhen: "B-roll mở/kết",
    template:
      `Vertical 9:16 studio product shot that starts from the reference frame. {product_visual} stands centered on {surface}, with no people in frame. Slow push-in, then a smooth 180-degree orbit around the product, ending on a clean front view with empty space above it for text. Soft key light with a gentle rim highlight, shallow depth of field, {palette}, premium commercial look. Audio: soft whoosh and minimal ambient music, no voice. ${CONSISTENT}`,
  },
  {
    id: "lifestyle_broll",
    name: "Đang sử dụng, từ vai xuống",
    flowMode: "Ingredients to Video",
    faceless: true,
    ingredients: ONE_IMAGE,
    useWhen: "Chèn giữa video lồng tiếng/TTS",
    template:
      `Vertical 9:16 medium close-up in {setting}, framed from the shoulders down so only the torso and hands are visible. {product_visual} is being used in an unhurried, natural way: the hands {usage}. Slow sideways slide of the camera, shallow depth of field, warm natural light, {palette}, calm everyday lifestyle feel. Audio: quiet room ambience and light background music, no voice. ${CONSISTENT}`,
  },
  {
    id: "before_after",
    name: "Trước/Sau tinh tế",
    flowMode: "Ingredients to Video",
    faceless: false,
    ingredients: WITH_PERSON,
    useWhen: "Chỉ khi kết quả thấy được; mỹ phẩm chỉ nói cảm nhận",
    template:
      `Vertical 9:16, two moments in {setting}. First moment: {creator} in flat, dull light, looking unsure. Second moment: the same person in brighter, flattering light, holding {product_visual} with a relaxed, confident look, and says in Vietnamese: {hook_line} Keep the change subtle and believable, with no exaggerated transformation. Static camera for both moments, {palette}. Audio: clear natural voice, gentle background music. ${CONSISTENT}`,
  },
];

export function fillTemplate(template, slots) {
  return template.replace(/\{([a-z_]+)\}/g, (_, name) => {
    const value = slots[name];
    if (value == null || value === "") throw new Error(`Thiếu slot: ${name}`);
    return value;
  });
}

export function buildVideoPrompts(product, { faceless = true, hookLine = "", overrides = {} } = {}) {
  const name = shortName(product?.title);
  const defaults = CATEGORY_DEFAULTS[detectCategory(product?.title, product?.description)];
  const custom = Object.fromEntries(
    Object.entries(overrides || {}).filter(([, v]) => typeof v === "string" && v.trim() !== ""),
  );
  // Lời thoại nằm trong ngoặc kép của prompt, nên bỏ ngoặc kép có sẵn trong câu.
  const line = String(hookLine || `Mọi người xem thử ${name || "món này"} nè`).replace(/["“”]/g, "").trim();
  const slots = {
    ...defaults,
    ...custom,
    product_visual: `the ${name || "product"} exactly as shown in the reference image`,
    hook_line: `"${line}"`,
  };
  return TEMPLATES.filter((t) => !faceless || t.faceless).map((t) => ({
    id: t.id,
    name: t.name,
    flowMode: t.flowMode,
    ingredients: t.ingredients,
    prompt: `${fillTemplate(t.template, slots)} ${NEGATIVE}`,
  }));
}
