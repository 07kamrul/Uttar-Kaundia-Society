import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Bottom sheet for "আমার দাগ কোথায় পাব?". It shows a schematic porcha (no real
 * data) with the three places the member should look.
 */
@Component({
  selector: 'app-dag-help-sheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './dag-help-sheet.component.html',
})
export class DagHelpSheetComponent {
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();
}
