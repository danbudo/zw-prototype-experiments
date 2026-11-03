import { referenceMidi } from "./pitch.js";
import { Engine } from "./dsp.js";
import { History, HISTORY, FIELDS } from "./telemetry.js";
import { Audition } from "./audition.js";
class CLLDR extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = new Engine(sampleRate);
    this.history = new History();
    this.engine.telemetry = this.history;
    this.audition = new Audition(sampleRate);
    this.frames = 0;
    this.nextPacket = 0;
    this.telemetryEnabled = false;
    this.pool = Array.from(
      { length: 3 },
      () => new Float32Array(HISTORY * FIELDS.length),
    );
    this.port.onmessage = ({ data }) => {
      if (data.type === "config") this.engine.configure(data.value);
      if (data.type === "on") {
        this.audition.enabled = false;
        this.audition.singleOff = Infinity;
        this.engine.noteOffset = 0;
        this.engine.trigger();
      }
      if (data.type === "clean-on")
        this.audition.strike(this.engine, !!data.value?.sustain);
      if (data.type === "off") this.audition.stop(this.engine);
      if (data.type === "audition") {
        if (data.value) this.audition.start();
        else this.audition.stop(this.engine);
      }
      if (data.type === "lock")
        this.engine.lock = Math.max(
          -200,
          Math.min(200, Number(data.value) || 0),
        );
      if (data.type === "telemetry") this.telemetryEnabled = !!data.value;
      if (
        data.type === "recycle" &&
        data.buffer instanceof ArrayBuffer &&
        data.buffer.byteLength === HISTORY * FIELDS.length * 4 &&
        this.pool.length < 3
      )
        this.pool.push(new Float32Array(data.buffer));
    };
  }
  process(inputs, outputs) {
    const out = outputs[0];
    for (let i = 0; i < out[0].length; i++) {
      this.audition.tick(this.engine);
      const v = this.engine.sample();
      for (const ch of out) ch[i] = v;
      this.frames++;
    }
    if (this.telemetryEnabled && this.frames >= this.nextPacket) {
      this.nextPacket = this.frames + Math.round(sampleRate / 20);
      const packet = this.pool.pop();
      if (packet) {
        const count = this.history.copyInto(packet);
        this.port.postMessage(
          {
            type: "telemetry",
            buffer: packet.buffer,
            count,
            endFrame: this.frames,
            rate: sampleRate,
            note: referenceMidi(this.engine.p, this.engine.noteOffset),
            depth: this.engine.depth,
            coupling: this.engine.p.coupling,
          },
          [packet.buffer],
        );
      }
    }
    return true;
  }
}
registerProcessor("clldr-engine", CLLDR);
