# CLLDR corrective rebuild — preflight findings

Brief inspected: [CODEX-CORRECTIVE-REBUILD-BRIEF.md](CODEX-CORRECTIVE-REBUILD-BRIEF.md), commit `8d983c8`. This supersedes the earlier multi-MOD/FILTER-envelope proposals: the requested rebuild has **exactly AMP + one assignable MOD ADSR, one LFO, no musical filter or FILTER envelope**.

Status: inspection only. No application, DSP, UI, state, tests or wider Zero Width source files changed. The brief reserves three decisions for the designer; questions have been presented in chat before implementation.

## 1. Required design decisions

| Reserved decision | Current implementation / question |
| --- | --- |
| Calibrated initial pitch | Reference is MIDI 57 / A3 / 220 Hz. A2 / 110 Hz is the brief's lower candidate, not an ear-calibrated default. Confirm a pitch, or authorise a clearly provisional starting point. No listening/calibration is claimed. |
| Secondary knob banks | Shape, Bias, Detune and other existing source parameters are available. No assignments or slot count have been selected on the designer's behalf. Unassigned controls can remain in Advanced pending a decision; do not populate empty slots decoratively. |
| RESULT signal tap | Current central RESULT is raw interaction before imperfections, decimation, DC removal, AMP and output limiting. Final audible engine output is a different signal, currently available to the analyser but not in the synchronised source-history packet. Confirm raw/pre-envelope or final output before implementing the new display. |

The Gemini reference is also missing: `clldr/references/ZEROWIDTH_CLLDR_Drone_Synth.html` was absent from the fetched branch and no matching HTML was found in the attached workspace. It must be attached to this conversation or committed at that path. Its separate feedback investigation cannot be completed from the hand-off's verbal description.

## 2. Starscream interaction reference — inspected actual source

Read-only inspection of `danbudo/Zero-width-music-machines`, commit `bf8f17447068ec0199e29bf4f5bf843b78ac54c1`, in temporary Git/review files. No source changes, installation or build in that repository.

Relevant source prefix: `prototypes/zw-instrument prototypes/zw-all-the-work-so-far/Starscream/src/`.

- `StarscreamerApp.tsx` imports `components/LFOModMatrix.tsx`, passes source/destination updates and selection callbacks from `useSynthEngine`, and renders the matrix.
- `components/LFOModMatrix.tsx` groups destination columns under headings. Each column has a bipolar **−1…+1 Fader**, with source-assignment buttons beneath it.
- Its assignment handler clears the other LFO assignments for that destination. Switching source preserves the existing depth; clicking the assigned source removes that assignment. Shift-click supports selected source buttons.
- Selected faders receive a **relative delta**, independently clamped, rather than all being forced to the same absolute value. Selection is via fader labels; Shift-click on the fader itself resets its depth. These are distinct gestures.
- `components/Fader.tsx` is mouse-driven; CLLDR must provide the requested keyboard/touch accessibility rather than blindly copying those handlers.
- The source UI infers assignment from nonzero depth and inserts `0.01` when assigning from zero. That is an implementation quirk, not authority to introduce hidden nonzero modulation in CLLDR. Explicit source identity and depth can be represented separately so zero depth stays neutral.
- The separate `engine/ModulationMatrix.ts` can sum several LFO contributions. Do not adopt that resolution model: the corrective brief explicitly requires **one source per destination: Off / LFO 1 / ENV 3**. The UI's interaction pattern, not the broader engine/macro architecture, is the reference.

The Starscream component also contains filter/effects destinations, four LFOs and tempo facilities. Those are not CLLDR requirements. Do not import its destination inventory, effects, sequencers, precedence system or multiple sources.

## 3. Signal-path and removal audit

Current source loop in [dsp.js](dsp.js) is: source generation and mutual FM/PM → Multiply/Switch/XOR → asymmetry/leakage/noise → optional Drive saturation → bounded result-feedback update → protective decimation → DC removal → AMP × Output → final `tanh` ceiling → passive trim.

| Existing item | Finding / treatment to resolve before removal |
| --- | --- |
| Musical filter, notch or diode waveshaper | None exists in the current CLLDR code. Do not import any from the reference. |
| 63-tap FIR / 4× decimation | Anti-alias infrastructure, not a musical filter. Recommend retaining it to preserve safe alias mitigation; do not modulate it as FILTER. |
| 0.995-pole DC blocker | Protective offset removal, not an instrument filter. Recommend retaining it, especially for biased sources and sign-based interaction. It also attenuates low difference tones, relevant to the lower register. |
| Drive + drift (`grit`) | One parameter currently controls source drift **and** `tanh(v * (1 + 3*grit)) / (1 + grit)` after interaction. The post-processing is explicitly unwanted, but deleting the whole parameter would also discard existing source drift. Remove the post-processing portion while retaining the existing drift mechanism only; its naming/state/UI must make that split explicit. This is not approval for a new Chaos algorithm. |
| Result-feedback nonlinearity | `feedbackState = tanh(v + previousState * feedback * 0.3)` is inside the generator loop; its state then shifts **A's frequency** by `feedbackState * feedback * rootHz * 2`. Retain this bounded synthesis mechanism. It is different from mutual source-to-source FM/PM. |
| Asymmetry | `0.4 * asymmetry * v²` is both post-interaction distortion and part of the feedback excitation. Ambiguous under the brief: removing it changes the loop, while keeping it colours output with feedback off. Flagged for decision; do not silently delete it or invent a loop-only replacement topology. |
| Final `0.8 * tanh(signal)` | Serves as output bounding but also continuously saturates the result. Reconcile “no conventional post-distortion” with safe output before changing it. A transparent safety ceiling is conceptually different from a Drive control; the exact replacement/retention policy needs review. Do not simply remove all bounds. |
| Leakage and noise | Added after interaction and included in feedback. Existing circuit-character behaviour, not new effects to import. Retain unless the designer explicitly decides otherwise. |
| Pitch Sweep / Sweep Time | Explicitly authorised for removal in Stage B, from both UI and DSP. They currently affect defaults/sanitisation, per-note age, several example configurations, snapshot fields, tests/fixtures and docs. Remove/update those dependencies deliberately; unreviewed old patches and fixtures must not force obsolete sweeps back into the design. |

