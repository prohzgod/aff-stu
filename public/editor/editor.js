// Màn hình dựng video (#/p/{id}/edit): nhập clip, sắp thứ tự, cắt, xem trước, xuất MP4 1080x1920, lưu lên kho.
// Chỉ được nạp khi vào route này, để trang Studio không nặng thêm.

import { api } from "/lib/api.js";
import { h, toast } from "/lib/dom.js";
import { mediaUrl } from "/lib/format.js";
import { canShareFiles, shareFiles, downloadBlob } from "/lib/share.js";
import { slug } from "/lib/package-text.js";
import { shortName } from "/lib/prompt-library.js";
import {
  OUTPUT, LIMITS, segmentDuration, totalDuration, clampTrim, moveSegment, validateTimeline, locate, kenBurnsScale,
} from "./timeline.js";
import { composeFrame } from "./compose.js";
import { putClip, getClip, deleteClip, pruneOldClips } from "./local-clips.js";

const IMAGE_SECONDS = 2;
const seconds = (v) => `${v.toFixed(1)}s`;
const newId = () => Math.random().toString(36).slice(2, 10);

// ---------- worker ----------

function createWorker() {
  const worker = new Worker("/editor/render-worker.js", { type: "module" });
  let probeSeq = 0;
  const waiting = new Map();
  let onProgress = null, settle = null;
  worker.addEventListener("message", ({ data }) => {
    if (data.type === "probe") waiting.get(data.id)?.(data);
    else if (data.type === "capabilities") waiting.get("cap")?.(data);
    else if (data.type === "progress") onProgress?.(data.value);
    else if (data.type === "done") settle?.resolve(data);
    else if (data.type === "error") settle?.reject(Object.assign(new Error(data.message), { cancelled: data.cancelled }));
  });
  worker.addEventListener("error", (e) => settle?.reject(new Error(e.message || "Không chạy được bộ xuất video")));
  return {
    capabilities: () => new Promise((resolve) => { waiting.set("cap", resolve); worker.postMessage({ type: "capabilities" }); }),
    probe: (blob) => new Promise((resolve, reject) => {
      const id = ++probeSeq;
      waiting.set(id, (data) => { waiting.delete(id); data.error ? reject(new Error(data.error)) : resolve(data.info); });
      worker.postMessage({ type: "probe", id, blob });
    }),
    render: (job, progress) => new Promise((resolve, reject) => {
      onProgress = progress;
      settle = { resolve, reject };
      worker.postMessage({ type: "render", job });
    }),
    cancel: () => worker.postMessage({ type: "cancel" }),
    terminate: () => worker.terminate(),
  };
}

// ---------- màn hình ----------

