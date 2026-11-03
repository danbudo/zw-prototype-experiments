import test from "node:test";
import assert from "node:assert/strict";
import { defaults, sanitize } from "../dsp.js";
import { configurationDifferences } from "../comparison.js";
test("identical or partial default snapshots have no differences", () => {
  assert.deepEqual(configurationDifferences(defaults, {}), []);
});
test("one source parameter is isolated from other settings", () => {
  const reference = sanitize(defaults),
    variant = sanitize({ ...reference, a: { ...reference.a, ratio: 1.0001 } });
  assert.deepEqual(configurationDifferences(reference, variant), [
    { path: "a.ratio", a: 1, b: 1.0001 },
  ]);
  assert.equal(reference.a.ratio, 1);
  assert.equal(variant.b.ratio, 1.5);
});
test("comparison reveals confounds including trim, note, algorithm and envelope", () => {
  const variant = {
    ...defaults,
    trim: -6,
    note: 45,
    coupling: "pm",
    decay: 0.08,
    b: { ...defaults.b, shape: 0.3 },
  };
  const fields = configurationDifferences(defaults, variant).map((x) => x.path);
  assert.deepEqual(
    new Set(fields),
    new Set(["trim", "note", "coupling", "decay", "b.shape"]),
  );
});
test("every persisted field participates while runtime state is excluded", () => {
  const base = sanitize(defaults),
    variant = sanitize({ ...base, held: true, repeat: true, correction: 90 });
  assert.deepEqual(configurationDifferences(base, variant), []);
  const fields = Object.entries(base).flatMap(([key, value]) =>
    typeof value === "object"
      ? Object.keys(value).map((k) => [key, k])
      : [[key]],
  );
  assert.equal(fields.length, 44);
  for (const path of fields) {
    const copy = structuredClone(base);
    const obj = path.length === 2 ? copy[path[0]] : copy,
      key = path.at(-1),
      value = obj[key];
    obj[key] =
      typeof value === "number"
        ? value === 0
          ? key === "trim"
            ? -0.01
            : 0.01
          : value * 0.9
        : typeof value === "boolean"
          ? !value
          : value === "sine"
            ? "triangle"
            : value === "multiply"
              ? "xor"
              : "pm";
    assert.ok(
      configurationDifferences(base, copy).some(
        (d) => d.path === path.join("."),
      ),
      path.join("."),
    );
  }
});
