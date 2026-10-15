import { Component, ElementRef, EventEmitter, Input, Output, ChangeDetectionStrategy, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './confirm-modal.component.html',
  styleUrl: './confirm-modal.component.scss',
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class ConfirmModalComponent {
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

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor(private translate: TranslateService) {}

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

  onEscape(): void {
    if (this.open && !this.loading) this.cancel.emit();
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
