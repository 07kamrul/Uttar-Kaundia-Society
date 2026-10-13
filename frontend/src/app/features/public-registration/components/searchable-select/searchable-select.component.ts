import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  forwardRef,
  inject,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

export interface SelectOption {
  value: string;
  label: string;
  /** Extra text the search also matches (e.g. the English country name). */
  search?: string;
}

/**
 * A dropdown you can type into: the list narrows as you type. Used for the
 * division / district / upazila and country pickers, which are long lists.
 */
@Component({
  selector: 'app-searchable-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SearchableSelectComponent), multi: true },
  ],
  templateUrl: './searchable-select.component.html',
})
export class SearchableSelectComponent implements ControlValueAccessor {
  @Input() options: readonly SelectOption[] | null = [];
  @Input() inputId = '';
  @Input() placeholder = '';
  @Input() invalid = false;

  value = '';
  query: string | null = null;
  open = false;
  disabled = false;

  private readonly cdr = inject(ChangeDetectorRef);
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  /** What the input shows: what is being typed, else the label of the chosen value. */
  get text(): string {
    if (this.query !== null) return this.query;
    return this.options?.find((o) => o.value === this.value)?.label ?? this.value;
  }

  get filtered(): readonly SelectOption[] {
    const needle = (this.query ?? '').trim().toLowerCase();
    const all = this.options ?? [];
    return needle
      ? all.filter((o) => `${o.label} ${o.search ?? ''}`.toLowerCase().includes(needle))
      : all;
  }

  writeValue(value: string | null): void {
    this.value = value ?? '';
    this.query = null;
    this.cdr.markForCheck();
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled = disabled;
    this.cdr.markForCheck();
  }

  openList(): void {
    this.open = true;
    this.query ??= '';
  }

  onInput(event: Event): void {
    this.query = (event.target as HTMLInputElement).value;
    this.open = true;
    if (this.query.trim() === '' && this.value !== '') {
      this.value = '';
      this.onChange('');
    }
  }

  select(option: SelectOption): void {
    this.value = option.value;
    this.query = null;
    this.open = false;
    this.onChange(option.value);
    this.onTouched();
  }

  close(): void {
    this.open = false;
    this.query = null;
    this.onTouched();
  }
}
