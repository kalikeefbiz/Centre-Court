import type { CharacterId } from '../core/roster';
import { ROSTER } from '../core/roster';
import { EquipmentSelection, RACKETS, getRacket, isRacketId } from '../render/racket-equipment';
import './equipment.css';

export interface EquipmentUIHooks {
  character: () => CharacterId;
  /** Preview/equip the actual current athlete; do not load another character. */
  preview: (racket: string) => void | Promise<void>;
  equip: (racket: string) => void | Promise<void>;
  open?: () => void;
  close?: () => void;
  view?: (view: 'athlete' | 'grip') => void;
}

/** A cosmetic equipment dialog over the real scene preview. The coordinator
 * owns camera framing and actual renderer loading; this controller owns only
 * selection, feedback and accessible keyboard/focus behavior.
 */
export class EquipmentUI {
  readonly element: HTMLElement;
  private title: HTMLElement;
  private list: HTMLElement;
  private note: HTMLElement;
  private equipButton: HTMLButtonElement;
  private backButton: HTMLButtonElement;
  private chosen: string;
  private athlete: CharacterId;
  private pending = false;
  private operation = 0;
  private selectedView: 'athlete' | 'grip' = 'grip';
  private previousFocus: HTMLElement | null = null;
  constructor(
    parent: HTMLElement,
    private selection: EquipmentSelection,
    private hooks: EquipmentUIHooks,
  ) {
    this.athlete = hooks.character();
    this.chosen = selection.selected(this.athlete);
    this.element = document.createElement('section');
    this.element.id = 'racket-equipment';
    this.element.className = 'equipment-panel';
    this.element.hidden = true;
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-labelledby', 'equipment-title');
    this.element.innerHTML = `
      <div class="equipment-sheet">
        <p class="equipment-eyebrow">ATHLETE EQUIPMENT</p>
        <h2 id="equipment-title">Racket selection</h2>
        <p class="equipment-intro">Inspect your athlete's grip in the live 3D preview. Rackets are cosmetic.</p>
        <div class="equipment-views" role="group" aria-label="Preview framing">
          <button id="equipment-view-athlete" class="secondary" type="button" aria-pressed="false">FULL ATHLETE</button>
          <button id="equipment-view-grip" class="secondary" type="button" aria-pressed="true">GRIP DETAIL</button>
        </div>
        <div id="equipment-options" class="equipment-options" role="group" aria-label="Available racket models"></div>
        <p class="equipment-availability">${RACKETS.length === 1 ? 'One original racket model is currently available.' : `${RACKETS.length} racket models available.`}</p>
        <p id="equipment-status" class="equipment-status" role="status" aria-live="polite"></p>
        <div class="equipment-actions">
          <button id="equipment-equip" class="primary" type="button">EQUIP RACKET</button>
          <button id="equipment-close" class="secondary" type="button">BACK TO ROSTER</button>
        </div>
      </div>`;
    parent.append(this.element);
    this.title = this.element.querySelector<HTMLElement>('#equipment-title')!;
    this.list = this.element.querySelector<HTMLElement>('#equipment-options')!;
    this.note = this.element.querySelector<HTMLElement>('#equipment-status')!;
    this.equipButton = this.element.querySelector<HTMLButtonElement>('#equipment-equip')!;
    this.backButton = this.element.querySelector<HTMLButtonElement>('#equipment-close')!;
    for (const racket of RACKETS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'equipment-card';
      button.dataset.racket = racket.id;
      const name = document.createElement('strong');
      name.textContent = racket.name;
      const detail = document.createElement('span');
      detail.textContent = racket.description;
      button.append(name, detail);
      button.onclick = () => void this.preview(racket.id);
      this.list.append(button);
    }
    this.equipButton.onclick = () => void this.equip();
    this.backButton.onclick = () => this.close();
    for (const view of ['athlete', 'grip'] as const)
      this.element.querySelector<HTMLButtonElement>('#equipment-view-' + view)!.onclick = () => {
        this.selectedView = view;
        this.hooks.view?.(view);
        this.refresh();
      };
    this.element.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.close();
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        this.element.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
      );
      const first = focusable[0],
        last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    this.refresh();
  }
  get isOpen() {
    return !this.element.hidden;
  }
  open() {
    if (this.isOpen) return;
    this.previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.athlete = this.hooks.character();
    this.chosen = this.selection.selected(this.athlete);
    this.selectedView = 'grip';
    this.element.hidden = false;
    this.hooks.open?.();
    this.hooks.view?.(this.selectedView);
    this.refresh();
    this.list.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus();
    void this.preview(this.chosen);
  }
  close() {
    if (!this.isOpen || this.pending) return;
    this.operation++;
    this.element.hidden = true;
    this.hooks.close?.();
    // An uncommitted preview must not replace the saved equipment on return.
    const equipped = this.selection.selected(this.athlete);
    if (this.chosen !== equipped) void this.hooks.preview(equipped);
    this.previousFocus?.focus();
  }
  refresh() {
    this.title.textContent = `${ROSTER[this.athlete].name} · Racket selection`;
    for (const button of Array.from(this.list.querySelectorAll<HTMLButtonElement>('button'))) {
      button.setAttribute('aria-pressed', String(button.dataset.racket === this.chosen));
      button.disabled = this.pending;
    }
    this.equipButton.disabled = this.pending;
    this.backButton.disabled = this.pending;
    this.element.setAttribute('aria-busy', String(this.pending));
    for (const view of ['athlete', 'grip'])
      this.element
        .querySelector('#equipment-view-' + view)!
        .setAttribute('aria-pressed', String(this.selectedView === view));
    if (!this.pending)
      this.note.textContent =
        `${getRacket(this.selection.selected(this.athlete)).name} equipped. ` +
        (this.selection.persistent
          ? 'Your choice is saved on this device.'
          : 'Storage is unavailable; your choice is kept for this visit.');
  }
  private async preview(id: string) {
    if (this.pending || !isRacketId(id)) return;
    const operation = ++this.operation;
    this.pending = true;
    this.chosen = id;
    this.refresh();
    this.note.textContent = `Showing ${getRacket(id).name} on ${ROSTER[this.athlete].name}…`;
    try {
      await this.hooks.preview(id);
      if (operation !== this.operation) return;
      this.pending = false;
      this.refresh();
    } catch {
      if (operation !== this.operation) return;
      this.pending = false;
      this.refresh();
      this.note.textContent =
        'Racket preview could not load. Your saved equipment is unchanged; try again.';
    }
  }
  private async equip() {
    if (this.pending) return;
    const operation = ++this.operation;
    this.pending = true;
    this.refresh();
    this.note.textContent = 'Equipping racket…';
    try {
      await this.hooks.equip(this.chosen);
      if (operation !== this.operation) return;
      this.selection.choose(this.athlete, this.chosen);
      this.pending = false;
      this.refresh();
    } catch {
      if (operation !== this.operation) return;
      this.pending = false;
      this.refresh();
      this.note.textContent =
        'Racket could not equip. Your saved equipment is unchanged; try again.';
    }
  }
  snapshot() {
    return {
      open: this.isOpen,
      character: this.athlete,
      selected: this.chosen,
      equipped: this.selection.selected(this.athlete),
      pending: this.pending,
      persistent: this.selection.persistent,
      models: RACKETS.length,
      view: this.selectedView,
    };
  }
}
