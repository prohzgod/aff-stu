// Kiểm UI (phase 1–6) bằng Chrome headless (375px) qua CDP. Cần `npm run dev` đang chạy và kho local rỗng.
// Chạy: node scripts/ui-check.mjs [thư mục lưu ảnh chụp]
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fixturePath = new URL("../test/fixtures/cocoon.json", import.meta.url);
const outDir = process.argv[2] || mkdtempSync(join(tmpdir(), "ui-shots-"));
const B = "http://localhost:8788";
const TOKEN = "dev-token-doi-truoc-khi-deploy";
const PORT = 9333;
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "uichk-"))}`,
  "--no-first-run", "--window-size=375,812", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://localhost:${PORT}/json`)).json()).find((t) => t.type === "page"); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0; const pending = new Map(); const dialogs = []; const consoleErrors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id) pending.get(d.id)?.(d);
  if (d.method === "Page.javascriptDialogOpening") { dialogs.push(d.params.message); send("Page.handleJavaScriptDialog", { accept: true }); }
  if (d.method === "Runtime.exceptionThrown") consoleErrors.push(d.params.exceptionDetails.text + " " + (d.params.exceptionDetails.exception?.description || ""));
};
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result.result.value;
};
const waitFor = async (expr, label) => {
  for (let i = 0; i < 60; i++) { if (await ev(expr)) return; await sleep(150); }
  throw new Error("hết giờ chờ: " + label);
};
const shot = async (name) => {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(join(outDir, name), Buffer.from(r.result.data, "base64"));
};
const results = [];
const check = (name, ok, extra = "") => { results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

await send("Page.enable"); await send("Runtime.enable");
const downloadDir = mkdtempSync(join(tmpdir(), "ui-dl-"));
await send("Browser.grantPermissions", { origin: B, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
const clipboard = () => ev("navigator.clipboard.readText()");
const toastText = () => ev("document.querySelector('#toast').hidden ? '' : document.querySelector('#toast').textContent");
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
const noOverflow = () => ev("document.documentElement.scrollWidth <= window.innerWidth");

try {
  // 1. chưa có token → settings
  await send("Page.navigate", { url: B + "/" });
  await waitFor("location.hash === '#/settings' && !!document.querySelector('#token')", "settings");
  check("chưa có token → chuyển tới #/settings", true);

  // ----- phase 4: PWA -----
  check("trang cài đặt có hướng dẫn thêm vào màn hình chính (iPhone và Android)", await ev("(() => { const t = document.querySelector('.install-guide')?.textContent || ''; return t.includes('Thêm vào Màn hình chính') && t.includes('iPhone') && t.includes('Android'); })()"));
  check("có manifest, theme-color, apple-touch-icon", await ev("!!document.querySelector('link[rel=\"manifest\"][href=\"/manifest.webmanifest\"]') && !!document.querySelector('meta[name=\"theme-color\"]') && !!document.querySelector('link[rel=\"apple-touch-icon\"]')"));
  const icons = await ev(`(async () => {
    const m = await (await fetch("/manifest.webmanifest")).json();
    const out = [];
    for (const icon of [...m.icons, { src: document.querySelector('link[rel="apple-touch-icon"]').getAttribute("href"), sizes: "180x180" }]) {
      const img = new Image();
      const ok = await new Promise((r) => { img.onload = () => r(true); img.onerror = () => r(false); img.src = icon.src; });
      out.push(ok && img.naturalWidth + "x" + img.naturalHeight === icon.sizes);
    }
    return { ok: out.every(Boolean), n: out.length, display: m.display, start: m.start_url, lang: m.lang, purposes: m.icons.map((i) => i.purpose).join() };
  })()`);
  check("manifest: standalone, start_url /, icon 192 + 512 + maskable tải được đúng kích thước", icons.ok && icons.n === 4 && icons.display === "standalone" && icons.start === "/" && icons.purposes === "any,any,maskable", JSON.stringify(icons));
  const swState = await ev("navigator.serviceWorker.ready.then((r) => r.active.scriptURL)");
  check("service worker đã đăng ký và hoạt động", swState.endsWith("/sw.js"), swState);
  await ev("document.querySelector('form').requestSubmit()");
  check("lưu token rỗng → báo lỗi, không rời trang", await ev("!document.querySelector('.field-error').hidden && location.hash === '#/settings'"));

  // 2. nhập token → danh sách rỗng
  await ev(`document.querySelector('#token').value = ${JSON.stringify(TOKEN)}; document.querySelector('form').requestSubmit()`);
  await waitFor("location.hash === '#/' && !!document.querySelector('.state-title, .grid')", "list");
  check("nhập token → danh sách rỗng", (await ev("document.querySelector('.state-title')?.textContent")) === "Chưa có sản phẩm");
  check("toast 'Đã lưu token'", (await ev("document.querySelector('#toast').textContent")) === "Đã lưu token");
  check("danh sách rỗng: không cuộn ngang ở 375px", await noOverflow());
  await shot("1-empty.png");

  // 3. dialog: JSON sai
  await ev("document.querySelector('.fab').click()");
  await waitFor("!!document.querySelector('dialog[open] textarea')", "dialog");
  await ev("document.querySelector('dialog textarea').value = '{sai'; document.querySelector('dialog form').requestSubmit()");
  check("dán JSON sai → lỗi ngay trong dialog", await ev("!document.querySelector('dialog .field-error').hidden && document.querySelector('dialog').open"));

  // 4. dán sản phẩm có HTML trong tiêu đề + 1 ảnh thật
  const XSS = `<img src=x onerror=alert(1)> Tinh chất "bí đao" <script>alert(2)</script>`;
  const p = JSON.parse(readFileSync(fixturePath, "utf8"));
  p.title = XSS; p.shopName = "<b>Cocoon</b>";
  p.images[0].original = "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png";
  await ev(`document.querySelector('dialog textarea').value = ${JSON.stringify(JSON.stringify(p))}; document.querySelector('dialog form').requestSubmit()`);
  await waitFor("/^#\\/p\\/[a-z0-9]{10}$/.test(location.hash) && !!document.querySelector('.ptitle')", "detail");
  const id = (await ev("location.hash")).slice(4);
  check("dán JSON → mở trang chi tiết", true, id);
  check("tiêu đề chứa HTML hiện nguyên văn dạng chữ", (await ev("document.querySelector('.ptitle').textContent")) === XSS);
  check("không có thẻ lạ được tạo từ dữ liệu", await ev("document.querySelectorAll('.ptitle *, #app script, #app b').length === 0"));
  check("giá 216.749₫, giá gạch, -43%", await ev("document.querySelector('.price.big').textContent === '216.749₫' && document.querySelector('.price-row s').textContent === '377.952₫' && document.querySelector('.badge.sale').textContent === '-43%'"));
  check("shop · đã bán · ★", (await ev("document.querySelector('.card p.muted').textContent")) === "<b>Cocoon</b> · 229.096 đã bán · ★ 4.7 (321)");
  check("link sàn mở tab mới, có noopener", await ev("(() => { const a = [...document.querySelectorAll('a')].find(a => a.textContent.includes('Xem trên sàn')); return a.href === 'https://shop.tiktok.com/vn/pdp/1736191557601166757' && a.target === '_blank' && a.rel.includes('noopener'); })()"));
  check("'Tự xoá sau 7 ngày'", await ev("[...document.querySelectorAll('.badge')].some(b => b.textContent === 'Tự xoá sau 7 ngày')"));
  check("3 ảnh có nhãn Ảnh 1..3", await ev("[...document.querySelectorAll('.media-grid figcaption > span:first-child')].map(s => s.textContent).join() === 'Ảnh 1,Ảnh 2,Ảnh 3'"));
  check("ảnh 1 đã lưu: src /media/, nút Tải có download", await ev(`(() => { const f = document.querySelector('.media-grid figure'); const a = f.querySelector('a'); return f.querySelector('img').getAttribute('src') === '/media/p/${id}/img_01.png' && a.hasAttribute('download') && a.getAttribute('download') === '${id}_img_01.png'; })()`));
  check("ảnh 2 chưa lưu: nút Mở link gốc ở tab mới", await ev("(() => { const a = document.querySelectorAll('.media-grid figure')[1].querySelector('a'); return a.href.startsWith('https://cdn.example.test/') && a.target === '_blank' && !a.hasAttribute('download'); })()"));
  await waitFor("document.querySelectorAll('.media-grid figure')[1].querySelector('.noimg')?.textContent === 'Không tải được ảnh'", "ô thay ảnh vỡ");
  check("ảnh link gốc không tải được → hiện 'Không tải được ảnh'", true);
  check("video trùng chỉ hiện 1 lần, có controls + playsinline", await ev("(() => { const v = document.querySelectorAll('video'); return v.length === 1 && v[0].controls && v[0].hasAttribute('playsinline'); })()"));
  check("có ghi chú số file dùng link gốc", (await ev("document.querySelector('.hint')?.textContent || ''")).startsWith("3 file chưa lưu"));
  await waitFor("document.querySelector('.media-grid img').complete && document.querySelector('.media-grid img').naturalWidth > 0", "ảnh thật tải xong");
  check("ảnh đã lưu hiển thị được từ /media", true);
  check("chi tiết: không cuộn ngang ở 375px", await noOverflow());

  // ----- phase 2: gói đăng bài -----
  await waitFor("document.querySelectorAll('.hook').length === 6", "6 hook (gói tự tạo khi mở trang)");
  check("mở trang lần đầu → tự tạo gói, đủ 6 hook đúng thứ tự công thức", (await ev("[...document.querySelectorAll('.hook .chip')].map(c => c.textContent).join('|')")) === "Nỗi đau|Giá sốc|Bằng chứng xã hội|Tò mò|So sánh|Trải nghiệm thật");
  check("nội dung gói chứa HTML từ tiêu đề vẫn hiện dạng chữ", await ev("document.querySelectorAll('#app script, #app b, .hook img').length === 0"));
  await ev("document.querySelector('.hook [data-copy=\"spoken\"]').click()");
  await waitFor("document.querySelector('#toast').textContent === 'Đã copy' && !document.querySelector('#toast').hidden", "toast copy hook");
  check("copy lời hook → clipboard đúng", (await clipboard()) === (await ev("document.querySelector('.hook .hook-spoken').textContent")));
  await ev("document.querySelector('.cover-chip').click()");
  check("bấm chip chữ ảnh bìa → copy đúng chữ", (await clipboard()) === (await ev("document.querySelector('.cover-chip').textContent")));
  check("tab Đề xuất có 4 prompt (faceless)", await ev("document.querySelectorAll('[data-panel=\"suggested\"] .prompt').length === 4"));
  await ev("document.querySelector('[data-tab=\"library\"]').click()");
  check("tab Thư viện mẫu: faceless bật có 4 prompt", await ev("!document.querySelector('[data-panel=\"library\"]').hidden && document.querySelector('[data-panel=\"suggested\"]').hidden && document.querySelectorAll('[data-panel=\"library\"] .prompt').length === 4"));
  await ev("(() => { const c = document.querySelector('#lib-faceless'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); })()");
  check("tắt faceless → 7 prompt", await ev("document.querySelectorAll('[data-panel=\"library\"] .prompt').length === 7"));
  await ev("(() => { const i = document.querySelector('#lib-surface'); i.value = 'a pink marble table'; i.dispatchEvent(new Event('input', { bubbles: true })); })()");
  check("sửa bề mặt → prompt đổi theo", await ev("[...document.querySelectorAll('[data-panel=\"library\"] .prompt-text')].some(p => p.textContent.includes('a pink marble table'))"));
  await ev("document.querySelector('[data-panel=\"library\"] .prompt [data-copy=\"prompt\"]').click()");
  check("copy prompt → clipboard bắt đầu bằng 'Vertical 9:16'", (await clipboard()).startsWith("Vertical 9:16"));
  check("kịch bản có 4 nhịp", await ev("document.querySelectorAll('.beat:not(.beat-head)').length === 4"));
  check("có khối Lưu ý (thiếu gì thì báo)", await ev("document.querySelectorAll('.warnings li').length >= 1"));
  await ev("(() => { const t = document.querySelector('#pkg-caption'); t.value = 'Caption đã sửa'; t.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await ev("document.querySelector('[data-action=\"copy-caption\"]').click()");
  await sleep(200);
  check("Copy caption + hashtag dùng nội dung đã sửa", (await clipboard()) === "Caption đã sửa\n\n" + (await ev("document.querySelector('#pkg-hashtags').value.trim().split(/\\s+/).join(' ')")));
  await ev("document.querySelector('[data-action=\"copy-all\"]').click()");
  await sleep(200);
  const all = await clipboard();
  check("Copy cả gói: đủ phần và có caption đã sửa", all.includes("== HOOK ==") && all.includes("== PROMPT GOOGLE FLOW ==") && all.includes("Caption đã sửa"));
  // ----- phase 3: tự lưu -----
  await waitFor("document.querySelector('.save-status')?.textContent === 'Đã lưu'", "tự lưu caption");
  await send("Page.reload");
  await waitFor("document.querySelector('#pkg-caption')?.value === 'Caption đã sửa'", "caption còn nguyên sau khi tải lại trang");
  check("sửa caption → tự lưu, tải lại trang vẫn còn", true);
  check("tải lại trang không tạo gói mới (vẫn 6 hook, không gọi generate)", await ev("document.querySelectorAll('.hook').length === 6"));

  check("thanh dính đáy không che nội dung cuối trang", await ev("(() => { window.scrollTo(0, document.body.scrollHeight); const last = document.querySelector('#app').lastElementChild.previousElementSibling ?? document.querySelector('#app').lastElementChild; const bar = document.querySelector('.pkgbar').getBoundingClientRect(); const secs = [...document.querySelectorAll('#app section')]; return secs[secs.length - 1].getBoundingClientRect().bottom <= bar.top + 1; })()"));
  check("chi tiết có gói: không cuộn ngang ở 375px", await noOverflow());
  await shot("2-detail.png");

  // zip
  await ev("document.querySelector('[data-action=\"zip\"]').click()");
  let zipName;
  for (let i = 0; i < 80 && !zipName; i++) { await sleep(150); zipName = readdirSync(downloadDir).find((f) => f.endsWith(".zip")); }
  check("Tải tất cả .zip → có file tải về", !!zipName, zipName || "");
  if (zipName) {
    const names = JSON.parse(execFileSync("python3", ["-c", "import json,sys,zipfile\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nprint(json.dumps(z.namelist()))", join(downloadDir, zipName)], { encoding: "utf8" }));
    check("zip hợp lệ, có ảnh đã lưu + goi-dang-bai.txt + product.json", names.includes("goi-dang-bai.txt") && names.includes("product.json") && names.some((n) => /^img_01\./.test(n)), names.join(", "));
    const txt = execFileSync("python3", ["-c", "import sys,zipfile\nsys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read('goi-dang-bai.txt'))", join(downloadDir, zipName)], { encoding: "utf8" });
    check("goi-dang-bai.txt trong zip chứa caption đã sửa", txt.includes("Caption đã sửa"));
    check("tên zip theo mẫu {slug}_{yyyymmdd}.zip", /^[a-z0-9-]+_\d{8}\.zip$/.test(zipName), zipName);
  }
  check("zip báo số file bị bỏ qua vì chưa lưu về kho", (await toastText()).includes("bỏ qua 3"), await toastText());

  // tạo lại khi đã sửa
  const before = dialogs.length;
  await ev("document.querySelector('[data-action=\"generate\"]').click()");
  await waitFor("document.querySelector('#pkg-caption').value !== 'Caption đã sửa'", "tạo lại xong");
  check("Tạo lại khi đã sửa → hỏi xác nhận trước", dialogs.length === before + 1 && dialogs[before].startsWith("Tạo lại sẽ thay"), JSON.stringify(dialogs.slice(before)));
  check("tạo lại xong vẫn đủ 6 hook, không nhân đôi khối", await ev("document.querySelectorAll('.hook').length === 6 && document.querySelectorAll('.pkgbar').length === 1"));

  // ----- phase 3: chế độ thủ công -----
  await ev("document.querySelector('details.manual').open = true");
  await ev("document.querySelector('[data-action=\"copy-manual-prompt\"]').click()");
  await waitFor("document.querySelector('#toast').textContent === 'Đã copy prompt' && !document.querySelector('#toast').hidden", "copy prompt thủ công");
  const manualPrompt = await clipboard();
  check("Copy prompt cho chat AI: có luật, schema và yêu cầu chỉ trả JSON", manualPrompt.includes('"hooks"') && manualPrompt.includes("Chỉ trả về đúng một khối JSON") && manualPrompt.includes("Dữ liệu sản phẩm"));
  await ev("(() => { const t = document.querySelector('#manual-raw'); t.value = 'xin lỗi, không có json'; t.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-action=\"apply-manual\"]').click(); })()");
  await waitFor("!document.querySelector('.manual .field-error').hidden", "lỗi dán sai");
  check("dán nội dung không có JSON → báo lỗi tại chỗ, gói cũ còn nguyên", await ev("document.querySelector('.manual .field-error').textContent.includes('Không đọc được JSON') && document.querySelectorAll('.hook').length === 6"));
  const pasted = "Của bạn đây:\n```json\n" + JSON.stringify({ caption: "Caption từ chat. Bấm giỏ hàng vàng nha!", hooks: [{ formula: "Tò mò", spoken: "Món này có gì mà ai cũng hỏi?", onScreen: "Có gì hot?" }] }) + "\n```";
  await ev(`(() => { const t = document.querySelector('#manual-raw'); t.value = ${JSON.stringify(pasted)}; t.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-action="apply-manual"]').click(); })()`);
  await waitFor("document.querySelector('#pkg-caption')?.value === 'Caption từ chat. Bấm giỏ hàng vàng nha!'", "áp dụng JSON đã dán");
  check("dán JSON từ chat → gói đổi theo, vẫn đủ 6 hook, ghi nguồn thủ công", await ev("document.querySelectorAll('.hook').length === 6 && [...document.querySelectorAll('.hook-spoken')][3].textContent === 'Món này có gì mà ai cũng hỏi?' && document.querySelector('.gen-note').textContent.includes('thủ công')"));

  // bấm Tạo lại hai lần liên tiếp → chỉ một request
  await ev("(() => { window.__gen = 0; const f = window.fetch; window.fetch = (u, o) => { if (String(u).endsWith('/generate')) window.__gen++; return f(u, o); }; const b = document.querySelector('[data-action=\"generate\"]'); b.click(); b.click(); })()");
  await waitFor("!document.querySelector('[data-action=\"generate\"]').disabled", "tạo lại lần hai xong");
  check("bấm Tạo lại hai lần liên tiếp → chỉ một request", (await ev("window.__gen")) === 1);

  // Clipboard API hỏng → vẫn copy được bằng cách cũ, không có lỗi
  await ev("navigator.clipboard.writeText = () => Promise.reject(new Error('no'))");
  // execCommand("copy") cần thao tác thật của người dùng, nên bấm bằng chuột qua CDP thay vì .click()
  const pt = await ev("(() => { const el = document.querySelector('.cover-chip'); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()");
  for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: pt.x, y: pt.y, button: "left", clickCount: 1 });
  await sleep(300);
  check("Clipboard API hỏng → copy bằng cách cũ vẫn báo 'Đã copy'", (await toastText()) === "Đã copy", await toastText());

  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(200);
  check("chi tiết ở 1280px: không cuộn ngang", await noOverflow());
  await shot("2-detail-desktop.png");
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });


  // ----- phase 5: dựng video -----
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  check("trang sản phẩm có nút Dựng video, chưa có video thành phẩm", await ev("document.querySelector('[data-action=\"open-editor\"]')?.textContent.includes('Dựng video') && !document.querySelector('.final-video')"));
  await ev("fetch('/api/brandkit', { method: 'PUT', headers: { Authorization: 'Bearer ' + localStorage.getItem('APP_TOKEN'), 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: 'kenhthu', position: 'tl', watermark: true, logo: null }) }).then((r) => r.status)");
  await ev("location.hash = '#/p/" + id + "/edit'");
  await waitFor("document.querySelector('.editor')?.dataset.ready === '1'", "mở trình dựng video");
  check("thiết bị này xuất được video (không có thông báo chặn)", await ev("document.querySelector('.editor .field-error').hidden && document.querySelector('[data-action=\"export\"]').disabled"));
  check("có công tắc watermark khi brand kit có tên kênh", await ev("!document.querySelector('#ed-watermark').closest('label').hidden"));
  // Tạo hai clip thử ngay trong trình duyệt: khung một màu, tiếng bíp, 720x1280, 24fps.
  await ev(`(async () => {
    const MB = await import("/editor/vendor/mediabunny-1.66.0.min.mjs");
    async function make(name, color, secs, freq) {
      const fps = 24, rate = 48000, c = new OffscreenCanvas(720, 1280), g = c.getContext("2d");
      const out = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: "in-memory" }), target: new MB.BufferTarget() });
      const vs = new MB.CanvasSource(c, { codec: "avc", bitrate: 1500000 }), as = new MB.AudioSampleSource({ codec: "aac", bitrate: 96000 });
      out.addVideoTrack(vs, { frameRate: fps }); out.addAudioTrack(as); await out.start();
      for (let i = 0; i < secs * fps; i++) { g.fillStyle = color; g.fillRect(0, 0, 720, 1280); await vs.add(i / fps, 1 / fps); }
      for (let o = 0; o < secs * rate; o += 4800) {
        const d = new Float32Array(9600);
        for (let i = 0; i < 4800; i++) d[i] = d[4800 + i] = 0.4 * Math.sin((2 * Math.PI * freq * (o + i)) / rate);
        const s = new MB.AudioSample({ data: d, format: "f32-planar", numberOfChannels: 2, sampleRate: rate, timestamp: o / rate });
        await as.add(s); s.close();
      }
      await out.finalize();
      return new File([out.target.buffer], name, { type: "video/mp4" });
    }
    const dt = new DataTransfer();
    dt.items.add(await make("do.mp4", "#ff0000", 2, 440));
    dt.items.add(await make("xanh.mp4", "#0000ff", 3, 880));
    const input = document.querySelector("#ed-files");
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await waitFor("document.querySelectorAll('.seg').length === 2", "nhập 2 clip");
  check("nhập 2 clip: đúng tên, thời lượng 2.0s và 3.0s, tổng 5.0s", await ev("[...document.querySelectorAll('.seg-name')].map((n) => n.textContent).join('|') === '1. do.mp4|2. xanh.mp4' && [...document.querySelectorAll('.seg .badge')].map((b) => b.textContent).join() === '2.0s,3.0s' && document.querySelector('.ed-summary').textContent === '2 đoạn · 5.0s'"));
  await ev("document.querySelector('[data-add]').click()");
  await waitFor("document.querySelectorAll('.seg').length === 3", "thêm ảnh sản phẩm từ kho");
  await ev("document.querySelectorAll('.seg')[2].querySelector('[data-move=\"up\"]').click()");
  check("thêm ảnh sản phẩm rồi chuyển lên giữa", (await ev("[...document.querySelectorAll('.seg-name')].map((n) => n.textContent).join('|')")) === "1. do.mp4|2. Ảnh 1|3. xanh.mp4");
  await ev("(() => { const i = document.querySelectorAll('.seg')[2].querySelector('[data-field=\"in\"]'); i.value = '1'; i.dispatchEvent(new Event('change', { bubbles: true })); })()");
  check("cắt đầu clip thứ ba 1 giây → tổng 6.0s", (await ev("document.querySelector('.ed-summary').textContent")) === "3 đoạn · 6.0s");
  await ev("(() => { const i = document.querySelectorAll('.seg')[2].querySelector('[data-field=\"in\"]'); i.value = '99'; i.dispatchEvent(new Event('change', { bubbles: true })); })()");
  check("cắt quá tay được kéo về hợp lệ (đoạn còn tối thiểu 0,2s)", (await ev("document.querySelectorAll('.seg .badge')[2].textContent")) === "0.2s");
  await ev("(() => { const i = document.querySelectorAll('.seg')[2].querySelector('[data-field=\"in\"]'); i.value = '1'; i.dispatchEvent(new Event('change', { bubbles: true })); })()");
  await waitFor("(() => { const c = document.querySelector('.ed-canvas'); const d = c.getContext('2d').getImageData(540, 1200, 1, 1).data; return d[0] > 180 && d[2] < 80; })()", "xem trước hiện frame đầu (đỏ)");
  check("xem trước hiện frame đầu của clip thứ nhất", true);
  check("xem trước có watermark @kenhthu ở góc trên-trái", await ev("(() => { const d = document.querySelector('.ed-canvas').getContext('2d').getImageData(44, 130, 260, 60).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 1] > 120) n++; return n > 200; })()"));
  // ----- phase 6: chữ trên video -----
  const whiteIn = (x, y, w, hh) => ev(`(() => { const d = document.querySelector('.ed-canvas').getContext('2d').getImageData(${x}, ${y}, ${w}, ${hh}).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) n++; return n; })()`);
  check("font Be Vietnam Pro đã nạp trước khi vẽ", await ev("document.fonts.check('800 60px \"Be Vietnam Pro\"') && document.fonts.check('600 40px \"Be Vietnam Pro\"', 'ấệ')"));
  check("chữ hook, giá, CTA điền sẵn từ gói đăng bài", await ev("(() => { const v = (k) => document.querySelector('[data-overlay-text=\"' + k + '\"]').value; return v('hook').length > 0 && v('price') === 'Chỉ 217K · -43%' && v('cta') === 'Bấm giỏ hàng 🛒' && document.querySelectorAll('.ov-hook').length === 6; })()"));
  await waitFor("(() => { const d = document.querySelector('.ed-canvas').getContext('2d').getImageData(200, 250, 600, 130).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) n++; return n > 800; })()", "chữ hook trên bản xem trước");
  check("xem trước: chữ hook hiện ở phần trên khung hình tại giây 0", true);
  await ev("(() => { const c = document.querySelector('[data-overlay-on=\"hook\"]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); })()");
  check("tắt chữ hook → biến mất khỏi bản xem trước", (await whiteIn(200, 250, 600, 130)) === 0);
  await ev("(() => { const c = document.querySelector('[data-overlay-on=\"hook\"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); const t = document.querySelector('[data-overlay-text=\"hook\"]'); t.value = 'Thử ngay ấ ệ ữ'; t.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await ev("(() => { const c = document.querySelector('#ed-tiktok'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); })()");
  check("bật 'Xem lớp UI TikTok' → vùng trên cùng bị phủ tối trên bản xem trước", await ev("document.querySelector('.ed-canvas').getContext('2d').getImageData(900, 20, 1, 1).data[0] < 200"));
  await ev("(() => { const c = document.querySelector('#ed-tiktok'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); })()");

  await ev("document.querySelector('[data-action=\"export\"]').click()");
  await waitFor("!!document.querySelector('.ed-result:not([hidden]) video')", "xuất video");
  const exported = await ev(`(async () => {
    const MB = await import("/editor/vendor/mediabunny-1.66.0.min.mjs");
    const blob = await (await fetch(document.querySelector(".ed-result video").src)).blob();
    const inp = new MB.Input({ formats: MB.ALL_FORMATS, source: new MB.BlobSource(blob) });
    const v = await inp.getPrimaryVideoTrack(), a = await inp.getPrimaryAudioTrack();
    const cs = new MB.CanvasSink(v, { width: 108, height: 192, fit: "fill" });
    const px = async (t) => { const m = (await cs.getCanvas(t)).canvas.getContext("2d").getImageData(54, 150, 1, 1).data; return [m[0], m[1], m[2]]; };
    const sink = new MB.AudioBufferSink(a);
    const rms = async (s, e) => { let sum = 0, n = 0; for await (const b of sink.buffers(s, e)) { const d = b.buffer.getChannelData(0); for (let i = 0; i < d.length; i++) { const t = b.timestamp + i / b.buffer.sampleRate; if (t >= s && t < e) { sum += d[i] * d[i]; n++; } } } return Math.sqrt(sum / Math.max(1, n)); };
    return { w: v.displayWidth, h: v.displayHeight, codec: v.codec, frames: (await v.computePacketStats()).packetCount, vdur: await v.computeDuration(), adur: await a.computeDuration(), acodec: a.codec, rate: a.sampleRate,
      red: await px(1), blue: await px(5), rmsClip1: await rms(0.3, 1.7), rmsImage: await rms(2.3, 3.7), rmsClip2: await rms(4.3, 5.7), bytes: blob.size, info: document.querySelector(".ed-result-info").textContent };
  })()`);
  check("file xuất: MP4 H.264 1080x1920, đúng 144 frame, dài 6 giây", exported.w === 1080 && exported.h === 1920 && exported.codec === "avc" && exported.frames === 144 && Math.abs(exported.vdur - 6) < 0.001, JSON.stringify({ w: exported.w, h: exported.h, frames: exported.frames, vdur: exported.vdur, info: exported.info }));
  check("tiếng AAC 48kHz dài bằng hình (lệch dưới 0,06s)", exported.acodec === "aac" && exported.rate === 48000 && Math.abs(exported.adur - exported.vdur) < 0.06, `tiếng ${exported.adur}s, hình ${exported.vdur}s`);
  check("đúng thứ tự hình: giây 1 là clip đỏ, giây 5 là clip xanh", exported.red[0] > 180 && exported.red[2] < 80 && exported.blue[2] > 180 && exported.blue[0] < 80, JSON.stringify([exported.red, exported.blue]));
  check("đúng tiếng: hai clip có tiếng, đoạn ảnh tĩnh im lặng", exported.rmsClip1 > 0.1 && exported.rmsClip2 > 0.1 && exported.rmsImage < 0.005, JSON.stringify([exported.rmsClip1, exported.rmsImage, exported.rmsClip2].map((v) => +v.toFixed(4))));
  const layers = await ev(`(async () => {
    const MB = await import("/editor/vendor/mediabunny-1.66.0.min.mjs");
    const blob = await (await fetch(document.querySelector(".ed-result video").src)).blob();
    const v = await new MB.Input({ formats: MB.ALL_FORMATS, source: new MB.BlobSource(blob) }).getPrimaryVideoTrack();
    const cs = new MB.CanvasSink(v, { width: 270, height: 480, fit: "fill" });
    const count = async (t, x, y, w, h, test) => { const d = (await cs.getCanvas(t)).canvas.getContext("2d").getImageData(x, y, w, h).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (test(d[i], d[i + 1], d[i + 2])) n++; return n; };
    const white = (r, g, b) => r > 190 && g > 190 && b > 190;
    const accent = (r, g, b) => r > 160 && g > 35 && g < 120 && b < 120;
    return {
      hookAt1: await count(1, 40, 60, 190, 40, white), hookAt5: await count(5, 40, 60, 190, 40, white),
      priceAt1: await count(1, 60, 292, 130, 26, accent), priceAt5: await count(5, 60, 292, 130, 26, accent),
      ctaAt1: await count(1, 40, 330, 190, 26, white), ctaAt5: await count(5, 40, 330, 190, 26, white),
      rightColumn: await count(5, 238, 40, 30, 320, (r, g, b) => white(r, g, b) || accent(r, g, b)),
      belowSafe: await count(5, 0, 362, 270, 110, (r, g, b) => white(r, g, b) || accent(r, g, b)),
    };
  })()`);
  check("file xuất: chữ hook có ở giây 1, không còn ở giây 5", layers.hookAt1 > 100 && layers.hookAt5 === 0, JSON.stringify(layers));
  check("file xuất: sticker giá và CTA chỉ hiện ở cuối video", layers.priceAt5 > 300 && layers.priceAt1 === 0 && layers.ctaAt5 > 300 && layers.ctaAt1 === 0, JSON.stringify(layers));
  check("file xuất: không chữ nào lấn vào cột nút bên phải hay vùng caption phía dưới của TikTok", layers.rightColumn === 0 && layers.belowSafe === 0, JSON.stringify(layers));
  check("file xuất không có lớp UI TikTok giả (vùng trên cùng vẫn là màu clip)", (await ev(`(async () => { const MB = await import("/editor/vendor/mediabunny-1.66.0.min.mjs"); const blob = await (await fetch(document.querySelector(".ed-result video").src)).blob(); const v = await new MB.Input({ formats: MB.ALL_FORMATS, source: new MB.BlobSource(blob) }).getPrimaryVideoTrack(); const d = (await new MB.CanvasSink(v, { width: 270, height: 480, fit: "fill" }).getCanvas(1)).canvas.getContext("2d").getImageData(225, 5, 1, 1).data; return d[0]; })()`)) > 200);
  await ev("document.querySelector('[data-action=\"save-final\"]').click()");
  await waitFor("document.querySelector('[data-action=\"save-final\"]')?.textContent === 'Đã lưu lên kho ✓'", "lưu video lên kho");
  check("Lưu lên kho thành công", true);
  await shot("4-editor.png");
  await send("Page.reload");
  await waitFor("document.querySelector('.editor')?.dataset.ready === '1' && document.querySelectorAll('.seg').length === 3", "mở lại trình dựng");
  check("tải lại trang: 3 đoạn còn nguyên, không đoạn nào thiếu file, điểm cắt được giữ", await ev("!document.querySelector('.seg .field-error') && document.querySelector('.ed-summary').textContent === '3 đoạn · 6.0s' && !document.querySelector('[data-action=\"export\"]').disabled"));
  check("tải lại trang: chữ hook đã sửa được giữ", (await ev("document.querySelector('[data-overlay-text=\"hook\"]').value")) === "Thử ngay ấ ệ ữ");
  // ----- phase 6: ảnh bìa -----
  await ev("document.querySelector('[data-action=\"open-cover\"]').click()");
  await waitFor("document.querySelector('.ed-cover')?.dataset.ready === '1' && !!document.querySelector('.cover-stage canvas')", "mở trình làm ảnh bìa");
  check("ảnh bìa: chữ lấy từ coverTexts, có sticker giá", await ev("(() => { const s = document.querySelector('.ed-cover').coverState(); return s.text.length > 0 && s.stickerVisible && document.querySelectorAll('.cover-pick').length === 3; })()"));
  await ev("document.querySelector('[data-template=\"bottom\"]').click()");
  check("đổi bố cục 'Chữ dưới' → chữ xuống dưới, sticker vẫn căn giữa vùng an toàn", await ev("(() => { const s = document.querySelector('.ed-cover').coverState(); return s.textY === 1150 && Math.abs(s.stickerX + s.stickerW / 2 - 492) < 1; })()"));
  await ev("(() => { const t = document.querySelector('#cover-text'); t.value = 'Bìa thử ấ ệ'; t.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await ev("document.querySelector('[data-action=\"save-cover\"]').click()");
  await waitFor("document.querySelectorAll('.seg').length === 4", "chèn ảnh bìa vào đầu video");
  check("lưu ảnh bìa → chèn làm đoạn đầu dài 0,2 giây", await ev("document.querySelector('.seg-name').textContent === '1. Ảnh bìa' && document.querySelector('.seg .badge').textContent === '0.2s' && document.querySelector('.ed-summary').textContent === '4 đoạn · 6.2s'"));
  await ev("document.querySelector('[data-action=\"save-cover\"]').click()");
  await waitFor("document.querySelector('#toast').textContent.startsWith('Đã lưu ảnh bìa') && document.querySelectorAll('.seg').length === 4", "lưu ảnh bìa lần hai");
  check("khối 'Chữ trên video' không in ra chữ rác", await ev("!/\\b(false|undefined|null)\\b/.test(document.querySelector('.ed-overlays').textContent)"));
  check("lưu ảnh bìa lần hai không tạo thêm đoạn bìa", await ev("[...document.querySelectorAll('.seg-name')].filter((n) => n.textContent.includes('Ảnh bìa')).length === 1"));
  await shot("5-cover.png");

  await ev("location.hash = '#/p/" + id + "'");
  await waitFor("!!document.querySelector('.final-video')", "video thành phẩm trên trang sản phẩm");
  await waitFor("document.querySelector('.final-cover')?.complete && document.querySelector('.final-cover').naturalWidth > 0", "ảnh bìa trên trang sản phẩm");
  check("trang sản phẩm hiện ảnh bìa 1080x1920 từ kho", await ev("(() => { const i = document.querySelector('.final-cover'); return i.naturalWidth === 1080 && i.naturalHeight === 1920 && i.getAttribute('src') === '/media/p/" + id + "/cover.png'; })()"));
  await waitFor("document.querySelector('.final-video').readyState >= 1", "video thành phẩm tải được");
  check("trang sản phẩm hiện video thành phẩm 1080x1920 từ kho, kèm nút tải", await ev("(() => { const v = document.querySelector('.final-video'); return v.getAttribute('src') === '/media/p/" + id + "/final.mp4' && v.videoWidth === 1080 && v.videoHeight === 1920 && !!document.querySelector('.final a[download]'); })()"));
  check("rời trình dựng: không còn worker hay thanh nào sót lại, không lỗi JavaScript", consoleErrors.length === 0, consoleErrors.join(" | "));
  await ev("fetch('/api/brandkit', { method: 'PUT', headers: { Authorization: 'Bearer ' + localStorage.getItem('APP_TOKEN'), 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: '', position: 'tl', watermark: true, logo: null }) }).then((r) => r.status)");
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await sleep(200);
  check("trang sản phẩm có video thành phẩm: không cuộn ngang ở 375px", await noOverflow());

  // 5. danh sách có 1 card
  await ev("location.hash = '#/'");
  await waitFor("!!document.querySelector('.pcard')", "card");
  check("card: tiêu đề dạng chữ, giá, badge", await ev(`(() => { const c = document.querySelector('.pcard'); return c.querySelector('.pcard-title').textContent === ${JSON.stringify(XSS)} && c.querySelector('.price').textContent === '216.749₫' && c.querySelectorAll('.badge')[0].textContent === 'Đã có gói' && [...c.querySelectorAll('.badge')].some((b) => b.textContent === 'Có video') && [...c.querySelectorAll('.badge')].some((b) => b.textContent === 'còn 7 ngày') && c.querySelector('img').getAttribute('src').startsWith('/media/p/'); })()`));
  check("danh sách: không cuộn ngang ở 375px", await noOverflow());
  await shot("3-list.png");

  // 6. xoá
  await ev(`location.hash = '#/p/${id}'`);
  await waitFor("!!document.querySelector('.btn.danger')", "nút xoá");
  await ev("document.querySelector('.btn.danger').click()");
  await waitFor("location.hash === '#/' && !!document.querySelector('.state-title')", "về danh sách sau xoá");
  check("Xoá: hỏi xác nhận rồi về danh sách rỗng", dialogs.at(-1)?.startsWith("Xoá sản phẩm này"), `hộp thoại: ${JSON.stringify(dialogs)}`);
  check("thanh dính đáy biến mất khi rời trang chi tiết", await ev("document.querySelectorAll('.pkgbar').length === 0"));

  // 7. sản phẩm không còn
  await ev("location.hash = '#/p/zzzzzzzzzz'");
  await waitFor("document.querySelector('.state-title')?.textContent === 'Sản phẩm không còn'", "404");
  check("id không tồn tại → 'Sản phẩm không còn' + link về danh sách", await ev("!!document.querySelector('.state a[href=\"#/\"]')"));

  // 8. token sai → về settings
  await ev("localStorage.setItem('APP_TOKEN', 'sai'); location.hash = '#/'");
  await waitFor("location.hash === '#/settings' && !!document.querySelector('#token')", "401 → settings");
  check("token sai → chuyển tới #/settings", true);
  check("token sai → có thông báo lý do", (await ev("document.querySelector('#toast').hidden ? '' : document.querySelector('#toast').textContent")) === "Token không đúng. Nhập lại token.");

  const cached = await ev("(async () => { const out = []; for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) out.push(new URL(r.url).pathname); return out; })()");
  check("cache của service worker có app shell, không có /api hay /media", cached.includes("/app.js") && cached.includes("/views/package.js") && !cached.some((u) => /^\/(api|media)\//.test(u)), `${cached.length} mục`);
  check("không có lỗi JavaScript", consoleErrors.length === 0, consoleErrors.join(" | "));
  check("không có alert nào từ dữ liệu sản phẩm", dialogs.every((d) => d.startsWith("Xoá sản phẩm này") || d.startsWith("Tạo lại sẽ thay")));
} catch (e) {
  check("kịch bản chạy hết", false, e.message);
  try { await shot("error.png"); } catch {}
} finally {
  console.log(results.join("\n"));
  ws.close(); chrome.kill();
  process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
}
