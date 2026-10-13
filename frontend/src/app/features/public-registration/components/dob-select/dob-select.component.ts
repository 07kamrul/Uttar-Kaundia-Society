import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { monthNameKey } from '../../../../shared/constants/months';

const OLDEST_AGE_YEARS = 110;
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** True only for a real calendar day, so 31 February is rejected. */
function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/**
 * Date of birth as three dropdowns (day / month / year) instead of a calendar
 * popup, which older members find hard. Same contract as the date picker:
 * `value` in, `valueChange` out with an ISO yyyy-mm-dd string or '' while the
 * date is incomplete or impossible.
 */
@Component({
  selector: 'app-dob-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './dob-select.component.html',
})
export class DobSelectComponent implements OnChanges {
  @Input() value = '';
  /** Latest allowed date (ISO); defaults to today. */
  @Input() max = new Date().toISOString().slice(0, 10);
  @Input() invalid = false;
  @Input() inputId = 'dob';
  @Output() valueChange = new EventEmitter<string>();

  readonly days = DAYS;
  readonly months = MONTHS;
  day = '';
  month = '';
  year = '';

  private readonly translate = inject(TranslateService);

  get years(): number[] {
    const latest = Number(this.max.slice(0, 4)) || new Date().getFullYear();
    return Array.from({ length: OLDEST_AGE_YEARS + 1 }, (_, i) => latest - i);
  }

  monthKey(month: number): string {
    return monthNameKey(month);
  }

  /** Digits as the member reads them (Bangla in Bangla). */
  label(n: number): string {
    const text = String(n);
    if (this.translate.currentLang() === 'en') return text;
    return text.replace(/[0-9]/g, (d) => BANGLA_DIGITS[Number(d)]);
  }

  ngOnChanges(): void {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(this.value ?? '');
    if (match) {
      this.year = String(Number(match[1]));
      this.month = String(Number(match[2]));
      this.day = String(Number(match[3]));
    }
  }

  private isComplete(): boolean {
    return !!this.day && !!this.month && !!this.year;
  }

  onChange(part: 'day' | 'month' | 'year', event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (part === 'day') this.day = value;
    else if (part === 'month') this.month = value;
    else this.year = value;
    this.valueChange.emit(this.toIso());
  }

  private toIso(): string {
    if (!this.isComplete()) return '';
    const [y, m, d] = [Number(this.year), Number(this.month), Number(this.day)];
    if (!isRealDate(y, m, d)) return '';
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    return iso > this.max ? '' : iso;
  }
}
