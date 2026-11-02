# CLLDR - Codex discovery and audition brief

Status: authorised discovery/prototype work, NOT approval of a final instrument design. Read STAGE-A-PROPOSAL.md for implementation inventory, but treat its layout, control placements and compatibility recommendations as provisional where superseded below.

## Purpose
CLLDR is an experiment in two-oscillator ring modulation and mutual modulation, with a distinctive alien, metallic, rhythmic and unruly sonic identity. We are discovering which DSP parameters are essential, musically useful, inconsequential or off-brief. Existing code and prototype patches are NOT an approved specification or reference sounds. The designer has not auditioned the patches. Do not infer merit from mere implementation.

## Immediate task
Make the current experiment straightforward to audition, compare and assess. First inspect the existing UI/DSP and propose a lean, staged discovery workflow, then implement only the smallest safe changes needed to support that workflow. Keep the actual synthesis behaviour inspectable and avoid speculative new sound engines, effects or ornamental controls.

- Maintain accessible, responsive, usable laboratory audition facilities. Target control model: momentary Trigger; Drone / Sequence segmented choice; Play button that becomes Stop; Melody switch for the temporary sequence. Examine existing Strike, Repeat, Hold, Clean/Legacy, pitch sequence and keyboard semantics; report any ambiguities or potential loss before replacing them. Do not quietly change triggering behaviour.
- Do not build a CLLDR-specific performance system, sequencer or patch-saving convention. ZW provides shared performance, sequencing and saving architecture. Current audition and JSON/snapshot tools are experimental conveniences only.
- Provide a practical parameter-audition method: clear neutral/reference starting states, repeatable A/B comparisons, ability to isolate each parameter and its meaningful ranges, and a concise evaluation log/template. Keep measurements truthful; distinguish listening judgements from numerical DSP observations. No invented results or claims of listening.
- Identify interactions worth listening to: Multiply/Switch/XOR, waveform pairings, tuning ratios, Collision depth, three coupling algorithms and their ranges, Shape, Bias, phase, offset, detune, hard sync, result feedback, grit/drift, leakage, noise, asymmetry. Evaluate whether each earns its complexity and where it belongs. Ring modulation remains active when Collision=0; Collision is mutual coupling, not wet/dry.
- Pitch Sweep and Sweep Time are provisional legacy mechanisms, not approved features. Their intended musical purpose belongs to assignable ENV 3 pitch modulation. They are not candidates for the medium-knob deck. Do not preserve them solely for unreviewed patches; flag any deletion and dependencies explicitly before removing. No requirement to preserve prototype patch sound or legacy file formats at the expense of the architecture.
- Do not implement FILTER or MOD envelopes as part of this discovery task without a separate decision. AMP ADSR currently exists. Proposed standard envelope roles are ENV 1 AMP, ENV 2 FILTER and two independently assignable ENV 3 MOD envelopes (A/B), with pitch as a key destination.

## Agreed UI direction (not authority to finalise the knob inventory)
1. Compact header: one row with three functional columns on wide layouts, stacking those groups responsively. Audition controls are lab-only.
2. Main fascia: symmetric oscillator A/B large tuning rings and waveform selectors around a generous truthful interaction visualiser; central Collision fader and Multiply/Switch/XOR selector.
3. Two-part deck of medium knobs immediately below fascia, one bank per oscillator. Exact controls and count NOT decided; do not lock Shape/Bias or any other candidate into the design without evaluation.
4. Envelopes visible by default, not buried in Advanced. Do not depict unimplemented envelopes as functional.
5. Advanced section collapsed by default.
6. Chaos is a distinct rack, AFTER Advanced.
7. Mod Matrix is last, immediately AFTER Chaos.
Do not invent a bespoke CLLDR saving header or assume the lab's patch tools will survive into ZW. Avoid dropdowns in the intended instrument UI.

## Deliverables
1. Short audit of current audition capabilities, parameter controls and gaps for meaningful listening, grounded in code.
2. A prioritised listening test plan with specific repeatable parameter comparisons, expected diagnostic purpose (not invented audible outcomes), and an evaluation table with Essential / Useful / Inconsequential / Off-brief / Untested classifications.
3. Minimal prototype changes only if justified by the test plan, with tests and clear before/after notes. If a design choice or destructive DSP removal is required, stop and ask rather than guessing.
4. A concise recommendation of what to audition first, not a predetermined final knob deck.

Keep changes on branch clldr-prototype. Do not alter unrelated ZW components. Clearly separate code facts, proposals and untested hypotheses.
