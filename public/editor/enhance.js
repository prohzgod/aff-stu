// Làm đẹp hình nguồn trước khi ghép (docs/spec/hau-ky.md mục 9.7). Chỉ chạy trong Web Worker.
//   Chuẩn:      phóng bằng GPU (WebGL2) kèm làm nét nhẹ (unsharp).
//   Enhance AI: WebSR trên WebGPU, phóng 2 lần bằng mạng nơ-ron; hàm ghép sau đó thu về 1080x1920.
// Chữ, sticker, phụ đề, watermark luôn được vẽ SAU bước này, thẳng ở 1080x1920, nên luôn nét.

import { enhanceScale } from "./timeline.js";

const SHARPEN_AMOUNT = 0.4;
const WEIGHTS_URL = "/editor/vendor/weights/websr-cnn-m-v0.1.0.bin";
const NETWORK = "websr/cnn-m";
const MODEL_CACHE = "as-models-v1"; // tên không bắt đầu bằng "affiliate-studio-" để service worker không dọn mất

// Giữ kết quả trong một canvas 2D riêng: canvas WebGL/WebGPU có thể bị xoá trắng sau khi nhường luồng.
function holder() {
  const canvas = new OffscreenCanvas(2, 2);
  const ctx = canvas.getContext("2d", { alpha: false });
  return (from, width, height) => {
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    ctx.drawImage(from, 0, 0, width, height);
    return { width, height, draw: (c, x, y, w, h) => c.drawImage(canvas, x, y, w, h) };
  };
}

// ----- Chuẩn: phóng + làm nét bằng WebGL2 -----
const VERTEX = `#version 300 es
out vec2 uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  gl_Position = vec4(p, 0.0, 1.0);
}`;
const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D image;
uniform vec2 texel;
uniform float amount;
in vec2 uv;
out vec4 color;
void main() {
  vec3 c = texture(image, uv).rgb;
  vec3 blur = (texture(image, uv + vec2(texel.x, 0.0)).rgb + texture(image, uv - vec2(texel.x, 0.0)).rgb
             + texture(image, uv + vec2(0.0, texel.y)).rgb + texture(image, uv - vec2(0.0, texel.y)).rgb) * 0.25;
  color = vec4(clamp(c + amount * (c - blur), 0.0, 1.0), 1.0);
}`;

export function createSharpener() {
  const canvas = new OffscreenCanvas(2, 2);
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, premultipliedAlpha: false });
  if (!gl) return null;
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "shader");
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Không khởi tạo được bộ làm nét");
  gl.useProgram(program);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  for (const [name, value] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, name, value);
  gl.uniform1i(gl.getUniformLocation(program, "image"), 0);
  gl.uniform1f(gl.getUniformLocation(program, "amount"), SHARPEN_AMOUNT);
  const texel = gl.getUniformLocation(program, "texel");
  const hold = holder();

  return {
    // source: VideoFrame hoặc ImageBitmap; trả hình đã phóng và làm nét, hoặc null nếu nguồn đã đủ lớn.
    process(source, width, height) {
      const scale = enhanceScale(width);
      if (scale === 1 || gl.isContextLost()) return null;
      const w = Math.round(width * scale), h = Math.round(height * scale);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.uniform2f(texel, 1 / w, 1 / h); // bán kính khoảng 1 điểm ảnh của hình đầu ra
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return hold(canvas, w, h);
    },
  };
}

// ----- Enhance AI: WebSR trên WebGPU -----
export async function hasWebGpu() {
  try {
    return Boolean(self.navigator?.gpu && (await navigator.gpu.requestAdapter()));
  } catch {
    return false;
  }
}

// Model chỉ tải một lần, lần sau lấy từ Cache Storage.
async function loadWeights() {
  try {
    const cache = await caches.open(MODEL_CACHE);
    const hit = await cache.match(WEIGHTS_URL);
    if (hit) return hit.arrayBuffer();
    const res = await fetch(WEIGHTS_URL);
    if (!res.ok) throw new Error("weights");
    await cache.put(WEIGHTS_URL, res.clone());
    return res.arrayBuffer();
  } catch {
    const res = await fetch(WEIGHTS_URL);
    if (!res.ok) throw new Error("Không tải được model Enhance AI");
    return res.arrayBuffer();
  }
}

export async function createAiEnhancer() {
  await import("./vendor/websr-0.1.1.js"); // bản UMD: tự gắn vào self.WebSR
  const WebSR = self.WebSR?.default || self.WebSR;
  if (!WebSR) throw new Error("Không nạp được WebSR");
  const gpu = await WebSR.initWebGPU();
  if (!gpu) throw new Error("Thiết bị này không có WebGPU");
  const weights = WebSR.parseBinaryWeights(await loadWeights());
  const canvas = new OffscreenCanvas(2, 2);
  const websr = new WebSR({ network_name: NETWORK, weights, gpu, canvas });
  const hold = holder();
  return {
    // source: VideoFrame hoặc ImageBitmap. Mạng phóng 2 lần; hàm ghép thu về khung 1080x1920.
    async process(source) {
      await websr.render(source);
      return hold(canvas, canvas.width, canvas.height);
    },
    destroy: () => websr.destroy?.().catch?.(() => {}),
  };
}
