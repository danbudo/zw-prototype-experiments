import { defaults, sanitize, couplingDepth } from "./dsp.js";
import { presets } from "./presets.js";
import { estimatePitch, pitchLabel } from "./analysis.js";
import { CollisionView } from "./collision-view.js";
import { configurationDifferences } from "./comparison.js";
import { knob, segments } from "./controls.js";
import { referenceHz, nominalHz } from "./pitch.js";
const $ = (s) => document.querySelector(s);
let config = structuredClone(presets.initialise),
  ctx,
  node,
  analyser,
  master,
  held = false,
  active = "a",
  slots = { a: structuredClone(config), b: structuredClone(config) },
  lock = 0,
  timer,
  lastAnalysis = 0,
  audioInitialising = null,
  playbackRequest = 0;
const controls = [];
let mechanismControl, octaveControl, trackingControl;
let auditionMode = "sequence",
  momentaryDown = false,
  playPending = false;
let auditioning = false,
  latestRMS = 0,
  referenceRMS = 0;
const collisionView = new CollisionView(
  $("#collision-scope"),
  $("#telemetry-summary"),
);
function stopAudition() {
  // Stop/preset changes must also cancel a start waiting for audio readiness.
  playbackRequest++;
  if (auditioning) send("audition", false);
  auditioning = false;
  playPending = false;
  $("#repeat").setAttribute("aria-pressed", "false");
  $("#pitch-lock").disabled = false;
  refreshTransport();
}
function refreshTransport() {
  if (config.drone) auditionMode = "drone";
  else if (auditioning) auditionMode = "sequence";
  const running = auditioning || config.drone || held || playPending;
  $("#audition-play").textContent = running ? "Stop" : "Play";
  $("#audition-play").setAttribute("aria-pressed", String(running));
  $("#audition-play").setAttribute("aria-busy", String(playPending));
  $("#mode-drone").setAttribute(
    "aria-pressed",
    String(auditionMode === "drone"),
  );
  $("#mode-sequence").setAttribute(
    "aria-pressed",
    String(auditionMode === "sequence"),
  );
  $("#momentary-trigger").setAttribute("aria-pressed", String(momentaryDown));
}
function releaseMomentary() {
  if (!momentaryDown) return;
  momentaryDown = false;
  playbackRequest++;
  send("off");
  refreshTransport();
}
function pressMomentary() {
  if (momentaryDown) return;
  $("#stop").click();
  momentaryDown = true;
  refreshTransport();
  safely(() => {
    if (momentaryDown) {
      resetLock();
      send("clean-on", { sustain: true });
      message("Clean Trigger held. Release to close the gate.");
    }
  });
}
const triggerButton = $("#momentary-trigger");
triggerButton.onpointerdown = (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  triggerButton.focus();
  triggerButton.setPointerCapture(e.pointerId);
  pressMomentary();
};
triggerButton.onpointerup = releaseMomentary;
triggerButton.onpointercancel = releaseMomentary;
triggerButton.onlostpointercapture = releaseMomentary;
triggerButton.onkeydown = (e) => {
  if (e.code === "Space" || e.code === "Enter") {
    e.preventDefault();
    if (!e.repeat) pressMomentary();
  }
};
triggerButton.onkeyup = (e) => {
  if (e.code === "Space" || e.code === "Enter") {
    e.preventDefault();
    releaseMomentary();
  }
};
triggerButton.onblur = releaseMomentary;
for (const mode of ["drone", "sequence"])
  $("#mode-" + mode).onclick = () => {
    if (auditionMode === mode) return;
    $("#stop").click();
    auditionMode = mode;
    refreshTransport();
    message(
      `${mode === "drone" ? "Drone" : "Sequence"} selected; playback stopped. Press Play to audition.`,
    );
  };
