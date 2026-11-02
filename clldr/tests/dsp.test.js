import test from "node:test";
import assert from "node:assert/strict";
import { Engine, interact, sanitize, defaults } from "../dsp.js";
import { presets } from "../presets.js";
import { estimatePitch, pitchLabel } from "../analysis.js";
test("three interactions have distinct algebra", () => {
  assert.equal(interact(0.3, -0.2, "multiply"), -0.06);
  assert.equal(interact(0.3, -0.2, "switch"), -0.3);
  assert.equal(interact(0.3, -0.2, "xor"), 1);
  assert.equal(interact(-0.3, -0.2, "xor"), -1);
});
test("configuration bounds reject nonfinite and invalid values", () => {
  const p = sanitize({
    fm: Infinity,
    feedback: 20,
    a: { ratio: -1, wave: "bad" },
    note: NaN,
  });
  assert.equal(p.fm, 0);
  assert.equal(p.feedback, 0.94);
  assert.equal(p.a.ratio, 0.125);
  assert.equal(p.a.wave, "sine");
  assert.equal(p.note, defaults.note);
});
for (const [name, p] of Object.entries(presets))
  test(`${name}: audible, finite and bounded at 48 kHz; releases`, () => {
    const e = new Engine(48000);
    e.configure(p);
    e.trigger();
    let energy = 0,
      peak = 0;
    for (let i = 0; i < 48000; i++) {
      const v = e.sample();
      assert.ok(Number.isFinite(v));
      energy += v * v;
      peak = Math.max(peak, Math.abs(v));
    }
    assert.ok(energy / 48000 > 1e-6);
    assert.ok(peak <= 0.8);
    e.configure({ ...p, drone: false });
    e.release();
    for (let i = 0; i < 48000 * (p.release + 0.1); i++) e.sample();
    assert.equal(e.env, 0);
    assert.ok(e.sample() === 0);
  });
test("multiplication generates sum and difference rather than a carrier-only signal", () => {
  const sr = 48000,
    e = new Engine(sr);
  e.configure({
    ...defaults,
    note: 57,
    a: { ...defaults.a },
    b: { ...defaults.b, ratio: 2 },
    attack: 0.002,
    sustain: 1,
  });
  e.trigger();
  for (let i = 0; i < 10000; i++) e.sample();
  const buffer = Float64Array.from({ length: sr }, () => e.sample());
  function power(hz) {
    let a = 0,
      b = 0;
    buffer.forEach((v, i) => {
      a += v * Math.sin((2 * Math.PI * hz * i) / sr);
      b += v * Math.cos((2 * Math.PI * hz * i) / sr);
    });
    return Math.hypot(a, b) / sr;
  }
  assert.ok(power(220) > 0.03);
  assert.ok(power(660) > 0.03);
  assert.ok(power(440) < 0.005);
});
test("tuner detects a known output and rejects silence/noise", () => {
  const rate = 48000,
    buf = Float32Array.from(
      { length: 8192 },
      (_, i) => 0.25 * Math.sin((2 * Math.PI * 440 * i) / rate),
    );
  const p = estimatePitch(buf, rate);
  assert.ok(Math.abs(p.hz - 440) < 1);
  assert.ok(p.confidence > 0.98);
  assert.equal(pitchLabel(p.hz).name, "A4");
  assert.equal(estimatePitch(new Float32Array(8192), rate), null);
  let seed = 1;
  const noise = Float32Array.from({ length: 8192 }, () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 2 ** 32 - 0.5) * 0.3;
  });
  assert.equal(estimatePitch(noise, rate), null);
});
test("extreme modulation remains finite at common sample rates", () => {
  for (const rate of [44100, 48000, 96000]) {
    const e = new Engine(rate);
    e.configure({
      ...presets.collision,
      note: 96,
      fm: 1000,
      feedback: 0.94,
      noise: 0.15,
      volume: 0.85,
      a: { ...presets.collision.a, ratio: 8, dc: 0.8 },
      b: { ...presets.collision.b, ratio: 8, dc: -0.8 },
      drone: true,
    });
    for (let i = 0; i < rate * 0.2; i++) {
      const v = e.sample();
      assert.ok(Number.isFinite(v) && Math.abs(v) <= 0.8);
    }
  }
});

test("worklet messaging and render blocks work without main-thread cloning APIs", async () => {
  const clone = globalThis.structuredClone;
  let Processor;
  globalThis.structuredClone = undefined;
  globalThis.sampleRate = 48000;
  globalThis.AudioWorkletProcessor = class {
    constructor() {
      this.port = {};
    }
  };
  globalThis.registerProcessor = (name, implementation) => {
    assert.equal(name, "clldr-engine");
    Processor = implementation;
  };
  try {
    await import("../worklet.js");
    const processor = new Processor();
    processor.port.onmessage({ data: { type: "config", value: presets.pure } });
    processor.port.onmessage({ data: { type: "on" } });
    let peak = 0;
    for (let block = 0; block < 30; block++) {
      const output = [new Float32Array(128)];
      assert.equal(processor.process([], [output]), true);
      for (const value of output[0]) {
        assert.ok(Number.isFinite(value));
        peak = Math.max(peak, Math.abs(value));
      }
    }
    assert.ok(peak > 0.01 && peak <= 0.8);
    processor.port.onmessage({ data: { type: "lock", value: 999 } });
    assert.equal(processor.engine.lock, 200);
    processor.port.onmessage({ data: { type: "off" } });
    assert.equal(processor.engine.stage, "release");
  } finally {
    globalThis.structuredClone = clone;
    delete globalThis.sampleRate;
    delete globalThis.AudioWorkletProcessor;
    delete globalThis.registerProcessor;
  }
});
