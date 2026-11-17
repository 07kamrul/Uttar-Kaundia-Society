import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy, inject } from '@angular/core';
import { FormArray, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PhoneTextPipe } from '../../../../shared/phone/phone-text.pipe';
import { BnDatePipe, BnNumberPipe, TakaPipe } from '../../../../shared/pipes/bn-pipes';
import { PAYMENT_METHOD_KEYS } from '../../../../core/models/registration.model';

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';

interface AddressValue {
  house?: string;
  road?: string;
  postOffice?: string;
  upazila?: string;
  district?: string;
  division?: string;
}

@Component({
  selector: 'app-review-summary',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe, PhoneTextPipe, BnDatePipe, BnNumberPipe, TakaPipe],
  templateUrl: './review-summary.component.html',
})
export class ReviewSummaryComponent {
  @Input({ required: true }) form!: FormGroup;
  /** reg_simplified_ui: plain-language summary of every section instead of the four cards. */
  @Input() simplified = false;
  @Output() editStep = new EventEmitter<number>();

  private readonly translate = inject(TranslateService);

  get properties(): FormArray {
    return this.form.get('properties') as FormArray;
  }

  get nominees(): FormArray {
    return this.form.get('nominees') as FormArray;
  }

  goTo(step: number): void {
    this.editStep.emit(step);
  }

  /** Digits as the member reads them: Bangla in Bangla, untouched in English. */
  digits(value: unknown): string {
    const text = String(value ?? '').trim();
    if (this.translate.currentLang() === 'en') return text;
    return text.replace(/[0-9]/g, (d) => BANGLA_DIGITS[Number(d)]);
  }

  get isAbroad(): boolean {
    return this.form.get('currentAddressAbroad')?.value === true;
  }

  addressText(address: AddressValue | null | undefined): string {
    if (!address) return '';
    return [address.house, address.road, address.postOffice, address.upazila, address.district, address.division]
      .map((part) => (part ?? '').trim())
      .filter(Boolean)
      .join(', ');
  }

  get abroadAddressText(): string {
    const v = this.form.getRawValue();
    return [v.currentAddressText, v.currentCity, this.countryName(v.currentCountry)]
      .map((part: string) => (part ?? '').trim())
      .filter(Boolean)
      .join(', ');
  }

  private countryName(code: string | undefined): string {
    if (!code) return '';
    try {
      const lang = this.translate.currentLang() === 'en' ? 'en' : 'bn';
      return new Intl.DisplayNames([lang], { type: 'region' }).of(code.toUpperCase()) ?? code;
    } catch {
      return code;
    }
  }

  /** Canonical keys get their friendly name; legacy stored values are shown as they are. */
  methodLabel(): string {
    const method = this.form.get('paymentMethod')?.value as string;
    return (PAYMENT_METHOD_KEYS as readonly string[]).includes(method)
      ? this.translate.instant(`registration.simplified.payment.methods.${method}`)
      : method;
  }

  /** Names of the documents the member attached, e.g. "খতিয়ান/পর্চা, খাজনা/কর রশিদ". */
  attachedDocs(property: { applicableDocs?: { type: string; fileDataUrl?: string }[] }): string {
    return (property.applicableDocs ?? [])
      .filter((doc) => !!doc.fileDataUrl)
      .map((doc) => doc.type)
      .join(', ');
  }

  propertyTypes(property: { propertyType?: string[]; propertyTypeOther?: string }): string {
    return [...(property.propertyType ?? []), property.propertyTypeOther ?? '']
      .map((type) => type.trim())
      .filter(Boolean)
      .join(', ');
  }
}
