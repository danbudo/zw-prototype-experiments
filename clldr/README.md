# CLLDR — experimental sound engine

A disposable, standalone browser sound laboratory for Zero Width. Two oscillators generate sound through multiplication, polarity switching, or sign-bit XOR. There is no conventional synth voice feeding a ring-modulation effect.

## Collision listening experiment

The laboratory now includes exclusive **Original FM**, **Normalised FM** and **Mutual PM**, one Collision fader, adjustable depth ranges/curve, an Initialise configuration, deterministic sample-clock repeat/sequence, passive level matching and live synchronised source telemetry. The six original configurations remain available.

See [EXPERIMENT.md](EXPERIMENT.md) for audition instructions, exact coupling formulas, telemetry format, numerical findings and known compromises. The original prototype controls described below remain available; the Collision fader replaces the old standalone Mutual FM slider.

## Run

Requires Python 3 and a modern browser with AudioWorklet (Chrome/Chromium recommended). No package installation, build, backend, account, external font, or network service is required.

```sh
cd /workspace/zw-prototype-experiments/clldr
npm start
# alternatively: python3 -m http.server 8000 --bind 0.0.0.0
```

Visit the server in your browser using localhost or an HTTPS development forwarding URL. AudioWorklet requires a secure context; opening index.html directly or using plain HTTP on a remote host will not work. Click **Enable audio** to unlock playback. Start with quiet headphones/speakers.

`npm test` runs the dependency-free DSP tests with Node 20+.

## Experiment

1. Select **Pure**, enable audio, and press **Strike**. **Hold** opens a sustained gate; **Space** plays while held when focus is outside a control. **Stop** closes all gates with the configured release. **Drone** keeps the gate open and can start immediately when audio is enabled.
2. Change between **A × B**, **A × sign(B)**, and **A ⊕ B**. XOR means comparison of each input with zero followed by boolean XOR, mapped to ±1; this is not a bitwise operation on floating-point samples. Multiplication produces sum and difference sidebands. Switching retains A's amplitude; XOR discards both input amplitudes except their signs.
3. Each source has sine, triangle, saw, or pulse; ratio, detune, additive frequency offset, key tracking, initial/continuous phase offset, shape, DC bias, and its own exponentially decaying pitch sweep. DC bias moves switching thresholds as well as changing multiplication. Shape changes sine/triangle skew, saw curvature, or pulse width.
4. **Mutual FM** is bidirectional, using the other oscillator's previous oversample as a linear frequency modulation signal. **Hard sync** resets B when A wraps. Feedback routes the saturated interaction back into A's frequency, with a one-oversample delay and bounded gain.
5. **Drive + drift**, asymmetry, source leakage and noise deliberately break ideal behaviour. They are abstract controls, not calibrated component tolerances or a model of a particular circuit.
6. Store a sound in the opposite A/B slot, change the active sound, then listen to either slot. Edits are retained in the active slot. Root, tuning, waveform, envelopes, drone and all sound parameters are recalled. Gate/phase continue where applicable; returning from Drone to a closed gate releases. This is manual comparison, without loudness matching, crossfade or blind randomisation.
7. Export/import a versioned JSON configuration. Import validates the format and clamps numbers to the supported limits. Files contain the current sound only, not A/B slots, playback state, or the experimental tuning correction.

### Six test configurations

| Configuration | Intent                                                          |
| ------------- | --------------------------------------------------------------- |
| Pure          | Sine × sine at 1:2; clean sum/difference reference              |
| Bell          | Inharmonic 2.76 ratio, fast upward sweep, long decay            |
| Bass          | Triangle polarity switching, sub ratio, short downward sweep    |
| Strike        | XOR, opposed pitch sweeps, noise, percussive decay              |
| Drone         | Near-unison beating, phase offset, mutual FM and light feedback |
| Collision     | XOR, saw/pulse, opposing sweeps, sync, FM and stronger feedback |

### Tuning and analysis

The oscilloscope, spectrum, RMS/peak meters and YIN tuner analyse the final mono signal sent to the destination, after DC removal, envelope and output ceiling. The spectrum is logarithmic from 30 Hz to 20 kHz; the scope displays about 25 ms with simple zero-crossing alignment. Pitch analysis updates roughly every 180 ms and reports note, cents from equal temperament (A4 = 440 Hz), frequency and periodicity confidence. Confidence is a heuristic, not a probability of musical correctness. Quiet/aperiodic frames are rejected. The useful pitch range is approximately 35–1800 Hz at 48 kHz and varies with sample rate.

**Master Tune** offsets the oscillator root ±100 cents. The experimental pitch lock targets the selected root plus Master Tune, rather than the nearest detected note. When confidence exceeds 92% and the detected output is within 350 cents of the target, it slowly adjusts a common internal tuning offset up to ±200 cents. It pauses outside that range; disable it to clear correction. It cannot force arbitrary inharmonic spectra onto a pitch, and partial key tracking or Hz offsets can make its behaviour unintuitive.

## DSP and limitations

- The AudioWorklet owns the sample loop; there is no audio processing on the UI thread. The engine runs at 4× device sample rate and decimates through a normalised 63-tap Blackman-windowed low-pass FIR. Saw/pulse use polyBLEP edge correction. Frequencies are clamped to 0–0.42× device sample rate, so excessive negative FM stalls a phase instead of implementing through-zero FM.
- Aliasing is mitigated, **not eliminated**. Sign switching, XOR, hard sync, waveform skew, FM and nonlinear feedback produce discontinuities/broad spectra. Sync resets do not have BLEP correction, and the final soft ceiling operates at device rate. Extreme settings will alias. High-frequency content near Nyquist is deliberately attenuated.
- The signal path is `sources → interaction + imperfections → FIR → DC blocker → ADSR × output gain → 0.8 × tanh`. The final sample magnitude is below 0.8 (about −1.94 dBFS). This prevents digital clipping but does not guarantee comfortable listening volume. The soft ceiling adds some harmonics, so the final output is not a perfectly linear rendering even in ideal multiplication mode. Zero output gain reaches silence.
- Envelope and tuning values are not universally smoothed; mode, phase, sync, preset and A/B changes can click. Strike lasts 180 ms before release and resets phases/sweeps, with attack starting from the current envelope level. Decay-only presets have zero sustain, so Hold/Drone do not override their natural decay. Stop uses the current release, up to eight seconds.
- Spectrum and pitch detection are diagnostic aids, not precision metrology. The tuner may select an octave/subharmonic or decline to report a noisy/colliding sound. Pitch lock can hunt or hit its bound. There is no loudness normalisation, output recording, persistence across reloads, or automatic pitch calibration.
- This is one mono experimental voice. No final Zero Width UI, shared DSP package, sequencer, LFO system, register/multivoice logic or effects rack is included. The files are deliberately self-contained.

## Validation

The Node suite exercises interaction algebra, malformed/extreme configurations, all six presets for nonzero finite bounded output and complete release, 220/660 Hz multiplication sidebands with suppressed 440 Hz carrier, tuner accuracy/silence/noise rejection, extreme modulation at 44.1/48/96 kHz, and worklet messaging/render blocks without main-thread cloning APIs.

Real headless Chromium playback was also checked through the live AudioWorklet: all six configurations produce nonzero output; Pure is detected near 220 Hz / A3; A/B recalls the mode and preserves Hold; JSON export/import roundtrips; Stop reaches silence; the interface fits a 390-pixel viewport without horizontal overflow; and experimental pitch lock reduces a known +20-cent detuning to about +1 cent in 6.5 seconds. These checks establish browser signal generation, not a subjective listening evaluation or validation on physical audio hardware/Safari/mobile devices.
