import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import {
  CORRECTION_FIELDS,
  type CorrectionField,
} from '../../core/models/application-review.model';

/**
 * Checklist of form sections a reviewer wants the applicant to correct.
 * Emits a new array on every toggle (never mutates the input).
 */
@Component({
  selector: 'app-correction-fields-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <fieldset class="cf-picker">
      <legend class="cf-legend">{{ 'application.picker.legend' | translate }}</legend>
      <p class="cf-hint">{{ 'application.picker.hint' | translate }}</p>
      <div class="cf-grid">
        @for (field of fields; track field.key) {
          <label class="cf-chip" [class.cf-chip--on]="isOn(field.key)">
            <input
              type="checkbox"
              [checked]="isOn(field.key)"
              (change)="toggle(field.key)"
              [attr.data-testid]="'cf-' + field.key"
            />
            <span>{{ field.labelKey | translate }}</span>
          </label>
        }
      </div>
    </fieldset>
  `,
  styles: [
    `
      .cf-picker {
        border: 0;
        margin: 0.75rem 0 0;
        padding: 0;
        min-width: 0;
      }
      .cf-legend {
        font-weight: 600;
        color: var(--gray-800);
        padding: 0;
      }
      .cf-hint {
        margin: 0.25rem 0 0.5rem;
        font-size: 0.85rem;
        color: var(--gray-600);
      }
      .cf-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 0.5rem;
      }
      .cf-chip {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-height: 44px;
        padding: 0.5rem 0.75rem;
        border: 1px solid var(--gray-300);
        border-radius: var(--radius-sm);
        background: var(--surface);
        color: var(--gray-800);
        cursor: pointer;
        font-size: 0.9rem;
      }
      .cf-chip input {
        width: 18px;
        height: 18px;
        flex: none;
        accent-color: var(--emerald-600);
      }
      .cf-chip--on {
        border-color: var(--red-600);
        background: var(--red-50);
      }
      @media (max-width: 420px) {
        .cf-grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class CorrectionFieldsPickerComponent {
  readonly value = input<readonly CorrectionField[]>([]);
  readonly valueChange = output<CorrectionField[]>();
  readonly fields = CORRECTION_FIELDS;

  isOn(key: CorrectionField): boolean {
    return this.value().includes(key);
  }

  toggle(key: CorrectionField): void {
    const current = this.value();
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    // Keep the canonical order so the e-mail and the applicant page agree.
    this.valueChange.emit(this.fields.map((f) => f.key).filter((k) => next.includes(k)));
  }
}
