import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Engine, defaults, sanitize, couplingDepth, interact } from "../dsp.js";
import { History, FIELDS } from "../telemetry.js";
import { Audition, SEQUENCE } from "../audition.js";
const golden = JSON.parse(
  readFileSync(new URL("./fixtures/original-fm.json", import.meta.url), "utf8"),
);
for (const c of golden.cases)
  test(`Original FM reproduces pre-change baseline: ${c.name}`, () => {
    const e = new Engine(48000);
    e.configure(c.config);
    e.trigger();
    let checkpoint = 0;
    for (let i = 0; i < 8192; i++) {
      const v = e.sample();
      if (i === c.samples[checkpoint]?.[0]) {
        assert.ok(
          Math.abs(v - c.samples[checkpoint][1]) < 1e-12,
          `${c.name} sample ${i}`,
        );
        checkpoint++;
      }
    }
    assert.equal(checkpoint, c.samples.length);
  });
test("old patches select Original FM and curve/range retain exact Hz depth", () => {
  const p = sanitize({ fm: 190 });
  assert.equal(p.coupling, "original");
  assert.equal(couplingDepth(p), 190);
  assert.equal(couplingDepth(sanitize({ fm: 0.123456789 })), 0.123456789);
  const shaped = sanitize({ ...p, fm: 500, curve: 2, hzRange: 800 });
  assert.equal(couplingDepth(shaped), 200);
  assert.equal(
    sanitize({ coupling: "invalid", curve: NaN, phaseRange: Infinity })
      .coupling,
    "original",
  );
  assert.equal(sanitize({ relativeRange: 999, trim: 999 }).relativeRange, 8);
});
test("zero coupling is the same signal in all mechanisms, including shaped sources", () => {
  const signals = [];
  for (const coupling of ["original", "normalised", "pm"]) {
    const e = new Engine(48000);
    e.configure({
      ...defaults,
      coupling,
      a: { ...defaults.a, wave: "square", phase: 90, shape: 0.2 },
      b: { ...defaults.b, wave: "saw", phase: 45 },
    });
    e.trigger();
    signals.push(Float64Array.from({ length: 4096 }, () => e.sample()));
  }
  assert.deepEqual(signals[0], signals[1]);
  assert.deepEqual(signals[0], signals[2]);
});
for (const coupling of ["normalised", "pm"])
  test(`${coupling} matches independent causal sine reference`, () => {
    const e = new Engine(48000);
    e.configure({
      ...defaults,
      coupling,
      note: 57,
      fm: 300,
      relativeRange: 1,
      phaseRange: 0.1,
    });
    e.trigger();
    const sr = 192000,
      depth = coupling === "pm" ? 0.03 : 0.3,
      targets = [220, 330],
      phase = [0, 0];
    let previous = [0, 0];
    for (let sample = 0; sample < 1024; sample++) {
      let expected;
      for (let sub = 0; sub < 4; sub++) {
        const next = [];
        for (let i = 0; i < 2; i++) {
          const hz =
            coupling === "normalised"
              ? targets[i] * (1 + depth * previous[1 - i])
              : targets[i];
          phase[i] = (phase[i] + hz / sr) % 1;
          const pm = coupling === "pm" ? depth * previous[1 - i] : 0;
          const read = (((phase[i] + pm) % 1) + 1) % 1;
          next[i] = Math.sin(2 * Math.PI * read);
        }
        previous = next;
        expected = next;
      }
      e.sample();
      for (let i = 0; i < 2; i++)
        assert.ok(Math.abs(e.values[i] - expected[i]) < 1e-10);
    }
  });
for (const coupling of ["normalised", "pm"])
  test(`${coupling} scales consistently under octave plus doubled sample rate`, () => {
    const a = new Engine(48000),
      b = new Engine(96000);
    a.configure({ ...defaults, coupling, note: 45, fm: 150 });
    b.configure({ ...defaults, coupling, note: 57, fm: 150 });
    a.trigger();
    b.trigger();
    for (let n = 0; n < 1000; n++) {
      a.sample();
      b.sample();
      assert.ok(Math.abs(a.values[0] - b.values[0]) < 1e-11);
      assert.ok(Math.abs(a.values[1] - b.values[1]) < 1e-11);
    }
  });
