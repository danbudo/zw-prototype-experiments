import test from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../dsp.js";
import { HISTORY, FIELDS } from "../telemetry.js";
test("worklet telemetry uses a bounded transferable pool and recycles under backpressure", async () => {
  const events = [];
  globalThis.sampleRate = 48000;
  globalThis.AudioWorkletProcessor = class {
    constructor() {
      this.port = {
        postMessage: (data, transfer) =>
          events.push(structuredClone(data, { transfer })),
      };
    }
  };
  let Processor;
  globalThis.registerProcessor = (name, c) => {
    Processor = c;
  };
  try {
    await import("../worklet.js");
    const p = new Processor();
    const msg = (data) => p.port.onmessage({ data });
    msg({ type: "config", value: defaults });
    msg({ type: "telemetry", value: true });
    msg({ type: "clean-on" });
    const output = [[new Float32Array(128)]];
    for (let i = 0; i < 200; i++) p.process([], output);
    assert.equal(events.length, 3);
    assert.equal(p.pool.length, 0);
    for (const event of events) {
      assert.ok(event.count > 0 && event.count <= HISTORY);
      assert.equal(event.buffer.byteLength, HISTORY * FIELDS.length * 4);
      const values = new Float32Array(event.buffer);
      assert.ok(values.every(Number.isFinite));
    }
    const returned = structuredClone(
      { type: "recycle", buffer: events[0].buffer },
      { transfer: [events[0].buffer] },
    );
    msg(returned);
    assert.equal(p.pool.length, 1);
    for (let i = 0; i < 30; i++) p.process([], output);
    assert.equal(events.length, 4);
    assert.equal(p.pool.length, 0);
    assert.ok(events[3].endFrame > events[2].endFrame);
    msg({ type: "telemetry", value: false });
    msg({
      type: "config",
      value: { ...defaults, auditionRate: 8, auditionSequence: true },
    });
    msg({ type: "audition", value: true });
    for (let i = 0; i < 50; i++) p.process([], output);
    assert.equal(p.audition.enabled, true);
    assert.notEqual(p.engine.noteOffset, 0);
    msg({ type: "off" });
    assert.equal(p.audition.enabled, false);
    assert.equal(p.engine.noteOffset, 0);
  } finally {
    delete globalThis.sampleRate;
    delete globalThis.AudioWorkletProcessor;
    delete globalThis.registerProcessor;
  }
});
