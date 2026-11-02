# CLLDR - Codex next task: fascia and envelope architecture

**Scope: Stage A only. Inspect and propose. Do not modify application, DSP or UI files yet.**

## Objective
Turn the CLLDR ring-modulation laboratory into a coherent Zero Width instrument, retaining the experimental synthesis engine. Produce an actionable design and engineering proposal for review.

## Existing instrument: preserve
- Two oscillators combined through actual ring multiplication (Multiply), with Switch and XOR alternatives.
- Collision controls mutual oscillator influence, **not** ring-modulation wet/dry. Ring modulation remains active at zero Collision.
- Existing original/normalised FM and PM mechanisms, feedback, oscillator controls, comparison facilities, diagnostics, audition tools and patch functionality.
- Do not introduce arbitrary macros, effects, new synthesis modes, invented LFOs or fake visual behaviour.

## Interface structure
**Compact header**: audition tools (Strike, Repeat, repeat rate, temporary four-note sequence, Drone, Stop); mode/configuration (including Multiply/Switch/XOR, keyboard tracking and reference tuning); patch management and initialisation. Arrange in tidy functional groups. The temporary note sequencer and triggers stay here, **not** on the fascia or in a separate performance strip.

**Main fascia**: bridge layout. Oscillator A controls to the left of a generous central live visualiser, oscillator B to the right. Two large, symmetric tuning dials with useful readouts. Each oscillator gets a waveform selector and only the most important immediate sound-shaping controls. Audit candidates such as Shape rather than assuming they belong. Collision is a prominent long fader integrated with or immediately beneath the central display. Visualise real A, B and interaction telemetry, including ring modulation at Collision zero. Distinguish nominal oscillator frequencies from instantaneous frequencies under modulation.

**Advanced sections**: coherent collapsible groups for envelopes, oscillator detail, interaction/coupling, character/Chaos, and diagnostics. Group by musical relationship, not arbitrary parameter count. Preserve access to every existing parameter. Keep consistent sizing, spacing and typography; avoid endless equal-sized knobs or deep nesting.

**ZW control vocabulary**: large 270-degree feedback-ring dials for primary tuning, appropriately sized amp-style knobs for secondary parameters, faders for meaningful travel, segmented controls, rotary selectors, switches and buttons. **Zero Width does not use drop-down menus**: no HTML select elements, dropdown popovers or disguised dropdowns anywhere, including header, patch controls and envelope routing. For complex choices, propose dedicated selection panels. Collapsible accordions for advanced sections are allowed.

**Responsive**: retain readable tuning controls and visualiser on narrower layouts; rearrange instead of indiscriminately shrinking. Keep the header compact.

## Envelope architecture to investigate
All ZW instruments use standard envelope roles:
- ENV 1 - AMP: one global ADSR for CLLDR.
- ENV 2 - FILTER: one global ADSR for CLLDR.
- ENV 3 - MOD: **two independent, freely assignable ADSRs**, one for oscillator A and one for oscillator B.

Each envelope has Attack, Decay, Sustain and Release. Pitch must be an available ENV 3 destination for either oscillator. Investigate suitable additional oscillator-specific destinations, and whether either ENV 3 may target shared Collision. If both target Collision, propose deterministic combination rules.

Do **not** assume these DSP features already exist. Inspect the actual filter signal path (if any), current amplitude ADSR, and existing pitch sweeps. Identify what is needed to implement the standard FILTER envelope and assignable MOD envelopes without compromising the ring-modulation identity. Do not invent or implement filter topology or modulation routing until reviewed.

## Stage A deliverables
1. Inventory of current parameters and their current UI/DSP implementation.
2. Explicit mapping of each existing control to header, main fascia or named advanced group.
3. Proposed wide-screen bridge layout, with responsive behaviour and clear control-size hierarchy.
4. Envelope DSP gap analysis, modulation destination shortlist and proposed routing/combination semantics.
5. Specific open decisions requiring approval, especially FILTER topology, ENV 3 routing and which secondary oscillator controls belong on the fascia.
6. A staged implementation plan with test and regression implications.

**Stop after presenting the Stage A proposal. Do not implement Stage B without explicit approval.**
