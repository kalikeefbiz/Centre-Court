export type AppState = 'BOOT' | 'MENU_LOADING' | 'MENU' | 'MATCH_LOADING' | 'MATCH' | 'RESULTS';
export interface Session {
  dispose(): void;
  suspend(): void;
}
export interface LifecycleHooks<S extends Session, C> {
  menu(signal: AbortSignal): Promise<void>;
  prepare(config: C, signal: AbortSignal): Promise<S>;
  changed(): void;
  interrupt(): void;
}
/** The only application transition authority. Async work must also check its
 * signal before publishing entities; a late session is always disposed here. */
export class Lifecycle<S extends Session, C> {
  private current: AppState = 'BOOT';
  private currentSession?: S;
  get state() {
    return this.current;
  }
  get session() {
    return this.currentSession;
  }
  error = '';
  suspended = false;
  contextLost = false;
  private transaction?: AbortController;
  private generation = 0;
  constructor(private hooks: LifecycleHooks<S, C>) {}
  private enter(state: AppState) {
    this.current = state;
    this.hooks.changed();
  }
  private invalidate() {
    this.generation++;
    this.transaction?.abort();
    const controller = new AbortController();
    this.transaction = controller;
    return { controller, generation: this.generation };
  }
  private release() {
    this.hooks.interrupt();
    this.session?.dispose();
    this.currentSession = undefined;
  }
  async menu() {
    if (this.state === 'MENU_LOADING') return false;
    const { controller, generation } = this.invalidate();
    this.release();
    this.error = '';
    this.enter('MENU_LOADING');
    try {
      await this.hooks.menu(controller.signal);
      if (generation !== this.generation) return false;
      this.enter('MENU');
      return true;
    } catch (e) {
      if (generation !== this.generation) return false;
      this.error = String(e);
      // MENU is recoverable even if its preview failed. Retry reacquires it.
      this.enter('MENU');
      return false;
    }
  }
  async start(config: C) {
    if (!['MENU', 'MATCH', 'RESULTS'].includes(this.state) || this.contextLost) return false;
    const { controller, generation } = this.invalidate();
    this.release();
    this.error = '';
    this.enter('MATCH_LOADING');
    try {
      const session = await this.hooks.prepare(config, controller.signal);
      if (generation !== this.generation) {
        session.dispose();
        return false;
      }
      this.currentSession = session;
      if (this.suspended) session.suspend();
      this.enter('MATCH');
      return true;
    } catch (e) {
      if (generation !== this.generation) return false;
      await this.menu();
      this.error = String(e);
      this.hooks.changed();
      return false;
    }
  }
  results() {
    if (this.state !== 'MATCH' || !this.session) return false;
    this.session.suspend();
    this.enter('RESULTS');
    return true;
  }
  suspend() {
    this.suspended = true;
    this.session?.suspend();
    this.hooks.interrupt();
    this.hooks.changed();
  }
  resume() {
    this.suspended = false;
    // Match stays paused until an explicit user Resume; held inputs never replay.
    this.hooks.interrupt();
    this.hooks.changed();
  }
  loseContext() {
    this.contextLost = true;
    this.suspend();
  }
  restoreContext() {
    this.contextLost = false;
    this.resume();
  }
}
export function checkCancelled(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Loading cancelled', 'AbortError');
}
