// Lớp gọi Web Worker xuất video, dùng chung cho trình dựng và màn hình dựng hàng loạt.

export function createWorker() {
  const worker = new Worker("/editor/render-worker.js", { type: "module" });
  let probeSeq = 0;
  const waiting = new Map();
  let onProgress = null, settle = null;
  worker.addEventListener("message", ({ data }) => {
    if (data.type === "probe") waiting.get(data.id)?.(data);
    else if (data.type === "audio") waiting.get(`audio${data.id}`)?.(data);
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
    audio: (job) => new Promise((resolve, reject) => {
      const id = ++probeSeq;
      waiting.set(`audio${id}`, (data) => { waiting.delete(`audio${id}`); data.error ? reject(new Error(data.error)) : resolve(data); });
      worker.postMessage({ type: "audio", id, job });
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