This table reports conflicts before any DSP edit. The extra ambiguity is not a fourth invented fascia choice: it concerns which existing nonlinearities the brief means to remove versus retain.

## 4. Octave implementation constraints

The requested five positions are relative **−2 / −1 / 0 / +1 / +2**. They must transpose the played-note reference for Trigger, Drone and the existing melody sequence; they must not multiply every frequency-valued parameter.

- Apply the octave to the note reference, then run the existing per-source tracking/ratio/detune/pitch-modulation calculation. Keep fixed Hz offsets, absolute-Hz FM depth and LFO rates in Hz. Preserve receiving-relative FM scaling and existing result-feedback semantics rather than adding a second blanket multiplier.
- With full equal tracking and no fixed offsets/modulation, A/B frequency ratios and melody intervals transpose as expected. With different/partial tracking or Hz offsets, actual ratios can legitimately change: preserving those independent behaviours is incompatible with forcing every actual ratio to remain constant. Do not add compensating hidden retuning.
- The engine and telemetry currently clamp played notes to MIDI 24–96. A2 minus two octaves is MIDI 21; an additional melody down-octave reaches MIDI 9. Those existing clamps would silently break the requested intervals. The runtime reference calculation and telemetry note reporting need a reviewed extended reference domain rather than clipping each melody note back into the old range. Bounded oscillator-frequency protection remains separate.
- Lower references also expose the short telemetry window and DC blocker's low-frequency attenuation. No default should be described as calibrated or auditioned without human listening.

## 5. Display and state implications

Current source telemetry captures A/B, read phase, carrier/read velocities, uncoupled targets, raw interaction and loop input in shared 2048-sample windows. The final engine output is not in that window. Adding a final RESULT must tap the actual conditioned sample on the same clock, rather than independently triggering a second scope and pretending its phase aligns.

The current window is about 42.7 ms at 48 kHz and 21.3 ms at 96 kHz. That is insufficient for some low-octave cycles. Stage A needs a longer bounded shared history or truthful aggregation/timebase management. Do not draw a simulated clean waveform when telemetry lacks a complete period. Three-view scaling must keep silent, stalled and strongly modulated states truthful; source motion can continue while AMP closes audible output.

Presentation currently owns some sound/transport state in `app.js`, while DSP sanitisation is separate. The rebuild should make parameter state explicit and keep control input/rendering separate from DSP. No wider-platform abstraction, parameter-lock/macro precedence or new saving system is needed. Existing lab playback readiness/cancellation regressions remain important.

## 6. Stage boundaries after decisions

**Stage A:** remove oversized intro; build compact audition/reference header and responsive OSC A | real display/Collision | OSC B fascia; implement accessible rings/segments and approved secondary banks; add relative root octave and confirmed lower reference; reorganise Advanced and Chaos. Keep waveform, tuning, partial tracking, sync, all coupling algorithms, response controls and feedback inspectable. No final knob assignments or RESULT tap are guessed.

**Stage B:** exactly AMP and one assignable MOD ADSR, one LFO, collapsed Starscream-style matrix after Chaos with explicit Off/LFO 1/ENV 3 and supported destinations only; remove sweeps and approved post-processing; verify units, per-destination exclusivity, bipolar depths, relative selection edits, gate behaviour and safety. No FILTER envelope, extra MOD A/B, tactile pad/ribbon, added effects or new sequencer.

**Separate Gemini investigation:** blocked on the HTML. Once supplied, compare actual feedback target, signal tap, scaling, delay, saturation and clamping with the current A-directed result-feedback loop and reciprocal FM/PM. The phrase “ring output to modulator frequency” alone does not establish equivalence, especially because Switch, hard sync and A-directed feedback are asymmetric. No Gemini topology or claimed sonic merit has been adopted.

## 7. Verification implications

Keep existing core interaction, waveform/coupling, output-safety and real-audio transport tests, updating tests that intentionally encode removed sweeps/saturation rather than treating every old sample fixture as an approved sound. Add explicit tests for all octave positions across all playing modes, melody intervals outside the old clamp, fixed-Hz invariance and partial-tracking semantics; both ADSRs, LFO and exclusive routes; absence of retired controls/processors; pointer/keyboard/numeric control synchronisation; section order and collapsed state; responsive above-fold composition; and actual aligned source/RESULT traces.

No application tests were rerun for this inspection-only document. Previous automated passes do not constitute ear calibration or approval of musical controls.
