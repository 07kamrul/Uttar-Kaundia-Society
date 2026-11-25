import { DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { IconComponent } from '../../../../../shared/icon/icon.component';
import type { PlotMapMode } from '../plot-map.constants';

/**
 * "আরও লেয়ার" sheet (map_wizard): one place for the map view (segmented
 * আমার জমি / সরকারি মৌজা ম্যাপ) and the RS lines / snapping / satellite
 * switches. Bottom sheet on phones, popover on tablet and desktop. Focus is
 * trapped while open and returns to the "আরও লেয়ার" button on close.
 */
@Component({
  selector: 'app-layers-sheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div class="sheet-backdrop" (click)="closed.emit()"></div>
    <section
      #sheetEl
      class="layers-sheet"
      role="dialog"
      data-testid="layers-sheet"
      [attr.aria-label]="'member.plotMap.wizard.layers.title' | translate"
      (keydown.tab)="trapFocus($event)"
    >
      <header class="sheet-head">
        <h2 class="sheet-title">{{ 'member.plotMap.wizard.layers.title' | translate }}</h2>
        <button
          type="button"
          class="sheet-close"
          data-testid="layers-close"
          (click)="closed.emit()"
          [attr.aria-label]="'common.close' | translate"
        >
          <app-icon name="close" [size]="16" />
        </button>
      </header>

      <h3 class="group-title">{{ 'member.plotMap.wizard.layers.typeTitle' | translate }}</h3>
      <div class="segmented" role="radiogroup" [attr.aria-label]="'member.plotMap.wizard.layers.typeTitle' | translate">
        <button
          type="button"
          role="radio"
          class="segment"
          data-testid="layer-mode-mine"
          [attr.aria-checked]="mode() === 'boundaries'"
          (click)="modeChange.emit('boundaries')"
        >
          {{ 'member.plotMap.wizard.layers.mine' | translate }}
        </button>
        <button
          type="button"
          role="radio"
          class="segment"
          data-testid="layer-mode-bds"
          [attr.aria-checked]="mode() === 'bds'"
          (click)="modeChange.emit('bds')"
        >
          {{ 'member.plotMap.wizard.layers.bds' | translate }}
        </button>
      </div>

      <h3 class="group-title">{{ 'member.plotMap.wizard.layers.extraTitle' | translate }}</h3>
      <div class="rows" role="group" [attr.aria-label]="'member.plotMap.wizard.layers.extraTitle' | translate">
        <button
          type="button"
          role="switch"
          class="row"
          data-testid="layer-rs"
          [attr.aria-checked]="rs()"
          (click)="rsToggle.emit()"
        >
          <span class="row-text">{{ 'member.plotMap.wizard.layers.rs' | translate }}</span>
          <span class="switch" aria-hidden="true"><span class="knob"></span></span>
        </button>
        <button
          type="button"
          role="switch"
          class="row"
          data-testid="layer-snap"
          [attr.aria-checked]="snap()"
          [disabled]="!rs()"
          (click)="snapToggle.emit()"
        >
          <span class="row-text">
            {{ 'member.plotMap.wizard.layers.snap' | translate }}
            @if (!rs()) {
              <span class="row-hint">{{ 'member.plotMap.wizard.layers.snapHint' | translate }}</span>
            }
          </span>
          <span class="switch" aria-hidden="true"><span class="knob"></span></span>
        </button>
        @if (showSatellite()) {
          <button
            type="button"
            role="switch"
            class="row"
            data-testid="layer-satellite"
            [attr.aria-checked]="satellite()"
            (click)="satelliteToggle.emit()"
          >
            <span class="row-text">{{ 'member.plotMap.wizard.layers.satellite' | translate }}</span>
            <span class="switch" aria-hidden="true"><span class="knob"></span></span>
          </button>
        }
      </div>
    </section>
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      z-index: 1100;
      display: block;
      pointer-events: none;
    }

    .sheet-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.35);
      pointer-events: auto;
    }

    /* Phones: bottom sheet. Tablet/desktop: popover docked under the top bar
       on the right, so the map stays visible. */
    .layers-sheet {
      position: absolute;
      left: 0.5rem;
      right: 0.5rem;
      bottom: 0.5rem;
      max-height: min(70%, 26rem);
      overflow-y: auto;
      overscroll-behavior: contain;
      background: var(--surface);
      color: var(--gray-800);
      border: 1px solid var(--gray-200);
      border-radius: var(--radius-lg);
      padding: 0.75rem;
      padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
      box-shadow: var(--shadow-lg);
      pointer-events: auto;
      animation: sheet-up 0.2s ease;
    }

    @keyframes sheet-up {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }

    @media (min-width: 768px) {
      .layers-sheet {
        left: auto;
        right: 0.75rem;
        bottom: auto;
        top: 4.6rem;
        width: 22rem;
        max-height: calc(100% - 5.5rem);
        animation: sheet-down 0.18s ease;
      }
    }

    @keyframes sheet-down {
      from {
        opacity: 0;
        transform: translateY(-6px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .layers-sheet {
        animation: none;
      }
    }

    .sheet-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .sheet-title {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
    }

    .sheet-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 44px;
      min-height: 44px;
      border: none;
      background: var(--surface-2);
      color: var(--gray-700);
      border-radius: 50%;
      cursor: pointer;
    }

    .sheet-close:hover {
      background: var(--gray-200);
    }

    .group-title {
      margin: 0.5rem 0 0.4rem;
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--gray-500);
    }

    .segmented {
      display: flex;
      padding: 0.2rem;
      gap: 0.2rem;
      background: var(--surface-2);
      border-radius: var(--radius-md);
    }

    .segment {
      flex: 1;
      min-height: 44px;
      padding: 0.4rem 0.6rem;
      font: inherit;
      font-size: 0.88rem;
      font-weight: 500;
      text-align: center;
      color: var(--gray-700);
      background: transparent;
      border: none;
      border-radius: calc(var(--radius-md) - 0.15rem);
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
    }

    .segment[aria-checked='true'] {
      background: var(--surface);
      color: var(--emerald-700);
      font-weight: 600;
      box-shadow: var(--shadow-sm);
    }

    .rows {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      width: 100%;
      min-height: 48px;
      padding: 0.5rem 0.75rem;
      font: inherit;
      font-size: 0.9rem;
      text-align: left;
      color: inherit;
      background: var(--surface-2);
      border: 1px solid var(--gray-200);
      border-radius: var(--radius-md);
      cursor: pointer;
    }

    .row[aria-checked='true'] {
      border-color: var(--emerald-600);
      background: color-mix(in srgb, var(--emerald-700) 6%, var(--surface));
    }

    .row:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .row-text {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }

    .row-hint {
      font-size: 0.72rem;
      color: var(--gray-500);
    }

    /* CSS switch (state also lives on aria-checked, so it stays testable). */
    .switch {
      flex-shrink: 0;
      width: 2.4rem;
      height: 1.35rem;
      border-radius: 999px;
      background: var(--gray-300);
      position: relative;
      transition: background 0.15s ease;
    }

    .row[aria-checked='true'] .switch {
      background: var(--emerald-700);
    }

    .knob {
      position: absolute;
      top: 0.15rem;
      inset-inline-start: 0.15rem;
      width: 1.05rem;
      height: 1.05rem;
      border-radius: 50%;
      background: #fff;
      box-shadow: var(--shadow-sm);
      transition: inset-inline-start 0.15s ease;
    }

    .row[aria-checked='true'] .knob {
      inset-inline-start: calc(2.4rem - 1.05rem - 0.15rem);
    }
  `,
})
export class LayersSheetComponent implements AfterViewInit, OnDestroy {
  readonly mode = input.required<PlotMapMode>();
  readonly rs = input(false);
  readonly snap = input(false);
  readonly satellite = input(false);
  readonly showSatellite = input(true);

  readonly modeChange = output<PlotMapMode>();
  readonly rsToggle = output<void>();
  readonly snapToggle = output<void>();
  readonly satelliteToggle = output<void>();
  readonly closed = output<void>();

  private readonly sheet = viewChild.required<ElementRef<HTMLElement>>('sheetEl');
  private readonly document = inject<Document>(DOCUMENT);

  ngAfterViewInit(): void {
    const first = this.sheet().nativeElement.querySelector<HTMLElement>('button');
    first?.focus({ preventScroll: true });
  }

  ngOnDestroy(): void {
    // The sheet goes away with this component, so focus returns to the opener.
    this.document
      .querySelector<HTMLElement>('[data-testid="layers-open"]')
      ?.focus({ preventScroll: true });
  }

  /** Keeps Tab inside the dialog while it is open. */
  trapFocus(event: Event): void {
    const keyEvent = event as KeyboardEvent;
    const focusable = [
      ...this.sheet().nativeElement.querySelectorAll<HTMLElement>('button:not([disabled])'),
    ];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.document.activeElement;
    if (keyEvent.shiftKey && active === first) {
      keyEvent.preventDefault();
      last.focus();
    } else if (!keyEvent.shiftKey && active === last) {
      keyEvent.preventDefault();
      first.focus();
    }
  }
}
