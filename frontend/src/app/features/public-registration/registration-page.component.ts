import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  MAX_PHOTO_BYTES,
  accountsForMethod,
  type RegistrationConfig,
} from '../../core/models/registration.model';
import { FeatureFlagService, type FeatureFlagKey } from '../../core/services/feature-flag.service';
import { toAsciiDigits } from '../../core/services/digits.helper';
import { isValidNid } from '../../core/utils/bd-input';
import { RegistrationService } from '../../core/services/registration.service';
import { RegistrationDraftService } from './services/registration-draft.service';
import { createIndexedDbFileStore } from './services/indexed-db-file-store';
import { NO_UI_FLAGS, readUiFlags, type RegistrationUiFlags } from './registration-ui-flags';
import { abroadAddressErrors, dagErrors, hasAtLeastOneProof } from './step-rules';
import { prepareUpload, readAsDataUrl } from './file-upload';
import { MemberInfoComponent } from './components/member-info/member-info.component';
import { AddressInfoComponent } from './components/address-info/address-info.component';
import { UrgentContactComponent } from './components/urgent-contact/urgent-contact.component';
import { PropertyListComponent } from './components/property-list/property-list.component';
import { NomineeListComponent } from './components/nominee-list/nominee-list.component';
import { PaymentInfoComponent } from './components/payment-info/payment-info.component';
import { ConfirmationComponent } from './components/confirmation/confirmation.component';
import { ReviewSummaryComponent } from './components/review-summary/review-summary.component';
import { SignaturePadComponent } from './components/signature-pad/signature-pad.component';
import { BnNumberPipe } from '../../shared/pipes/bn-pipes';
import { DatePickerComponent } from '../../shared/date-picker/date-picker.component';
import { ConfirmModalComponent } from '../../shared/confirm-modal/confirm-modal.component';
import { buildRegistrationForm, propertiesArray, nomineesArray } from './registration-form.builder';
import { mapSubmissionError } from './services/submission-error.mapper';
import { isPossibleInternationalPhone } from '../../shared/phone-input/phone-number';

interface DuplicateSubmissionError {
  success: false;
  code: 'APPLICATION_PENDING' | 'ALREADY_REGISTERED';
  message: string;
}

function isDuplicateSubmissionError(body: unknown): body is DuplicateSubmissionError {
  return (
    !!body &&
    typeof body === 'object' &&
    ((body as { code?: unknown }).code === 'APPLICATION_PENDING' ||
      (body as { code?: unknown }).code === 'ALREADY_REGISTERED')
  );
}

export interface RegistrationStep {
  id: number;
  title: string;
  shortLabel: string;
}

export const REGISTRATION_STEPS: RegistrationStep[] = [
  {
    id: 1,
    title: 'registration.stepTitles.memberInfo',
    shortLabel: 'registration.stepShortLabels.memberInfo',
  },
  {
    id: 2,
    title: 'registration.stepTitles.property',
    shortLabel: 'registration.stepShortLabels.property',
  },
  {
    id: 3,
    title: 'registration.stepTitles.contactAndNominee',
    shortLabel: 'registration.stepShortLabels.nominee',
  },
  {
    id: 4,
    title: 'registration.stepTitles.payment',
    shortLabel: 'registration.stepShortLabels.payment',
  },
  {
    id: 5,
    title: 'registration.stepTitles.declarationAndSignature',
    shortLabel: 'registration.stepShortLabels.signature',
  },
  {
    id: 6,
    title: 'registration.stepTitles.review',
    shortLabel: 'registration.stepShortLabels.review',
  },
];

@Component({
  selector: 'app-registration-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MemberInfoComponent,
    AddressInfoComponent,
    UrgentContactComponent,
    PropertyListComponent,
    NomineeListComponent,
    PaymentInfoComponent,
    ConfirmationComponent,
    ReviewSummaryComponent,
    DatePickerComponent,
    ConfirmModalComponent,
    SignaturePadComponent,
    BnNumberPipe,
    TranslatePipe,
  ],
  templateUrl: './registration-page.component.html',
  styleUrl: './registration-simplified.scss',
  encapsulation: ViewEncapsulation.None,
})
export class RegistrationPageComponent implements OnInit {
  form: FormGroup;
  errors: string[] = [];
  serverError: string | null = null;
  submitting = false;
  submitAttempted = false;
  success: { id: string } | null = null;
  duplicateSubmission: DuplicateSubmissionError | null = null;
  memberPhotoPreview = signal('');
  photoBusy = signal(false);
  /** Society payment accounts and consent version (reg_simplified_ui); null until loaded or if unavailable. */
  config = signal<RegistrationConfig | null>(null);
  feeLoading = signal(true);
  feeError = signal(false);
  subscriptionBusy = signal(false);

