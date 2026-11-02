import { Engine } from "./dsp.js";
class CLLDR extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = new Engine(sampleRate);
    this.port.onmessage = ({ data }) => {
      if (data.type === "config") this.engine.configure(data.value);
      if (data.type === "on") this.engine.trigger();
      if (data.type === "off") this.engine.release();
      if (data.type === "lock")
        this.engine.lock = Math.max(
          -200,
          Math.min(200, Number(data.value) || 0),
        );
    };
  }
  process(inputs, outputs) {
    const out = outputs[0];
    for (let i = 0; i < out[0].length; i++) {
      const v = this.engine.sample();
      for (const ch of out) ch[i] = v;
    }
    return true;
  }
}
registerProcessor("clldr-engine", CLLDR);
