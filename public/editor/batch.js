// Dựng hàng loạt (#/batch): xuất lần lượt video của nhiều sản phẩm đã có dự án dựng trên thiết bị này,
// áp cùng một bộ thiết lập, rồi lưu từng video lên kho.

import { api } from "/lib/api.js";
import { h, toast } from "/lib/dom.js";
import { createWorker } from "./worker-client.js";
import { readLocalProject, projectSummary, loadSources, buildJob } from "./project.js";
import { toSrt, SUBTITLE_STYLES } from "./subtitles.js";

const TRISTATE = [["", "Giữ như từng sản phẩm"], ["on", "Bật cho tất cả"], ["off", "Tắt cho tất cả"]];
const tri = (v) => (v === "on" ? true : v === "off" ? false : null);

export function renderBatch(container) {
  const worker = createWorker();
  let running = false;
  let cancelled = false;
  let brand = null, logoBlob = null;
  const rows = []; // { item, project, summary, checkbox, status, bar }

  const listEl = h("div", { class: "batch-list" }, h("p", { class: "muted" }, "Đang tải…"));
  const notice = h("p", { class: "field-error", hidden: true });
  const select = (id, label, options) => {
    const el = h("select", { id }, options.map(([value, text]) => h("option", { value }, text)));
    return { el, node: h("div", { class: "field" }, h("label", { for: id }, label), el) };
  };
  const watermark = select("batch-watermark", "Watermark", TRISTATE);
  const hook = select("batch-hook", "Chữ hook", TRISTATE);
  const price = select("batch-price", "Sticker giá", TRISTATE);
  const cta = select("batch-cta", "Lời kêu gọi", TRISTATE);
  const subs = select("batch-subs", "Phụ đề", [["keep", "Giữ như từng sản phẩm"], ["off", "Tắt cho tất cả"], ...Object.entries(SUBTITLE_STYLES).map(([value, s]) => [value, `Bật, kiểu ${s.label}`])]);
  const runButton = h("button", { class: "btn primary", type: "button", "data-action": "batch-run", disabled: true }, "Xuất và lưu lên kho");
  const cancelButton = h("button", { class: "btn", type: "button", hidden: true }, "Dừng sau video này");
  const overall = h("p", { class: "muted batch-overall", role: "status" });

  container.replaceChildren(
    h("a", { class: "back", href: "#/" }, "‹ Danh sách"),
    h("section", { class: "card" },
      h("h1", {}, "Dựng hàng loạt"),
      h("p", { class: "muted" }, "Xuất lần lượt video của các sản phẩm đã sắp sẵn clip trên thiết bị này, rồi lưu từng video lên kho. Video cũ trên kho của sản phẩm đó sẽ bị thay."),
      notice,
    ),
    h("section", { class: "card" }, h("h2", {}, "Thiết lập chung"), h("div", { class: "batch-template" }, watermark.node, hook.node, price.node, cta.node, subs.node)),
    h("section", { class: "card" }, h("h2", {}, "Sản phẩm"), listEl, h("div", { class: "row wrap" }, runButton, cancelButton, overall)),
  );

  const chosen = () => rows.filter((r) => r.checkbox.checked && !r.checkbox.disabled);
  const refresh = () => {
    const n = chosen().length;
    runButton.disabled = running || n === 0;
    runButton.textContent = n ? `Xuất và lưu lên kho ${n} video` : "Xuất và lưu lên kho";
  };

  async function run() {
    if (running) return;
    running = true;
    cancelled = false;
    cancelButton.hidden = false;
    refresh();
    const queue = chosen();
    const template = { watermark: tri(watermark.el.value), hook: tri(hook.el.value), price: tri(price.el.value), cta: tri(cta.el.value), subtitles: subs.el.value };
    let ok = 0, failed = 0, wakeLock = null;
    try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { wakeLock = null; }
    for (const [i, row] of queue.entries()) {
      if (cancelled) { row.status.textContent = "Đã bỏ qua"; continue; }
      overall.textContent = `Đang làm ${i + 1}/${queue.length}…`;
      row.status.textContent = "Đang tải clip…";
      row.bar.hidden = false;
      row.bar.value = 0;
      try {
        const blobs = await loadSources(row.item.id, row.project.segments, row.project.voiceover);
        const job = buildJob(row.project, blobs, brand, logoBlob, template);
        row.status.textContent = "Đang xuất…";
        const { buffer } = await worker.render(job, (value) => { row.bar.value = value; });
        row.status.textContent = "Đang lưu lên kho…";
        await api(`/api/products/${row.item.id}/upload/final.mp4`, { method: "PUT", body: new Blob([buffer], { type: "video/mp4" }) });
        const srt = job.subtitles.enabled ? toSrt(job.subtitles.lines) : "";
        if (srt) await api(`/api/products/${row.item.id}/upload/subs.srt`, { method: "PUT", body: new Blob([srt], { type: "application/x-subrip" }) });
        row.status.replaceChildren("Xong ✓ ", h("a", { href: `#/p/${row.item.id}` }, "Mở sản phẩm"));
        row.el.dataset.state = "done";
        ok++;
      } catch (err) {
        row.status.textContent = `Lỗi: ${err.message}`;
        row.el.dataset.state = "error";
        failed++;
        if (err.status === 401) { toast(err.message); break; }
      } finally {
        row.bar.hidden = true;
      }
    }
    wakeLock?.release?.().catch(() => {});
    running = false;
    cancelButton.hidden = true;
    overall.textContent = `Xong ${ok} video${failed ? `, ${failed} lỗi` : ""}${cancelled ? ", đã dừng theo yêu cầu" : ""}.`;
    container.dataset.done = String(ok);
    refresh();
  }

  runButton.addEventListener("click", run);
  cancelButton.addEventListener("click", () => { cancelled = true; cancelButton.hidden = true; overall.textContent = "Sẽ dừng sau video đang xuất…"; });

  (async () => {
    let items = [];
    try {
      const [list, kit, cap] = await Promise.all([api("/api/products"), api("/api/brandkit").catch(() => ({ brandkit: null })), worker.capabilities().catch(() => ({ video: false, audio: false }))]);
      items = list.items;
      brand = kit.brandkit;
      if (brand?.logo) logoBlob = await (await fetch(brand.logo)).blob().catch(() => null);
      if (!(cap.video && cap.audio)) {
        notice.textContent = "Thiết bị này chưa xuất được video. Hãy dùng Chrome hoặc Edge trên máy tính.";
        notice.hidden = false;
      }
      const canRun = cap.video && cap.audio;
      for (const item of items) {
        const project = readLocalProject(item.id);
        const summary = project && projectSummary(project);
        const usable = Boolean(canRun && project && summary.problems.length === 0);
        const checkbox = h("input", { type: "checkbox", checked: usable, disabled: !usable, "aria-label": `Chọn ${item.title}` });
        checkbox.addEventListener("change", refresh);
        const status = h("span", { class: "batch-status muted" }, !project ? "Chưa sắp clip trên thiết bị này" : summary.problems[0] || `${summary.count} đoạn · ${summary.seconds.toFixed(1)}s${item.hasFinal ? " · đã có video trên kho" : ""}`);
        const bar = h("progress", { class: "ed-progress", max: "1", value: "0", hidden: true });
        const el = h("label", { class: "batch-row", "data-batch-row": item.id }, checkbox, h("span", { class: "batch-title" }, item.title), status, bar,
          !project && h("a", { class: "btn small", href: `#/p/${item.id}/edit` }, "Sắp clip"));
        rows.push({ item, project, summary, checkbox, status, bar, el });
      }
      listEl.replaceChildren(...(rows.length ? rows.map((r) => r.el) : [h("p", { class: "muted" }, "Chưa có sản phẩm nào.")]));
    } catch (err) {
      listEl.replaceChildren(h("p", { class: "field-error" }, err.message));
    }
    refresh();
    container.dataset.ready = "1";
  })();

  return () => { cancelled = true; worker.terminate(); };
}
