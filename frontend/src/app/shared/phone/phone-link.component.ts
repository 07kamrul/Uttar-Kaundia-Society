import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { IconComponent } from '../icon/icon.component';
import { copyText } from './copy-text';
import { describePhone, formatPhone } from './phone-format';

type CopyState = 'idle' | 'copied' | 'failed';

const COPY_FEEDBACK_MS = 1600;

/**
 * A member phone number as the people reading it need it: international
 * format (Bangla digits in Bangla mode), tap-to-call, a WhatsApp link and a
 * copy button that copies the E.164 number. Accepts E.164 or legacy "01…"
 * values (read as Bangladeshi). Anything that is not a phone number is shown
 * as plain text with no links.
 */
@Component({
  selector: 'app-phone-link',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    @if (info(); as phone) {
      <span class="phone-link">
        @if (phone.telHref; as telHref) {
          <a
            class="phone-link-number"
            [href]="telHref"
            [attr.aria-label]="('phoneLink.call' | translate) + ' ' + text()"
            >{{ text() }}</a
          >
        } @else {
          <span class="phone-link-number">{{ text() }}</span>
        }
        @if (phone.whatsAppHref; as whatsAppHref) {
          <a
            class="phone-link-action phone-link-whatsapp no-print"
            [href]="whatsAppHref"
            target="_blank"
            rel="noopener noreferrer"
          >
            <app-icon name="whatsapp" [size]="16" />
            <span>{{ 'phoneLink.whatsapp' | translate }}</span>
          </a>
        }
        <button
          type="button"
          class="phone-link-action phone-link-copy no-print"
          [class.is-copied]="copyState() === 'copied'"
          (click)="copy(phone.e164)"
        >
          <app-icon [name]="copyState() === 'copied' ? 'check-circle' : 'copy'" [size]="16" />
          <span aria-live="polite">{{ copyLabelKey() | translate }}</span>
        </button>
      </span>
    } @else if (text()) {
      <span class="phone-link-raw">{{ text() }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-block;
    }

    .phone-link {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem 0.75rem;
    }

    .phone-link-number {
      color: var(--emerald-700);
      font-weight: 600;
      text-decoration: none;
      white-space: nowrap;

      &:hover {
        text-decoration: underline;
      }
    }

    .phone-link-action {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      min-height: 2.75rem;
      padding: 0 0.6rem;
      border: 1px solid var(--gray-300);
      border-radius: 0.375rem;
      background: transparent;
      color: var(--gray-800);
      font: inherit;
      font-size: 0.85rem;
      text-decoration: none;
      cursor: pointer;

      &:hover {
        border-color: var(--gray-400);
        background: var(--surface-2);
      }

      &.is-copied {
        border-color: var(--emerald-600);
        color: var(--emerald-700);
      }
    }
  `,
})
export class PhoneLinkComponent {
  /** E.164 ("+8801712345678") or a legacy national value ("01712345678"). */
  readonly value = input<string | null | undefined>();

  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  readonly copyState = signal<CopyState>('idle');

  protected readonly info = computed(() => describePhone(this.value()));
  protected readonly text = computed(() =>
    formatPhone(this.value(), this.translate.currentLang() === 'en' ? 'en' : 'bn'),
  );
  protected readonly copyLabelKey = computed(() => {
    const state = this.copyState();
    return state === 'copied'
      ? 'phoneLink.copied'
      : state === 'failed'
        ? 'phoneLink.copyFailed'
        : 'phoneLink.copy';
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.clearTimer());
  }

  protected async copy(e164: string): Promise<void> {
    try {
      await copyText(e164);
      this.copyState.set('copied');
    } catch {
      this.copyState.set('failed');
    }
    this.clearTimer();
    this.resetTimer = setTimeout(() => this.copyState.set('idle'), COPY_FEEDBACK_MS);
  }

  private clearTimer(): void {
    if (this.resetTimer) clearTimeout(this.resetTimer);
    this.resetTimer = null;
  }
}
