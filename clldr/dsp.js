export const oscillatorDefaults = {
  wave: "sine",
  ratio: 1,
  detune: 0,
  offset: 0,
  tracking: 1,
  phase: 0,
  shape: 0,
  dc: 0,
  sweep: 0,
  sweepTime: 0.3,
};
export const defaults = {
  mode: "multiply",
  note: 57,
  tune: 0,
  volume: 0.45,
  attack: 0.008,
  decay: 0.6,
  sustain: 0.65,
  release: 0.7,
  drone: false,
  fm: 0,
  sync: false,
  feedback: 0,
  grit: 0,
  asymmetry: 0,
  leak: 0,
  noise: 0,
  a: { ...oscillatorDefaults },
  b: { ...oscillatorDefaults, ratio: 1.5 },
};
export function sanitize(input = {}) {
  const p = { ...defaults, a: { ...defaults.a }, b: { ...defaults.b } };
  const limits = {
    note: [24, 96],
    tune: [-100, 100],
    volume: [0, 0.85],
    attack: [0.002, 3],
    decay: [0.01, 5],
    sustain: [0, 1],
    release: [0.01, 8],
    fm: [0, 1000],
    feedback: [0, 0.94],
    grit: [0, 1],
    asymmetry: [-0.8, 0.8],
    leak: [0, 0.3],
    noise: [0, 0.15],
  };
  for (const [k, [lo, hi]] of Object.entries(limits))
    if (typeof input[k] === "number" && Number.isFinite(input[k]))
      p[k] = Math.max(lo, Math.min(hi, input[k]));
  if (["multiply", "switch", "xor"].includes(input.mode)) p.mode = input.mode;
  for (const k of ["drone", "sync"])
    if (typeof input[k] === "boolean") p[k] = input[k];
  for (const id of ["a", "b"]) {
    const o = input[id] || {};
    if (["sine", "triangle", "saw", "square"].includes(o.wave))
      p[id].wave = o.wave;
    for (const [k, lo, hi] of [
      ["ratio", 0.125, 8],
      ["detune", -100, 100],
      ["offset", -1000, 1000],
      ["tracking", 0, 1],
      ["phase", 0, 360],
      ["shape", -0.85, 0.85],
      ["dc", -0.8, 0.8],
      ["sweep", -48, 48],
      ["sweepTime", 0.005, 4],
    ])
      if (typeof o[k] === "number" && Number.isFinite(o[k]))
        p[id][k] = Math.max(lo, Math.min(hi, o[k]));
  }
  return p;
}
export function interact(a, b, mode) {
  return mode === "switch"
    ? a * (b >= 0 ? 1 : -1)
    : mode === "xor"
      ? a >= 0 !== b >= 0
        ? 1
        : -1
      : a * b;
}
function blep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}
function wave(t, dt, o) {
  const duty = 0.5 + o.shape * 0.45;
  let v;
  if (o.wave === "sine") {
    const warped =
      t < duty ? (t * 0.5) / duty : 0.5 + ((t - duty) * 0.5) / (1 - duty);
    v = Math.sin(2 * Math.PI * warped);
  } else if (o.wave === "triangle")
    v = t < duty ? -1 + (2 * t) / duty : 1 - (2 * (t - duty)) / (1 - duty);
  else if (o.wave === "saw") {
    v = 2 * t - 1 - blep(t, dt);
    v += o.shape * (1 - v * v) * 0.5;
  } else v = (t < duty ? 1 : -1) + blep(t, dt) - blep((t - duty + 1) % 1, dt);
  return v + o.dc;
}
export class Engine {
  constructor(rate) {
    this.rate = rate;
    this.os = 4;
    this.sr = rate * 4;
    this.p = sanitize();
    this.ph = [0, 0];
    this.last = new Float64Array(2);
    this.values = new Float64Array(2);
    this.env = 0;
    this.stage = "off";
    this.age = 0;
    this.feedback = 0;
    this.lock = 0;
    this.seed = 12345;
    this.ring = new Float64Array(63);
    this.pos = 0;
    this.coeffs = new Float64Array(63);
    let sum = 0;
    for (let i = 0; i < 63; i++) {
      const x = i - 31;
      const c =
        (x === 0 ? 0.225 : Math.sin(2 * Math.PI * 0.1125 * x) / (Math.PI * x)) *
        (0.42 -
          0.5 * Math.cos((2 * Math.PI * i) / 62) +
          0.08 * Math.cos((4 * Math.PI * i) / 62));
      this.coeffs[i] = c;
      sum += c;
    }
    for (let i = 0; i < 63; i++) this.coeffs[i] /= sum;
  }
  configure(p) {
    this.p = sanitize(p);
    if (this.p.drone && this.stage === "off") this.trigger();
  }
  trigger() {
    this.ph = [0, 0];
    this.age = 0;
    this.stage = "attack";
  }
  release() {
    if (!this.p.drone) {
      this.stage = "release";
      this.releaseStep = this.env / (this.p.release * this.rate);
    }
  }
  random() {
    this.seed = (1664525 * this.seed + 1013904223) >>> 0;
    return this.seed / 2147483648 - 1;
  }
  sample() {
    const p = this.p;
    if (p.drone && this.stage === "off") this.trigger();
    if (this.stage === "attack") {
      this.env = Math.min(1, this.env + 1 / (p.attack * this.rate));
      if (this.env >= 1) this.stage = "decay";
    } else if (this.stage === "decay") {
      this.env = Math.max(
        p.sustain,
        this.env - (1 - p.sustain) / (p.decay * this.rate),
      );
      if (this.env <= p.sustain) this.stage = "sustain";
    } else if (this.stage === "sustain") this.env = p.sustain;
    else if (this.stage === "release") {
      this.env = Math.max(
        0,
        this.env - (this.releaseStep || 1 / (p.release * this.rate)),
      );
      if (this.env === 0) this.stage = "off";
    }
    const base = 440 * 2 ** ((p.note - 69) / 12 + (p.tune + this.lock) / 1200);
    for (let j = 0; j < 4; j++) {
      const values = this.values;
      for (let i = 0; i < 2; i++) {
        const o = i === 0 ? p.a : p.b;
        const tracked = 220 * (base / 220) ** o.tracking;
        const sweep = o.sweep * Math.exp(-this.age / o.sweepTime);
        const drift =
          p.grit * 0.003 * Math.sin(this.age * (i ? 1.17 : 0.83) * 6.28);
        const hz = Math.max(
          0,
          Math.min(
            this.rate * 0.42,
            tracked * o.ratio * 2 ** (o.detune / 1200 + sweep / 12 + drift) +
              o.offset +
              p.fm * this.last[1 - i] +
              (i === 0 ? this.feedback * p.feedback * base * 2 : 0),
          ),
        );
        const dt = hz / this.sr;
        this.ph[i] += dt;
        const wrapped = this.ph[i] >= 1;
        this.ph[i] %= 1;
        if (i === 0 && wrapped && p.sync) this.ph[1] = 0;
        values[i] = wave(
          (this.ph[i] + o.phase / 360) % 1,
          Math.max(dt, 1e-9),
          o,
        );
      }
      this.last.set(values);
      let v = interact(values[0], values[1], p.mode);
      v +=
        p.asymmetry * v * v * 0.4 +
        p.leak * (values[0] + values[1]) +
        p.noise * this.random();
      if (p.grit > 0) v = Math.tanh(v * (1 + 3 * p.grit)) / (1 + p.grit);
      this.feedback = Math.tanh(v + this.feedback * p.feedback * 0.3);
      this.ring[this.pos] = v;
      this.pos = (this.pos + 1) % 63;
      this.age += 1 / this.sr;
    }
    let out = 0;
    for (let i = 0; i < 63; i++)
      out += this.coeffs[i] * this.ring[(this.pos - 1 - i + 63) % 63];
    // DC blocker after the interaction; envelope and saturator bound final output.
    const dc = out - (this.dcIn || 0) + 0.995 * (this.dcOut || 0);
    this.dcIn = out;
    this.dcOut = dc;
    return 0.8 * Math.tanh(dc * this.env * p.volume);
  }
}