$("#audition-play").onclick = async () => {
  releaseMomentary();
  if (auditioning || config.drone || held || playPending) {
    $("#stop").click();
    return;
  }
  playPending = true;
  refreshTransport();
  try {
    if (auditionMode === "sequence") await $("#repeat").onclick();
    else
      await safely(() => {
        stopAudition();
        clearTimeout(timer);
        held = false;
        $("#hold").setAttribute("aria-pressed", "false");
        config.drone = true;
        changed();
        // Start immediately even during an older release: use the existing legacy
        // note-on, retaining loop/filter history rather than a clean DSP reset.
        send("on");
        refresh();
        message(
          "Drone playing. Stop releases the gate; Trigger starts a clean note.",
        );
      });
  } finally {
    playPending = false;
    refreshTransport();
  }
};
function refreshCoupling() {
  mechanismControl?.set(config.coupling);
  $("#collision").value = config.fm;
  $("#collision-value").value = config.fm / 10;
  const depth = couplingDepth(config),
    unit =
      config.coupling === "original"
        ? "Hz"
        : config.coupling === "normalised"
          ? "× receiving target"
          : "cycles";
  $("#collision-depth").textContent =
    `${depth.toFixed(3)} ${unit} · mutually exclusive source coupling`;
  for (const key of ["hzRange", "relativeRange", "phaseRange"])
    $("#" + key).closest(".control").hidden =
      key !==
      { original: "hzRange", normalised: "relativeRange", pm: "phaseRange" }[
        config.coupling
      ];
}
function message(s) {
  $("#message").textContent = s;
}
function send(type, value) {
  node?.port.postMessage({ type, value });
}
function refreshComparison() {
  const differences = configurationDifferences(slots.a, slots.b);
  $("#comparison-summary").textContent = differences.length
    ? `Snapshot A ↔ B: ${differences.length} setting${differences.length === 1 ? "" : "s"} differ`
    : "Snapshot A ↔ B: settings identical";
  $("#comparison-diff").replaceChildren();
  for (const difference of differences) {
    const li = document.createElement("li");
    li.textContent = `${difference.path}: A = ${difference.a}; B = ${difference.b}`;
    $("#comparison-diff").append(li);
  }
}
function changed() {
  config = sanitize(config);
  send("config", config);
  slots[active] = structuredClone(config);
  refreshComparison();
  refreshTransport();
  document
    .querySelectorAll("[data-preset]")
    .forEach((b) => b.classList.remove("selected"));
}
function slider(
  parent,
  key,
  label,
  min,
  max,
  step,
  unit = "",
  osc = null,
  divider = false,
  size = "small",
) {
  const id = (osc ? osc + "-" : "") + key;
  const control = knob($(parent), {
    id,
    label: osc ? `${osc.toUpperCase()} ${label}` : label,
    min,
    max,
    step,
    unit,
    size,
    log:
      min > 0 &&
      ["ratio", "attack", "decay", "release", "sweepTime"].includes(key),
    onChange: (value) => {
      (osc ? config[osc] : config)[key] = value;
      if (key === "tune") resetLock();
      changed();
      refresh();
    },
  });
  controls.push(() => control.set((osc ? config[osc] : config)[key]));
  return control;
}
for (const id of ["a", "b"]) {
  const parent = $("#osc-" + id);
  parent.innerHTML = `<div class="source-heading"><span>OSC ${id.toUpperCase()}</span><output id="${id}-nominal"></output></div>`;
  slider(
    "#osc-" + id,
    "ratio",
    "Tuning",
    0.125,
    8,
    0.001,
    "×",
    id,
    false,
    "tuning",
  );
  const wave = segments(parent, {
    id: id + "-wave",
    label: `Oscillator ${id.toUpperCase()} waveform`,
    choices: [
      ["sine", "Sine"],
      ["triangle", "Triangle"],
      ["saw", "Saw"],
      ["square", "Square"],
    ],
    onChange: (value) => {
      config[id].wave = value;
      changed();
      refresh();
    },
  });
  controls.push(() => wave.set(config[id].wave));
  slider(
    "#bank-controls-" + id,
    "shape",
    "Shape",
    -0.85,
    0.85,
    0.01,
    "",
    id,
    false,
    "medium",
  );
  slider(
    "#bank-controls-" + id,
    "dc",
    "Bias",
    -0.8,
    0.8,
    0.01,
    "",
    id,
    false,
    "medium",
  );
  for (const args of [
    ["detune", "Detune", -100, 100, 1, " ct"],
    ["offset", "Hz offset", -1000, 1000, 1, " Hz"],
    ["tracking", "Key tracking", 0, 1, 0.01, ""],
    ["phase", "Phase", 0, 360, 1, "°"],
    ["sweep", "Legacy pitch sweep", -48, 48, 0.1, " st"],
    ["sweepTime", "Legacy sweep time", 0.005, 4, 0.005, " s"],
  ])
    slider("#fine-" + id, ...args, id);
}
mechanismControl = segments($("#mechanism-control"), {
  id: "mechanism",
  label: "Coupling mechanism",
  choices: [
    ["original", "Original FM"],
    ["normalised", "Relative FM"],
    ["pm", "Mutual PM"],
  ],
  onChange: (value) => {
    config.coupling = value;
    resetLock();
    changed();
    refresh();
  },
});
octaveControl = segments($("#octave-control"), {
  id: "root-octave",
  label: "Relative root octave",
  choices: [
    ["-2", "−2"],
    ["-1", "−1"],
    ["0", "0"],
    ["1", "+1"],
    ["2", "+2"],
  ],
  onChange: (value) => {
    config.rootOctave = Number(value);
    resetLock();
    changed();
    refresh();
  },
});
trackingControl = segments($("#tracking-control"), {
  id: "keyboard-tracking",
  label: "Keyboard tracking",
  choices: [
    ["off", "Off"],
    ["a", "A"],
    ["b", "B"],
    ["both", "Both"],
  ],
  onChange: (value) => {
    config.a.tracking = value === "a" || value === "both" ? 1 : 0;
    config.b.tracking = value === "b" || value === "both" ? 1 : 0;
    changed();
    refresh();
  },
});
slider("#header-output", "volume", "Output", 0, 0.85, 0.01, "");
slider("#calibration", "tune", "Master tune", -100, 100, 1, " ct");
slider("#coupling", "feedback", "Result feedback", 0, 0.94, 0.01);
slider("#scaling", "curve", "Curve exponent", 0.25, 4, 0.05);
slider("#scaling", "hzRange", "FM range", 0, 4000, 1, " Hz");
slider("#scaling", "relativeRange", "Relative range", 0, 8, 0.01, "×");
slider("#scaling", "phaseRange", "PM range", 0, 4, 0.01, " cyc");
slider("#repeat-rate", "auditionRate", "Notes / second", 0.25, 8, 0.05, " Hz");
slider("#level-trim", "trim", "Listening trim", -24, 0, 0.1, " dB");
$("#collision").oninput = (e) => {
  config.fm = Number(e.target.value);
  changed();
  refreshCoupling();
};
$("#collision-value").onchange = (e) => {
  const value = e.target.valueAsNumber;
  if (e.target.value.trim() === "" || !Number.isFinite(value)) {
    refreshCoupling();
    message(
      "Enter a finite Collision percentage; the previous setting was retained.",
    );
    return;
  }
  config.fm = value * 10;
  changed();
  refreshCoupling();
};
$("#collision-value").onkeydown = (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    e.target.blur();
  }
};
$("#sequence").onchange = (e) => {
  config.auditionSequence = e.target.checked;
  changed();
};
$("#clean-trigger").onclick = () =>
  safely(() => {
    stopAudition();
    clearTimeout(timer);
    resetLock();
    send("clean-on", { sustain: held || config.drone });
  });
