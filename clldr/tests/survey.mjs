// Numerical behaviour survey, not a perceptual ranking or aliasing measurement.
import { Engine, defaults } from "../dsp.js";
const results = [];
for (const coupling of ["original", "normalised", "pm"])
  for (const position of [0, 0.02, 0.25, 1]) {
    let stalls = 0,
      count = 0,
      peak = 0,
      maxRead = 0,
      nonfinite = 0;
    const levels = [];
    for (const wave of ["sine", "triangle", "saw", "square"])
      for (const mode of ["multiply", "switch", "xor"])
        for (const note of [24, 96])
          for (const ratio of [1.006, 8]) {
            const e = new Engine(48000);
            e.configure({
              ...defaults,
              coupling,
              mode,
              note,
              fm: position * 1000,
              attack: 0.002,
              sustain: 1,
              a: { ...defaults.a, wave },
              b: { ...defaults.b, wave, ratio },
            });
            e.reset();
            e.trigger();
            let energy = 0;
            for (let i = 0; i < 9600; i++) {
              const v = e.sample();
              if (!Number.isFinite(v)) nonfinite++;
              energy += v * v;
              peak = Math.max(peak, Math.abs(v));
              for (let j = 0; j < 2; j++) {
                stalls += e.carrierHz[j] === 0;
                maxRead = Math.max(maxRead, Math.abs(e.readHz[j]));
                count++;
              }
            }
            levels.push(Math.sqrt(energy / 9600));
          }
    levels.sort((a, b) => a - b);
    results.push({
      coupling,
      collision: position,
      cases: levels.length,
      medianRMSdB: Number((20 * Math.log10(levels[24])).toFixed(1)),
      carrierStoppedPercent: Number(((100 * stalls) / count).toFixed(2)),
      peak: Number(peak.toFixed(4)),
      maxAbsReadVelocityHz: Math.round(maxRead),
      nonfinite,
    });
  }
console.table(results);
