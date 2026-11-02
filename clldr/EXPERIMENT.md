# Collision listening experiment

Three exclusive coupling mechanisms in the standalone CLLDR laboratory. This experiment supplies comparisons, not a winning algorithm. No Zero Width application integration, new Chaos model, phase-locking mechanism or envelope architecture is included.

## Run and make a controlled comparison

From the repository root:

```sh
npm start
```

Open the server using localhost or an HTTPS development forwarding URL. Click **Enable audio**, then **Initialise**. No dependency installation/build is required. Python 3 serves the files; a modern AudioWorklet browser is required.

Initialise selects sine A at 220 Hz and sine B at 330 Hz, full tracking, zero sweeps/bias/imperfections/result feedback, Original FM, Collision zero, linear response, unity listening trim and the original ADSR. It also turns off the existing experimental output pitch lock. The original six presets remain available and retain their sounds; legacy Drone and Collision intentionally restore nonzero result feedback, so Initialise is the clean comparison starting point.

1. Choose Multiply, Switch or XOR, and set the oscillators. Changing the **coupling mechanism** changes only the mechanism (and clears the transient output-tuner correction); it leaves oscillator settings, fader position, ranges, curve and trim intact.
2. Raise **Collision** slowly. The readout below it gives the effective depth in Hz, relative units or cycles. Equal percentages across mechanisms are not equivalent modulation strengths.
3. Use **Clean strike** for a deterministic state reset and a sample-clock 180 ms gate. Hold or Drone keeps that strike open. The original **Strike** retains its legacy retrigger behaviour and UI-timed release.
4. **Repeat notes** uses the audio sample clock, 0.25–8 notes/second and a 55% gate. Every onset resets oscillator phases, PM memory, envelope, feedback, noise seed, DC blocker and decimation-filter memory. This deliberately truncates previous tails. Pitch lock is disabled during repeat. Keep it off for controlled manual comparisons too.
5. Enable the fixed pitch sequence to hear root / +12 / −12 / +7 semitones. The note range clamps at MIDI 24–96; choose a middle root to hear all four distinct pitches. Sequence changes root-note input; each oscillator's tracking/offset/sweep still applies. This is a fixed listening aid, not a general sequencer.
6. Drone and Repeat are exclusive. Drone retains a continuous state while switching mechanisms; use Clean strike or Repeat when history-independent comparisons are needed. Stop cancels repetition and releases the envelope.
7. Store the current configuration in the other **A/B** slot. Mechanism, fader, curve, all three depth ranges, listening trim, repetition rate/sequence and underlying oscillator settings are retained. Playback state, sequence position and output pitch-lock correction are not stored. A/B preserves a held gate/ongoing repeat where applicable; recalling a Drone configuration stops repeat.

### Level matching

Keep the original Output setting fixed while comparing. **Listening trim** is passive attenuation after the existing soft ceiling, from −24 to 0 dB. It preserves waveform shape and dynamics; it does not drive the limiter harder or boost/clip a quiet sound.

Play the quieter sustained sound, **Capture reference level**, switch to the louder comparison and **Match once**. This estimates a static trim from the current final-output RMS window. There is no AGC, compressor or ongoing correction. If matching requires gain, the interface asks for a quieter reference instead. The estimate can be misleading for attacks, evolving sounds and silence; use stable windows, meters and ears. Silence or large dynamic differences are results, not something the tool normalises away. Trim is stored in A/B and JSON.

## Coupling definitions

Let `uA`, `uB` be the previous oversample's shaped oscillator values, including DC bias. Both directions read that same previous pair before either value is replaced. Let `T_i` be each uncoupled frequency target after ratio, tracking, detune, sweep, drift and Hz offset. The existing result-feedback term remains independent and affects A only.

The Collision position is `x` in [0,1]. Effective depth is `range × x^curve`. Curve is adjustable from 0.25 to 4. Ranges are independent per mechanism and persist when switching:

| Mechanism     | Default range; adjustable range | Operation                                                                                              |
| ------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Original FM   | 1000 Hz; 0–4000 Hz              | Add `depth × u_other` to target frequency                                                              |
| Normalised FM | 2; 0–8                          | Add `depth × clamp(T_i, 0, 0.42 Fs) × u_other` to target frequency                                     |
| Mutual PM     | 1 cycle; 0–4 cycles             | Add `depth × u_other` to waveform read phase; carrier accumulator keeps its target-frequency increment |