test("clean reset repeats even noise, imperfections, sweeps and result feedback", () => {
  const e = new Engine(48000);
  e.configure({
    ...defaults,
    coupling: "pm",
    fm: 400,
    feedback: 0.4,
    noise: 0.1,
    grit: 0.3,
    a: { ...defaults.a, sweep: 12 },
  });
  const render = () => {
    e.reset();
    e.trigger();
    return Float64Array.from({ length: 4096 }, () => e.sample());
  };
  assert.deepEqual(render(), render());
});
test("history is synchronised, chronological and bounded; telemetry leaves audio unchanged", () => {
  const a = new Engine(48000),
    b = new Engine(48000);
  a.configure({ ...defaults, note: 57, coupling: "pm", fm: 220 });
  b.configure(a.p);
  a.trigger();
  b.trigger();
  const h = new History(32);
  a.telemetry = h;
  for (let i = 0; i < 100; i++) assert.equal(a.sample(), b.sample());
  assert.equal(h.count, 32);
  const packet = new Float32Array(32 * FIELDS.length);
  assert.equal(h.copyInto(packet), 32);
  const end = 31 * FIELDS.length;
  assert.equal(packet[end], Math.fround(a.values[0]));
  assert.equal(packet[end + 1], Math.fround(a.values[1]));
  assert.equal(
    packet[end + 10],
    Math.fround(interact(a.values[0], a.values[1], a.p.mode)),
  );
  assert.equal(packet[end + 8], 220);
  assert.equal(packet[end + 9], 330);
  a.sample();
  h.copyInto(packet);
  assert.equal(packet[30 * FIELDS.length], Math.fround(b.values[0]));
});
test("sample-clock repeat is deterministic and runs the intended pitch sequence", () => {
  const e = new Engine(48000);
  e.configure({ ...defaults, auditionRate: 8, auditionSequence: true });
  const a = new Audition(48000);
  a.start();
  const starts = [];
  for (let frame = 0; frame < 24000; frame++) {
    a.tick(e);
    if (frame % 6000 === 0) starts.push(e.noteOffset);
    e.sample();
  }
  assert.deepEqual(starts, SEQUENCE);
  a.stop(e);
  assert.equal(e.noteOffset, 0);
  assert.equal(e.stage, "release");
  const render = () => {
    const engine = new Engine(48000);
    engine.configure({ ...defaults, noise: 0.05, auditionRate: 8 });
    const clock = new Audition(48000);
    clock.start();
    const first = [],
      second = [];
    for (let frame = 0; frame < 12000; frame++) {
      clock.tick(engine);
      const v = engine.sample();
      if (frame < 1000) first.push(v);
      if (frame >= 6000 && frame < 7000) second.push(v);
    }
    assert.deepEqual(first, second);
  };
  render();
});
test("full mechanism/shape/interaction/depth matrix stays finite and bounded at 44.1/48/96 kHz", () => {
  let cases = 0;
  for (const rate of [44100, 48000, 96000])
    for (const coupling of ["original", "normalised", "pm"])
      for (const wave of ["sine", "triangle", "saw", "square"])
        for (const mode of ["multiply", "switch", "xor"])
          for (const note of [24, 96])
            for (const ratio of [1.006, 8])
              for (const fm of [0, 20, 250, 1000]) {
                const e = new Engine(rate);
                e.configure({
                  ...defaults,
                  coupling,
                  mode,
                  note,
                  fm,
                  a: { ...defaults.a, wave },
                  b: { ...defaults.b, wave, ratio },
                  relativeRange: 8,
                  phaseRange: 4,
                  attack: 0.002,
                });
                e.trigger();
                for (let i = 0; i < 256; i++) {
                  const v = e.sample();
                  assert.ok(Number.isFinite(v) && Math.abs(v) <= 0.8);
                  for (const f of e.readHz) assert.ok(Number.isFinite(f));
                }
                cases++;
              }
  assert.equal(cases, 1728);
});
test("strong normalised FM exposes carrier stalling rather than hiding it", () => {
  const e = new Engine(48000);
  e.configure({
    ...defaults,
    coupling: "normalised",
    fm: 1000,
    relativeRange: 8,
  });
  e.trigger();
  let stalled = 0;
  for (let i = 0; i < 8000; i++) {
    e.sample();
    stalled += e.carrierHz[0] === 0 || e.carrierHz[1] === 0;
  }
  assert.ok(stalled > 0);
});

test("clean single strike releases on the sample clock at 180 ms", () => {
  const engine = new Engine(48000);
  engine.configure(defaults);
  const clock = new Audition(48000);
  clock.strike(engine);
  for (let i = 0; i < 8640; i++) {
    clock.tick(engine);
    engine.sample();
  }
  assert.notEqual(engine.stage, "release");
  clock.tick(engine);
  assert.equal(engine.stage, "release");
  clock.strike(engine, true);
  for (let i = 0; i < 9000; i++) {
    clock.tick(engine);
    engine.sample();
  }
  assert.notEqual(engine.stage, "release");
});
