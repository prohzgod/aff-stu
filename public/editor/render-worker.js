// Web Worker của Hậu kỳ: đọc thông tin clip, kiểm khả năng thiết bị, và xuất MP4 1080x1920.
// Luồng: giải mã → composeFrame → mã hoá H.264 → đóng gói MP4. Tiếng được giải mã, ghép theo timeline rồi mã hoá lại AAC.
//
// Tin nhắn vào:  { type: "capabilities" } | { type: "probe", id, blob } | { type: "render", job } | { type: "cancel" }
// Tin nhắn ra:   { type: "capabilities", video, audio } | { type: "probe", id, info | error }
//                { type: "progress", value } | { type: "done", buffer, info } | { type: "error", message, cancelled? }

import * as MB from "./vendor/mediabunny-1.66.0.min.mjs";
import { OUTPUT, SAMPLE_RATE, buildSchedule, frameSourceTime, kenBurnsScale, outputFps, validateTimeline } from "./timeline.js";
import { placeSamples } from "./audio.js";
import { composeFrame } from "./compose.js";
import { activeOverlays } from "./overlays.js";
import { loadFonts } from "./fonts.js";

const VIDEO_BITRATE = 8_000_000;
const AUDIO_BITRATE = 160_000;
const AUDIO_CHUNK = 4800; // 0,1 giây mỗi lần đẩy vào encoder

let cancelled = false;

const openInput = (blob) => new MB.Input({ formats: MB.ALL_FORMATS, source: new MB.BlobSource(blob) });

async function capabilities() {
  const [video, audio] = await Promise.all([
    MB.canEncodeVideo("avc", { width: OUTPUT.width, height: OUTPUT.height, bitrate: VIDEO_BITRATE }).catch(() => false),
    MB.canEncodeAudio("aac", { numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: AUDIO_BITRATE }).catch(() => false),
  ]);
  return { video, audio };
}

async function probe(blob) {
  if (blob.type.startsWith("image/")) {
    const bitmap = await createImageBitmap(blob);
    const info = { kind: "image", width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return info;
  }
  const input = openInput(blob);
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error("File này không có hình");
    if (!(await video.canDecode())) throw new Error("Trình duyệt không giải mã được định dạng video này");
    const audio = await input.getPrimaryAudioTrack();
    const stats = await video.computePacketStats(120);
    return {
      kind: "clip",
      width: video.displayWidth,
      height: video.displayHeight,
      duration: await video.computeDuration(),
      fps: stats.averagePacketRate,
      hasAudio: Boolean(audio && (await audio.canDecode())),
    };
  } finally {
    input.dispose?.();
  }
}

