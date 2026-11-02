import { FIELDS } from "./telemetry.js";
export class CollisionView {
  constructor(canvas, summary) {
    this.canvas = canvas;
    this.summary = summary;
    this.packet = null;
    this.data = null;
  }
  accept(packet, port) {
    if (this.packet)
      port.postMessage({ type: "recycle", buffer: this.packet.buffer }, [
        this.packet.buffer,
      ]);
    this.packet = packet;
    this.data = new Float32Array(packet.buffer);
    const n = packet.count,
      w = FIELDS.length,
      d = this.data;
    let stalledA = 0,
      stalledB = 0,
      minA = Infinity,
      maxA = -Infinity,
      minB = Infinity,
      maxB = -Infinity;
    for (let i = 0; i < n; i++) {
      const p = i * w;
      stalledA += d[p + 4] === 0;
      stalledB += d[p + 5] === 0;
      minA = Math.min(minA, d[p + 6]);
      maxA = Math.max(maxA, d[p + 6]);
      minB = Math.min(minB, d[p + 7]);
      maxB = Math.max(maxB, d[p + 7]);
    }
    const end = (n - 1) * w;
    this.summary.textContent = `${packet.coupling} · ${((1000 * n) / packet.rate).toFixed(1)} ms shared window · note ${packet.note} · A target ${d[end + 8].toFixed(1)} Hz / read velocity ${minA.toFixed(0)}…${maxA.toFixed(0)} Hz · B target ${d[end + 9].toFixed(1)} Hz / read velocity ${minB.toFixed(0)}…${maxB.toFixed(0)} Hz · stopped carrier samples A/B ${stalledA}/${stalledB}. Read velocity includes PM and sync jumps; it is not detected pitch.`;
    this.canvas.dataset.frames = packet.endFrame;
    this.canvas.dataset.coupling = packet.coupling;
  }
  snapshot() {
    if (!this.packet) return null;
    const { buffer, ...meta } = this.packet;
    return {
      ...meta,
      fields: FIELDS,
      sampling:
        "last oversample of each output sample; raw, not anti-aliased display data",
      samples: Array.from(
        this.data.subarray(0, this.packet.count * FIELDS.length),
      ),
    };
  }
  draw(amount) {
    const canvas = this.canvas,
      r = devicePixelRatio || 1,
      w = Math.round(canvas.clientWidth * r),
      h = Math.round(canvas.clientHeight * r);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const c = canvas.getContext("2d");
    c.clearRect(0, 0, w, h);
    const top = h * 0.77,
      center = top * 0.5,
      separation = top * 0.24 * (1 - amount),
      scale = top * 0.16;
    c.lineWidth = r;
    c.strokeStyle = "#354033";
    for (const y of [center - separation, center + separation, h * 0.9]) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
    if (!this.packet) return;
    const n = this.packet.count,
      stride = FIELDS.length,
      d = this.data;
    // Shared sample indices, min/max per pixel: never align sources independently.
    for (const [field, y, amplitude, color] of [
      [0, center - separation, scale, "#c8ed83"],
      [1, center + separation, scale, "#edaf76"],
      [10, h * 0.9, h * 0.065, "#98b5ce"],
    ]) {
      c.strokeStyle = color;
      c.lineWidth = r;
      c.beginPath();
      for (let x = 0; x < w; x += r) {
        const from = Math.floor((x / w) * n),
          to = Math.min(n, Math.max(from + 1, Math.floor(((x + r) / w) * n)));
        let lo = Infinity,
          hi = -Infinity;
        for (let i = from; i < to; i++) {
          const v = d[i * stride + field];
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
        c.moveTo(x, y - Math.max(-2, Math.min(2, lo)) * amplitude);
        c.lineTo(x, y - Math.max(-2, Math.min(2, hi)) * amplitude);
      }
      c.stroke();
      // Join actual sample values as well as the per-pixel extrema.
      c.beginPath();
      for (let x = 0; x < w; x += r) {
        const value = d[Math.floor((x / w) * n) * stride + field];
        const py = y - Math.max(-2, Math.min(2, value)) * amplitude;
        if (x === 0) c.moveTo(x, py);
        else c.lineTo(x, py);
      }
      c.stroke();
    }
  }
}
