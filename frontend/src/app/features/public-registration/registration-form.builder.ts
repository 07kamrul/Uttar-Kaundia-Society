import { FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { internationalPhoneValidator } from '../../shared/phone-input/phone-number';
import { nidValidator } from '../../core/utils/bd-input';
import { toAsciiDigits } from '../../core/services/digits.helper';

export interface RegistrationFormOptions {
  /** reg_road_optional: the road/village field may be left empty. */
  roadOptional?: boolean;
}

const DIGITS_ONLY_PATTERN = /^\d+$/;
const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

/** Quantities may be typed with Bangla digits; they are read as ASCII. */
function asciiText(value: unknown): string {
  return toAsciiDigits(String(value ?? ''));
}

function decimalQuantityValidator(control: FormControl): { pattern: boolean } | null {
  const text = asciiText(control.value).trim();
  return text === '' || DECIMAL_PATTERN.test(text) ? null : { pattern: true };
}

function shareQuantityValidator(group: FormGroup): { shareExceedsTotal: boolean } | null {
  const landQuantity = parseFloat(asciiText(group.get('landQuantity')?.value));
  const myShareQuantity = parseFloat(asciiText(group.get('myShareQuantity')?.value));
  if (!isNaN(landQuantity) && !isNaN(myShareQuantity) && myShareQuantity > landQuantity) {
    return { shareExceedsTotal: true };
  }
  return null;
}

function positiveQuantityValidator(control: FormControl): { notPositive: boolean } | null {
  const raw = asciiText(control.value);
  if (raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return value > 0 ? null : { notPositive: true };
}

export function buildApplicableDocGroup(fb: FormBuilder, type: string): FormGroup {
  return fb.group({
    type: [type],
    fileName: [''],
    fileDataUrl: [''],
  });
}

export function buildPropertyGroup(fb: FormBuilder): FormGroup {
  return fb.group(
    {
      propertyType: fb.control<string[]>([]),
      propertyTypeOther: [''],
      khatianNo: ['', Validators.required],
      dagUnknown: [false],
      dagNo: fb.group({ cs: ['', Validators.required], rs: ['', Validators.required] }),
      holdingNumber: [''],
      landQuantity: [
        '',
        [Validators.required, decimalQuantityValidator, positiveQuantityValidator],
      ],
      myShareQuantity: [
        '',
        [Validators.required, decimalQuantityValidator, positiveQuantityValidator],
      ],
      ownership: ['', Validators.required],
      jointOwnerCount: [null],
      applicableDocs: fb.array([]),
    },
    { validators: shareQuantityValidator },
  );
}

export function buildAddressGroup(fb: FormBuilder, options: RegistrationFormOptions = {}): FormGroup {
  return fb.group({
    house: ['', Validators.required],
    road: ['', options.roadOptional ? [] : Validators.required],
    postOffice: ['', Validators.required],
    upazila: ['', Validators.required],
    district: ['', Validators.required],
    division: ['', Validators.required],
  });
}

export function buildNomineeGroup(fb: FormBuilder): FormGroup {
  return fb.group({
    name: ['', Validators.required],
    relation: [''],
    mobile: ['', [Validators.required, internationalPhoneValidator]],
    address: [''],
  });
}

export function buildRegistrationForm(
  fb: FormBuilder,
  options: RegistrationFormOptions = {},
): FormGroup {
  return fb.group({
    fullName: ['', Validators.required],
    fatherOrHusband: ['', Validators.required],
    mother: ['', Validators.required],
    dob: ['', Validators.required],
    nationality: ['বাংলাদেশী'],
    occupation: [''],
    nid: ['', [Validators.required, nidValidator]],
    mobile: ['', [Validators.required, internationalPhoneValidator]],
    gender: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],

    hasWhatsapp: new FormControl<boolean | null>(null),

    permanentAddress: buildAddressGroup(fb, options),
    currentAddress: buildAddressGroup(fb, options),
    currentAddressAbroad: [false],
    currentCountry: [''],
    currentCity: [''],
    currentAddressText: [''],

    urgentContactName: ['', Validators.required],
    urgentContactRelation: [''],
    urgentContactMobile: ['', [Validators.required, internationalPhoneValidator]],
    urgentContactAddress: [''],

    propertyCount: new FormControl(null),
    properties: fb.array([]),

    nominees: fb.array([buildNomineeGroup(fb)]),

    admissionFee: ['', Validators.required],
    subscription: ['', Validators.required],
    receiptNo: [''],
    paymentMethod: ['', Validators.required],
    receiptFileName: [''],
    receiptFileDataUrl: [''],

    memberSignature: [''],
    submissionDate: [new Date().toISOString().split('T')[0]],
    memberPhoto: ['', Validators.required],

    declarationAccepted: [false, Validators.requiredTrue],
  });
}

export function propertiesArray(form: FormGroup): FormArray {
  return form.get('properties') as FormArray;
}

export function nomineesArray(form: FormGroup): FormArray {
  return form.get('nominees') as FormArray;
}

export function applicableDocsArray(propertyGroup: FormGroup): FormArray {
  return propertyGroup.get('applicableDocs') as FormArray;
}