async function render(job) {
  const { segments, watermark, overlays } = job;
  const problems = validateTimeline(segments);
  if (problems.length) throw new Error(problems[0]);

  const fps = outputFps(segments);
  const schedule = buildSchedule(segments, fps);
  const canvas = new OffscreenCanvas(OUTPUT.width, OUTPUT.height);
  const ctx = canvas.getContext("2d", { alpha: false });

  await loadFonts(self.fonts); // trước frame đầu, để chữ tiếng Việt không ra font dự phòng
  // Đoạn ảnh bìa đã có chữ riêng: không phủ lớp chữ hay watermark lên nó.
  const layers = (seg, frameIndex) => (seg.isCover ? { overlays: [], watermark: null } : { overlays: activeOverlays(overlays, frameIndex / fps, schedule.duration), watermark: mark });
  const mark = watermark ? { ...watermark, logo: watermark.logoBlob ? await createImageBitmap(watermark.logoBlob) : null } : null;

  const output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: "in-memory" }), target: new MB.BufferTarget() });
  const videoSource = new MB.CanvasSource(canvas, { codec: "avc", bitrate: VIDEO_BITRATE, keyFrameInterval: 2 });
  const audioSource = new MB.AudioSampleSource({ codec: "aac", bitrate: AUDIO_BITRATE });
  output.addVideoTrack(videoSource, { frameRate: fps });
  output.addAudioTrack(audioSource);
  await output.start();

  // Mỗi file nguồn chỉ mở một lần, dù được dùng ở nhiều đoạn.
  const inputs = new Map();
  const inputFor = (blob) => {
    if (!inputs.has(blob)) inputs.set(blob, openInput(blob));
    return inputs.get(blob);
  };
  const stop = () => { if (cancelled) throw Object.assign(new Error("Đã huỷ"), { cancelled: true }); };

  try {
    // ----- tiếng: ghép vào bộ đệm của cả timeline; đoạn không có tiếng để nguyên số 0 (im lặng) -----
    const mix = [new Float32Array(schedule.totalSamples), new Float32Array(schedule.totalSamples)];
    for (const item of schedule.items) {
      const seg = segments[item.index];
      if (seg.type !== "clip" || seg.muted) continue;
      const track = await inputFor(seg.blob).getPrimaryAudioTrack();
      if (!track || !(await track.canDecode())) continue;
      const sink = new MB.AudioSampleSink(track);
      for await (const sample of sink.samples(seg.in, seg.out)) {
        stop();
        const plane = new Float32Array(sample.numberOfFrames);
        for (let ch = 0; ch < 2; ch++) {
          sample.copyTo(plane, { planeIndex: Math.min(ch, sample.numberOfChannels - 1), format: "f32-planar" });
          placeSamples(mix[ch], item.startSample, item.sampleCount, plane, sample.sampleRate, sample.timestamp - seg.in, SAMPLE_RATE);
        }
        sample.close();
      }
    }

    // ----- hình -----
    let done = 0;
    const emit = async (frameIndex) => {
      await videoSource.add(frameIndex / fps, 1 / fps);
      done++;
      if (done % 6 === 0 || done === schedule.totalFrames) postMessage({ type: "progress", value: (done / schedule.totalFrames) * 0.95 });
    };

    for (const item of schedule.items) {
      const seg = segments[item.index];
      if (seg.type === "clip") {
        const track = await inputFor(seg.blob).getPrimaryVideoTrack();
        const sink = new MB.VideoSampleSink(track);
        const times = Array.from({ length: item.frameCount }, (_, k) => frameSourceTime(seg, k, fps));
        let k = 0;
        let last = null; // frame gần nhất, dùng lại khi clip hết hình sớm hơn điểm cắt
        for await (const sample of sink.samplesAtTimestamps(times)) {
          stop();
          const current = sample || last;
          composeFrame(ctx, {
            source: current && { width: current.displayWidth, height: current.displayHeight, draw: (c, x, y, w, h) => current.draw(c, x, y, w, h) },
            fit: seg.fit,
            ...layers(seg, item.startFrame + k),
          });
          if (sample && sample !== last) { last?.close(); last = sample; }
          await emit(item.startFrame + k);
          k++;
        }
        last?.close();
      } else {
        const bitmap = await createImageBitmap(seg.blob);
        const source = { width: bitmap.width, height: bitmap.height, draw: (c, x, y, w, h) => c.drawImage(bitmap, x, y, w, h) };
        for (let k = 0; k < item.frameCount; k++) {
          stop();
          const progress = item.frameCount > 1 ? k / (item.frameCount - 1) : 0;
          composeFrame(ctx, { source, fit: seg.fit, zoom: seg.kenBurns ? kenBurnsScale(progress) : 1, ...layers(seg, item.startFrame + k) });
          await emit(item.startFrame + k);
        }
        bitmap.close();
      }
    }

    // ----- đẩy tiếng vào encoder -----
    for (let offset = 0; offset < schedule.totalSamples; offset += AUDIO_CHUNK) {
      stop();
      const n = Math.min(AUDIO_CHUNK, schedule.totalSamples - offset);
      const data = new Float32Array(n * 2);
      data.set(mix[0].subarray(offset, offset + n), 0);
      data.set(mix[1].subarray(offset, offset + n), n);
      const sample = new MB.AudioSample({ data, format: "f32-planar", numberOfChannels: 2, sampleRate: SAMPLE_RATE, timestamp: offset / SAMPLE_RATE });
      await audioSource.add(sample);
      sample.close();
    }

    await output.finalize();
    const buffer = output.target.buffer;
    postMessage({ type: "progress", value: 1 });
    return { buffer, info: { fps, frames: schedule.totalFrames, duration: schedule.duration, width: OUTPUT.width, height: OUTPUT.height, bytes: buffer.byteLength } };
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  } finally {
    mark?.logo?.close?.();
    for (const input of inputs.values()) input.dispose?.();
  }
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "cancel") {
      cancelled = true;
    } else if (data.type === "capabilities") {
      postMessage({ type: "capabilities", ...(await capabilities()) });
    } else if (data.type === "probe") {
      try {
        postMessage({ type: "probe", id: data.id, info: await probe(data.blob) });
      } catch (error) {
        postMessage({ type: "probe", id: data.id, error: error?.message || "Không đọc được file" });
      }
    } else if (data.type === "render") {
      cancelled = false;
      const { buffer, info } = await render(data.job);
      postMessage({ type: "done", buffer, info }, [buffer]);
    }
  } catch (error) {
    postMessage({ type: "error", message: error?.message || "Lỗi khi xuất video", cancelled: Boolean(error?.cancelled) });
  }
};