FM carrier frequencies retain the original clamp to [0, 0.42 Fs]. PM also retains that carrier clamp, but its read-phase velocity is not frequency-clamped. All mechanisms retain the independent A result-feedback term, hard-sync option and subsequent Multiply/Switch/XOR operation. Initialise disables those confounding features; legacy configurations still work.

Normalised FM uses the **receiving oscillator's** nonnegative capped target, not the other oscillator's frequency or a constant shared root. It scales fractional excursion under transposition, but does not hold conventional FM index constant as the A/B ratio changes. A nonpositive target has zero normalised mutual-FM depth and cannot be restarted by that coupling alone. Waveform amplitude and DC bias are deliberately not normalised away.

PM is explicitly causal: one oversample delay in both directions (about 5.2 μs at 48 kHz output). It displaces waveform-reading phase, not the carrier phase accumulator. Source output, including that displacement, drives the other oscillator on the next oversample. Delay in seconds varies with device sample rate. No algebraic simultaneous solve, phase-attraction law or additional phase locking is implemented.

The `fm` JSON field is retained as the 0–1000 Collision position. With omitted new fields, Original FM, curve 1 and range 1000 reproduce the old absolute-Hz value exactly. Existing version-1 configuration files import normally; new exports retain the format with added optional fields. Loading new files in an old prototype would ignore new mechanism fields and should not be expected to reproduce them.

## Telemetry and visual semantics

`telemetry.js` defines a bounded 2048-frame interleaved history. The fields, in order, are:

`a`, `b`, `phaseA`, `phaseB`, `carrierHzA`, `carrierHzB`, `readHzA`, `readHzB`, `targetA`, `targetB`, `interaction`, `loopInput`.

- A/B are actual waveforms immediately before combination, including shaping and bias.
- Phase fields are wrapped waveform-reading phases in cycles.
- Carrier Hz is the clamped accumulator increment; read Hz is the derivative of the unwrapped read-phase command, including PM, phase-control changes and sync reset jumps. It can be negative or far above the output sample rate. It is **not perceived/detected pitch**.
- Targets are the uncoupled requested frequencies, before FM/result feedback and clamping; they may be negative with Hz offsets.
- Interaction is raw Multiply/Switch/XOR; loop input additionally includes imperfections/drive, before FIR, DC removal, amplitude envelope and final ceiling.

One snapshot is taken at the last oversample of each output sample. The shared window is about 42.7 ms at 48 kHz, shorter at higher rates. It is raw diagnostic sampling, not band-limited source audio. It can miss intra-sample events and visually alias. This is a compromise between bounded history length and communication cost, not a claim to record every 4× internal sample.

The worklet reuses a history plus a three-buffer transferable pool, approximately 384 KiB total. Packets are sent at approximately 20 Hz, about 1.9 MiB/s maximum at full window size. Missing returned buffers cause packet drops, not unbounded queuing or audio blocking. No telemetry allocation occurs per audio sample. The UI returns old buffers and renders only its latest snapshot.

The lime A and amber B traces use the same sample indices and time window. At zero Collision their centres are separated; at maximum their centres meet. Only position is metaphorical. Trace deformation comes from telemetry, without independently triggering/aligning the sources or inventing agitation. The lower blue trace is the raw interaction. Sources continue running before the amplitude envelope, so they can move while final output is silent. Pixel extrema and sample interpolation aid drawing; values outside ±2 are visually clipped without changing audio.

**Export snapshot** saves field definitions, sample rate, frame endpoint, mechanism, depth, note, samples and current control configuration. A window may straddle control changes; the configuration is the current UI state, not a per-sample automation log. Bounded snapshots are diagnostic captures, not continuous recordings or synchronisation classifiers.

## Numerical findings, not a musical verdict

`node clldr/tests/survey.mjs` renders 576 short configurations: all three mechanisms, four waveforms, all three interaction modes, MIDI 24/96, B/A 1.006/8 and Collision 0/2/25/100%, at 48 kHz. Each configuration runs 200 ms from a clean start with feedback/sync/imperfections off, default mechanism ranges and sustain 1.

No nonfinite or out-of-bound output occurred. The following are **sampled carrier-stalling percentages aggregated over those particular configurations**, not universal instability thresholds:

| Mechanism     | 2% Collision | 25% Collision | 100% Collision |
| ------------- | -----------: | ------------: | -------------: |
| Original FM   |           0% |        26.88% |         40.07% |
| Normalised FM |           0% |            0% |         73.78% |
| Mutual PM     |           0% |            0% |             0% |

