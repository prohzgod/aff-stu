// Màn hình dựng video (#/p/{id}/edit): nhập clip, sắp thứ tự, cắt, xem trước, xuất MP4 1080x1920, lưu lên kho.
// Chỉ được nạp khi vào route này, để trang Studio không nặng thêm.

import { api } from "/lib/api.js";
import { h, toast } from "/lib/dom.js";
import { askNotifyPermission, notifyDone } from "/lib/notify.js";
import { mediaUrl } from "/lib/format.js";
import { canShareFiles, shareFiles, downloadBlob } from "/lib/share.js";
import { slug } from "/lib/package-text.js";
import { shortName } from "/lib/prompt-library.js";
import {
  OUTPUT, LIMITS, segmentDuration, totalDuration, clampTrim, moveSegment, validateTimeline, locate, kenBurnsScale, outputFps, headSegments,
} from "./timeline.js";
import {
  DEFAULT_VOICE_URL, CLIP_GAIN, CLIP_VOLUME_LABELS, SPEED, createVoiceClient, healthProblem, normalizeVoiceover, scriptText, voiceStart, voiceOverrun, cuesToLines,
} from "./voice.js";
import { composeFrame } from "./compose.js";
import { activeOverlays, defaultOverlays, drawTikTokUi } from "./overlays.js";
import { loadFonts } from "./fonts.js";
import { SUBTITLE_STYLES, wordsToLines, linesFromText, activeLine, toSrt, nudgeLine, splitLine, mergeLines, setLineText } from "./subtitles.js";
import { putClip, getClip, deleteClip, pruneOldClips } from "./local-clips.js";
import { createWorker } from "./worker-client.js";

const IMAGE_SECONDS = 2;
const seconds = (v) => `${v.toFixed(1)}s`;
const COMPARE_SECONDS = 2;
const estimate = (v) => (v < 90 ? `${Math.max(1, Math.round(v))} giây` : `${Math.round(v / 60)} phút`);
const newId = () => Math.random().toString(36).slice(2, 10);

// ---------- màn hình ----------

