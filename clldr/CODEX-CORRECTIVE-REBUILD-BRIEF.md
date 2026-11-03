# CLLDR - Corrective Prototype Rebuild

Project: Zero Width - Collider (CLLDR)
Repository: danbudo/zw-prototype-experiments
Branch: clldr-prototype
Directory: clldr/
Status: Approved for Codex hand-off by request to publish this brief. Design details marked open below are NOT delegated to Codex for invention.

## 1. Objective
Rebuild CLLDR as a greatly simplified, expressive, playable ring-modulation synthesiser. Replace the sprawling laboratory UI with a coherent instrument fascia. Preserve distinctive synthesis and remove conventional effects, redundant controls, decorative animation and instrument-specific tactile surfaces. Do not expand scope.

## 2. Inspect before editing
Inspect existing CLLDR UI, DSP, state, tests and parameter wiring. Inspect the Starscream modulation-matrix component in danbudo/Zero-width-music-machines as the interaction reference. Identify reusable patterns and report conflicts or ambiguous DSP removals before making them. Do not silently discard working synthesis.

## 3. Fascia
Remove the oversized 'TWO SIGNALS. ONE COLLISION.' intro and copy. Compact header: existing essential trigger, drone/sequence, transport, melody and reference utilities.
Primary composition: OSC A | COLLISION / VISUALISER | OSC B.
- Two large matching 270-degree tuning dials.
- Horizontal four-way waveform selectors (sine, triangle, saw, square) for each oscillator.
- Prominent Collision depth fader and horizontal Multiply / Switch / XOR selector.
- Central truthful live signal visualiser.
- Accessible root octave selector.
- Two small symmetrical banks of essential secondary sound-shaping controls.
Keep principal controls and visualiser together above the fold on a typical desktop viewport. Exact secondary knob assignments remain an open design detail: do not arbitrarily fill slots.

## 4. Octave and register
Add a five-position relative root octave selector: -2 | -1 | 0 | +1 | +2. Applies to initial drone, triggered root and sequence pitch reference; preserve note intervals and A/B ratio relationships. Preserve semantics of independent Hz offsets, modulation rates, absolute-Hz FM and feedback; do not multiply all DSP frequencies indiscriminately. Start lower than the current prototype. One octave below existing reference is a candidate, not a final calibrated frequency: evaluate by ear before locking a default.

## 5. Controls
No dropdowns. Use segmented controls for small enumerations, switches for binary values, rotary knobs for continuous sound-shaping, a Collision fader and numeric readouts/entry as useful. Keyboard accessible, visible focus, responsive, reliable drag and synchronised readouts. No duplicate state or decorative status clutter.

## 6. Core synthesis to preserve
Two independently configurable oscillators, A and B: sine/triangle/saw/square, tuning, detune, ratios, existing shaping/bias, phase, partial tracking and hard sync where supported.
Collision: mutual oscillator modulation, absolute-Hz FM, frequency-relative FM, mutual PM, algorithm-specific response and existing feedback. Preserve Multiply (actual signal multiplication), Switch and XOR. Collision is oscillator interaction, NOT wet/dry. Multiply continues to work at zero Collision depth. Do not replace with a basic carrier/modulator engine.

## 7. Remove conventional post-processing
No filters, notch stages, conventional post-process distortion, diode waveshaper or imported effects. Zero Width provides shared channel distortion and colour on returns. Distinguish existing Drive's post-processing from synthesis-integrated nonlinearity: remove the former, retain the latter, and flag ambiguous cases rather than silently deleting them. Do not introduce replacements.

## 8. Envelopes
Exactly two ADSRs: ENV 1 - AMP (dedicated amplitude) and ENV 3 - MOD (one assignable modulation envelope). No separate MOD A/B and no filter envelope. Remove legacy Pitch Sweep and Sweep Time from both UI and DSP; use assignable modulation for suitable pitch movement. Ensure trigger/drone/sequence behaviour is consistent.

## 9. LFO / Mod Matrix
One LFO. Follow actual Starscream matrix interaction: grouped destinations, bipolar depth fader per destination, source-assignment buttons beneath, one source per destination (Off, LFO 1 or ENV 3), multi-selection/relative changes where appropriate. Matrix collapsed by default. Use only actual supported destinations. Do not invent parameter precedence: Zero Width's broader base/macro/parameter-lock hierarchy is out of scope.

## 10. Advanced and Chaos
Advanced collapsed by default, organised OSC A | COLLISION | OSC B, containing genuinely useful detailed synthesis controls, not obsolete clutter. Chaos follows Advanced, collapsed by default; it is deliberately sculpted instability inside sound generation, not generic effects. No new Chaos algorithms without approval. Mod Matrix follows Chaos.

## 11. Visual feedback
A prominent live audio-derived display with three proposed signal views: OSC A | RESULT | OSC B. Make waveform/tuning/Collision/feedback/modulation changes visible where observable, with scaling useful across low and high registers. Define the Result signal tap (pre-envelope or final output) before implementation. No fake spectrum, simulated waveforms, particle effects, ripples or decorative animation. Efficient rendering.

## 12. Playing modes
Preserve existing trigger, drone, sequence, melody and transport functionality. Octave selector must behave consistently across modes. Do not build another sequencer.

## 13. Tactile Control exclusion
No XY pad, ribbons or CLLDR-specific tactile UI. Tactile Control is a shared Zero Width interface across instruments and outside this rebuild. Do not modify the wider platform.

## 14. Gemini reference - investigation only
Reference: ZEROWIDTH_CLLDR_Drone_Synth.html (user-provided Gemini prototype; see reference file if present). Examine its ring-modulated output fed back to modulator oscillator frequency. Compare with CLLDR's current feedback and mutual FM/PM. Report equivalence, distinctions and possible merit. Do NOT implement new topology without approval. Do NOT import Gemini's filters, post-distortion, tactile pad, ribbons, sequencer or animations.

## 15. Implementation quality
Separate DSP, parameter state and presentation. All controls must affect their stated parameters. Maintain safe audio output and prevent accidental overload. Preserve working DSP except explicit removals. Keyboard and responsive accessibility. Avoid unnecessary dependencies and platform-wide abstractions.

## 16. Verification
Test oscillator waveforms, tuning, root octave and lower default, drone/trigger/sequence intervals, Multiply/Switch/XOR, Collision algorithms, feedback, both ADSRs, LFO assignments, removed sweeps/filters/post-distortion, output safety, control synchronisation, numeric entry, collapsible sections, responsiveness and real-signal visualisation. Distinguish automated tests, browser checks and actual listening; never claim to have listened if not done.

## 17. Delivery
Stage A: compact header, fascia, octave selector/lower default, essential controls, visualiser, Advanced/Chaos presentation.
Stage B: ENV 1/ENV 3, one LFO, Starscream-style Mod Matrix, remove pitch sweeps and conventional processing, tests.
Separate report only: Gemini feedback investigation.
Keep reviewable commits, concise test results and unresolved issues. Do not modify danbudo/Zero-width-music-machines.

## 18. Acceptance
CLLDR opens as a simple playable instrument in a lower register; octave works across modes; distinctive oscillator interactions survive; meaningful visual feedback is prominent; essential controls accessible; deeper controls collapsed; two envelopes and one LFO work; no conventional effects, filters or decorative tactile/animation features; no silent regressions.

## Open design points - require user decision, not Codex invention
1. Exact calibrated initial root pitch.
2. Which existing parameters occupy the small secondary knob banks.
3. Whether RESULT trace taps pre-envelope synthesis or final audible output.
