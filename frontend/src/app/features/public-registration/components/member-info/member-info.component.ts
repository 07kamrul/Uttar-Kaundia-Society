import { Component, EventEmitter, Input, OnInit, Output, ChangeDetectionStrategy, signal } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DatePickerComponent } from '../../../../shared/date-picker/date-picker.component';
import { PhoneInputComponent } from '../../../../shared/phone-input/phone-input.component';
import { AsciiDigitsDirective } from '../../ascii-digits.directive';
import { NO_UI_FLAGS, type RegistrationUiFlags } from '../../registration-ui-flags';
import { DobSelectComponent } from '../dob-select/dob-select.component';

const DEFAULT_NATIONALITY = 'বাংলাদেশী';

@Component({
  selector: 'app-member-info',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    DatePickerComponent,
    PhoneInputComponent,
    DobSelectComponent,
    AsciiDigitsDirective,
  ],
  templateUrl: './member-info.component.html',
})
export class MemberInfoComponent implements OnInit {
  @Input({ required: true }) form!: FormGroup;
  @Input() memberPhotoPreview = '';
  @Input() submitAttempted = false;
  @Input() photoBusy = false;
  /** Feature flags; all off keeps the original form. */
  @Input() ui: RegistrationUiFlags = NO_UI_FLAGS;
  @Output() photoChange = new EventEmitter<Event>();
  @Output() photoClear = new EventEmitter<void>();

  /** dob must be in the past; used as the date-picker's max. */
  readonly today = new Date().toISOString().slice(0, 10);

  /** reg_hide_nationality: the field only shows once "another country" is ticked. */
  readonly foreignNational = signal(false);

  constructor(private translate: TranslateService) {}

  ngOnInit(): void {
    const nationality = (this.form.get('nationality')?.value ?? '').trim();
    this.foreignNational.set(!!nationality && nationality !== DEFAULT_NATIONALITY);
  }

  toggleForeignNational(checked: boolean): void {
    this.foreignNational.set(checked);
    if (!checked) this.form.get('nationality')?.setValue(DEFAULT_NATIONALITY);
  }

  toggleWhatsapp(checked: boolean): void {
    this.form.get('hasWhatsapp')?.setValue(checked);
  }

  get showNationality(): boolean {
    return !this.ui.hideNationality || this.foreignNational();
  }

  showError(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!control && control.invalid && (control.touched || this.submitAttempted);
  }

  errorMessage(controlName: string): string {
    const control = this.form.get(controlName);
    const messageKeys: Record<string, string> = {
      fullName: 'registration.memberInfo.fullNameRequired',
      fatherOrHusband: 'registration.memberInfo.fatherOrHusbandRequired',
      mother: 'registration.memberInfo.motherRequired',
      dob: 'registration.memberInfo.dobRequired',
      gender: 'registration.memberInfo.genderRequired',
      memberPhoto: 'registration.memberInfo.memberPhotoRequired',
    };

    if (controlName === 'mobile') {
      return this.translate.instant(
        control?.errors?.['required']
          ? 'registration.memberInfo.mobileRequired'
          : 'registration.memberInfo.mobileInvalid',
      );
    }

    if (controlName === 'email') {
      return this.translate.instant(
        control?.errors?.['required']
          ? 'registration.memberInfo.emailRequired'
          : 'registration.memberInfo.emailInvalid',
      );
    }

    if (controlName === 'nid') {
      return this.translate.instant(
        control?.errors?.['required']
          ? 'registration.memberInfo.nidRequired'
          : 'registration.memberInfo.nidInvalid',
      );
    }

    const key = messageKeys[controlName];
    return key ? this.translate.instant(key) : '';
  }
}