export function renderEditor(container, product, pkg = null) {
  const storeKey = `edit:${product.id}`;
  const worker = createWorker();
  const sources = new Map(); // sourceId → { blob, url, el }  (el: <video> hoặc <img> dùng cho xem trước)
  let segments = [];
  let brand = { handle: "", position: "tl", watermark: true, logo: null };
  let logoImage = null, logoBlob = null;
  let useWatermark = true;
  let overlays = defaultOverlays(product, pkg);
  let showTikTok = false;
  let subtitles = { enabled: true, style: "karaoke", lines: [], sig: "" };
  let voiceover = normalizeVoiceover({ text: scriptText(pkg) });
  let voiceBlob = null, voiceUrl = "";
  const voiceAudio = h("audio", { class: "voice-audio", controls: true, preload: "auto" });
  let canExport = false;
  let exporting = false;
  let result = null; // { blob, url, info }
  let quality = "standard"; // chế độ xuất: "standard" (Chuẩn) | "ai" (Enhance AI, chỉ khi thiết bị có WebGPU)
  let compareUrls = [];
  let wakeLock = null;

  // ----- phần tử cố định -----
  const fileInput = h("input", { id: "ed-files", type: "file", accept: "video/*,image/*", multiple: true, hidden: true });
  const notice = h("p", { class: "field-error", hidden: true });
  const listEl = h("div", { class: "seg-list" });
  const summary = h("p", { class: "muted ed-summary" });
  const problems = h("p", { class: "field-error", hidden: true });
  const canvas = h("canvas", { class: "ed-canvas", width: String(OUTPUT.width), height: String(OUTPUT.height) });
  const ctx = canvas.getContext("2d", { alpha: false });
  const playButton = h("button", { class: "btn", type: "button", "data-action": "play" }, "▶ Xem trước");
  const timeLabel = h("span", { class: "muted ed-time" }, "0.0s");
  const markToggle = h("input", { id: "ed-watermark", type: "checkbox", checked: true });
  const markRow = h("label", { class: "check", hidden: true }, markToggle, "Watermark");
  const exportButton = h("button", { class: "btn primary", type: "button", "data-action": "export", disabled: true }, "Xuất video 1080x1920");
  const cancelButton = h("button", { class: "btn", type: "button", "data-action": "cancel-export", hidden: true }, "Huỷ");
  const progress = h("progress", { class: "ed-progress", max: "1", value: "0", hidden: true });
  const progressLabel = h("span", { class: "muted", hidden: true });
  const resultBox = h("section", { class: "card ed-result", hidden: true });
  const compareBox = h("section", { class: "card ed-compare", hidden: true });
  const qualityRadio = (value, label) => h("label", { class: "check small" },
    h("input", { type: "radio", name: "ed-quality", value, checked: value === quality, onchange: () => { quality = value; } }), label);
  const compareButton = h("button", { class: "btn small", type: "button", "data-action": "compare", disabled: true }, `So sánh ${COMPARE_SECONDS} giây đầu`);
  // Chỉ hiện khi thiết bị có WebGPU; không có thì luôn xuất chế độ Chuẩn.
  const qualityBox = h("div", { class: "ed-quality", hidden: true },
    h("div", { class: "row wrap" }, h("strong", {}, "Chất lượng"), qualityRadio("standard", "Chuẩn (nhanh)"), qualityRadio("ai", "Enhance AI (nét hơn, chậm hơn nhiều)")),
    h("div", { class: "row wrap" }, compareButton),
  );
  const syncLabel = h("span", { class: "muted ed-sync", role: "status" });
  const overlayBox = h("section", { class: "card ed-overlays" });
  const coverBox = h("section", { class: "card ed-cover", hidden: true });
  const subsBox = h("section", { class: "card ed-subs" });
  const voiceBox = h("section", { class: "card ed-voice" });
  const coverButton = h("button", { class: "btn", type: "button", "data-action": "open-cover", onclick: openCover }, "🖼 Tạo ảnh bìa");
  const tiktokToggle = h("input", { id: "ed-tiktok", type: "checkbox" });
  tiktokToggle.addEventListener("change", () => { showTikTok = tiktokToggle.checked; if (!playing) drawCurrent(); });

  const productMedia = [
    ...(Array.isArray(product.images) ? product.images : []).filter((im) => im?.stored).map((im, i) => ({ label: `Ảnh ${i + 1}`, key: im.stored, kind: "image" })),
    ...Object.values(product.videos || {}).filter((v) => v?.stored).map((v) => ({ label: "Video sản phẩm", key: v.stored, kind: "clip" }))
      .filter((v, i, all) => all.findIndex((x) => x.key === v.key) === i),
  ];
  const drop = h("div", { class: "ed-drop" },
    h("p", {}, "Kéo clip từ Google Flow và ảnh vào đây, hoặc"),
    h("div", { class: "row wrap" },
      h("button", { class: "btn primary", type: "button", onclick: () => fileInput.click() }, "＋ Chọn file"),
      productMedia.map((m) => h("button", { class: "btn small", type: "button", "data-add": m.key, onclick: (e) => addFromStore(m, e.currentTarget) }, `＋ ${m.label}`)),
    ),
    h("p", { class: "hint" }, `Clip chỉ nằm trên thiết bị này, không tải lên máy chủ. Tối đa ${LIMITS.maxSegments} đoạn, ${LIMITS.maxSeconds} giây.`),
    fileInput,
  );

  container.replaceChildren(
    h("a", { class: "back", href: `#/p/${product.id}` }, "‹ Về sản phẩm"),
    h("section", { class: "card" }, h("h1", {}, "Dựng video"), h("p", { class: "muted" }, product.title), notice, drop),
    h("div", { class: "ed-main" },
      h("div", { class: "ed-left" },
        h("section", { class: "card ed-timeline" }, h("div", { class: "row" }, h("h2", {}, "Các đoạn"), h("span", { class: "push" }, syncLabel)), listEl, summary, problems),
        overlayBox,
        voiceBox,
        subsBox,
        coverBox,
      ),
      h("section", { class: "card ed-preview" },
        h("h2", {}, "Xem trước"),
        canvas,
        h("div", { class: "row wrap" }, playButton, timeLabel),
        h("div", { class: "row wrap" }, markRow, h("label", { class: "check" }, tiktokToggle, "Xem lớp UI TikTok")),
        h("div", { class: "row wrap" }, coverButton),
        qualityBox,
        h("div", { class: "row wrap" }, exportButton, cancelButton, progress, progressLabel),
      ),
    ),
    compareBox,
    resultBox,
  );

  // ----- lưu trạng thái trên thiết bị -----
  // Lưu ngay trên thiết bị, rồi đẩy lên máy chủ (edit.json) sau khi ngừng sửa 1,5 giây để mở tiếp được trên máy khác.
  let loaded = false;      // chưa khôi phục xong thì không ghi đè gì
  let updatedAt = null;
  let syncTimer = null;
  const snapshot = () => ({ segments, useWatermark, overlays, subtitles, voiceover });
  const saveLocal = (dirty) => {
    try { localStorage.setItem(storeKey, JSON.stringify({ ...snapshot(), updatedAt, dirty })); } catch { /* đầy bộ nhớ: bỏ qua */ }
  };
  async function pushEdit() {
    syncTimer = null;
    const sent = JSON.stringify(snapshot());
    try {
      const { edit } = await api(`/api/products/${product.id}/edit`, { method: "PUT", body: sent });
      if (sent !== JSON.stringify(snapshot())) return; // đã sửa tiếp trong lúc gửi: lần gửi sau sẽ lo
      updatedAt = edit.updatedAt;
      saveLocal(false);
      syncLabel.textContent = "Đã đồng bộ";
    } catch (err) {
      syncLabel.textContent = err.status === 401 ? "Chưa đồng bộ: token không đúng" : "Chưa đồng bộ được (vẫn lưu trên thiết bị này)";
    }
  }
  const persist = () => {
    if (!loaded) return;
    updatedAt = new Date().toISOString();
    saveLocal(true);
    syncLabel.textContent = "Đang đồng bộ…";
    clearTimeout(syncTimer);
    syncTimer = setTimeout(pushEdit, 1500);
  };

  function setSegments(next, { keepResult = false } = {}) {
    segments = next;
    if (!keepResult) clearResult();
    persist();
    drawList();
    drawSubsBox();
    drawVoiceBox();
    stop();
    showAt(Math.min(time, Math.max(0, totalDuration(segments) - 0.01)));
  }

  // ----- nguồn hình cho xem trước -----
  function attach(sourceId, blob, kind) {
    const url = URL.createObjectURL(blob);
    const el = kind === "clip"
      ? Object.assign(document.createElement("video"), { src: url, preload: "auto", playsInline: true, muted: true })
      : Object.assign(new Image(), { src: url });
    el.addEventListener(kind === "clip" ? "seeked" : "load", () => { if (!playing) drawCurrent(); });
    if (kind === "clip") el.addEventListener("loadeddata", () => { if (!playing) drawCurrent(); });
    sources.set(sourceId, { blob, url, el });
  }

  async function addBlob(blob, name, origin) {
    if (segments.length >= LIMITS.maxSegments) throw new Error(`Tối đa ${LIMITS.maxSegments} đoạn.`);
    if (blob.size > LIMITS.maxFileBytes) throw new Error(`"${name}" lớn hơn 200MB.`);
    const info = await worker.probe(blob);
    const sourceId = newId();
    attach(sourceId, blob, info.kind);
    if (!origin.r2Key) await putClip(product.id, sourceId, blob, name).catch(() => {});
    const common = { id: newId(), name, sourceId, r2Key: origin.r2Key || null, width: info.width, height: info.height, fit: "cover" };
    return info.kind === "clip"
      ? { ...common, type: "clip", srcDuration: info.duration, fps: info.fps, hasAudio: info.hasAudio, in: 0, out: Math.round(info.duration * 1000) / 1000, muted: false }
      : { ...common, type: "image", duration: IMAGE_SECONDS, kenBurns: true };
  }

  async function addFiles(files) {
    const added = [];
    const failed = [];
    for (const file of files) {
      try {
        added.push(await addBlob(file, file.name, {}));
        segments = [...segments, added.at(-1)]; // để giới hạn số đoạn tính đúng trong cùng một lượt
      } catch (err) {
        failed.push(`${file.name}: ${err.message}`);
      }
    }
    if (added.length) setSegments(segments);
    if (failed.length) toast(failed[0]);
  }

  async function addFromStore(item, button) {
    button.disabled = true;
    try {
      const res = await fetch(`/media/${item.key}`);
      if (!res.ok) throw new Error("Không tải được file từ kho");
      const seg = await addBlob(await res.blob(), item.label, { r2Key: item.key });
      setSegments([...segments, seg]);
    } catch (err) {
      toast(err.message);
    } finally {
      button.disabled = false;
    }
  }

  fileInput.addEventListener("change", () => { addFiles([...fileInput.files]); fileInput.value = ""; });
  for (const type of ["dragenter", "dragover"]) drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add("over"); });
  for (const type of ["dragleave", "drop"]) drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.remove("over"); });
  drop.addEventListener("drop", (e) => addFiles([...(e.dataTransfer?.files || [])].filter((f) => /^(video|image)\//.test(f.type))));

  // ----- danh sách đoạn -----
  let dragFrom = null;
  function drawList() {
    listEl.replaceChildren(...segments.map((seg, index) => segmentRow(seg, index)));
    if (!segments.length) listEl.append(h("p", { class: "muted" }, "Chưa có đoạn nào."));
    const total = totalDuration(segments);
    summary.textContent = segments.length ? `${segments.length} đoạn · ${seconds(total)}` : "";
    const errors = segments.length ? validateTimeline(segments) : [];
    const missing = segments.some((s) => !sources.has(s.sourceId));
    const voiceMissing = voiceover.enabled && voiceover.sourceId && !voiceBlob;
    problems.textContent = errors[0] || (missing ? "Có đoạn thiếu file. Chọn lại file cho đoạn đó hoặc xoá đoạn." : "")
      || (voiceMissing ? "Thiếu file giọng đọc trên thiết bị này. Tạo lại giọng đọc, hoặc bỏ chọn \"Dùng giọng đọc trong video\"." : "");
    problems.hidden = !problems.textContent;
    exportButton.disabled = exporting || !canExport || !segments.length || errors.length > 0 || missing || voiceMissing;
    compareButton.disabled = exportButton.disabled;
  }

  function update(index, change) {
    setSegments(segments.map((s, i) => (i === index ? change(s) : s)));
  }

  function numberField(label, value, attrs, onChange) {
    const input = h("input", { type: "number", step: "0.1", min: "0", value: String(value), "aria-label": label, ...attrs });
    input.addEventListener("change", () => onChange(Number(input.value)));
    return h("label", { class: "seg-num" }, h("span", {}, label), input);
  }

  function segmentRow(seg, index) {
    const src = sources.get(seg.sourceId);
    const thumb = !src
      ? h("div", { class: "seg-thumb missing" }, "?")
      : seg.type === "clip"
        ? h("video", { class: "seg-thumb", src: `${src.url}#t=${seg.in + 0.05}`, muted: true, playsinline: true, preload: "metadata" })
        : h("img", { class: "seg-thumb", src: src.url, alt: "" });

    const controls = [];
    if (!src) {
      const relink = h("input", { type: "file", accept: seg.type === "clip" ? "video/*" : "image/*", hidden: true });
      relink.addEventListener("change", async () => {
        const file = relink.files[0];
        if (!file) return;
        attach(seg.sourceId, file, seg.type);
        await putClip(product.id, seg.sourceId, file, file.name).catch(() => {});
        setSegments(segments.slice());
      });
      controls.push(h("p", { class: "field-error" }, "Thiếu clip, chọn lại file."), relink, h("button", { class: "btn small", type: "button", onclick: () => relink.click() }, "Chọn lại file"));
    } else if (seg.type === "clip") {
      controls.push(
        numberField("Từ giây", seg.in, { max: String(seg.srcDuration), "data-field": "in" }, (v) => update(index, (s) => clampTrim(s, { in: v }))),
        numberField("Đến giây", seg.out, { max: String(seg.srcDuration), "data-field": "out" }, (v) => update(index, (s) => clampTrim(s, { out: v }))),
      );
      if (seg.hasAudio) {
        const mute = h("input", { type: "checkbox", checked: seg.muted, "data-field": "muted" });
        mute.addEventListener("change", () => update(index, (s) => ({ ...s, muted: mute.checked })));
        controls.push(h("label", { class: "check small" }, mute, "Tắt tiếng"));
      }
    } else {
      controls.push(numberField("Hiện trong (giây)", seg.duration, { max: "10", "data-field": "duration" }, (v) => update(index, (s) => clampTrim(s, { duration: v }))));
      const kb = h("input", { type: "checkbox", checked: seg.kenBurns });
      kb.addEventListener("change", () => update(index, (s) => ({ ...s, kenBurns: kb.checked })));
      controls.push(h("label", { class: "check small" }, kb, "Phóng nhẹ"));
    }
    if (src) {
      const fit = h("select", { "aria-label": "Kiểu vừa khung", "data-field": "fit" },
        h("option", { value: "cover", selected: seg.fit === "cover" }, "Lấp đầy khung"),
        h("option", { value: "blur", selected: seg.fit === "blur" }, "Nằm gọn, nền mờ"),
      );
      fit.addEventListener("change", () => update(index, (s) => ({ ...s, fit: fit.value })));
      controls.push(fit);
    }

    const move = (to) => setSegments(moveSegment(segments, index, to));
    const row = h("article", { class: "seg", draggable: "true", "data-index": String(index) },
      thumb,
      h("div", { class: "seg-body" },
        h("div", { class: "seg-head" },
          h("strong", { class: "seg-name" }, `${index + 1}. ${seg.name}`),
          h("span", { class: "badge" }, seconds(segmentDuration(seg))),
        ),
        h("div", { class: "seg-controls" }, controls),
      ),
      h("div", { class: "seg-actions" },
        h("button", { class: "btn small", type: "button", "aria-label": "Chuyển lên", "data-move": "up", disabled: index === 0, onclick: () => move(index - 1) }, "↑"),
        h("button", { class: "btn small", type: "button", "aria-label": "Chuyển xuống", "data-move": "down", disabled: index === segments.length - 1, onclick: () => move(index + 1) }, "↓"),
        h("button", { class: "btn small danger", type: "button", "aria-label": "Xoá đoạn", "data-remove": "", onclick: () => removeSegment(index) }, "✕"),
      ),
    );
    row.addEventListener("dragstart", () => { dragFrom = index; row.classList.add("dragging"); });
    row.addEventListener("dragend", () => { dragFrom = null; row.classList.remove("dragging"); });
    row.addEventListener("dragover", (e) => e.preventDefault());
    row.addEventListener("drop", (e) => { e.preventDefault(); if (dragFrom !== null && dragFrom !== index) move2(dragFrom, index); });
    return row;
  }
  const move2 = (from, to) => setSegments(moveSegment(segments, from, to));

  function removeSegment(index) {
    const seg = segments[index];
    const next = segments.filter((_, i) => i !== index);
    if (!next.some((s) => s.sourceId === seg.sourceId)) {
      const src = sources.get(seg.sourceId);
      if (src) URL.revokeObjectURL(src.url);
      sources.delete(seg.sourceId);
      deleteClip(product.id, seg.sourceId).catch(() => {});
    }
    setSegments(next);
  }

  // ----- xem trước -----
  let time = 0, playing = false, raf = 0, clock = 0, activeVideo = null;

  const watermark = () => (useWatermark && brand.watermark && (logoImage || brand.handle) ? { handle: brand.handle, logo: logoImage, position: brand.position } : null);

  let bare = false; // true khi chụp frame làm nền ảnh bìa: chỉ vẽ hình, không chữ, không watermark
  function drawSegment(seg, offset) {
    const src = seg && sources.get(seg.sourceId);
    let source = null;
    if (src) {
      const el = src.el;
      const [width, height] = seg.type === "clip" ? [el.videoWidth, el.videoHeight] : [el.naturalWidth, el.naturalHeight];
      if (width && height) source = { width, height, draw: (c, x, y, w, hh) => c.drawImage(el, x, y, w, hh) };
    }
    const zoom = seg?.type === "image" && seg.kenBurns ? kenBurnsScale(offset / Math.max(seg.duration, 0.001)) : 1;
    const cover = Boolean(seg?.isCover); // ảnh bìa đã có chữ riêng: không phủ lớp chữ hay watermark
    composeFrame(ctx, {
      source, fit: seg?.fit || "cover", zoom,
      overlays: cover || bare ? [] : activeOverlays(overlays, time, totalDuration(segments)),
      subtitle: cover || bare || !subtitles.enabled || !subtitles.lines.length ? null : { active: activeLine(subtitles.lines, time), style: subtitles.style },
      watermark: cover || bare ? null : watermark(),
    });
    if (showTikTok && !bare) drawTikTokUi(ctx);
    timeLabel.textContent = `${seconds(time)} / ${seconds(totalDuration(segments))}`;
  }

  function drawCurrent() {
    const at = locate(segments, time);
    drawSegment(at ? segments[at.index] : null, at?.offset || 0);
  }

  // Hiện frame tại thời điểm t khi đang dừng.
  function showAt(t) {
    time = Math.max(0, t);
    const at = locate(segments, time);
    const seg = at && segments[at.index];
    const src = seg && sources.get(seg.sourceId);
    if (seg?.type === "clip" && src && Math.abs(src.el.currentTime - at.sourceTime) > 0.03) src.el.currentTime = at.sourceTime;
    drawCurrent();
  }

  // ----- giọng đọc khi xem trước -----
  const voiceActive = () => Boolean(voiceover.enabled && voiceBlob);
  const voiceAt = () => voiceStart(segments, outputFps(segments));
  // Giữ <audio> của giọng đọc theo đúng thời điểm của timeline (gọi mỗi frame khi đang phát).
  function syncVoice() {
    if (!playing || !voiceActive()) { if (!voiceAudio.paused) voiceAudio.pause(); return; }
    const rel = time - voiceAt();
    const inside = rel >= 0 && rel < (voiceAudio.duration || voiceover.duration);
    if (!inside) { if (!voiceAudio.paused) voiceAudio.pause(); return; }
    if (voiceAudio.paused || Math.abs(voiceAudio.currentTime - rel) > 0.25) {
      voiceAudio.currentTime = rel;
      if (voiceAudio.paused) voiceAudio.play().catch(() => {});
    }
  }

  function stop() {
    playing = false;
    cancelAnimationFrame(raf);
    activeVideo?.pause();
    activeVideo = null;
    if (!voiceAudio.paused) voiceAudio.pause();
    playButton.textContent = "▶ Xem trước";
  }

  function startSegment(index, offset) {
    const seg = segments[index];
    const src = sources.get(seg.sourceId);
    activeVideo?.pause();
    activeVideo = null;
    clock = performance.now() - offset * 1000;
    if (seg.type === "clip" && src) {
      activeVideo = src.el;
      const gain = voiceActive() ? CLIP_GAIN[voiceover.clipVolume] : 1;
      activeVideo.muted = seg.muted || !seg.hasAudio || gain === 0;
      activeVideo.volume = gain || 1;
      activeVideo.currentTime = seg.in + offset;
      activeVideo.play().catch(() => {});
    }
  }

  function play() {
    if (!segments.length) return;
    if (time >= totalDuration(segments) - 0.05) time = 0;
    playing = true;
    playButton.textContent = "⏸ Dừng";
    let at = locate(segments, time);
    let index = at.index;
    let segStart = time - at.offset;
    startSegment(index, at.offset);
    const tick = () => {
      if (!playing) return;
      const seg = segments[index];
      const dur = segmentDuration(seg);
      // Clip đi theo đồng hồ của chính video (để hình khớp tiếng); ảnh tĩnh đi theo đồng hồ hệ thống.
      const offset = activeVideo && !activeVideo.paused && activeVideo.readyState >= 2
        ? activeVideo.currentTime - seg.in
        : (performance.now() - clock) / 1000;
      if (offset >= dur || (activeVideo && activeVideo.ended)) {
        segStart += dur;
        index++;
        if (index >= segments.length) {
          time = totalDuration(segments);
          stop();
          drawSegment(seg, dur);
          return;
        }
        startSegment(index, 0);
      } else {
        time = segStart + Math.max(0, offset);
        drawSegment(seg, Math.max(0, offset));
      }
      syncVoice();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  playButton.addEventListener("click", () => (playing ? stop() : play()));
  markToggle.addEventListener("change", () => { useWatermark = markToggle.checked; clearResult(); persist(); if (!playing) drawCurrent(); });

  // ----- chữ trên video -----
  function changeOverlay(kind, change) {
    overlays = { ...overlays, [kind]: { ...overlays[kind], ...change } };
    clearResult();
    persist();
    if (!playing) drawCurrent();
  }

  function drawOverlayBox() {
    const hooks = (Array.isArray(pkg?.hooks) ? pkg.hooks : []).filter((x) => x?.onScreen);
    const row = (kind, label, hint, extra) => {
      const on = h("input", { type: "checkbox", checked: overlays[kind].enabled, "data-overlay-on": kind });
      const text = h("input", { type: "text", maxlength: "120", value: overlays[kind].text, "data-overlay-text": kind, "aria-label": label });
      on.addEventListener("change", () => changeOverlay(kind, { enabled: on.checked }));
      text.addEventListener("input", () => changeOverlay(kind, { text: text.value }));
      return h("div", { class: "field ov-row" }, h("label", { class: "check" }, on, label), extra?.(text), text, h("p", { class: "hint" }, hint));
    };
    overlayBox.replaceChildren(
      h("h2", {}, "Chữ trên video"),
      row("hook", "Chữ hook", "Hiện trong 3 giây đầu, ở phần trên khung hình.", (text) => hooks.length > 0 && h("div", { class: "row wrap" },
        hooks.map((x, i) => h("button", { class: "chip ov-hook", type: "button", "data-hook": String(i), onclick: () => { text.value = x.onScreen; changeOverlay("hook", { text: x.onScreen, enabled: true }); drawOverlayBox(); } }, x.onScreen)))),
      row("price", "Sticker giá", "Hiện trong 3 giây cuối."),
      row("cta", "Lời kêu gọi", "Hiện trong 2,5 giây cuối, sát mép dưới vùng an toàn."),
      ...(pkg ? [] : [h("p", { class: "hint" }, "Sản phẩm chưa có gói đăng bài nên chữ hook chưa có sẵn. Tạo gói ở trang sản phẩm rồi quay lại, hoặc tự gõ.")]),
    );
  }

  // ----- lồng tiếng AI (CIT Voice Studio chạy trên máy này, spec mục 9.12) -----
  // Địa chỉ CIT là của từng máy nên chỉ nhớ trên thiết bị. Đã kết nối được một lần thì lần sau tự kết nối.
  const VOICE_URL_KEY = "cit:url", VOICE_AUTO_KEY = "cit:auto";
  const readPref = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
  const writePref = (key, value) => { try { localStorage.setItem(key, value); } catch { /* bỏ qua */ } };
  let citUrl = readPref(VOICE_URL_KEY, DEFAULT_VOICE_URL);
  let cit = { state: "idle", message: "", engine: "", voices: [] }; // state: idle | connecting | ready | error
  let voiceBusy = false;

  function setVoiceBlob(blob) {
    if (voiceUrl) URL.revokeObjectURL(voiceUrl);
    voiceBlob = blob;
    voiceUrl = blob ? URL.createObjectURL(blob) : "";
    if (voiceUrl) voiceAudio.src = voiceUrl; else voiceAudio.removeAttribute("src");
  }

  function setVoiceover(change, { redraw = true } = {}) {
    voiceover = { ...voiceover, ...change };
    clearResult();
    persist();
    drawList();
    if (redraw) { drawVoiceBox(); drawSubsBox(); }
  }

  async function connectVoice() {
    cit = { ...cit, state: "connecting", message: "" };
    drawVoiceBox();
    const client = createVoiceClient(citUrl);
    try {
      const health = await client.health();
      const problem = healthProblem(health);
      if (problem) throw new Error(problem);
      const voices = await client.voices();
      if (!voices.length) throw new Error("CIT Voice Studio chưa có giọng nào.");
      cit = { state: "ready", message: "", engine: String(health.engine || ""), voices };
      writePref(VOICE_AUTO_KEY, "1");
    } catch (err) {
      cit = { ...cit, state: "error", message: err.message };
    }
    drawVoiceBox();
  }

  async function generateVoice() {
    const text = voiceover.text.trim();
    if (voiceBusy || cit.state !== "ready") return;
    if (!text) return toast("Nhập lời đọc trước.");
    voiceBusy = true;
    drawVoiceBox();
    try {
      const voiceId = cit.voices.some((v) => v.id === voiceover.voiceId) ? voiceover.voiceId : cit.voices[0].id;
      const out = await createVoiceClient(citUrl).synth({ text, voiceId, speed: voiceover.speed });
      if (out.blob.type !== "audio/wav") throw new Error("CIT Voice Studio trả về định dạng không phải WAV");
      const old = voiceover.sourceId;
      const sourceId = `voice-${newId()}`;
      await putClip(product.id, sourceId, out.blob, "giong-doc.wav").catch(() => {});
      if (old) deleteClip(product.id, old).catch(() => {});
      setVoiceBlob(out.blob);
      setVoiceover({ voiceId, sourceId, duration: out.duration, cues: out.cues, enabled: true });
      if (!subtitles.lines.length && out.cues.length) voiceSubtitles({ quiet: true });
      toast("Đã tạo giọng đọc");
    } catch (err) {
      toast(err.message);
      if (/kết nối|tải mô hình/.test(err.message)) { cit = { ...cit, state: "error", message: err.message }; }
    } finally {
      voiceBusy = false;
      drawVoiceBox();
    }
  }

  function removeVoice() {
    if (voiceover.sourceId) deleteClip(product.id, voiceover.sourceId).catch(() => {});
    setVoiceBlob(null);
    setVoiceover({ sourceId: "", duration: 0, cues: [] });
  }

  function drawVoiceBox() {
    const status = {
      idle: h("p", { class: "muted voice-status" }, "Đọc lời thoại bằng CIT Voice Studio đang chạy trên máy này."),
      connecting: h("p", { class: "muted voice-status" }, "Đang kết nối CIT Voice Studio…"),
      ready: h("p", { class: "muted voice-status", "data-state": "ready" }, `Đã kết nối CIT Voice Studio${cit.engine ? ` · ${cit.engine}` : ""}`),
      error: h("p", { class: "field-error voice-status", "data-state": "error" }, cit.message),
    }[cit.state];
    const connectButton = cit.state !== "ready" && h("button", { class: "btn", type: "button", "data-action": "voice-connect", disabled: cit.state === "connecting", onclick: connectVoice },
      cit.state === "error" ? "Thử kết nối lại" : "Kết nối CIT Voice Studio");

    const urlInput = h("input", { id: "voice-url", type: "url", value: citUrl, "aria-label": "Địa chỉ CIT Voice Studio" });
    urlInput.addEventListener("change", () => {
      citUrl = urlInput.value.trim() || DEFAULT_VOICE_URL;
      writePref(VOICE_URL_KEY, citUrl);
      connectVoice();
    });
    const urlBox = h("details", { class: "manual" }, h("summary", {}, "Địa chỉ CIT"),
      h("div", { class: "field" }, urlInput, h("p", { class: "hint" }, `Mặc định ${DEFAULT_VOICE_URL}. Chỉ dùng được CIT chạy trên chính máy này.`)));

    const voices = cit.voices.length ? cit.voices : voiceover.voiceId ? [{ id: voiceover.voiceId, label: voiceover.voiceId }] : [];
    const voiceSelect = h("select", { id: "voice-id", disabled: cit.state !== "ready" },
      voices.map((v) => h("option", { value: v.id, selected: v.id === voiceover.voiceId }, v.label)));
    voiceSelect.addEventListener("change", () => setVoiceover({ voiceId: voiceSelect.value }, { redraw: false }));

    const speedLabel = h("span", { class: "muted" }, `${voiceover.speed.toFixed(2)}x`);
    const speed = h("input", { id: "voice-speed", type: "range", min: String(SPEED.min), max: String(SPEED.max), step: "0.05", value: String(voiceover.speed) });
    speed.addEventListener("input", () => { speedLabel.textContent = `${Number(speed.value).toFixed(2)}x`; });
    speed.addEventListener("change", () => setVoiceover({ speed: Number(speed.value) }, { redraw: false }));

    const text = h("textarea", { id: "voice-text", rows: "5", maxlength: "5000" }, voiceover.text);
    text.addEventListener("input", () => setVoiceover({ text: text.value }, { redraw: false }));

    const hasVoice = Boolean(voiceover.sourceId);
    const extra = [];
    if (hasVoice && !voiceBlob) {
      extra.push(h("p", { class: "field-error voice-missing" }, "Thiếu file giọng đọc trên thiết bị này. Bấm \"Tạo giọng đọc\" để đọc lại."));
    }
    if (voiceBlob) {
      const start = voiceAt();
      const over = voiceOverrun(start, voiceover.duration, totalDuration(segments));
      extra.push(
        voiceAudio,
        h("p", { class: "muted voice-info" }, `Dài ${seconds(voiceover.duration)} · bắt đầu ở giây ${start.toFixed(1)} · ${voiceover.cues.length} câu`),
        over > 0 && h("p", { class: "field-error voice-over" }, `Giọng đọc dài hơn video ${over.toFixed(1)} giây, phần thừa sẽ bị cắt. Thêm đoạn hoặc rút bớt lời.`),
      );
    }
    if (hasVoice) {
      const on = h("input", { id: "voice-on", type: "checkbox", checked: voiceover.enabled });
      on.addEventListener("change", () => setVoiceover({ enabled: on.checked }));
      const clipVol = h("select", { id: "voice-clip-volume" },
        Object.entries(CLIP_VOLUME_LABELS).map(([value, label]) => h("option", { value, selected: voiceover.clipVolume === value }, label)));
      clipVol.addEventListener("change", () => setVoiceover({ clipVolume: clipVol.value }, { redraw: false }));
      extra.push(
        h("div", { class: "gen-grid" },
          h("label", { class: "check" }, on, "Dùng giọng đọc trong video"),
          h("div", { class: "field" }, h("label", { for: "voice-clip-volume" }, "Tiếng của clip"), clipVol),
        ),
        h("div", { class: "row wrap" }, h("button", { class: "btn small danger", type: "button", "data-action": "voice-remove", onclick: removeVoice }, "Xoá giọng đọc")),
        h("p", { class: "hint" }, "Video có giọng đọc AI: khi đăng TikTok, bật nhãn \"Nội dung do AI tạo\"."),
      );
    }

    voiceBox.replaceChildren(...[
      h("h2", {}, "Lồng tiếng AI"),
      status,
      connectButton && h("div", { class: "row wrap" }, connectButton),
      urlBox,
      h("div", { class: "gen-grid" },
        h("div", { class: "field" }, h("label", { for: "voice-id" }, "Giọng"), voiceSelect),
        h("div", { class: "field" }, h("label", { for: "voice-speed" }, "Tốc độ đọc"), h("div", { class: "row" }, speed, speedLabel)),
      ),
      h("div", { class: "field" },
        h("label", { for: "voice-text" }, "Lời đọc"),
        text,
        h("p", { class: "hint" }, "Lấy sẵn từ kịch bản của gói đăng bài. Chèn [nghỉ 1s] để ngắt, [cười] để thêm tiếng cười."),
      ),
      h("div", { class: "row wrap" },
        h("button", { class: "btn primary", type: "button", "data-action": "voice-generate", disabled: voiceBusy || cit.state !== "ready", onclick: generateVoice }, voiceBusy ? "Đang đọc…" : hasVoice ? "Tạo lại giọng đọc" : "Tạo giọng đọc"),
        pkg && h("button", { class: "btn small", type: "button", "data-action": "voice-script", onclick: () => setVoiceover({ text: scriptText(pkg) }) }, "Lấy lại từ kịch bản"),
      ),
      ...extra,
    ].filter(Boolean));
  }

  // ----- phụ đề -----
  let subsStyleChosen = false; // người dùng (hoặc bản lưu) đã chọn kiểu: không lấy mặc định từ brand kit nữa
  let subsBusy = false;
  let subsMessage = "";
  // "Chữ ký" của timeline lúc tạo phụ đề: đổi đoạn sau đó thì mốc thời gian có thể lệch.
  const timelineSig = () => segments.map((s) => `${s.sourceId}:${s.type === "clip" ? `${s.in}-${s.out}:${s.muted ? 1 : 0}` : s.duration}`).join("|");

  function setSubtitles(change, { keepMessage = false } = {}) {
    subtitles = { ...subtitles, ...change };
    if (!keepMessage) subsMessage = "";
    clearResult();
    persist();
    drawSubsBox();
    if (!playing) drawCurrent();
  }

  async function autoSubtitles() {
    if (subsBusy || !segments.length) return;
    subsBusy = true;
    subsMessage = "Đang tách tiếng và phiên âm…";
    drawSubsBox();
    try {
      const { buffer } = await worker.audio({ segments: segments.map((s) => ({ ...s, blob: sources.get(s.sourceId).blob })) });
      const hint = [shortName(product.title), product.shopName].filter(Boolean).join(", ");
      const query = new URLSearchParams({ lang: "vi", prompt: hint });
      const { words } = await api(`/api/transcribe?${query}`, { method: "POST", body: new Blob([buffer], { type: "audio/wav" }) });
      if (!words.length) throw new Error("Không nghe thấy lời nói nào trong video.");
      subsMessage = "";
      setSubtitles({ lines: wordsToLines(words, subtitles.style), sig: timelineSig(), enabled: true });
      toast("Đã tạo phụ đề");
    } catch (err) {
      subsMessage = `${err.message} Bạn có thể dùng lời thoại từ kịch bản rồi sửa tay.`;
      if (err.status === 401) toast(err.message);
    } finally {
      subsBusy = false;
      drawSubsBox();
    }
  }

  function scriptSubtitles() {
    const spoken = (Array.isArray(pkg?.script) ? pkg.script : []).map((b) => b?.voiceover).filter(Boolean).join(" ") || pkg?.hooks?.[0]?.spoken || "";
    if (!spoken.trim()) return toast("Sản phẩm chưa có kịch bản. Tạo gói đăng bài trước.");
    const start = segments[0]?.isCover ? segmentDuration(segments[0]) : 0;
    const lines = linesFromText(spoken, start, totalDuration(segments), subtitles.style);
    if (!lines.length) return toast("Thêm clip trước khi tạo phụ đề.");
    setSubtitles({ lines, sig: timelineSig(), enabled: true });
  }

  // Mỗi câu CIT đã đọc thành dòng phụ đề đúng mốc; không cần gửi tiếng đi phiên âm.
  function voiceSubtitles({ quiet = false } = {}) {
    const lines = cuesToLines(voiceover.cues, voiceAt(), subtitles.style);
    if (!lines.length) return toast("Chưa có giọng đọc. Tạo giọng đọc trước.");
    setSubtitles({ lines, sig: timelineSig(), enabled: true });
    if (!quiet) toast("Đã tạo phụ đề từ giọng đọc");
  }

  function drawSubsBox() {
    const ready = segments.length > 0 && segments.every((s) => sources.has(s.sourceId));
    const enabled = h("input", { id: "subs-on", type: "checkbox", checked: subtitles.enabled });
    enabled.addEventListener("change", () => setSubtitles({ enabled: enabled.checked }, { keepMessage: true }));
    const style = h("select", { id: "subs-style" }, Object.entries(SUBTITLE_STYLES).map(([value, s]) => h("option", { value, selected: subtitles.style === value }, s.label)));
    style.addEventListener("change", () => {
      subsStyleChosen = true;
      // Chia lại dòng theo kiểu mới (karaoke dòng ngắn, hai kiểu kia dòng dài hơn); chữ đã sửa nằm trong từng từ nên không mất.
      setSubtitles({ style: style.value, lines: wordsToLines(subtitles.lines.flatMap((l) => l.words), style.value) });
    });
    const change = (lines) => setSubtitles({ lines });
    const rows = subtitles.lines.map((line, i) => {
      const text = h("input", { type: "text", value: line.text, maxlength: "120", "data-sub-text": String(i), "aria-label": `Phụ đề dòng ${i + 1}` });
      text.addEventListener("change", () => {
        const next = setLineText(line, text.value);
        change(next.text ? subtitles.lines.map((l, k) => (k === i ? next : l)) : subtitles.lines.filter((_, k) => k !== i));
      });
      const nudge = (field, delta, label) => h("button", { class: "btn small", type: "button", "aria-label": label, onclick: () => change(subtitles.lines.map((l, k) => (k === i ? nudgeLine(l, field, delta) : l))) }, delta < 0 ? "−" : "+");
      return h("div", { class: "sub-row" },
        text,
        h("div", { class: "sub-times" },
          nudge("start", -0.1, "Bắt đầu sớm hơn 0,1 giây"), h("span", { class: "sub-time", "data-sub-start": String(i) }, line.start.toFixed(1)), nudge("start", 0.1, "Bắt đầu muộn hơn 0,1 giây"),
          h("span", { class: "muted" }, "→"),
          nudge("end", -0.1, "Kết thúc sớm hơn 0,1 giây"), h("span", { class: "sub-time", "data-sub-end": String(i) }, line.end.toFixed(1)), nudge("end", 0.1, "Kết thúc muộn hơn 0,1 giây"),
          h("button", { class: "btn small", type: "button", disabled: line.words.length < 2, "data-sub-split": String(i), onclick: () => change(splitLine(subtitles.lines, i, Math.ceil(line.words.length / 2))) }, "Tách"),
          h("button", { class: "btn small", type: "button", disabled: i === subtitles.lines.length - 1, "data-sub-merge": String(i), onclick: () => change(mergeLines(subtitles.lines, i)) }, "Gộp ↓"),
          h("button", { class: "btn small danger", type: "button", "aria-label": "Xoá dòng", onclick: () => change(subtitles.lines.filter((_, k) => k !== i)) }, "✕"),
        ),
      );
    });
    const stale = subtitles.lines.length > 0 && subtitles.sig && subtitles.sig !== timelineSig();
    subsBox.replaceChildren(...[
      h("h2", {}, "Phụ đề"),
      h("div", { class: "row wrap" },
        h("button", { class: "btn primary", type: "button", "data-action": "subs-auto", disabled: subsBusy || !ready, onclick: autoSubtitles }, subsBusy ? "Đang tạo…" : "Tạo phụ đề tự động"),
        h("button", { class: "btn", type: "button", "data-action": "subs-script", disabled: subsBusy || !ready, onclick: scriptSubtitles }, "Dùng lời thoại từ kịch bản"),
        voiceover.cues.length > 0 && h("button", { class: "btn", type: "button", "data-action": "subs-voice", disabled: subsBusy || !segments.length, onclick: () => voiceSubtitles() }, "Dùng mốc câu của giọng đọc"),
      ),
      subsMessage && h("p", { class: subsBusy ? "muted subs-message" : "field-error subs-message" }, subsMessage),
      stale && h("p", { class: "field-error subs-stale" }, "Các đoạn đã thay đổi sau khi tạo phụ đề nên thời gian có thể lệch. Tạo lại phụ đề, hoặc chỉnh tay từng dòng."),
      h("div", { class: "gen-grid" },
        h("div", { class: "field" }, h("label", { for: "subs-style" }, "Kiểu"), style),
        h("label", { class: "check" }, enabled, "In phụ đề vào video"),
      ),
      subtitles.lines.length > 0 && h("div", { class: "sub-list" }, rows),
      subtitles.lines.length > 0 && h("div", { class: "row wrap" },
        h("span", { class: "muted subs-count" }, `${subtitles.lines.length} dòng`),
        h("button", { class: "btn small", type: "button", "data-action": "subs-download", onclick: () => downloadBlob(new Blob([toSrt(subtitles.lines)], { type: "application/x-subrip" }), `${slug(shortName(product.title))}.srt`) }, "⬇ Tải .srt"),
        h("button", { class: "btn small danger", type: "button", onclick: () => setSubtitles({ lines: [], sig: "" }) }, "Xoá hết"),
      ),
      h("p", { class: "hint" }, "Phụ đề nằm phía trên sticker giá. Khi bấm \"Lưu lên kho\", file .srt được lưu kèm video."),
    ].filter(Boolean));
  }

  // ----- ảnh bìa -----
  // Trả canvas xem trước đang hiện đúng frame tại thời điểm t, chỉ có hình (không chữ, không watermark).
  async function frameAt(t) {
    stop();
    bare = true;
    try {
      const at = locate(segments, t);
      const seg = at && segments[at.index];
      const src = seg && sources.get(seg.sourceId);
      time = Math.max(0, t);
      if (seg?.type === "clip" && src) {
        const el = src.el;
        if (Math.abs(el.currentTime - at.sourceTime) > 0.01 || el.readyState < 2) {
          await new Promise((resolve) => {
            const done = () => { el.removeEventListener("seeked", done); clearTimeout(timer); resolve(); };
            const timer = setTimeout(done, 2000);
            el.addEventListener("seeked", done);
            el.currentTime = at.sourceTime;
          });
        }
      }
      drawSegment(seg || null, at?.offset || 0);
      const copy = document.createElement("canvas");
      copy.width = canvas.width;
      copy.height = canvas.height;
      copy.getContext("2d").drawImage(canvas, 0, 0);
      return copy;
    } finally {
      bare = false;
      drawCurrent();
    }
  }

  async function saveCover({ blob, insert }) {
    await api(`/api/products/${product.id}/upload/cover.png`, { method: "PUT", body: blob });
    // Mỗi video chỉ có một đoạn ảnh bìa: bỏ đoạn cũ (nếu có) trước khi chèn đoạn mới.
    const old = segments.filter((s) => s.isCover);
    let next = segments.filter((s) => !s.isCover);
    for (const s of old) {
      const src = sources.get(s.sourceId);
      if (src) URL.revokeObjectURL(src.url);
      sources.delete(s.sourceId);
      deleteClip(product.id, s.sourceId).catch(() => {});
    }
    if (insert) {
      const sourceId = `cover-${newId()}`;
      attach(sourceId, blob, "image");
      await putClip(product.id, sourceId, blob, "cover.png").catch(() => {});
      next = [{ id: newId(), type: "image", isCover: true, name: "Ảnh bìa", sourceId, r2Key: null, width: OUTPUT.width, height: OUTPUT.height, fit: "cover", duration: 0.2, kenBurns: false }, ...next];
    }
    setSegments(next);
    toast(insert ? "Đã lưu ảnh bìa và chèn vào đầu video" : "Đã lưu ảnh bìa");
  }

  async function openCover() {
    if (!segments.some((s) => !s.isCover && sources.has(s.sourceId))) return toast("Thêm ít nhất một clip hoặc ảnh trước khi làm ảnh bìa");
    coverButton.disabled = true;
    coverBox.hidden = false;
    try {
      const { openCoverEditor } = await import("./cover-editor.js");
      const body = segments.filter((s) => !s.isCover);
      const offset = segments[0]?.isCover ? segmentDuration(segments[0]) : 0;
      await openCoverEditor(coverBox, {
        product, pkg, logo: brand.logo,
        total: totalDuration(body), fps: Math.round(body.find((s) => s.type === "clip")?.fps || 30), startTime: 0,
        frameAt: (t) => frameAt(t + offset),
        onSave: saveCover,
        onClose: () => { coverBox.hidden = true; coverBox.replaceChildren(); delete coverBox.dataset.ready; },
      });
      coverBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) {
      coverBox.hidden = true;
      toast(err.message);
    } finally {
      coverButton.disabled = false;
    }
  }

  // ----- xuất -----
  function clearResult() {
    if (result) URL.revokeObjectURL(result.url);
    result = null;
    resultBox.hidden = true;
    resultBox.replaceChildren();
  }

  function setExporting(on) {
    exporting = on;
    cancelButton.hidden = !on;
    progress.hidden = !on;
    progressLabel.hidden = !on;
    exportButton.textContent = on ? "Đang xuất…" : "Xuất video 1080x1920";
    drawList();
  }

  const withBlobs = (list) => list.map((s) => ({ ...s, blob: sources.get(s.sourceId).blob }));

  function clearCompare() {
    for (const url of compareUrls) URL.revokeObjectURL(url);
    compareUrls = [];
    compareBox.hidden = true;
    compareBox.replaceChildren();
  }

  // Dựng phần đầu video ở cả hai chế độ, đặt cạnh nhau để quyết định có đáng chờ Enhance AI không.
  // Không kèm chữ, phụ đề, watermark: các lớp đó giống hệt nhau ở hai chế độ.
  async function compareModes() {
    if (exporting) return;
    stop();
    clearCompare();
    setExporting(true);
    progress.value = 0;
    progressLabel.textContent = "0%";
    const head = withBlobs(headSegments(segments, COMPARE_SECONDS));
    const modes = [{ quality: "standard", label: "Chuẩn" }, { quality: "ai", label: "Enhance AI" }];
    try {
      for (const [i, mode] of modes.entries()) {
        const started = performance.now();
        const { buffer, info } = await worker.render({ segments: head, watermark: null, overlays: null, subtitles: null, quality: mode.quality }, (value) => {
          progress.value = (i + value) / modes.length;
          progressLabel.textContent = `${Math.round(progress.value * 100)}%`;
        });
        mode.url = URL.createObjectURL(new Blob([buffer], { type: "video/mp4" }));
        compareUrls.push(mode.url);
        mode.took = (performance.now() - started) / 1000;
        mode.duration = info.duration;
      }
      drawCompare(modes);
    } catch (err) {
      clearCompare();
      toast(err.cancelled ? "Đã huỷ so sánh" : `Không so sánh được: ${err.message}`);
    } finally {
      setExporting(false);
    }
  }

  function drawCompare(modes) {
    const total = totalDuration(segments);
    const zoom = h("input", { type: "checkbox", checked: true });
    const grid = h("div", { class: "ed-compare-grid zoomed" }, modes.map((mode) => h("figure", { class: "ed-compare-item", "data-quality": mode.quality },
      h("video", { src: mode.url, muted: true, loop: true, autoplay: true, playsinline: true }),
      h("figcaption", {},
        h("strong", {}, mode.label),
        h("span", { class: "muted" }, ` · ${seconds(mode.duration)} dựng trong ${seconds(mode.took)}, cả video ước chừng ${estimate(mode.took / mode.duration * total)}`),
      ),
    )));
    zoom.addEventListener("change", () => grid.classList.toggle("zoomed", zoom.checked));
    // Thuộc tính muted đặt qua setAttribute không tắt tiếng thật, nên trình duyệt chặn tự phát: đặt bằng thuộc tính DOM rồi phát.
    for (const video of grid.querySelectorAll("video")) { video.muted = true; video.play().catch(() => {}); }
    compareBox.replaceChildren(
      h("div", { class: "row wrap" },
        h("h2", {}, "So sánh hai chế độ"),
        h("button", { class: "btn small push", type: "button", onclick: clearCompare }, "Đóng"),
      ),
      h("label", { class: "check small" }, zoom, "Xem cỡ thật (phần giữa khung hình)"),
      grid,
      h("p", { class: "hint" }, "Đoạn so sánh không kèm chữ, phụ đề và watermark. Chọn chế độ ở mục Chất lượng rồi bấm Xuất video."),
    );
    compareBox.hidden = false;
    compareBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function exportVideo() {
    if (exporting) return;
    stop();
    clearResult();
    setExporting(true);
    progress.value = 0;
    progressLabel.textContent = "0%";
    askNotifyPermission(); // không chờ câu trả lời: xin quyền để báo khi xuất xong lúc đang ở tab khác
    try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { wakeLock = null; }
    const started = performance.now();
    try {
      const job = {
        segments: withBlobs(segments),
        watermark: watermark() ? { handle: brand.handle, position: brand.position, logoBlob } : null,
        overlays,
        subtitles: { enabled: subtitles.enabled, style: subtitles.style, lines: subtitles.lines },
        voiceover: voiceActive() ? { blob: voiceBlob, clipVolume: voiceover.clipVolume } : null,
        quality,
      };
      const { buffer, info } = await worker.render(job, (value) => {
        progress.value = value;
        progressLabel.textContent = `${Math.round(value * 100)}%`;
      });
      const blob = new Blob([buffer], { type: "video/mp4" });
      result = { blob, url: URL.createObjectURL(blob), info: { ...info, took: (performance.now() - started) / 1000 } };
      drawResult();
      toast("Đã xuất xong video");
      notifyDone("Đã xuất xong video", `${shortName(product.title)} · ${seconds(info.duration)}`);
    } catch (err) {
      toast(err.cancelled ? "Đã huỷ xuất video" : `Không xuất được: ${err.message}`);
      if (!err.cancelled) notifyDone("Không xuất được video", err.message);
    } finally {
      wakeLock?.release?.().catch(() => {});
      wakeLock = null;
      setExporting(false);
    }
  }

  function drawResult() {
    const d = new Date();
    const filename = `${slug(shortName(product.title))}_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.mp4`;
    const mb = (result.blob.size / 1024 / 1024).toFixed(1);
    const saveButton = h("button", { class: "btn primary", type: "button", "data-action": "save-final" }, "Lưu lên kho");
    const saveNote = h("p", { class: "hint" }, "Lưu lên kho để mở và đăng từ điện thoại. Video tự xoá cùng sản phẩm sau 7 ngày.");
    saveButton.addEventListener("click", async () => {
      saveButton.disabled = true;
      saveButton.textContent = "Đang lưu…";
      try {
        await api(`/api/products/${product.id}/upload/final.mp4`, { method: "PUT", body: result.blob });
        const srt = toSrt(subtitles.lines);
        if (srt) await api(`/api/products/${product.id}/upload/subs.srt`, { method: "PUT", body: new Blob([srt], { type: "application/x-subrip" }) });
        saveButton.textContent = "Đã lưu lên kho ✓";
        saveNote.textContent = "Đã lưu. Mở trang sản phẩm trên điện thoại để xem và đăng.";
        toast("Đã lưu video lên kho");
      } catch (err) {
        saveButton.disabled = false;
        saveButton.textContent = "Lưu lên kho";
        toast(err.status === 401 ? err.message : `Chưa lưu được: ${err.message}`);
      }
    });
    const file = () => new File([result.blob], filename, { type: "video/mp4" });
    resultBox.replaceChildren(
      h("h2", {}, "Video đã xuất"),
      h("p", { class: "muted ed-result-info" }, `${result.info.width}x${result.info.height} · ${seconds(result.info.duration)} · ${result.info.fps}fps · ${mb}MB · ${result.info.quality === "ai" ? "Enhance AI" : "Chuẩn"} · xuất trong ${seconds(result.info.took)}`),
      h("video", { class: "ed-result-video", src: result.url, controls: true, playsinline: true }),
      h("div", { class: "row wrap" },
        saveButton,
        h("button", { class: "btn", type: "button", "data-action": "download-final", onclick: () => downloadBlob(result.blob, filename) }, "⬇ Tải về"),
        canShareFiles() && h("button", { class: "btn", type: "button", onclick: async () => {
          if ((await shareFiles([file()])) === "unsupported") toast("Thiết bị này không chia sẻ được file, hãy dùng nút Tải về");
        } }, "↗ Chia sẻ"),
      ),
      saveNote,
    );
    resultBox.hidden = false;
    resultBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  exportButton.addEventListener("click", exportVideo);
  compareButton.addEventListener("click", compareModes);
  cancelButton.addEventListener("click", () => worker.cancel());

  // ----- khởi động -----
  async function restore() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(storeKey) || "null"); } catch { saved = null; }
    // Bản trên máy chủ mới hơn (sửa từ máy khác) thì dùng bản đó; bản trên máy này mới hơn mà chưa gửi thì gửi lại.
    let remote = null;
    try { ({ edit: remote } = await api(`/api/products/${product.id}/edit`)); } catch { remote = null; }
    const localTime = Date.parse(saved?.updatedAt || "") || 0;
    const remoteTime = Date.parse(remote?.updatedAt || "") || 0;
    let pushAfter = false;
    if (remote && remoteTime > localTime) {
      saved = remote;
      syncLabel.textContent = "Đã đồng bộ";
    } else if (saved && (saved.dirty || localTime > remoteTime)) {
      pushAfter = true;
    } else if (remote) {
      syncLabel.textContent = "Đã đồng bộ";
    }
    updatedAt = saved?.updatedAt || null;
    for (const kind of ["hook", "price", "cta"]) {
      const o = saved?.overlays?.[kind];
      if (o && typeof o.enabled === "boolean" && typeof o.text === "string") overlays[kind] = { enabled: o.enabled, text: o.text.slice(0, 120) };
    }
    drawOverlayBox();
    const savedSubs = saved?.subtitles;
    if (savedSubs && Array.isArray(savedSubs.lines)) {
      subtitles = {
        enabled: savedSubs.enabled !== false,
        style: Object.hasOwn(SUBTITLE_STYLES, savedSubs.style) ? savedSubs.style : "karaoke",
        sig: typeof savedSubs.sig === "string" ? savedSubs.sig : "",
        lines: savedSubs.lines.filter((l) => l && typeof l.text === "string" && Number.isFinite(l.start) && Number.isFinite(l.end) && Array.isArray(l.words)).slice(0, 400),
      };
      subsStyleChosen = true;
    }
    if (saved?.voiceover) {
      voiceover = normalizeVoiceover(saved.voiceover);
      if (!voiceover.text) voiceover.text = scriptText(pkg);
      if (voiceover.sourceId) setVoiceBlob(await getClip(product.id, voiceover.sourceId).catch(() => null));
    }
    if (saved && typeof saved.useWatermark === "boolean") {
      useWatermark = saved.useWatermark;
      markToggle.checked = useWatermark;
    }
    const list = Array.isArray(saved?.segments) ? saved.segments.filter((s) => s && s.sourceId && (s.type === "clip" || s.type === "image")) : [];
    for (const seg of list) {
      if (sources.has(seg.sourceId)) continue;
      try {
        const blob = seg.r2Key
          ? await fetch(`/media/${seg.r2Key}`).then((r) => (r.ok ? r.blob() : null))
          : await getClip(product.id, seg.sourceId);
        if (blob) attach(seg.sourceId, blob, seg.type);
      } catch { /* thiếu file: hàng đó sẽ hiện nút chọn lại */ }
    }
    segments = list;
    loaded = true;
    if (pushAfter) persist();
    else if (remote && remoteTime > localTime) saveLocal(false);
    drawList();
    showAt(0);
  }

  async function loadBrand() {
    try {
      ({ brandkit: brand } = await api("/api/brandkit"));
      if (brand.logo) {
        logoBlob = await (await fetch(brand.logo)).blob();
        logoImage = await createImageBitmap(logoBlob);
      }
    } catch { /* không có brand kit thì dựng không watermark */ }
    markRow.hidden = !(brand.watermark && (brand.handle || brand.logo));
    if (!subsStyleChosen && Object.hasOwn(SUBTITLE_STYLES, brand.subtitleStyle)) { subtitles = { ...subtitles, style: brand.subtitleStyle }; drawSubsBox(); }
    if (!playing) drawCurrent();
  }

  (async () => {
    pruneOldClips().catch(() => {});
    let cap = { video: false, audio: false };
    try {
      if (typeof VideoEncoder !== "undefined" && typeof AudioEncoder !== "undefined") cap = await worker.capabilities();
    } catch { /* coi như không hỗ trợ */ }
    canExport = cap.video && cap.audio;
    qualityBox.hidden = !(canExport && cap.enhance);
    if (!canExport) {
      notice.textContent = "Thiết bị này chưa xuất được video. Hãy dựng trên Chrome hoặc Edge trên máy tính. Bạn vẫn sắp xếp và xem trước được ở đây.";
      notice.hidden = false;
    }
    drawOverlayBox();
    drawSubsBox();
    await Promise.all([restore(), loadBrand(), loadFonts(document.fonts)]);
    drawSubsBox();
    drawVoiceBox();
    // Chỉ tự kết nối CIT khi đã từng dùng trên máy này (Chrome có thể hỏi quyền truy cập mạng cục bộ).
    if (readPref(VOICE_AUTO_KEY, "") || voiceover.sourceId) connectVoice();
    if (!playing) drawCurrent();
    drawList();
    container.dataset.ready = "1";
  })();

  // Dọn dẹp khi rời màn hình (router gọi).
  return () => {
    stop();
    if (syncTimer) { clearTimeout(syncTimer); pushEdit(); } // rời màn hình khi còn thay đổi chưa gửi: gửi ngay
    worker.terminate();
    clearResult();
    clearCompare();
    for (const src of sources.values()) URL.revokeObjectURL(src.url);
    sources.clear();
    setVoiceBlob(null);
    wakeLock?.release?.().catch(() => {});
  };
}
