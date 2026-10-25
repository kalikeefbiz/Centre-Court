import type { Match } from '../core/match';
/** Locally synthesized, quiet crowd bed; no recordings, requests, or autoplay dependency. */
export class StadiumAudio {
  enabled = true;
  private context?: AudioContext;
  private bed?: GainNode;
  private buffer?: AudioBuffer;
  private points = 0;
  private contacts = 0;
  private active = false;
  reactions = 0;
  unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context) {
        const c = new AudioContext();
        this.context = c;
        this.buffer = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
        const data = this.buffer.getChannelData(0);
        let previous = 0;
        for (let i = 0; i < data.length; i++) {
          previous = (previous + (Math.random() * 2 - 1) * 0.12) / 1.12;
          data[i] = previous;
        }
        const source = c.createBufferSource();
        source.buffer = this.buffer;
        source.loop = true;
        const filter = c.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 850;
        this.bed = c.createGain();
        this.bed.gain.value = 0;
        source.connect(filter).connect(this.bed).connect(c.destination);
        source.start();
      }
      void this.context.resume().catch(() => {});
    } catch {
      /* Audio unavailable; the match does not depend on it. */
    }
  }
  update(match: Match) {
    const active =
      this.enabled &&
      ['serve', 'rally', 'pointOver', 'result'].includes(match.phase) &&
      !document.hidden;
    if (active !== this.active && this.context && this.bed) {
      this.bed.gain.setTargetAtTime(active ? 0.035 : 0, this.context.currentTime, 0.12);
      this.active = active;
    }
    if (
      match.totalPoints > this.points &&
      active &&
      this.context?.state === 'running' &&
      this.buffer
    ) {
      const c = this.context,
        t = c.currentTime,
        source = c.createBufferSource(),
        gain = c.createGain();
      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1400;
      filter.Q.value = 0.5;
      source.buffer = this.buffer;
      const duration = this.contacts >= 8 || match.phase === 'result' ? 1.6 : 0.9;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      source.connect(filter).connect(gain).connect(c.destination);
      source.start(t);
      source.stop(t + duration);
      source.onended = () => {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
      this.reactions++;
    }
    this.points = match.totalPoints;
    this.contacts = match.contacts;
  }
  snapshot() {
    return {
      enabled: this.enabled,
      state: this.context?.state ?? 'locked',
      reactions: this.reactions,
    };
  }
}
