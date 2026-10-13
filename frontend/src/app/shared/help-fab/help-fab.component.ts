import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { HelplineService } from '../../core/services/helpline.service';
import { describePhone } from '../phone/phone-format';

/**
 * Floating "সাহায্য দরকার?" button. It renders only while the society has set
 * a helpline number, and opens a small sheet: call, WhatsApp, help desk page.
 */
@Component({
  selector: 'app-help-fab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, RouterLink],
  template: `
    @if (helpline().enabled) {
      <button type="button" class="help-fab" data-testid="help-fab" [attr.aria-expanded]="open()" (click)="open.set(true)">
        <span aria-hidden="true">🆘</span> {{ 'help.fab' | translate }}
      </button>
      @if (open()) {
        <div class="help-backdrop" (click)="open.set(false)"></div>
        <div class="help-sheet" role="dialog" aria-modal="true" data-testid="help-sheet" [attr.aria-label]="'help.fab' | translate">
          <div class="help-sheet-head">
            <h2>{{ 'help.fab' | translate }}</h2>
            <button type="button" class="help-close" data-testid="help-close" [attr.aria-label]="'member.pay.close' | translate" (click)="open.set(false)">✕</button>
          </div>
          @if (helpline().hoursText; as hours) {
            <p class="help-hours">{{ hours }}</p>
          }
          @if (call()?.telHref; as telHref) {
            <a class="help-action" data-testid="help-call" [href]="telHref">📞 {{ 'help.call' | translate }}</a>
          }
          @if (whatsapp()?.whatsAppHref; as waHref) {
            <a class="help-action" data-testid="help-whatsapp" [href]="waHref" target="_blank" rel="noopener noreferrer">💬 {{ 'help.whatsapp' | translate }}</a>
          }
          <a class="help-action help-action-secondary" data-testid="help-desk" routerLink="/emergency-help" (click)="open.set(false)">
            ℹ️ {{ 'help.desk' | translate }}
          </a>
        </div>
      }
    }
  `,
  styles: `
    .help-fab {
      position: fixed; right: 1rem; bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px)); z-index: 40;
      min-height: 56px; padding: 0 1.25rem; border: 0; border-radius: 999px; cursor: pointer;
      background: var(--emerald-700, #047857); color: #fff; font: inherit; font-weight: 700; font-size: 1.05rem;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    }
    @media (min-width: 960px) { .help-fab { bottom: 1.5rem; } }
    .help-backdrop { position: fixed; inset: 0; z-index: 50; background: rgba(0, 0, 0, 0.4); }
    .help-sheet {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 51; display: flex; flex-direction: column; gap: 0.75rem;
      padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px)); background: var(--surface, #fff);
      border-radius: 1rem 1rem 0 0; max-width: 32rem; margin: 0 auto;
    }
    .help-sheet-head { display: flex; align-items: center; justify-content: space-between; }
    .help-sheet-head h2 { margin: 0; font-size: 1.2rem; }
    .help-close { min-width: 48px; min-height: 48px; border: 0; background: transparent; font-size: 1.2rem; cursor: pointer; color: inherit; }
    .help-hours { margin: 0; color: var(--gray-600, #4b5563); }
    .help-action {
      display: flex; align-items: center; justify-content: center; gap: 0.5rem; min-height: 56px; border-radius: 0.75rem;
      background: var(--emerald-700, #047857); color: #fff; font-weight: 700; font-size: 1.1rem; text-decoration: none;
    }
    .help-action-secondary { background: transparent; color: inherit; border: 2px solid var(--gray-300, #d1d5db); }
  `,
})
export class HelpFabComponent {
  private readonly service = inject(HelplineService);
  readonly helpline = this.service.helpline;
  readonly open = signal(false);
  readonly call = computed(() => describePhone(this.helpline().phone));
  readonly whatsapp = computed(() => describePhone(this.helpline().whatsapp));

  constructor() {
    this.service.ensureLoaded();
  }
}