$("#repeat").onclick = () => {
  // Stopping is immediate, even if an interrupted context cannot resume yet.
  if (auditioning) {
    stopAudition();
    message("Repeat stopped. Envelope tail continues.");
    return;
  }
  return safely(() => {
    clearTimeout(timer);
    held = false;
    config.drone = false;
    $("#hold").setAttribute("aria-pressed", "false");
    $("#pitch-lock").checked = false;
    resetLock();
    changed();
    refresh();
    auditioning = true;
    $("#repeat").setAttribute("aria-pressed", "true");
    $("#pitch-lock").disabled = true;
    send("audition", true);
    message(
      "Sequence audition playing. Each note starts clean; Melody controls the temporary pitch pattern. Pitch lock is off.",
    );
  });
};
$("#capture-level").onclick = () => {
  if (latestRMS < 0.003) {
    message("Play a sustained sound before capturing a reference level.");
    return;
  }
  referenceRMS = latestRMS;
  $("#match-status").textContent =
    `Reference ${(20 * Math.log10(referenceRMS)).toFixed(1)} dBFS RMS captured. Switch sound, then Match once.`;
};
$("#match-level").onclick = () => {
  if (!referenceRMS || latestRMS < 0.003) {
    message("Capture a reference, then play a sound with a measurable level.");
    return;
  }
  const estimate = config.trim + 20 * Math.log10(referenceRMS / latestRMS);
  config.trim = Math.max(-24, Math.min(0, estimate));
  changed();
  refresh();
  $("#match-status").textContent =
    estimate > 0
      ? "Reference is louder than this sound. Trim only attenuates: capture the quieter sound, then match the louder sound to it."
      : `One-shot estimate: ${config.trim.toFixed(1)} dB passive trim. Compare meters and ears; no ongoing correction.`;
};
$("#export-telemetry").onclick = () => {
  const snapshot = collisionView.snapshot();
  if (!snapshot) {
    message("Enable audio before exporting telemetry.");
    return;
  }
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify({
          format: "clldr-telemetry",
          version: 1,
          config,
          ...snapshot,
        }),
      ],
      { type: "application/json" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "clldr-telemetry.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
for (const a of [
  ["attack", "Attack", 0.002, 3, 0.002, " s"],
  ["decay", "Decay", 0.01, 5, 0.01, " s"],
  ["sustain", "Sustain", 0, 1, 0.01, ""],
  ["release", "Release", 0.01, 8, 0.01, " s"],
])
  slider("#envelope", ...a, null, false, "medium");
for (const a of [
  ["grit", "Drive + drift", 0, 1, 0.01, ""],
  ["asymmetry", "Asymmetry", -0.8, 0.8, 0.01, ""],
  ["leak", "Source leakage", 0, 0.3, 0.01, ""],
  ["noise", "Noise floor", 0, 0.15, 0.001, ""],
])
  slider("#circuit", ...a, null, false, "medium");
function resetLock() {
  lock = 0;
  send("lock", 0);
  $("#lock-status").textContent =
    "Targets the root note · correction limited to ±200 ct";
}
function refresh() {
  refreshCoupling();
  $("#sequence").checked = config.auditionSequence;
  controls.forEach((f) => f());
  for (const k of ["note", "tune", "volume"]) $("#" + k).value = config[k];
  for (const k of ["drone", "sync"]) $("#" + k).checked = config[k];
  $("#note-name").textContent =
    `${pitchLabel(referenceHz(config)).name} / ${referenceHz(config).toFixed(1)} Hz`;
  octaveControl.set(config.rootOctave);
  const a = config.a.tracking,
    b = config.b.tracking;
  const tracking =
    a === 1 && b === 1
      ? "both"
      : a === 0 && b === 0
        ? "off"
        : a === 1 && b === 0
          ? "a"
          : a === 0 && b === 1
            ? "b"
            : "custom";
  trackingControl.set(tracking);
  $("#tracking-note").textContent = tracking === "custom" ? "partial" : "";
  for (const id of ["a", "b"])
    $("#" + id + "-nominal").textContent =
      nominalHz(config, id).toFixed(2) + " Hz nominal";
  const fa = nominalHz(config, "a"),
    fb = nominalHz(config, "b");
  $("#relationship").textContent =
    fa > 0 && fb > 0 ? `B/A ${(fb / fa).toFixed(4)}× nominal` : "B/A —";
  refreshTransport();
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) =>
      b.classList.toggle("selected", b.dataset.mode === config.mode),
    );
}
function apply(p, preserveGate = false) {
  if (!preserveGate) stopAudition();
  const wasDrone = config.drone,
    wasHeld = held;
  config = sanitize(p);
  if (config.drone && auditioning) stopAudition();
  if (!preserveGate) held = false;
  clearTimeout(timer);
  $("#hold").setAttribute("aria-pressed", String(held));
  resetLock();
  refresh();
  send("config", config);
  if (!config.drone && ((wasDrone && !held) || (wasHeld && !preserveGate)))
    send("off");
  slots[active] = structuredClone(config);
  refreshComparison();
}
for (const name of Object.keys(presets)) {
  const b = document.createElement("button");
  b.textContent = name;
  b.dataset.preset = name;
  b.onclick = () => {
    apply(presets[name]);
    if (name === "initialise") {
      $("#pitch-lock").checked = false;
      resetLock();
    }
    document
      .querySelectorAll("[data-preset]")
      .forEach((x) => x.classList.toggle("selected", x === b));
    message(
      name === "drone"
        ? "Drone configuration loaded; gate armed. Enable audio to hear it, or press Stop to release."
        : `${name[0].toUpperCase() + name.slice(1)} loaded. Hold Trigger or press Play to audition.`,
    );
  };
  $(name === "initialise" ? "#initialise-slot" : "#presets").append(b);
}
for (const k of ["tune", "volume"])
  $("#" + k).oninput = (e) => {
    config[k] = Number(e.target.value);
    if (k !== "volume") resetLock();
    changed();
    refresh();
  };
