import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

const COPIED_RESET_MS = 2000;

@Component({
  selector: 'app-confirmation',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './confirmation.component.html',
})
export class ConfirmationComponent {
  @Input({ required: true }) submissionId!: string;
  /** reg_simplified_ui: full-screen success instead of the modal. */
  @Input() simplified = false;
  @Output() acknowledge = new EventEmitter<void>();

  readonly copied = signal(false);
  private readonly cdr = inject(ChangeDetectorRef);

  async copyReference(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.submissionId);
    } catch {
      return; // Clipboard blocked: the number stays visible and selectable.
    }
    this.copied.set(true);
    this.cdr.markForCheck();
    setTimeout(() => {
      this.copied.set(false);
      this.cdr.markForCheck();
    }, COPIED_RESET_MS);
  }
}
