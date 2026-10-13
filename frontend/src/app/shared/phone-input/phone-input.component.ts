import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Input,
  computed,
  forwardRef,
  inject,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator,
} from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { CountryCode, getExampleNumber } from 'libphonenumber-js/min';
import examples from 'libphonenumber-js/mobile/examples';
import { toAsciiDigits } from '../../core/services/digits.helper';
import { LanguageService } from '../../core/services/language.service';
import { toBanglaDigits } from '../pipes/bn-format';
import {
  DEFAULT_PHONE_COUNTRY,
  PhoneCountry,
  composePhoneNumber,
  filterPhoneCountries,
  internationalPhoneValidator,
  isInternationalInput,
  listPhoneCountries,
  listPinnedPhoneCountries,
  parsePhone,
  phoneStatus,
  splitPhoneNumber,
} from './phone-number';

let nextPhoneInputId = 0;

/**
 * International phone input: searchable country picker (diaspora destinations
 * pinned on top) + national number. Works with formControlName and ngModel;
 * the model value is E.164 (e.g. "+8801712345678"). Legacy national values
 * ("01712345678") are read as Bangladeshi, Bangla digits are converted as
 * typed, and a "+…" or "00…" number switches the country by itself.
 *
 * Two tiers of feedback: an impossible number is reported to the form as
 * `phoneInvalid` (see internationalPhoneValidator); a plausible number we do
 * not recognise only shows a warning under the field.
 */
@Component({
  selector: 'app-phone-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PhoneInputComponent), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => PhoneInputComponent), multi: true },
  ],
  template: `
    <div class="phone-input" [class.is-invalid]="invalid" [class.is-disabled]="disabled()">
      <button
        type="button"
        class="phone-country-trigger"
        [disabled]="disabled()"
        [attr.aria-label]="'phoneInput.selectCountry' | translate"
        aria-haspopup="listbox"
        [attr.aria-expanded]="open()"
        (click)="toggle()"
      >
        <span class="phone-flag" aria-hidden="true">{{ selected().flag }}</span>
        <span class="phone-dial">{{ selected().dialCode }}</span>
        <span class="phone-caret" aria-hidden="true">▾</span>
      </button>
      <input
        type="tel"
        inputmode="tel"
        autocomplete="tel-national"
        [attr.id]="inputId"
        [value]="nationalNumber()"
        [disabled]="disabled()"
        [attr.placeholder]="placeholder()"
        [attr.aria-invalid]="invalid ? 'true' : null"
        [attr.aria-describedby]="showWarning() ? warningId : null"
        (input)="onNumberInput($any($event.target))"
        (paste)="onPaste($event)"
        (blur)="onBlur()"
      />
      @if (open()) {
        <div class="phone-country-panel">
          <input
            type="search"
            class="phone-country-search"
            [value]="query()"
            [attr.placeholder]="'phoneInput.searchCountry' | translate"
            [attr.aria-label]="'phoneInput.searchCountry' | translate"
            (input)="query.set($any($event.target).value)"
            (keydown.enter)="$event.preventDefault(); pickFirst()"
          />
          <ul class="phone-country-list" role="listbox">
            @if (!isSearching()) {
              @for (country of pinned(); track country.code) {
                <li
                  role="option"
                  tabindex="0"
                  class="is-pinned"
                  [attr.data-code]="country.code"
                  [attr.aria-selected]="country.code === countryCode()"
                  [class.is-selected]="country.code === countryCode()"
                  (click)="pick(country.code)"
                  (keydown.enter)="pick(country.code)"
                >
                  <span class="phone-flag" aria-hidden="true">{{ country.flag }}</span>
                  <span class="phone-country-name">{{ country.name }}</span>
                  <span class="phone-dial">{{ country.dialCode }}</span>
                </li>
              }
              <li role="separator" class="phone-country-divider">
                {{ 'phoneInput.allCountries' | translate }}
              </li>
            }
            @for (country of filtered(); track country.code) {
              <li
                role="option"
                tabindex="0"
                [attr.data-code]="country.code"
                [attr.aria-selected]="country.code === countryCode()"
                [class.is-selected]="country.code === countryCode()"
                (click)="pick(country.code)"
                (keydown.enter)="pick(country.code)"
              >
                <span class="phone-flag" aria-hidden="true">{{ country.flag }}</span>
                <span class="phone-country-name">{{ country.name }}</span>
                <span class="phone-dial">{{ country.dialCode }}</span>
              </li>
            } @empty {
              <li class="phone-country-empty">{{ 'phoneInput.noCountry' | translate }}</li>
            }
          </ul>
        </div>
      }
    </div>
    @if (showWarning()) {
      <p class="phone-warning" role="status" [attr.id]="warningId">
        {{ 'phoneInput.warning' | translate }}
      </p>
    }
  `,
  styleUrl: './phone-input.component.scss',
})
export class PhoneInputComponent implements ControlValueAccessor, Validator {
  @Input() inputId: string | null = null;
  @Input() invalid = false;

  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly language = inject(LanguageService);