  /** Feature flags resolved once; handed to the step components as one input. */
  ui: RegistrationUiFlags = NO_UI_FLAGS;

  steps = REGISTRATION_STEPS;
  currentStep = 1;

  showDraftRestoredToast = false;

  private readonly translate = inject(TranslateService);
  private readonly draftService = inject(RegistrationDraftService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly flags = inject(FeatureFlagService);

  readonly draftLastSaved = this.draftService.lastSaved;

  constructor(
    private fb: FormBuilder,
    private registrationService: RegistrationService,
    private router: Router,
  ) {
    this.ui = readUiFlags((key) => this.flags.isEnabled(key));
    this.form = this.newForm();
  }

  /** reg_simplified_ui: the redesigned wizard. Every part of it hangs off this one switch. */
  get simplified(): boolean {
    return this.ui.simplified;
  }

  flag(key: FeatureFlagKey): boolean {
    return this.flags.isEnabled(key);
  }

  private newForm(): FormGroup {
    return buildRegistrationForm(this.fb, { roadOptional: this.ui.roadOptional });
  }

  /** Localised "ধাপ ২ / ৬ — সম্পত্তি" key pieces for the header. */
  get currentStepNameKey(): string {
    return `registration.simplified.stepNames.${this.currentStep}`;
  }

  ngOnInit(): void {
    if (this.simplified) {
      this.draftService.useFileStore(createIndexedDbFileStore());
      this.loadConfig();
    }
    const draft = this.draftService.peekDraft();
    if (draft) {
      this.draftService.restore(this.form, this.fb, draft);
      this.currentStep = draft.currentStep;
      this.showDraftRestoredToast = true;
      void this.draftService.restoreFiles(this.form, draft).then(() => {
        this.memberPhotoPreview.set(this.form.get('memberPhoto')?.value ?? '');
        this.cdr.markForCheck();
      });
    }
    if (this.simplified && this.form.get('hasWhatsapp')?.value === null) {
      // The toggle starts "off" (not unknown): has_whatsapp is sent as false unless ticked.
      this.form.get('hasWhatsapp')?.setValue(false);
    }
    this.loadAdmissionFee();
    this.draftService.watch(this.form, () => this.currentStep);
    this.destroyRef.onDestroy(() => this.draftService.unwatch());
  }

  /**
   * The admission fee is a system-defined amount: it always comes from the
   * active fee setting, never from a hard-coded default or the saved draft.
   */
  loadAdmissionFee(): void {
    this.feeLoading.set(true);
    this.feeError.set(false);
    this.registrationService
      .getPublicFeeSettings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          const admissionFee = settings['admission_fee'];
          this.feeLoading.set(false);
          if (Number.isFinite(admissionFee)) {
            this.form.get('admissionFee')?.setValue(admissionFee);
          } else {
            this.feeError.set(true);
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.feeLoading.set(false);
          this.feeError.set(true);
          this.cdr.markForCheck();
        },
      });
  }

  private loadConfig(): void {
    this.registrationService
      .getRegistrationConfig()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (config) => {
          this.config.set(config);
          this.cdr.markForCheck();
        },
        // Payment accounts fall back to the built-in ones; consent_version falls back to the server's current.
        error: () => undefined,
      });
  }

  dismissDraftToast(): void {
    this.showDraftRestoredToast = false;
  }

  discardDraft(): void {
    this.draftService.clear();
    this.form = this.newForm();
    this.memberPhotoPreview.set('');
    this.currentStep = 1;
    this.showDraftRestoredToast = false;
    this.draftService.watch(this.form, () => this.currentStep);
  }

  get properties(): FormArray {
    return propertiesArray(this.form);
  }

  get nominees(): FormArray {
    return nomineesArray(this.form);
  }

  clearSignature(): void {
    this.form.get('memberSignature')?.setValue('');
  }

  async onPhotoChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0];
    input.value = '';
    if (!picked) return;

    if (!picked.type.startsWith('image/')) {
      this.serverError = this.translate.instant('registration.memberInfo.photoTypeError');
      return;
    }
    this.serverError = null;
    this.photoBusy.set(true);
    try {
      const file = await prepareUpload(picked, this.simplified);
      if (file.size > MAX_PHOTO_BYTES) {
        this.serverError = this.translate.instant('registration.memberInfo.photoSizeError');
        return;
      }
      const dataUrl = await readAsDataUrl(file);
      this.form.get('memberPhoto')?.setValue(dataUrl);
      this.memberPhotoPreview.set(dataUrl);
    } finally {
      this.photoBusy.set(false);
      this.cdr.markForCheck();
    }
  }

  clearPhoto(): void {
    this.form.get('memberPhoto')?.setValue('');
    this.memberPhotoPreview.set('');
  }

  private validateMemberStep(): string[] {
    const errs: string[] = [];
    const v = this.form.value;

    if (!v.fullName?.trim())
      errs.push(this.translate.instant('registration.validation.fullNameRequired'));
    if (!v.fatherOrHusband?.trim())
      errs.push(this.translate.instant('registration.validation.fatherOrHusbandRequired'));
    if (!v.mother?.trim())
      errs.push(this.translate.instant('registration.validation.motherRequired'));
    if (!v.dob) errs.push(this.translate.instant('registration.validation.dobRequired'));
    if (!v.mobile?.trim())
      errs.push(this.translate.instant('registration.validation.mobileRequired'));
    else if (!isPossibleInternationalPhone(v.mobile))
      errs.push(this.translate.instant('registration.validation.mobileInvalid'));
    if (!v.gender?.trim())
      errs.push(this.translate.instant('registration.validation.genderRequired'));
    // Email and NID are required here exactly as in the form builder.
    if (!v.email?.trim())
      errs.push(this.translate.instant('registration.memberInfo.emailRequired'));
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email))
      errs.push(this.translate.instant('registration.validation.emailInvalid'));
    if (!v.nid?.trim()) errs.push(this.translate.instant('registration.memberInfo.nidRequired'));
    else if (!isValidNid(v.nid))
      errs.push(this.translate.instant('registration.validation.nidInvalid'));
    if (!v.memberPhoto)
      errs.push(this.translate.instant('registration.memberInfo.memberPhotoRequired'));

    if (this.flag('reg_abroad_address') && v.currentAddressAbroad === true) {
      errs.push(...abroadAddressErrors(v, (key, params) => this.translate.instant(key, params)));
    } else {
      errs.push(
        ...this.validateAddressGroup(
          this.translate.instant('registration.validation.currentAddressLabel'),
          v.currentAddress,
        ),
      );
    }
    if (this.form.get('permanentAddress')?.enabled) {
      errs.push(
        ...this.validateAddressGroup(
          this.translate.instant('registration.validation.permanentAddressLabel'),
          v.permanentAddress,
        ),
      );
    }

    return errs;
  }

  private validateAddressGroup(
    label: string,
    address: {
      division?: string;
      district?: string;
      upazila?: string;
      postOffice?: string;
      road?: string;
      house?: string;
    },
  ): string[] {
    const errs: string[] = [];
    if (!address.division?.trim())
      errs.push(`${label}: ${this.translate.instant('registration.addressInfo.divisionRequired')}`);
    if (!address.district?.trim())
      errs.push(`${label}: ${this.translate.instant('registration.addressInfo.districtRequired')}`);
    if (!address.upazila?.trim())
      errs.push(`${label}: ${this.translate.instant('registration.addressInfo.upazilaRequired')}`);
    if (!address.postOffice?.trim())
      errs.push(
        `${label}: ${this.translate.instant('registration.addressInfo.postOfficeRequired')}`,
      );
    if (!address.road?.trim() && !this.flag('reg_road_optional'))
      errs.push(`${label}: ${this.translate.instant('registration.addressInfo.roadRequired')}`);
    if (!address.house?.trim())
      errs.push(`${label}: ${this.translate.instant('registration.addressInfo.houseRequired')}`);
    return errs;
  }

  private validatePropertyStep(): string[] {
    const errs: string[] = [];
    const v = this.form.value;

    if (!v.propertyCount) {
      errs.push(this.translate.instant('registration.validation.propertyCountRequired'));
      return errs;
    }

    (v.properties as any[]).forEach((property, i) => {
      const label = this.translate.instant('registration.validation.propertyLabel', {
        number: i + 1,
      });
      if (!property.propertyType || property.propertyType.length === 0) {
        errs.push(
          `${label}: ${this.translate.instant('registration.validation.propertyTypeRequired')}`,
        );
      }
      if (!property.ownership)
        errs.push(
          `${label}: ${this.translate.instant('registration.validation.ownershipRequired')}`,
        );
      if (property.ownership === 'যৌথ') {
        const count = property.jointOwnerCount;
        if (!count || count < 1) {
          errs.push(
            `${label}: ${this.translate.instant('registration.validation.jointOwnerCountRequired')}`,
          );
        }
      }
      const landRaw = toAsciiDigits(String(property.landQuantity ?? '')).trim();
      const shareRaw = toAsciiDigits(String(property.myShareQuantity ?? '')).trim();
      const landQuantity = parseFloat(landRaw);
      const myShareQuantity = parseFloat(shareRaw);
      if (!landRaw) {
        errs.push(
          `${label}: ${this.translate.instant('registration.validation.landQuantityRequired')}`,
        );
      } else if (!Number.isFinite(landQuantity) || landQuantity <= 0) {
        errs.push(
          `${label}: ${this.translate.instant('registration.validation.landQuantityInvalid')}`,
        );
      }
      if (!shareRaw) {
        errs.push(
          `${label}: ${this.translate.instant('registration.validation.myShareQuantityRequired')}`,
        );
      } else if (!Number.isFinite(myShareQuantity) || myShareQuantity <= 0) {
        errs.push(
          `${label}: ${this.translate.instant('registration.validation.myShareQuantityInvalid')}`,
        );
      }
      if (
        Number.isFinite(landQuantity) &&
        Number.isFinite(myShareQuantity) &&
        myShareQuantity > landQuantity
      ) {
        errs.push(
          `${label}: ${this.translate.instant('registration.validation.myShareQuantityExceedsTotal')}`,
        );
      }
      if (this.flag('reg_dag_unknown')) {
        errs.push(...dagErrors(property, label, (key, params) => this.translate.instant(key, params)));
      }
      errs.push(...this.validateDocs(property, label));
    });

    return errs;
  }

  private validateDocs(property: { applicableDocs?: any[] }, label: string): string[] {
    const docs = property.applicableDocs ?? [];
    if (this.flag('reg_min_one_proof')) {
      // One proof file of any type is enough; empty slots are ignored.
      return hasAtLeastOneProof(docs)
        ? []
        : [`${label}: ${this.translate.instant('registration.validation.proofRequired')}`];
    }
    if (docs.length === 0) {
      return [`${label}: ${this.translate.instant('registration.validation.applicableDocsRequired')}`];
    }
    return docs
      .filter((doc) => !doc.fileDataUrl)
      .map(
        (doc) =>
          `${label}: ${this.translate.instant('registration.validation.docFileRequired', { docType: doc.type })}`,
      );
  }

  private validateContactStep(): string[] {
    const errs: string[] = [];
    const v = this.form.value;
    const nominees = this.form.getRawValue().nominees;

    const urgentContactLabel = this.translate.instant('registration.validation.urgentContactLabel');
    if (!v.urgentContactName?.trim())
      errs.push(
        `${urgentContactLabel}: ${this.translate.instant('registration.validation.nameRequired')}`,
      );
    if (!v.urgentContactMobile?.trim())
      errs.push(
        `${urgentContactLabel}: ${this.translate.instant('registration.validation.mobileRequired')}`,
      );
    else if (!isPossibleInternationalPhone(v.urgentContactMobile))
      errs.push(
        `${urgentContactLabel}: ${this.translate.instant('registration.validation.mobileInvalid')}`,
      );

    (nominees as any[]).forEach((nominee, i) => {
      const label = this.translate.instant('registration.validation.nomineeLabel', {
        number: i + 1,
      });
      if (!nominee.name?.trim())
        errs.push(`${label}: ${this.translate.instant('registration.validation.nameRequired')}`);
      if (!nominee.mobile?.trim())
        errs.push(`${label}: ${this.translate.instant('registration.validation.mobileRequired')}`);
      else if (!isPossibleInternationalPhone(nominee.mobile))
        errs.push(`${label}: ${this.translate.instant('registration.validation.mobileInvalid')}`);
    });

    return errs;
  }

  private validatePaymentStep(): string[] {
    const errs: string[] = [];
    const v = this.form.value;

    if (!v.admissionFee)
      errs.push(this.translate.instant('registration.payment.admissionFeeRequired'));
    if (!v.subscription)
      errs.push(this.translate.instant('registration.payment.subscriptionRequired'));
    if (!v.paymentMethod)
      errs.push(this.translate.instant('registration.payment.paymentMethodRequired'));
    // Account-backed methods must name the account; no submitting before the
    // server's active accounts (or none) have actually loaded.
    else if (
      accountsForMethod(v.paymentMethod, this.config()?.paymentAccounts ?? []).length > 0 &&
      !v.paymentAccountId
    )
      errs.push(this.translate.instant('paymentAccounts.required'));

    return errs;
  }

  private validateDeclarationStep(): string[] {
    const errs: string[] = [];
    if (!this.form.value.declarationAccepted)
      errs.push(this.translate.instant('registration.declaration.consentRequired'));
    return errs;
  }

  private validateStep(step: number): string[] {
    switch (step) {
      case 1:
        return this.validateMemberStep();
      case 2:
        return this.validatePropertyStep();
      case 3:
        return this.validateContactStep();
      case 4:
        return this.validatePaymentStep();
      case 5:
        return this.validateDeclarationStep();
      default:
        return [];
    }
  }

  private validate(): string[] {
    return [
      ...this.validateMemberStep(),
      ...this.validatePropertyStep(),
      ...this.validateContactStep(),
      ...this.validatePaymentStep(),
      ...this.validateDeclarationStep(),
    ];
  }

  /** Returns the first step (1-based) that fails its own validation, or null if all steps pass. */
  private firstInvalidStep(): number | null {
    for (const step of this.steps) {
      if (step.id === this.steps.length) continue;
      if (this.validateStep(step.id).length > 0) return step.id;
    }
    return null;
  }

  goToStep(step: number): void {
    if (step > this.currentStep) {
      for (let s = this.currentStep; s < step; s++) {
        const stepErrors = this.validateStep(s);
        if (stepErrors.length > 0) {
          this.errors = stepErrors;
          this.submitAttempted = true;
          this.form.markAllAsTouched();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
      }
    }
    this.errors = [];
    this.currentStep = step;
    this.draftService.saveNow(this.form, this.currentStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  nextStep(): void {
    this.goToStep(this.currentStep + 1);
  }

  prevStep(): void {
    this.errors = [];
    if (this.currentStep > 1) {
      this.goToStep(this.currentStep - 1);
    }
  }

  onSubmit(): void {
    this.errors = [];
    this.serverError = null;
    this.submitAttempted = true;

    const clientErrors = this.validate();
    if (clientErrors.length > 0) {
      this.errors = clientErrors;
      const invalidStep = this.firstInvalidStep();
      if (invalidStep) {
        this.goToStep(invalidStep);
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    this.submitting = true;
    this.cdr.markForCheck();
    this.registrationService
      .submit({ ...this.form.getRawValue(), consentVersion: this.config()?.consentVersion })
      .subscribe({
      next: (res) => {
        this.submitting = false;
        // Reaching `next` means a 2xx response, which for POST /submissions
        // is a created submission - the backend body carries `id`/`status`,
        // not a `success` flag.
        this.success = { id: res.id != null ? String(res.id) : '' };
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.submitting = false;
        if (err.status === 409 && isDuplicateSubmissionError(err.error?.detail)) {
          this.duplicateSubmission = err.error.detail;
        } else {
          const mapped = mapSubmissionError(err, (key, params) =>
            this.translate.instant(key, params),
          );
          // goToStep clears `errors`, so jump first, then show the messages.
          if (mapped.step) {
            this.goToStep(mapped.step);
          }
          this.errors = mapped.messages;
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
        this.cdr.markForCheck();
      },
    });
  }

  dismissDuplicateSubmission(): void {
    const wasApproved = this.duplicateSubmission?.code === 'ALREADY_REGISTERED';
    this.duplicateSubmission = null;
    if (wasApproved) {
      this.router.navigate(['/login']);
    }
  }

  onConfirmationAcknowledged(): void {
    this.draftService.clear();
    this.success = null;
    this.router.navigateByUrl('/');
  }

  toggleDeclaration(): void {
    const control = this.form.get('declarationAccepted');
    control?.setValue(!control.value);
  }
}
