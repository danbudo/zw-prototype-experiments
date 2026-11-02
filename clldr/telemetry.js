// Interleaved, synchronised raw snapshots at output sample rate (last oversample).
// Bounded rings and transferable packet pool: no audio-sample allocation.
export const FIELDS = [
  "a",
  "b",
  "phaseA",
  "phaseB",
  "carrierHzA",
  "carrierHzB",
  "readHzA",
  "readHzB",
  "targetA",
  "targetB",
  "interaction",
  "loopInput",
];
export const HISTORY = 2048;
export class History {
  constructor(size = HISTORY) {
    this.size = size;
    this.data = new Float32Array(size * FIELDS.length);
    this.pos = 0;
    this.count = 0;
  }
  push(e) {
    let i = this.pos * FIELDS.length;
    const d = this.data;
    d[i++] = e.values[0];
    d[i++] = e.values[1];
    d[i++] = e.readPhase[0];
    d[i++] = e.readPhase[1];
    d[i++] = e.carrierHz[0];
    d[i++] = e.carrierHz[1];
    d[i++] = e.readHz[0];
    d[i++] = e.readHz[1];
    d[i++] = e.targets[0];
    d[i++] = e.targets[1];
    d[i++] = e.interaction;
    d[i] = e.loopInput;
    this.pos = (this.pos + 1) % this.size;
    this.count = Math.min(this.count + 1, this.size);
  }
  copyInto(target) {
    const width = FIELDS.length,
      start = (this.pos - this.count + this.size) % this.size;
    for (let j = 0; j < this.count; j++) {
      const from = ((start + j) % this.size) * width,
        to = j * width;
      for (let k = 0; k < width; k++) target[to + k] = this.data[from + k];
    }
    return this.count;
  }
}