$("#note").onchange = (e) => {
  if (!Number.isFinite(e.target.valueAsNumber)) {
    refresh();
    return;
  }
  config.note = Math.round(e.target.valueAsNumber);
  resetLock();
  changed();
  refresh();
};
for (const k of ["drone", "sync"])
  $("#" + k).onchange = (e) => {
    if (k === "drone" && e.target.checked) stopAudition();
    config[k] = e.target.checked;
    changed();
    if (k === "drone" && !config.drone && !held) send("off");
  };
document.querySelectorAll("[data-mode]").forEach(
  (b) =>
    (b.onclick = () => {
      config.mode = b.dataset.mode;
      changed();
      resetLock();
      refresh();
    }),
);
async function enable() {
  // ctx exists before addModule finishes. Share full initialisation, not just resume.
  if (audioInitialising) {
    await audioInitialising;
    return;
  }
  if (ctx) {
    if (ctx.state !== "running") await ctx.resume();
    return;
  }
  if (!window.isSecureContext || !window.AudioWorkletNode)
    throw new Error(
      "AudioWorklet needs HTTPS or localhost in a modern browser.",
    );
  ctx = new AudioContext({ latencyHint: "interactive" });
  message("Loading audio engine…");
  audioInitialising = initialiseAudio();
  try {
    await audioInitialising;
  } finally {
    audioInitialising = null;
  }
}
async function initialiseAudio() {
  try {
    await ctx.audioWorklet.addModule("./worklet.js");
    node = new AudioWorkletNode(ctx, "clldr-engine", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    node.port.onmessage = ({ data }) => {
      if (data.type === "telemetry") collisionView.accept(data, node.port);
    };
    send("telemetry", true);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 8192;
    analyser.smoothingTimeConstant = 0.65;
    master = ctx.createGain();
    master.gain.value = 1;
    node.connect(master).connect(analyser).connect(ctx.destination);
    node.onprocessorerror = () => {
      message("Audio processor failed. Reload to restart.");
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
    };
    send("config", config);
    if (ctx.state !== "running") await ctx.resume();
    $("#power").textContent = "Audio enabled ✓";
    $("#engine-status").textContent =
      `${Math.round(ctx.sampleRate / 1000)} kHz / 4× DSP`;
    ctx.onstatechange = () => {
      $("#power").textContent =
        ctx.state === "running" ? "Audio enabled ✓" : "Resume audio ↗";
    };
    message(
      "Audio ready. Hold Trigger, or select Drone/Sequence and press Play. Start quietly.",
    );
  } catch (e) {
    await ctx.close();
    ctx = null;
    throw e;
  }
}
async function safely(fn) {
  const request = fn ? ++playbackRequest : null;
  try {
    await enable();
    if (fn && request === playbackRequest) {
      fn();
      refreshTransport();
    }
  } catch (e) {
    message(e.message);
  }
}
$("#power").onclick = () => safely();
$("#trigger").onclick = () =>
  safely(() => {
    stopAudition();
    clearTimeout(timer);
    send("on");
    if (!held && !config.drone) timer = setTimeout(() => send("off"), 180);
  });
$("#hold").onclick = () =>
  safely(() => {
    stopAudition();
    held = !held;
    clearTimeout(timer);
    $("#hold").setAttribute("aria-pressed", String(held));
    send(held ? "on" : "off");
  });
$("#stop").onclick = () => {
  space = false;
  releaseMomentary();
  playPending = false;
  stopAudition();
  clearTimeout(timer);
  held = false;
  config.drone = false;
  $("#hold").setAttribute("aria-pressed", "false");
  changed();
  refresh();
  send("off");
  resetLock();
  message("Gate released. Envelope tail continues.");
};
let space = false;
document.addEventListener("keydown", (e) => {
  if (
    e.code !== "Space" ||
    e.repeat ||
    /INPUT|SELECT|BUTTON|TEXTAREA/.test(e.target.tagName)
  )
    return;
  e.preventDefault();
  stopAudition();
  space = true;
  safely(() => {
    if (space) send("on");
  });
});
document.addEventListener("keyup", (e) => {
  if (e.code === "Space" && space) {
    e.preventDefault();
    space = false;
    if (!held) send("off");
  }
});
window.addEventListener("blur", () => {
  releaseMomentary();
  space = false;
  if (!held && !auditioning) send("off");
});
for (const id of ["a", "b"])
  $("#slot-" + id).onclick = () => {
    if (active === id) return;
    slots[active] = structuredClone(config);
    active = id;
    apply(slots[id], true);
    for (const k of ["a", "b"])
      $("#slot-" + k).setAttribute("aria-pressed", String(k === active));
    $("#store").textContent = `Store current → ${active === "a" ? "B" : "A"}`;
    $("#slot-status").textContent =
      `Listening to ${active.toUpperCase()}. Root, mode and all sound settings recalled.`;
  };
$("#store").onclick = () => {
  const other = active === "a" ? "b" : "a";
  slots[other] = structuredClone(config);
  refreshComparison();
  $("#slot-status").textContent =
    `Current sound stored in ${other.toUpperCase()}. Change this sound, then switch to compare.`;
};
$("#save").onclick = () => {
  const blob = new Blob(
    [JSON.stringify({ format: "clldr", version: 1, config }, null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "clldr-configuration.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  message(
    "Current configuration exported. A/B slots and playback state are not included.",
  );
};
$("#load").onclick = () => $("#file").click();
$("#file").onchange = async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 100000) throw new Error("Configuration file is too large.");
    const data = JSON.parse(await file.text());
    if (
      data.format !== "clldr" ||
      data.version !== 1 ||
      !data.config ||
      typeof data.config !== "object" ||
      Array.isArray(data.config)
    )
      throw new Error("Expected a CLLDR version 1 configuration.");
    apply(data.config);
    message(
      "Configuration imported. Unsupported values are ignored; numeric values are bounded.",
    );
  } catch (err) {
    message("Import failed: " + err.message);
  } finally {
    e.target.value = "";
  }
};
$("#pitch-lock").onchange = resetLock;
refresh();
refreshComparison();
document.querySelector('[data-preset="initialise"]').classList.add("selected");
const time = new Float32Array(8192),
  freq = new Float32Array(4096);
