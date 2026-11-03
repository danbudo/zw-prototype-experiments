import { FIELDS } from "./telemetry.js";
export class CollisionView {
  constructor(canvas, summary) {
    this.canvas = canvas;
    this.summary = summary;
    this.packet = null;
    this.data = null;
    this.window = null;
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
    if (!n) return;
    let stoppedA = 0,
      stoppedB = 0,
      minA = Infinity,
      maxA = -Infinity,
      minB = Infinity,
      maxB = -Infinity;
    for (let i = 0; i < n; i++) {
      const p = i * w;
      stoppedA += d[p + 4] === 0;
      stoppedB += d[p + 5] === 0;
      minA = Math.min(minA, d[p + 6]);
      maxA = Math.max(maxA, d[p + 6]);
      minB = Math.min(minB, d[p + 7]);
      maxB = Math.max(maxB, d[p + 7]);
    }
    const end = (n - 1) * w;
    this.summary.textContent = `${packet.coupling} · ${((1000 * n) / packet.rate).toFixed(1)} ms captured · note ${packet.note} · A target ${d[end + 8].toFixed(2)} Hz / read velocity ${minA.toFixed(0)}…${maxA.toFixed(0)} Hz · B target ${d[end + 9].toFixed(2)} Hz / read velocity ${minB.toFixed(0)}…${maxB.toFixed(0)} Hz · stopped carrier samples A/B ${stoppedA}/${stoppedB}. Raw snapshots; read velocity is not detected pitch.`;
    this.canvas.dataset.frames = packet.endFrame;
    this.canvas.dataset.coupling = packet.coupling;
    this.canvas.dataset.note = packet.note;
  }
  snapshot() {
    if (!this.packet) return null;
    const { buffer, ...meta } = this.packet;
    return {
      ...meta,
      fields: FIELDS,
      view: this.window,
      sampling:
        "last oversample of each output sample; shared window, raw display data",
      samples: Array.from(
        this.data.subarray(0, this.packet.count * FIELDS.length),
      ),
    };
  }
  draw(amount, mode = "multiply") {
    const canvas = this.canvas,
      r = devicePixelRatio || 1,
      w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (
      canvas.width !== Math.round(w * r) ||
      canvas.height !== Math.round(h * r)
    ) {
      canvas.width = Math.round(w * r);
      canvas.height = Math.round(h * r);
    }
    const c = canvas.getContext("2d");
    c.setTransform(r, 0, 0, r, 0, 0);
    c.clearRect(0, 0, w, h);
    const colours = ["#c6e88b", "#a4bfce", "#e8b77e"],
      labels = [
        "OSC A",
        mode === "multiply"
          ? "RESULT · A × B"
          : mode === "switch"
            ? "RESULT · SWITCH"
            : "RESULT · XOR",
        "OSC B",
      ];
    const centers = [
        h * (0.17 + 0.045 * amount),
        h * 0.5,
        h * (0.83 - 0.045 * amount),
      ],
      fields = [0, 10, 1],
      left = 10,
      right = w - 10;
    if (!this.packet) {
      c.fillStyle = "#8b9785";
      c.font = "10px monospace";
      c.fillText("Enable audio to see actual source signals", 12, h / 2);
      return;
    }
    const packet = this.packet,
      stride = FIELDS.length,
      d = this.data,
      end = (packet.count - 1) * stride;
    const fa = d[end + 8],
      fb = d[end + 9],
      positive = [fa, fb].filter((v) => v > 0),
      slow = positive.length ? Math.min(...positive) : 20;
    const desired = Math.ceil(
      packet.rate * Math.max(0.004, Math.min(0.17, 3 / slow)),
    );
    const count = Math.max(2, Math.min(packet.count, desired));
    let start = packet.count - count,
      triggered = false;
    // One A edge aligns all three traces. Never independently align B or RESULT.
    const back = Math.min(start, Math.ceil(packet.rate / Math.max(5, fa)));
    for (let i = start; i > start - back; i--) {
      if (d[(i - 1) * stride] < 0 && d[i * stride] >= 0) {
        start = i;
        triggered = true;
        break;
      }
    }
    this.window = {
      start,
      count,
      durationMs: (1000 * count) / packet.rate,
      trigger: triggered ? "shared A rising edge" : "shared sample clock",
    };
    canvas.dataset.windowMs = this.window.durationMs;
    c.font = "8px monospace";
    c.lineWidth = 0.7;
    for (let trace = 0; trace < 3; trace++) {
      const field = fields[trace],
        center = centers[trace];
      let peak = 0;
      for (let i = 0; i < count; i++)
        peak = Math.max(peak, Math.abs(d[(start + i) * stride + field]));
      const scale = Math.max(1, Math.ceil(peak * 2) / 2),
        height = (h * (trace === 1 ? 0.12 : 0.1)) / scale;
      c.strokeStyle = "#2b3529";
      c.beginPath();
      c.moveTo(left, center);
      c.lineTo(right, center);
      c.stroke();
      c.fillStyle = colours[trace];
      c.fillText(labels[trace], left, center - h * 0.12);
      c.textAlign = "right";
      c.fillStyle = "#879780";
      c.fillText(`±${scale}`, right, center - h * 0.12);
      c.textAlign = "left";
      c.strokeStyle = colours[trace];
      c.lineWidth = 1;
      c.beginPath();
      for (let x = 0; x < right - left; x++) {
        const from = Math.floor((x / (right - left)) * count),
          to = Math.min(
            count,
            Math.max(from + 1, Math.floor(((x + 1) / (right - left)) * count)),
          );
        let lo = Infinity,
          hi = -Infinity;
        for (let i = from; i < to; i++) {
          const v = d[(start + i) * stride + field];
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
        c.moveTo(left + x, center - lo * height);
        c.lineTo(left + x, center - hi * height);
      }
      c.stroke();
      c.beginPath();
      for (let x = 0; x < right - left; x++) {
        const v =
            d[
              (start + Math.floor((x / (right - left)) * count)) * stride +
                field
            ],
          y = center - v * height;
        x ? c.lineTo(left + x, y) : c.moveTo(left, y);
      }
      c.stroke();
    }
    c.fillStyle = "#879780";
    c.font = "8px monospace";
    c.textAlign = "right";
    c.fillText(
      `${this.window.durationMs.toFixed(1)} ms · shared ${triggered ? "A edge" : "clock"}`,
      right,
      h - 5,
    );
    c.textAlign = "left";
  }
}