  protected readonly warningId = `phone-warning-${nextPhoneInputId++}`;

  readonly countries = computed(() => listPhoneCountries(this.language.lang()));
  readonly pinned = computed(() => listPinnedPhoneCountries(this.language.lang()));
  readonly countryCode = signal<CountryCode>(DEFAULT_PHONE_COUNTRY);
  readonly nationalNumber = signal('');
  readonly disabled = signal(false);
  readonly open = signal(false);
  readonly query = signal('');

  readonly selected = computed<PhoneCountry>(
    () =>
      this.countries().find((c) => c.code === this.countryCode()) ?? {
        code: this.countryCode(),
        name: this.countryCode(),
        englishName: this.countryCode(),
        dialCode: '',
        flag: '',
      },
  );
  readonly isSearching = computed(() => this.query().trim() !== '');
  readonly filtered = computed(() => filterPhoneCountries(this.countries(), this.query()));
  readonly placeholder = computed(() => {
    const example = getExampleNumber(this.countryCode(), examples)?.formatNational() ?? '';
    return this.language.lang() === 'bn' ? toBanglaDigits(example) : example;
  });
  /** Plausible length, but not a number we recognise: warn, never block. */
  readonly showWarning = computed(
    () =>
      phoneStatus(composePhoneNumber(this.countryCode(), this.nationalNumber())) === 'unrecognised',
  );

  private onChange: (value: string) => void = () => undefined;
  onTouched: () => void = () => undefined;

  toggle(): void {
    this.open.update((isOpen) => !isOpen);
    this.query.set('');
    if (this.open()) {
      queueMicrotask(() =>
        this.host.nativeElement.querySelector<HTMLInputElement>('.phone-country-search')?.focus(),
      );
    }
  }

  pick(code: CountryCode): void {
    this.countryCode.set(code);
    this.open.set(false);
    this.emit();
  }

  pickFirst(): void {
    const first = this.filtered()[0];
    if (first) this.pick(first.code);
  }

  onNumberInput(field: HTMLInputElement): void {
    const typed = field.value;
    const ascii = toAsciiDigits(typed);
    if (ascii !== typed) field.value = ascii;
    // A number that names its own country ("+966…", "00966…") switches the picker.
    if (isInternationalInput(ascii)) {
      this.countryCode.set(splitPhoneNumber(ascii, this.countryCode()).country);
    }
    this.nationalNumber.set(ascii);
    this.emit();
  }

  /**
   * An international number pasted into the field fills the picker and the
   * national part at once. Anything else is left to the browser; the input
   * event that follows normalises it.
   */
  onPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    if (!isInternationalInput(text)) return;
    event.preventDefault();
    const split = splitPhoneNumber(text, this.countryCode());
    this.countryCode.set(split.country);
    this.nationalNumber.set(split.nationalNumber);
    this.emit();
  }

  /** Tidy a typed "+966 …" into picker + national digits once the user leaves the field. */
  onBlur(): void {
    const typed = this.nationalNumber();
    if (isInternationalInput(typed) && parsePhone(typed, this.countryCode())?.country) {
      const split = splitPhoneNumber(typed, this.countryCode());
      this.countryCode.set(split.country);
      this.nationalNumber.set(split.nationalNumber);
    }
    this.onTouched();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    this.open.set(false);
  }

  writeValue(value: string | null): void {
    const split = splitPhoneNumber(value);
    this.countryCode.set(split.country);
    this.nationalNumber.set(split.nationalNumber);
  }

  /** Impossible numbers fail with `phoneInvalid` so template-driven forms block them too. */
  validate(control: AbstractControl): ValidationErrors | null {
    return internationalPhoneValidator(control);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  private emit(): void {
    this.onChange(composePhoneNumber(this.countryCode(), this.nationalNumber()));
  }
}