let pitch = null;
function draw(canvas, kind) {
  const ratio = devicePixelRatio || 1,
    w = Math.round(canvas.clientWidth * ratio),
    h = Math.round(canvas.clientHeight * ratio);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const c = canvas.getContext("2d");
  c.clearRect(0, 0, w, h);
  c.strokeStyle = "#2b352a";
  c.lineWidth = ratio;
  for (let i = 1; i < 4; i++) {
    c.beginPath();
    c.moveTo(0, (h * i) / 4);
    c.lineTo(w, (h * i) / 4);
    c.stroke();
  }
  for (let i = 1; i < 6; i++) {
    c.beginPath();
    c.moveTo((w * i) / 6, 0);
    c.lineTo((w * i) / 6, h);
    c.stroke();
  }
  c.strokeStyle = kind === "scope" ? "#c8ed83" : "#edaf76";
  c.lineWidth = 1.3 * ratio;
  c.beginPath();
  if (kind === "scope") {
    let start = 0;
    if (analyser)
      for (let i = 0; i < 2000; i++) {
        if (time[i] < 0 && time[i + 1] >= 0) {
          start = i;
          break;
        }
      }
    const count = ctx ? Math.round(ctx.sampleRate * 0.025) : 1200;
    for (let x = 0; x < w; x++) {
      const y = h * (0.5 - time[start + Math.floor((x / w) * count)] * 0.55);
      x ? c.lineTo(x, y) : c.moveTo(x, y);
    }
  } else {
    for (let x = 0; x < w; x++) {
      const hz = 30 * (20000 / 30) ** (x / w),
        bin = ctx
          ? Math.min(4095, Math.round((hz / ctx.sampleRate) * 8192))
          : 0;
      const db = analyser ? freq[bin] : -100;
      const y = h * (1 - Math.max(0, Math.min(1, (db + 100) / 100)));
      x ? c.lineTo(x, y) : c.moveTo(x, y);
    }
  }
  c.stroke();
}
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  if (analyser) {
    analyser.getFloatTimeDomainData(time);
    analyser.getFloatFrequencyData(freq);
    let recentPeak = 0;
    for (let i = time.length - 1024; i < time.length; i++)
      recentPeak = Math.max(recentPeak, Math.abs(time[i]));
    $("#output-meter").value =
      recentPeak > 1e-7 ? 20 * Math.log10(recentPeak) : -72;
    if (now - lastAnalysis > 180) {
      lastAnalysis = now;
      let peak = 0,
        rms = 0;
      for (const v of time) {
        peak = Math.max(peak, Math.abs(v));
        rms += v * v;
      }
      rms = Math.sqrt(rms / time.length);
      latestRMS = rms;
      const db = (v) => (v > 1e-7 ? (20 * Math.log10(v)).toFixed(1) : "−∞");
      $("#rms").textContent = db(rms);
      $("#peak").textContent = db(peak);
      pitch = estimatePitch(time, ctx.sampleRate);
      if (pitch) {
        const info = pitchLabel(pitch.hz);
        $("#pitch-note").textContent = info.name;
        $("#pitch-cents").textContent =
          (info.cents >= 0 ? "+" : "") + info.cents.toFixed(1) + " ct";
        $("#pitch-hz").textContent =
          pitch.hz.toFixed(2) + " Hz · detected final-output periodicity";
        $("#confidence").textContent =
          Math.round(pitch.confidence * 100) + "% CONF.";
        $("#needle").style.left =
          50 + Math.max(-50, Math.min(50, info.cents)) + "%";
        if ($("#pitch-lock").checked) {
          const target = referenceHz(config),
            error = 1200 * Math.log2(target / pitch.hz);
          if (pitch.confidence > 0.92 && Math.abs(error) < 350) {
            lock = Math.max(-200, Math.min(200, lock + error * 0.08));
            send("lock", lock);
            $("#lock-status").textContent =
              `Correction ${lock.toFixed(1)} ct / ±200 ct · experimental`;
          } else
            $("#lock-status").textContent =
              "Lock waiting: low confidence or target out of range";
        }
      } else {
        $("#pitch-note").textContent = "—";
        $("#pitch-cents").textContent = "— ct";
        $("#confidence").textContent = rms > 0.003 ? "AMBIGUOUS" : "NO SIGNAL";
        $("#pitch-hz").textContent = "No stable periodicity detected";
        if ($("#pitch-lock").checked)
          $("#lock-status").textContent = "Lock waiting for a stable signal";
      }
    }
  }
  collisionView.draw(config.fm / 1000, config.mode);
  draw($("#scope"), "scope");
  draw($("#spectrum"), "spectrum");
}
requestAnimationFrame(frame);
