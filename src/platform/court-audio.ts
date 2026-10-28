import type { Match, MatchEvent } from '../core/match';
import { CHARACTER_IDS, type CharacterId } from '../core/roster';
export type VoiceCategory = 'effort' | 'heavy' | 'challenge' | 'win' | 'loss' | 'signature';
/** Populate only with approved, licensed performances. Empty lists intentionally stay silent. */
export const VOICES: Record<CharacterId, Record<VoiceCategory, string[]>> = Object.fromEntries(
  CHARACTER_IDS.map((id) => [
    id,
    { effort: [], heavy: [], challenge: [], win: [], loss: [], signature: [] },
  ]),
) as unknown as Record<CharacterId, Record<VoiceCategory, string[]>>;
const CATEGORIES = ['soft', 'hard', 'serve', 'bounce', 'foot', 'squeak'] as const;
type Category = (typeof CATEGORIES)[number];
export class CourtAudio {
  volume = 0.65;
  muted = false;
  private context?: AudioContext;
  private master?: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private loading = false;
  private lastEvent = 0;
  private distance = [0, 0];
  private stepClock = [0, 0];
  private voiceClock = [0, 0];
  private active = new Set<AudioBufferSourceNode>();
  private tones = new Set<OscillatorNode>();
  played: Record<string, number> = {};
  unlock() {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -12;
        limiter.ratio.value = 8;
        this.master.connect(limiter).connect(this.context.destination);
      }
      void this.context.resume().catch(() => {});
      if (!this.loading) {
        this.loading = true;
        for (const category of CATEGORIES)
          for (let i = 0; i < (category === 'squeak' ? 1 : 3); i++)
            void this.decode(`${category}-${i}.wav`);
      }
    } catch {
      /* Match remains available if the browser denies audio. */
    }
  }
  private async decode(file: string) {
    try {
      const r = await fetch(
        new URL(import.meta.env.BASE_URL + 'assets/audio/' + file, document.baseURI),
      );
      if (!r.ok) return;
      const b = await this.context!.decodeAudioData(await r.arrayBuffer());
      this.buffers.set(file, b);
    } catch {
      /* Missing licensed clip: silent fallback. */
    }
  }
  private sample(file: string, volume: number, rate = 1) {
    const c = this.context,
      b = this.buffers.get(file);
    if (!c || !b || c.state !== 'running' || this.muted || this.active.size >= 12) return;
    const s = c.createBufferSource(),
      g = c.createGain();
    s.buffer = b;
    s.playbackRate.value = rate;
    g.gain.value = volume;
    s.connect(g).connect(this.master!);
    s.start();
    this.active.add(s);
    s.onended = () => {
      s.disconnect();
      g.disconnect();
      this.active.delete(s);
    };
    this.played[file] = (this.played[file] ?? 0) + 1;
  }
  private play(category: Category, volume: number) {
    this.sample(
      `${category}-${category === 'squeak' ? 0 : Math.floor(Math.random() * 3)}.wav`,
      volume,
      0.95 + Math.random() * 0.1,
    );
  }
  private tone(frequency: number, duration: number, volume: number) {
    const c = this.context;
    if (!c || c.state !== 'running' || this.muted) return;
    const o = c.createOscillator(),
      g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(frequency, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(frequency * 0.6, c.currentTime + duration);
    g.gain.setValueAtTime(volume, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    o.connect(g).connect(this.master!);
    this.tones.add(o);
    o.start();
    o.stop(c.currentTime + duration);
    o.onended = () => {
      this.tones.delete(o);
      o.disconnect();
      g.disconnect();
    };
  }
  private voice(match: Match, event: MatchEvent, category: VoiceCategory, probability = 1) {
    const side = event.side;
    if (this.voiceClock[side] > 0 || Math.random() > probability) return;
    const files = VOICES[match.characters[side]][category];
    if (!files.length) return;
    this.voiceClock[side] = 4 + Math.random() * 3;
    const file = files[Math.floor(Math.random() * files.length)];
    if (this.buffers.has(file)) this.sample(file, 0.45);
    else void this.decode(file);
  }
  update(match: Match, dt: number) {
    const enabled =
      ['serve', 'rally', 'pointOver', 'result'].includes(match.phase) && !document.hidden;
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(
        enabled && !this.muted ? this.volume : 0,
        this.context.currentTime,
        0.025,
      );
    for (const event of match.events) {
      if (event.id <= this.lastEvent) continue;
      this.lastEvent = event.id;
      if (!enabled) continue;
      if (event.type === 'impact') {
        this.play(
          event.stroke === 'Serve' ? 'serve' : event.strength > 0.65 ? 'hard' : 'soft',
          0.48 + match.heat * 0.04,
        );
        this.voice(
          match,
          event,
          event.strength > 0.8
            ? 'heavy'
            : match.players[event.side].locomotion.speed > 3
              ? 'challenge'
              : 'effort',
          0.22,
        );
      } else if (event.type === 'bounce') this.play('bounce', 0.24 + event.strength * 0.15);
      else if (event.type === 'net') {
        this.play('soft', 0.13);
        this.tone(130, 0.07, 0.04);
      } else if (event.type === 'signature') {
        this.tone(540, 0.35, 0.12);
        this.voice(match, event, 'signature');
      } else if (event.type === 'heat') this.tone(260 + event.strength * 80, 0.25, 0.07);
      else if (event.type === 'point') {
        this.tone(event.side === 0 ? 660 : 220, 0.22, 0.1);
        this.voice(match, event, 'win', 0.6);
        this.voice(match, { ...event, side: event.side === 0 ? 1 : 0 }, 'loss', 0.5);
      }
    }
    for (const side of [0, 1] as const) {
      this.voiceClock[side] = Math.max(0, this.voiceClock[side] - dt);
      this.stepClock[side] = Math.max(0, this.stepClock[side] - dt);
      const athlete = match.players[side],
        travelled = athlete.distance - this.distance[side];
      this.distance[side] = athlete.distance;
      // Distance and braking from the fixed-step movement, never idle animation or a swing timer.
      if (
        enabled &&
        match.phase === 'rally' &&
        travelled > 0 &&
        athlete.locomotion.speed > 0.7 &&
        this.stepClock[side] === 0
      ) {
        this.stepClock[side] = athlete.locomotion.speed > 3 ? 0.28 : 0.42;
        this.play(
          athlete.locomotion.braking || athlete.locomotion.reversing ? 'squeak' : 'foot',
          side === 0 ? 0.18 : 0.1,
        );
      }
    }
  }
  stop() {
    if (this.master && this.context) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setValueAtTime(0, this.context.currentTime);
    }
    for (const source of this.active) {
      try {
        source.stop();
      } catch {
        /* ended */
      }
    }
    this.active.clear();
    for (const tone of this.tones) {
      try {
        tone.stop();
      } catch {
        /* ended */
      }
    }
    this.tones.clear();
  }
  resetSession() {
    this.stop();
    this.lastEvent = 0;
    this.distance = [0, 0];
    this.stepClock = [0, 0];
    this.voiceClock = [0, 0];
  }
  snapshot() {
    return {
      state: this.context?.state ?? 'locked',
      volume: this.volume,
      muted: this.muted,
      decoded: this.buffers.size,
      active: this.active.size + this.tones.size,
      played: { ...this.played },
      voiceStatus: 'Awaiting licensed character performances',
    };
  }
}
