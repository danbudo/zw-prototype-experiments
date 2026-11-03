# Corrective rebuild — Stage A

Implemented against [the corrective brief](CODEX-CORRECTIVE-REBUILD-BRIEF.md), following [the preflight audit](CORRECTIVE-REBUILD-PREFLIGHT.md). This supersedes its three pending fascia decisions: the designer selected **provisional A2 / 110 Hz**, **Shape + Bias for both banks**, and **raw pre-envelope RESULT**. The starting pitch has not been calibrated by listening.

## Audition

Run `npm start` from the repository root and open localhost:8000, or the environment's HTTPS forwarding URL. No build or dependency installation is needed. Hold **Trigger** for a clean reset on press and release on lift. Choose **Sequence → Play** for repeated notes; Notes/second adjusts the rate and Melody enables the existing root / +12 / −12 / +7 pattern. **Drone → Play** sustains. Play becomes Stop; changing playing mode stops the previous mode. A zero-sustain envelope still decays naturally in Drone.

Initialise restores A2, ratios A=1 / B=1.5, sine waves, Multiply, Original FM, zero Collision and zero result feedback. These are source/reference frequencies, not a promise that the ring-modulated result's perceived pitch is A2. The original six test configurations remain in Advanced and retain their explicit notes and synthesis settings.

## Presentation and parameter semantics

- Two matching, logarithmic 270° tuning rings show each source's **ratio multiplier**, 0.125–8×. The adjacent readouts show nominal frequencies calculated from the root, tracking, ratio, detune and Hz offset. They describe the root reference, excluding sequence offsets, sweeps, drift, pitch-lock correction and coupling. The B/A indicator is likewise nominal; instantaneous read velocity remains available in diagnostics.
- Each oscillator has four waveform segments and medium Shape/Bias amp knobs. Bias writes the existing `dc` parameter; it shifts the waveform centre and changes sign thresholds. No new shaping or coupling algorithm was introduced.
- Collision remains a depth fader, with exact percentage entry and effective units below it. Multiply / Switch / XOR stays directly accessible. The three mutually exclusive coupling mechanisms, independent result feedback, response exponent/ranges and hard sync are in Advanced's central column.
- Advanced is collapsed and arranged OSC A | COLLISION | OSC B. It retains fine detune, Hz offset, partial tracking, phase, temporary legacy sweeps, master tuning, snapshots, passive matching, configuration files, legacy audition tools and diagnostics. Chaos follows, collapsed, with the existing character controls. AMP remains visible. No empty MOD/LFO/matrix controls imply absent DSP.
- Knobs support vertical pointer/touch drag, Shift fine drag, arrow keys, Shift fine keys, Page Up/Down, Home/End, visible focus and exact numeric entry. Segments support arrows/Home/End. Invalid numeric input restores the last value; out-of-range input clamps. The numeric input retains precision independently of native slider stepping. No dropdowns are present.
- Wide screens keep the paired sources alongside the display. Narrow screens put both tuning controls in one row immediately above the shared display, with character banks below. Automated checks covered 1440×900, 1024×768, 768×1024 and 390×844. The primary controls fit above the fold at 1440×900; the phone layout scrolls vertically without horizontal overflow.

## Octave and telemetry

`rootOctave` is a persisted integer −2…+2, default zero. It transposes the played reference before the existing per-oscillator calculations. Fixed Hz offsets, Original FM depth and repeat rate are not multiplied. Partial tracking still follows a fraction of an octave; tracking Off remains fixed. Therefore fixed offsets or unequal tracking can change the actual A/B ratio under transposition. The main tracking segments select exact Off / A / B / Both; partial settings display “partial” and remain editable in Advanced.

The former runtime MIDI 24–96 clamp was removed from the played reference and telemetry note metadata, so low-octave melody intervals survive. The editable base MIDI parameter retains its existing limits; each oscillator retains its existing 0…0.42×sample-rate frequency protection. Very high targets can still clip at that protection. Old complete JSON patches without `rootOctave` load with octave zero and keep their explicit pitch.

All three traces use one synchronous window and one shared A rising-edge alignment where available. The timebase aims for three periods of the slower positive target, bounded to 4–170 ms and the actual captured history. Strong modulation, stalling and negative targets can defeat stable alignment; no clean waveform is substituted. Sources converge modestly in screen position as Collision rises; their samples are actual telemetry. RESULT stays separate for readability.

The history is now 8192 output-rate samples: 170.7 ms at 48 kHz, 85.3 ms at 96 kHz. History plus the three transferable buffers occupies about 1.5 MiB; full-window transfer is about 7.5 MiB/s at 20 Hz. The pool remains bounded and drops packets under backpressure. The display uses a minimum ±1 amplitude scale, expanding in half-unit steps when necessary, without removing DC bias. One shared timebase, per-trace scale labels and actual pixel extrema preserve observable differences. Sources/RESULT can continue moving when AMP/output is silent; the header meter measures final audio.

Telemetry still captures only the last oversample per output sample, so fast motion can visually alias and intra-sample events can be missed. Extremely low frequencies may not complete a period within the available history. Nominal frequency is not detected pitch. A/B recalls parameter settings, not internal history. Abrupt tuning, mode and snapshot changes can click, as before.

## Validation and limits

Files changed: presentation in `index.html`, `style.css`, `app.js` and new `controls.js`; pitch/reference changes in `dsp.js`, `worklet.js` and new `pitch.js`; display/history in `collision-view.js` and `telemetry.js`. New `tests/pitch.test.js` and `tests/fascia.mjs` accompany updates to the existing comparison, coupling, browser-smoke and repeat-playback tests. `README.md`, `EXPERIMENT.md` and this report document the current behaviour.

The dependency-free Node suite covers the unchanged Original FM golden fixtures, independent FM/PM references, interaction algebra, finite/bounded output, history/pool behaviour and the new octave cases across clean trigger, Drone and all four melody notes. New cases verify fixed-Hz invariance and partial tracking. Existing baseline tests explicitly use their original 220/330 Hz reference rather than inheriting the intentionally lowered Initialise note.

Chromium integration checks exercise actual final AudioWorklet audio: startup/loading cancellation, repeat onsets and quiet gaps, all four audible sequence notes, held Trigger and release/blur, Drone/Play/Stop, coupling switching, snapshots, JSON, level matching and silence after stopping. The dedicated fascia check covers pointer/keyboard/numeric input, waveform segments, live octave telemetry, partial tracking, collapsed panels and responsive dimensions. These checks demonstrate generated audio and UI behaviour; they are **not human listening or hardware/browser coverage**.

Optional browser checks require Playwright/Chromium outside the application dependencies:

```sh
CLLDR_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CLLDR_CHROMIUM=/path/to/chromium node clldr/tests/fascia.mjs
# Same environment variables for tests/browser-smoke.mjs and tests/repeat-playback.mjs.
```

## Remaining work

Stage B has not been implemented: the single assignable MOD ADSR, LFO, matrix, legacy sweep removal and post-processing removal remain separate. In particular, Stage A retains Drive's drift/saturation, asymmetry and final soft ceiling. The preflight identifies ambiguous removals: asymmetry colours both output and feedback excitation, while the final `tanh` both saturates and bounds output. Those need an explicit policy before changing their sound/topology. Protective FIR decimation/DC blocking and synthesis feedback are distinct from conventional effects.

The separate Gemini feedback investigation remains blocked by the missing `clldr/references/ZEROWIDTH_CLLDR_Drone_Synth.html`. No Gemini DSP was imported or inferred. The main Zero Width repository was not modified.
