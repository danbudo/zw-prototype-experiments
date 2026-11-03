// Shared reference math: octave transposes the played reference, not every Hz parameter.
export function referenceMidi(p, noteOffset = 0) {
  return p.note + 12 * (p.rootOctave || 0) + noteOffset;
}
export function referenceHz(p, noteOffset = 0, correction = 0) {
  return (
    440 *
    2 **
      ((referenceMidi(p, noteOffset) - 69) / 12 + (p.tune + correction) / 1200)
  );
}
export function nominalHz(p, oscillator, noteOffset = 0) {
  const o = p[oscillator];
  return (
    220 *
      (referenceHz(p, noteOffset) / 220) ** o.tracking *
      o.ratio *
      2 ** (o.detune / 1200) +
    o.offset
  );
}
