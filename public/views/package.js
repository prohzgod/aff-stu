// Các khối gói đăng bài trên trang chi tiết (docs/spec/studio.md mục 8, khối 3–9 và thanh dính đáy).
// Nội dung gói có thể chứa chữ lấy từ trang sàn: chỉ đưa vào DOM qua h() (text node).

import { api } from "/lib/api.js";
import { h, toast } from "/lib/dom.js";
import { copyText } from "/lib/share.js";
import { captionWithHashtags, scriptToText, packageToText } from "/lib/package-text.js";
import { TEMPLATES, buildVideoPrompts } from "/lib/prompt-library.js";

const TONES = ["tự nhiên", "hài hước", "chuyên gia", "gấp gáp"];
const list = (v) => (Array.isArray(v) ? v : []);

async function copy(text) {
  toast((await copyText(String(text ?? ""))) ? "Đã copy" : "Không copy được, hãy bôi đen và copy tay");
}

const copyButton = (label, getText, attrs = {}) =>
  h("button", { class: "btn small", type: "button", ...attrs, onclick: () => copy(getText()) }, label);

function promptCard(p, useWhen) {
  return h("article", { class: "prompt" },
    h("div", { class: "prompt-head" },
      h("strong", {}, p.name),
      h("span", { class: "badge" }, p.flowMode),
    ),
    useWhen && h("p", { class: "muted" }, `Dùng khi: ${useWhen}`),
    p.ingredients && h("p", { class: "muted" }, `Ảnh nên đưa vào: ${p.ingredients}`),
    h("pre", { class: "prompt-text", tabindex: "0" }, p.prompt),
    copyButton("Copy prompt", () => p.prompt, { "data-copy": "prompt" }),
  );
}

/**
 * Vẽ gói đăng bài vào container.
 * state: { pkg, snapshot } dùng chung với trang chi tiết; snapshot() trả gói kèm phần người dùng đã sửa trên màn hình.
 * onGenerated(pkg): gọi sau mỗi lần tạo gói xong.
 */
