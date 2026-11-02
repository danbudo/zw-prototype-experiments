// Sample-clock listening aid, not a general sequencer. Each note starts from the same DSP state.
export const SEQUENCE = [0, 12, -12, 7];
export class Audition {
  constructor(rate) {
    this.sampleRate = rate;
    this.frame = 0;
    this.next = 0;
    this.off = Infinity;
    this.index = 0;
    this.enabled = false;
    this.singleOff = Infinity;
  }
  start() {
    this.singleOff = Infinity;
    this.enabled = true;
    this.next = this.frame;
    this.off = Infinity;
    this.index = 0;
  }
  strike(engine, sustain = false) {
    this.enabled = false;
    this.singleOff = sustain
      ? Infinity
      : this.frame + Math.round(this.sampleRate * 0.18);
    engine.noteOffset = 0;
    engine.reset();
    engine.trigger();
  }
  stop(engine) {
    this.singleOff = Infinity;
    this.enabled = false;
    engine.noteOffset = 0;
    engine.release();
  }
  tick(engine) {
    if (this.frame >= this.singleOff) {
      engine.release();
      this.singleOff = Infinity;
    }
    if (this.enabled) {
      if (this.frame >= this.next) {
        engine.reset();
        engine.noteOffset = engine.p.auditionSequence
          ? SEQUENCE[this.index++ % SEQUENCE.length]
          : 0;
        engine.trigger();
        const duration = Math.max(
          1,
          Math.round(this.sampleRate / engine.p.auditionRate),
        );
        this.off = this.frame + Math.round(duration * 0.55);
        this.next = this.frame + duration;
      } else if (this.frame >= this.off) {
        engine.release();
        this.off = Infinity;
      }
    }
    this.frame++;
  }
}
