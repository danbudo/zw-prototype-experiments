import { defaults, sanitize } from "./dsp.js";
// Compare declared sound/audition settings only, never transport or DSP history.
export function configurationDifferences(left, right) {
  const a = sanitize(left),
    b = sanitize(right),
    differences = [];
  for (const [key, value] of Object.entries(defaults)) {
    if (typeof value === "object") {
      for (const child of Object.keys(value))
        if (a[key][child] !== b[key][child])
          differences.push({
            path: `${key}.${child}`,
            a: a[key][child],
            b: b[key][child],
          });
    } else if (a[key] !== b[key])
      differences.push({ path: key, a: a[key], b: b[key] });
  }
  return differences;
}