export function renderPackage(container, product, state, { onGenerated } = {}) {
  let busy = false;
  let edited = false;
  let facelessUsed = true;
  let fields = null; // các textarea của khối 8
  let saveTimer = null;
  let saveSeq = 0;
  let saveStatus = null; // dòng "Đang lưu… / Đã lưu" của khối 8

  state.snapshot = () => {
    if (!state.pkg) return null;
    if (!fields) return state.pkg;
    return {
      ...state.pkg,
      caption: fields.caption.value.trim(),
      hashtags: fields.hashtags.value.trim().split(/\s+/).filter(Boolean),
      pinnedComment: fields.pinned.value.trim(),
    };
  };

  // ----- khối 3: tạo gói -----
  const tone = h("select", { id: "gen-tone" }, TONES.map((t) => h("option", { value: t }, t)));
  const notes = h("textarea", { id: "gen-notes", rows: "2", maxlength: "500", placeholder: "Ví dụ: nhấn mạnh quà tặng kèm" });
  const faceless = h("input", { id: "gen-faceless", type: "checkbox", checked: true });
  const button = h("button", { class: "btn primary", type: "button", "data-action": "generate", onclick: () => generate(false) }, "Tạo gói");
  const status = h("p", { class: "muted gen-note", hidden: true });
  const error = h("p", { class: "field-error", hidden: true });

  const options = () => ({ tone: tone.value, notes: notes.value, faceless: faceless.checked });

  // ----- chế độ thủ công: copy prompt sang Claude/Gemini chat, dán JSON về -----
  const manualRaw = h("textarea", { id: "manual-raw", rows: "5", spellcheck: "false", placeholder: "Dán nguyên câu trả lời của chat AI vào đây" });
  const manualError = h("p", { class: "field-error", hidden: true });
  const manualCopy = h("button", { class: "btn small", type: "button", "data-action": "copy-manual-prompt", onclick: async () => {
    manualCopy.disabled = true;
    try {
      const o = options();
      const query = new URLSearchParams({ tone: o.tone, notes: o.notes, faceless: String(o.faceless) });
      const { prompt } = await api(`/api/products/${product.id}/generate?${query}`);
      toast((await copyText(prompt)) ? "Đã copy prompt" : "Không copy được, hãy thử lại");
    } catch (err) {
      toast(err.message);
    } finally {
      manualCopy.disabled = false;
    }
  } }, "1. Copy prompt cho Claude/Gemini chat");
  const manualApply = h("button", { class: "btn small primary", type: "button", "data-action": "apply-manual", onclick: async () => {
    if (busy) return;
    manualError.hidden = true;
    if (!manualRaw.value.trim()) {
      manualError.textContent = "Chưa dán gì.";
      manualError.hidden = false;
      return;
    }
    if (hasEdits() && !confirm("Dùng kết quả này sẽ thay nội dung bạn đã sửa. Tiếp tục?")) return;
    busy = true;
    manualApply.disabled = true;
    try {
      cancelSave();
      const { package: pkg } = await api(`/api/products/${product.id}/package`, { method: "PUT", body: { raw: manualRaw.value } });
      if (!container.isConnected) return;
      state.pkg = pkg;
      edited = false;
      manualRaw.value = "";
      draw();
      onGenerated?.(pkg);
      toast("Đã dùng kết quả từ chat AI");
    } catch (err) {
      if (err.status === 401) toast(err.message);
      else {
        manualError.textContent = err.message;
        manualError.hidden = false;
      }
    } finally {
      busy = false;
      manualApply.disabled = false;
    }
  } }, "3. Dùng kết quả này");
  const manual = h("details", { class: "manual" },
    h("summary", {}, "Chế độ thủ công (Claude / Gemini chat)"),
    h("p", { class: "muted" }, "Dùng khi AI tự động hết hạn mức hoặc bạn muốn viết bằng Claude Pro. Tone, ghi chú và faceless ở trên được đưa vào prompt."),
    h("div", { class: "row wrap" }, manualCopy),
    h("div", { class: "field" }, h("label", { for: "manual-raw" }, "2. Dán kết quả JSON"), manualRaw),
    manualError,
    h("div", { class: "row wrap" }, manualApply),
  );

  const generator = h("section", { class: "card" },
    h("h2", {}, "Tạo gói đăng bài"),
    h("div", { class: "gen-grid" },
      h("div", { class: "field" }, h("label", { for: "gen-tone" }, "Tone"), tone),
      h("label", { class: "check" }, faceless, "Faceless (không có mặt người)"),
    ),
    h("div", { class: "field" }, h("label", { for: "gen-notes" }, "Ghi chú"), notes),
    error,
    h("div", { class: "row wrap" }, button, status),
    manual,
  );

  const body = h("div", { class: "pkg-body" });
  const bar = h("div", { class: "pkgbar", hidden: true },
    h("button", { class: "btn", type: "button", "data-action": "copy-caption", onclick: () => copy(captionWithHashtags(state.snapshot())) }, "Copy caption + hashtag"),
    h("button", { class: "btn primary", type: "button", "data-action": "copy-all", onclick: () => copy(packageToText(product, state.snapshot())) }, "Copy cả gói"),
  );
  container.replaceChildren(generator, body, bar);

  async function generate(auto) {
    if (busy) return;
    if (!auto && hasEdits() && !confirm("Tạo lại sẽ thay nội dung bạn đã sửa. Tiếp tục?")) return;
    cancelSave();
    busy = true;
    button.disabled = true;
    button.textContent = "Đang tạo…";
    error.hidden = true;
    try {
      const { package: pkg } = await api(`/api/products/${product.id}/generate`, {
        method: "POST",
        body: options(),
      });
      if (!container.isConnected) return;
      facelessUsed = faceless.checked;
      state.pkg = pkg;
      edited = false;
      draw();
      onGenerated?.(pkg);
      if (!auto) toast("Đã tạo gói");
    } catch (err) {
      if (err.status === 401) toast(err.message);
      else {
        error.textContent = `Không tạo được gói: ${err.message}`;
        error.hidden = false;
      }
    } finally {
      busy = false;
      button.disabled = false;
      button.textContent = state.pkg ? "Tạo lại" : error.hidden ? "Tạo gói" : "Thử lại";
    }
  }

  // ----- tự lưu phần người dùng sửa (khối 8) -----
  const hasEdits = () => edited || Boolean(state.pkg?.editedAt);

  function cancelSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    saveSeq++; // kết quả của lần lưu đang bay (nếu có) sẽ bị bỏ qua
  }

  function scheduleSave() {
    edited = true;
    clearTimeout(saveTimer);
    if (saveStatus) saveStatus.textContent = "Đang lưu…";
    saveTimer = setTimeout(save, 600);
  }

  async function save() {
    saveTimer = null;
    const snap = state.snapshot();
    if (!snap) return;
    const seq = ++saveSeq;
    try {
      const { package: pkg } = await api(`/api/products/${product.id}/package`, {
        method: "PUT",
        body: { caption: snap.caption, hashtags: snap.hashtags, pinnedComment: snap.pinnedComment },
      });
      if (seq !== saveSeq) return; // đã có thay đổi mới hơn hoặc gói đã được tạo lại
      state.pkg = { ...state.pkg, editedAt: pkg.editedAt };
      if (saveStatus) saveStatus.textContent = "Đã lưu";
    } catch (err) {
      if (seq !== saveSeq) return;
      if (err.status === 401) toast(err.message);
      if (saveStatus) saveStatus.textContent = `Chưa lưu được: ${err.message}`;
    }
  }

  // ----- khối 4–9 -----
  function hooksSection(pkg) {
    return h("section", { class: "card" },
      h("h2", {}, "Hook"),
      h("div", { class: "hooks" }, list(pkg.hooks).map((hook) => h("article", { class: "hook" },
        h("span", { class: "chip" }, hook.formula),
        h("p", { class: "hook-spoken" }, hook.spoken),
        h("p", { class: "muted" }, "Chữ màn hình: ", h("span", { class: "hook-onscreen" }, hook.onScreen)),
        h("div", { class: "row wrap" },
          copyButton("Copy lời", () => hook.spoken, { "data-copy": "spoken" }),
          copyButton("Copy chữ", () => hook.onScreen, { "data-copy": "onscreen" }),
        ),
      ))),
    );
  }

  function coverSection(pkg) {
    const texts = list(pkg.coverTexts).filter(Boolean);
    if (!texts.length) return null;
    return h("section", { class: "card" },
      h("h2", {}, "Chữ ảnh bìa"),
      h("p", { class: "muted" }, "Bấm vào để copy."),
      h("div", { class: "row wrap" }, texts.map((t) => h("button", { class: "chip cover-chip", type: "button", onclick: () => copy(t) }, t))),
    );
  }

  function promptsSection(pkg) {
    const hooks = list(pkg.hooks);
    const suggested = h("div", { "data-panel": "suggested", class: "prompts" }, list(pkg.videoPrompts).map((p) => promptCard(p)));

    const hookSelect = h("select", { id: "lib-hook" }, hooks.map((hook, i) => h("option", { value: String(i) }, `${hook.formula}: ${hook.spoken}`)));
    const setting = h("input", { id: "lib-setting", type: "text", placeholder: "Để trống = theo ngành hàng (viết tiếng Anh)" });
    const surface = h("input", { id: "lib-surface", type: "text", placeholder: "Để trống = theo ngành hàng (viết tiếng Anh)" });
    const onlyFaceless = h("input", { id: "lib-faceless", type: "checkbox", checked: facelessUsed });
    const results = h("div", { class: "prompts" });
    const drawLibrary = () => {
      const prompts = buildVideoPrompts(product, {
        faceless: onlyFaceless.checked,
        hookLine: hooks[Number(hookSelect.value)]?.spoken || "",
        overrides: { setting: setting.value, surface: surface.value },
      });
      results.replaceChildren(...prompts.map((p) => promptCard(p, TEMPLATES.find((t) => t.id === p.id)?.useWhen)));
    };
    for (const el of [hookSelect, onlyFaceless]) el.addEventListener("change", drawLibrary);
    for (const el of [setting, surface]) el.addEventListener("input", drawLibrary);
    drawLibrary();

    const library = h("div", { "data-panel": "library", hidden: true },
      h("div", { class: "gen-grid" },
        hooks.length > 0 && h("div", { class: "field" }, h("label", { for: "lib-hook" }, "Hook làm lời thoại"), hookSelect),
        h("label", { class: "check" }, onlyFaceless, "Chỉ mẫu faceless"),
        h("div", { class: "field" }, h("label", { for: "lib-setting" }, "Bối cảnh"), setting),
        h("div", { class: "field" }, h("label", { for: "lib-surface" }, "Bề mặt đặt sản phẩm"), surface),
      ),
      results,
    );

    const tabs = [["suggested", "Đề xuất", suggested], ["library", "Thư viện mẫu", library]].map(([id, label, panel]) => {
      const tab = h("button", { class: "tab", type: "button", role: "tab", "data-tab": id, "aria-selected": id === "suggested" ? "true" : "false" }, label);
      tab.addEventListener("click", () => {
        for (const other of tabs) {
          other.tab.setAttribute("aria-selected", String(other.tab === tab));
          other.panel.hidden = other.tab !== tab;
        }
      });
      return { tab, panel };
    });

    return h("section", { class: "card" },
      h("h2", {}, "Prompt Google Flow"),
      h("p", { class: "muted" }, "Mỗi prompt là một clip khoảng 8 giây, tỉ lệ 9:16. Tải bản 720p từ Flow."),
      h("div", { class: "tabs", role: "tablist" }, tabs.map((t) => t.tab)),
      suggested,
      library,
    );
  }

  function scriptSection(pkg) {
    const beats = list(pkg.script);
    if (!beats.length) return null;
    return h("section", { class: "card" },
      h("div", { class: "row" }, h("h2", {}, "Kịch bản"), copyButton("Copy kịch bản", () => scriptToText(pkg), { class: "btn small push" })),
      h("div", { class: "beats" },
        h("div", { class: "beat beat-head", "aria-hidden": "true" }, h("span", {}, "Thời gian"), h("span", {}, "Hình"), h("span", {}, "Lời"), h("span", {}, "Chữ")),
        beats.map((b) => h("div", { class: "beat" },
          h("span", { class: "beat-time" }, b.time),
          h("span", { "data-label": "Hình" }, b.visual),
          h("span", { "data-label": "Lời" }, b.voiceover),
          h("span", { "data-label": "Chữ" }, b.onScreen || "—"),
        )),
      ),
    );
  }

  function postSection(pkg) {
    const field = (id, label, value, rows) => {
      const area = h("textarea", { id, rows: String(rows) });
      area.value = value;
      area.addEventListener("input", scheduleSave);
      return { area, node: h("div", { class: "field" },
        h("div", { class: "row" }, h("label", { for: id }, label), copyButton("Copy", () => area.value.trim(), { class: "btn small push" })),
        area,
      ) };
    };
    const caption = field("pkg-caption", "Caption", pkg.caption || "", 3);
    const hashtags = field("pkg-hashtags", "Hashtag", list(pkg.hashtags).join(" "), 2);
    const pinned = field("pkg-pinned", "Bình luận ghim", pkg.pinnedComment || "", 2);
    fields = { caption: caption.area, hashtags: hashtags.area, pinned: pinned.area };
    return h("section", { class: "card" },
      h("h2", {}, "Gói đăng bài"),
      caption.node, hashtags.node, pinned.node,
      (saveStatus = h("p", { class: "hint save-status", role: "status" }, pkg.editedAt ? "Đã lưu" : "Sửa ở đây sẽ tự lưu.")),
    );
  }

  function warningsSection(pkg) {
    const warnings = list(pkg.warnings).filter(Boolean);
    if (!warnings.length) return null;
    return h("section", { class: "card warnings" }, h("h2", {}, "Lưu ý"), h("ul", {}, warnings.map((w) => h("li", {}, w))));
  }

  function draw() {
    const pkg = state.pkg;
    fields = null;
    saveStatus = null;
    bar.hidden = !pkg;
    button.textContent = pkg ? "Tạo lại" : "Tạo gói";
    status.hidden = !pkg?.note;
    status.textContent = pkg?.note || "";
    if (!pkg) return body.replaceChildren();
    body.replaceChildren(...[hooksSection(pkg), coverSection(pkg), promptsSection(pkg), scriptSection(pkg), postSection(pkg), warningsSection(pkg)].filter(Boolean));
  }

  draw();
  if (!state.pkg) generate(true); // lần đầu mở mà chưa có gói thì tự tạo
}
