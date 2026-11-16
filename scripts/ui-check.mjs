// Kiểm UI phase 1 bằng Chrome headless (375px) qua CDP. Cần `npm run dev` đang chạy và kho local rỗng.
// Chạy: node scripts/ui-check.mjs [thư mục lưu ảnh chụp]
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
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
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
const noOverflow = () => ev("document.documentElement.scrollWidth <= window.innerWidth");

try {
  // 1. chưa có token → settings
  await send("Page.navigate", { url: B + "/" });
  await waitFor("location.hash === '#/settings' && !!document.querySelector('#token')", "settings");
  check("chưa có token → chuyển tới #/settings", true);
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
  check("3 ảnh có nhãn Ảnh 1..3", await ev("[...document.querySelectorAll('.media-grid figcaption span')].map(s => s.textContent).join() === 'Ảnh 1,Ảnh 2,Ảnh 3'"));
  check("ảnh 1 đã lưu: src /media/, nút Tải có download", await ev(`(() => { const f = document.querySelector('.media-grid figure'); const a = f.querySelector('a'); return f.querySelector('img').getAttribute('src') === '/media/p/${id}/img_01.png' && a.hasAttribute('download') && a.getAttribute('download') === '${id}_img_01.png'; })()`));
  check("ảnh 2 chưa lưu: nút Mở link gốc ở tab mới", await ev("(() => { const a = document.querySelectorAll('.media-grid figure')[1].querySelector('a'); return a.href.startsWith('https://cdn.example.test/') && a.target === '_blank' && !a.hasAttribute('download'); })()"));
  await waitFor("document.querySelectorAll('.media-grid figure')[1].querySelector('.noimg')?.textContent === 'Không tải được ảnh'", "ô thay ảnh vỡ");
  check("ảnh link gốc không tải được → hiện 'Không tải được ảnh'", true);
  check("video trùng chỉ hiện 1 lần, có controls + playsinline", await ev("(() => { const v = document.querySelectorAll('video'); return v.length === 1 && v[0].controls && v[0].hasAttribute('playsinline'); })()"));
  check("có ghi chú số file dùng link gốc", (await ev("document.querySelector('.hint')?.textContent || ''")).startsWith("3 file chưa lưu"));
  await waitFor("document.querySelector('.media-grid img').complete && document.querySelector('.media-grid img').naturalWidth > 0", "ảnh thật tải xong");
  check("ảnh đã lưu hiển thị được từ /media", true);
  check("chi tiết: không cuộn ngang ở 375px", await noOverflow());
  await shot("2-detail.png");

  // 5. danh sách có 1 card
  await ev("location.hash = '#/'");
  await waitFor("!!document.querySelector('.pcard')", "card");
  check("card: tiêu đề dạng chữ, giá, badge", await ev(`(() => { const c = document.querySelector('.pcard'); return c.querySelector('.pcard-title').textContent === ${JSON.stringify(XSS)} && c.querySelector('.price').textContent === '216.749₫' && c.querySelectorAll('.badge')[0].textContent === 'Chưa tạo gói' && c.querySelectorAll('.badge')[1].textContent === 'còn 7 ngày' && c.querySelector('img').getAttribute('src').startsWith('/media/p/'); })()`));
  check("danh sách: không cuộn ngang ở 375px", await noOverflow());
  await shot("3-list.png");

  // 6. xoá
  await ev(`location.hash = '#/p/${id}'`);
  await waitFor("!!document.querySelector('.btn.danger')", "nút xoá");
  await ev("document.querySelector('.btn.danger').click()");
  await waitFor("location.hash === '#/' && !!document.querySelector('.state-title')", "về danh sách sau xoá");
  check("Xoá: hỏi xác nhận rồi về danh sách rỗng", dialogs.length === 1 && dialogs[0].startsWith("Xoá sản phẩm này"), `hộp thoại: ${JSON.stringify(dialogs)}`);

  // 7. sản phẩm không còn
  await ev("location.hash = '#/p/zzzzzzzzzz'");
  await waitFor("document.querySelector('.state-title')?.textContent === 'Sản phẩm không còn'", "404");
  check("id không tồn tại → 'Sản phẩm không còn' + link về danh sách", await ev("!!document.querySelector('.state a[href=\"#/\"]')"));

  // 8. token sai → về settings
  await ev("localStorage.setItem('APP_TOKEN', 'sai'); location.hash = '#/'");
  await waitFor("location.hash === '#/settings' && !!document.querySelector('#token')", "401 → settings");
  check("token sai → chuyển tới #/settings", true);

  check("không có lỗi JavaScript", consoleErrors.length === 0, consoleErrors.join(" | "));
  check("không có alert nào từ dữ liệu sản phẩm", dialogs.every((d) => d.startsWith("Xoá sản phẩm này")));
} catch (e) {
  check("kịch bản chạy hết", false, e.message);
  try { await shot("error.png"); } catch {}
} finally {
  console.log(results.join("\n"));
  ws.close(); chrome.kill();
  process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
}
