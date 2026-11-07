import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { IconComponent } from '../../../../../shared/icon/icon.component';

/**
 * "Report a problem" dialog for a boundary on the plot map. Presentational:
 * the parent owns the note/sending/sent/error state and performs the request.
 */
@Component({
  selector: 'app-report-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  host: { '(document:keydown.escape)': 'cancelled.emit()' },
  templateUrl: './report-dialog.component.html',
  styleUrl: './report-dialog.component.scss',
})
export class ReportDialogComponent {
  readonly note = input('');
  readonly sending = input(false);
  readonly sent = input(false);
  readonly errorKey = input<string | null>(null);

  readonly noteChange = output<string>();
  readonly send = output<void>();
  readonly cancelled = output<void>();

  protected readonly canSend = computed(() => this.note().trim().length > 0 && !this.sending());

  protected onNoteInput(event: Event): void {
    this.noteChange.emit((event.target as HTMLTextAreaElement).value);
  }
}