export function renderEditor(container, product) {
  const storeKey = `edit:${product.id}`;
  const worker = createWorker();
  const sources = new Map(); // sourceId → { blob, url, el }  (el: <video> hoặc <img> dùng cho xem trước)
  let segments = [];
  let brand = { handle: "", position: "tl", watermark: true, logo: null };
  let logoImage = null, logoBlob = null;
  let useWatermark = true;
  let canExport = false;
  let exporting = false;
  let result = null; // { blob, url, info }
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
      h("section", { class: "card ed-timeline" }, h("h2", {}, "Các đoạn"), listEl, summary, problems),
      h("section", { class: "card ed-preview" },
        h("h2", {}, "Xem trước"),
        canvas,
        h("div", { class: "row wrap" }, playButton, timeLabel, markRow),
        h("div", { class: "row wrap" }, exportButton, cancelButton, progress, progressLabel),
      ),
    ),
    resultBox,
  );

  // ----- lưu trạng thái trên thiết bị -----
  const persist = () => {
    try { localStorage.setItem(storeKey, JSON.stringify({ segments, useWatermark })); } catch { /* đầy bộ nhớ: bỏ qua */ }
  };

  function setSegments(next, { keepResult = false } = {}) {
    segments = next;
    if (!keepResult) clearResult();
    persist();
    drawList();
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
    problems.textContent = errors[0] || (missing ? "Có đoạn thiếu file. Chọn lại file cho đoạn đó hoặc xoá đoạn." : "");
    problems.hidden = !problems.textContent;
    exportButton.disabled = exporting || !canExport || !segments.length || errors.length > 0 || missing;
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

  function drawSegment(seg, offset) {
    const src = seg && sources.get(seg.sourceId);
    let source = null;
    if (src) {
      const el = src.el;
      const [width, height] = seg.type === "clip" ? [el.videoWidth, el.videoHeight] : [el.naturalWidth, el.naturalHeight];
      if (width && height) source = { width, height, draw: (c, x, y, w, hh) => c.drawImage(el, x, y, w, hh) };
    }
    const zoom = seg?.type === "image" && seg.kenBurns ? kenBurnsScale(offset / Math.max(seg.duration, 0.001)) : 1;
    composeFrame(ctx, { source, fit: seg?.fit || "cover", zoom, watermark: watermark() });
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

  function stop() {
    playing = false;
    cancelAnimationFrame(raf);
    activeVideo?.pause();
    activeVideo = null;
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
      activeVideo.muted = seg.muted || !seg.hasAudio;
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
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  playButton.addEventListener("click", () => (playing ? stop() : play()));
  markToggle.addEventListener("change", () => { useWatermark = markToggle.checked; clearResult(); persist(); if (!playing) drawCurrent(); });

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

  async function exportVideo() {
    if (exporting) return;
    stop();
    clearResult();
    setExporting(true);
    progress.value = 0;
    progressLabel.textContent = "0%";
    try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { wakeLock = null; }
    const started = performance.now();
    try {
      const job = {
        segments: segments.map((s) => ({ ...s, blob: sources.get(s.sourceId).blob })),
        watermark: watermark() ? { handle: brand.handle, position: brand.position, logoBlob } : null,
      };
      const { buffer, info } = await worker.render(job, (value) => {
        progress.value = value;
        progressLabel.textContent = `${Math.round(value * 100)}%`;
      });
      const blob = new Blob([buffer], { type: "video/mp4" });
      result = { blob, url: URL.createObjectURL(blob), info: { ...info, took: (performance.now() - started) / 1000 } };
      drawResult();
    } catch (err) {
      toast(err.cancelled ? "Đã huỷ xuất video" : `Không xuất được: ${err.message}`);
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
      h("p", { class: "muted ed-result-info" }, `${result.info.width}x${result.info.height} · ${seconds(result.info.duration)} · ${result.info.fps}fps · ${mb}MB · xuất trong ${seconds(result.info.took)}`),
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
  cancelButton.addEventListener("click", () => worker.cancel());

  // ----- khởi động -----
  async function restore() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(storeKey) || "null"); } catch { saved = null; }
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
    if (!playing) drawCurrent();
  }

  (async () => {
    pruneOldClips().catch(() => {});
    let cap = { video: false, audio: false };
    try {
      if (typeof VideoEncoder !== "undefined" && typeof AudioEncoder !== "undefined") cap = await worker.capabilities();
    } catch { /* coi như không hỗ trợ */ }
    canExport = cap.video && cap.audio;
    if (!canExport) {
      notice.textContent = "Thiết bị này chưa xuất được video. Hãy dựng trên Chrome hoặc Edge trên máy tính. Bạn vẫn sắp xếp và xem trước được ở đây.";
      notice.hidden = false;
    }
    await Promise.all([restore(), loadBrand()]);
    drawList();
    container.dataset.ready = "1";
  })();

  // Dọn dẹp khi rời màn hình (router gọi).
  return () => {
    stop();
    worker.terminate();
    clearResult();
    for (const src of sources.values()) URL.revokeObjectURL(src.url);
    sources.clear();
    wakeLock?.release?.().catch(() => {});
  };
}
