// YIN on a decimated final-output window. Low-confidence/quiet frames are rejected.
export function estimatePitch(samples, rate) {
  let rms = 0;
  for (const x of samples) rms += x * x;
  rms = Math.sqrt(rms / samples.length);
  if (rms < 0.003) return null;
  const step = 2,
    n = Math.min(1024, Math.floor(samples.length / 4)),
    max = Math.min(700, Math.floor(samples.length / 2) - n - 1),
    min = Math.floor(rate / step / 1800);
  const d = new Float64Array(max + 1);
  let sum = 0;
  for (let lag = 1; lag <= max; lag++) {
    let v = 0;
    for (let j = 0; j < n; j++) {
      const delta = samples[j * step] - samples[(j + lag) * step];
      v += delta * delta;
    }
    sum += v;
    d[lag] = sum ? (v * lag) / sum : 1;
  }
  for (let lag = Math.max(2, min); lag < max - 1; lag++) {
    if (d[lag] < 0.16) {
      while (lag + 1 < max && d[lag + 1] < d[lag]) lag++;
      const a = d[lag - 1],
        b = d[lag],
        c = d[lag + 1];
      const den = a - 2 * b + c;
      const shift = den ? (a - c) / (2 * den) : 0;
      const hz = rate / step / (lag + Math.max(-0.5, Math.min(0.5, shift)));
      return { hz, confidence: 1 - b, rms };
    }
  }
  return null;
}
export function pitchLabel(hz) {
  const midi = 69 + 12 * Math.log2(hz / 440),
    note = Math.round(midi);
  return {
    note,
    midi,
    name:
      ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][
        ((note % 12) + 12) % 12
      ] +
      (Math.floor(note / 12) - 1),
    cents: (midi - note) * 100,
  };
}
