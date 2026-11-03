import test from "node:test";
import assert from "node:assert/strict";
import { Engine, defaults, sanitize, couplingDepth } from "../dsp.js";
import { referenceMidi, referenceHz, nominalHz } from "../pitch.js";
import { Audition, SEQUENCE } from "../audition.js";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
test("Initialise uses provisional A2 and octave input is bounded and integral", () => {
  assert.equal(referenceMidi(defaults), 45);
  assert.equal(referenceHz(defaults), 110);
  assert.equal(sanitize({ rootOctave: Infinity }).rootOctave, 0);
  assert.equal(sanitize({ rootOctave: 20 }).rootOctave, 2);
  assert.equal(sanitize({ rootOctave: -20 }).rootOctave, -2);
  assert.equal(sanitize({ rootOctave: 1.3 }).rootOctave, 1);
  // Previously exported complete patches keep their explicit old note.
  close(referenceHz(sanitize({ note: 57 })), 220);
});
test("all root octaves preserve clean trigger, drone and four-note sequence targets", () => {
  for (const rootOctave of [-2, -1, 0, 1, 2]) {
    const p = sanitize({
      ...defaults,
      rootOctave,
      auditionRate: 8,
      auditionSequence: true,
    });
    const expected = 110 * 2 ** rootOctave;
    const clean = new Engine(48000),
      drone = new Engine(48000);
    clean.configure(p);
    new Audition(48000).strike(clean, true);
    drone.configure({ ...p, drone: true });
    for (const e of [clean, drone]) {
      assert.equal(e.stage, "attack");
      e.sample();
      close(e.targets[0], expected);
      close(e.targets[1], expected * 1.5);
    }
    const engine = new Engine(48000),
      clock = new Audition(48000);
    engine.configure(p);
    clock.start();
    const pitches = [];
    for (let frame = 0; frame < 24000; frame++) {
      clock.tick(engine);
      engine.sample();
      if (frame % 6000 === 0) {
        const offset = SEQUENCE[frame / 6000];
        pitches.push(referenceMidi(p, engine.noteOffset));
        close(engine.targets[0], expected * 2 ** (offset / 12));
        close(engine.targets[1] / engine.targets[0], 1.5);
      }
    }
    assert.deepEqual(
      pitches,
      SEQUENCE.map((offset) => 45 + rootOctave * 12 + offset),
    );
  }
});
test("octave respects partial/off tracking, fixed offsets, detune and absolute-Hz FM", () => {
  for (const tracking of [0, 0.35, 1]) {
    const p = sanitize({
      ...defaults,
      fm: 190,
      a: { ...defaults.a, tracking, ratio: 1.3, detune: 37, offset: 19 },
    });
    const up = { ...p, rootOctave: 1 };
    close(nominalHz(up, "a") - 19, (nominalHz(p, "a") - 19) * 2 ** tracking);
    for (const settings of [p, up]) {
      const e = new Engine(48000);
      e.configure(settings);
      e.trigger();
      e.sample();
      close(e.targets[0], nominalHz(settings, "a"));
      assert.equal(e.depth, 190);
      assert.equal(couplingDepth(settings), 190);
      assert.equal(e.p.auditionRate, 2);
      assert.equal(e.p.a.offset, 19);
    }
  }
});