PM does not stall its carrier in these cases, but its maximum sampled read-phase velocity reached roughly 400 kHz at full depth. That does not establish a 400 kHz audible pitch or quantify aliasing; it shows large read-phase jumps. Normalised FM at full default depth often becomes quieter/stalled: the median RMS over this survey falls substantially. Keeping this region accessible is intentional so the experiment can evaluate it, rather than hiding it with gain correction or selecting a winner.

## Technical compromises and listening questions

- Original FM's behaviour is preserved at the default range/curve. New mechanisms are mutually exclusive, not blended. Nonzero result feedback, sync, imperfections or pitch lock complicate interpretation; introduce them separately after clean comparisons.
- The original 4× oversampling and 63-tap FIR remain. PM uses an approximate polyBLEP width based on absolute read velocity for saw/pulse, capped below half a cycle. It does not correctly band-limit arbitrary phase jumps, reverse motion or hard sync. PM, pulse modulation, XOR and strong FM can alias heavily; no spectral alias-rejection measurement or claim of alias-free output is made.
- Range/mode/phase changes and clean resets can click. Resetting filter/envelope memory deliberately truncates existing tails. Repeat preserves timing, not seamless overlap. No universal parameter smoothing has been added because it would alter the baseline.
- Negative FM clamps rather than running through zero. This can create pitch stalling, very quiet states and abrupt transitions. The Normalised FM range exposes that limitation rather than fixing it as part of this comparison.
- PM is periodic in phase displacement. With nearly ideal ±1 pulse modulation, integer-cycle depths can largely wrap away between edges. Interesting behaviour may be non-monotonic and strongly waveform-dependent.
- The final soft ceiling remains nonlinear; the passive listening trim does not change its drive. Neither equal fader percentages nor RMS matching establishes equal perceived loudness or equivalent modulation.
- The existing output tuner can reject or misidentify strongly modulated signals. Its confidence is not proof of synchronisation or musical stability. No visual locking classifier is supplied.
- Finite output is established for tested cases; chaotic dynamics, pleasant instability, perceptual pitch, useful fader regions and visual meaningfulness require listening and viewing over longer times. In particular compare near-unison against 1:2, 1:2.76 and wide ratios; low/high notes; different source waveforms; all three interaction modes; and linear versus compressed/expanded response curves. Evaluate whether stable states are interesting or merely silent.
- Headless Chromium checks establish generated signal and UI operation, not subjective listening, physical-device latency, mobile performance or Safari compatibility.

## Validation

```sh
npm test
node clldr/tests/survey.mjs
```

The 34 automated tests include pre-change Original FM fixtures from commit `cc4f5ab` (six legacy configurations plus low/high extreme FM), exact zero-coupling equivalence, independent causal sine references, scaling under octave-plus-doubled-sample-rate, deterministic reset/sequence/180 ms gating, history alignment, telemetry backpressure/recycling and 1728 short extreme combinations at 44.1/48/96 kHz. The scaling check establishes the formula's similarity under that paired change, not perfect device/sample-rate invariance of nonlinear feedback.

The optional browser smoke test requires Playwright and Chromium in the test environment, but adds no runtime dependency. With Playwright available as a normal installed package:

```sh
node clldr/tests/browser-smoke.mjs
```

Alternatively specify an external Playwright module and browser executable through `CLLDR_PLAYWRIGHT_MODULE` and `CLLDR_CHROMIUM`. `CLLDR_TEST_URL` overrides the default local server address. The test checks real AudioWorklet signal in each mode, unchanged oscillator settings, telemetry beyond pool capacity, A/B and JSON preservation, old-patch import, all four sequence notes, Drone/Repeat exclusion, one-shot passive matching, complete release and a 390-pixel layout.

### Repeat playback regression

```sh
node clldr/tests/repeat-playback.mjs
```

This additional Playwright test uses the same optional environment variables, with the browser's default autoplay policy. It deliberately delays AudioWorklet loading, clicks Enable audio / Initialise / Repeat before loading completes, and measures the actual engine output through a silent test-only audio tap. Before the fix, the Repeat button highlighted but no `audition` command reached the worklet: `ctx` already existed, so the second playback request skipped module/node initialisation and its message was silently dropped. Playback now shares a full initialisation promise. Stop/preset changes cancel pending starts, stopping Repeat does not require resuming audio, and a running context is not redundantly resumed.

The regression checks repeated percussive attacks with quiet gaps at 2 Hz, all four sequence pitches paired with generated audio, Strike-to-Repeat and Drone-to-Repeat transitions, cancellation during loading, direct first-use Repeat, and silence after the configured release. It failed against the pre-fix UI and passed after the fix. A separate failure with audio already fully initialised was not reproduced in Chromium; these tests do not establish physical-device or Safari behaviour.
