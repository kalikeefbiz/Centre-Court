import { ANIMATIONS, type AthleteState } from '../render/animation-registry';
export class InspectionTimeline {
  state: AthleteState = 'Idle';
  time = 0;
  speed = 1;
  playing = true;
  loop = true;
  select(state: AthleteState) {
    if (!Object.hasOwn(ANIMATIONS, state)) return;
    this.state = state;
    this.time = 0;
    this.playing = true;
    this.loop = ANIMATIONS[state].loop;
  }
  seek(time: number) {
    this.time = Math.max(0, Math.min(ANIMATIONS[this.state].duration, time));
  }
  restart() {
    this.time = 0;
    this.playing = true;
  }
  advance(dt: number) {
    if (!this.playing) return;
    const duration = ANIMATIONS[this.state].duration;
    this.time += dt * this.speed;
    if (this.time >= duration) {
      if (this.loop) this.time %= duration;
      else {
        this.time = duration;
        this.playing = false;
      }
    }
  }
}
