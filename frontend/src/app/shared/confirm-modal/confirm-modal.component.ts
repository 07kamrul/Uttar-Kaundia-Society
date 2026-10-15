import {
  Component, ElementRef, EventEmitter, Injector, Input, OnChanges, Output, SimpleChanges,
  ChangeDetectionStrategy, afterNextRender, inject,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

let nextConfirmModalId = 0;

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './confirm-modal.component.html',
  styleUrl: './confirm-modal.component.scss',
})
export class ConfirmModalComponent implements OnChanges {
  @Input() open = false;
  @Input() title = '';
  @Input() message = '';
  @Input() confirmLabel = '';
  @Input() cancelLabel = '';
  @Input() danger = false;
  @Input() confirmDisabled = false;
  /** True while the confirmed action is in flight: locks both buttons. */
  @Input() loading = false;
  @Input() showCancel = true;

  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  readonly titleId = `confirm-modal-title-${nextConfirmModalId++}`;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private previouslyFocused: HTMLElement | null = null;

  constructor(private translate: TranslateService) {}

  /** Moves focus into the dialog on open and hands it back to the trigger on close. */
  ngOnChanges(changes: SimpleChanges): void {
    const change = changes['open'];
    if (!change || change.firstChange && !change.currentValue) return;
    if (change.currentValue) {
      this.previouslyFocused = document.activeElement as HTMLElement | null;
      afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('.modal-card')?.focus(), {
        injector: this.injector,
      });
    } else {
      this.previouslyFocused?.focus?.();
      this.previouslyFocused = null;
    }
  }

  get resolvedConfirmLabel(): string {
    return this.confirmLabel || this.translate.instant('common.confirmModal.confirmButton');
  }

  get resolvedCancelLabel(): string {
    return this.cancelLabel || this.translate.instant('common.confirmModal.cancelButton');
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cancel.emit();
    }
  }

  /** Bound on the dialog itself so the keypress never reaches layers underneath. */
  onEscape(event: Event): void {
    event.stopPropagation();
    if (!this.loading) this.cancel.emit();
  }

  /** Keeps Tab focus inside the dialog while it is open. */
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === event.currentTarget)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
