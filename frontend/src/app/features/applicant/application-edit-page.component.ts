import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import type { FormDataModel } from '../../core/models/registration.model';
import {
  correctionFieldInfo,
  firstStepToCorrect,
} from '../../core/models/application-review.model';
import { APPLICANT_HOME } from '../../core/services/auth.service';
import {
  REGISTRATION_PAGE_IMPORTS,
  RegistrationPageComponent,
  type CorrectionContext,
} from '../public-registration/registration-page.component';
import { rebuildFormArrays } from '../public-registration/services/registration-draft.service';
import { ApplicantService, type ApplicantApplication } from './applicant.service';

/**
 * The registration wizard, pre-filled with the applicant's own rejected
 * application. Same steps and validation as the public form; submitting saves
 * the corrections to the same record and resubmits it for review.
 */
@Component({
  selector: 'app-application-edit-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: REGISTRATION_PAGE_IMPORTS,
  templateUrl: '../public-registration/registration-page.component.html',
  styleUrl: '../public-registration/registration-simplified.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ApplicationEditPageComponent extends RegistrationPageComponent implements OnInit {
  private readonly applicant = inject(ApplicantService);

  /** Never touches the public registration draft: the record lives on the server. */
  override ngOnInit(): void {
    // Both UI variants render the payment picker and send consentVersion,
    // which come from the registration config.
    this.loadConfig();
    // Keeps "Next" disabled until the stored application is on the form.
    this.feeLoading.set(true);
    this.applicant
      .getApplication()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (app) => this.applyApplication(app),
        error: () => {
          // Leave the wizard disabled: an empty form must never be saved over
          // the stored application. The message asks the user to go back.
          this.serverError = this.translate.instant('application.edit.loadFailed');
          this.cdr.markForCheck();
        },
      });
  }

  /** The corrected record lives on the server; no local draft is written. */
  protected override persistDraft(): void {
    // Intentionally empty - see RegistrationPageComponent.persistDraft.
  }

  private applyApplication(app: ApplicantApplication): void {
    if (!app.canEdit) {
      // Already resubmitted: the record is locked until the next decision.
      this.router.navigateByUrl(APPLICANT_HOME);
      return;
    }
    const value = app.formValue as Record<string, any>;
    rebuildFormArrays(this.form, this.fb, value);
    this.form.patchValue(value);
    this.memberPhotoPreview.set(app.photoUrl ?? '');
    this.correction = toCorrectionContext(app);
    this.currentStep = firstStepToCorrect(app.correctionFields) ?? 1;
    this.feeLoading.set(false);
    this.cdr.markForCheck();
  }

  /** Save corrections to the same record, then send it back for review. */
  protected override submitForm(data: FormDataModel): void {
    this.applicant
      .update(data)
      .pipe(
        switchMap(() => this.applicant.resubmit()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.submitting = false;
          this.router.navigateByUrl(APPLICANT_HOME, { state: { resubmitted: true } });
        },
        error: (err: HttpErrorResponse) => {
          this.submitting = false;
          const code = (err.error?.detail as { code?: string } | undefined)?.code;
          if (err.status === 409 && code === 'APPLICATION_LOCKED') {
            this.errors = [this.translate.instant('application.edit.locked')];
          } else if (err.status === 409) {
            // Another application already uses this NID / mobile / email
            // (DUPLICATE_IDENTIFIER or a duplicate-check code). goToStep
            // clears `errors`, so jump first.
            this.goToStep(1);
            this.errors = [this.translate.instant('application.edit.duplicate')];
          } else {
            this.showServerError(err);
          }
          window.scrollTo({ top: 0, behavior: 'smooth' });
          this.cdr.markForCheck();
        },
      });
  }
}

export function toCorrectionContext(app: ApplicantApplication): CorrectionContext {
  const fields = app.correctionFields;
  return {
    reason: app.rejectionReason,
    fieldLabelKeys: fields.map((key) => correctionFieldInfo(key)?.labelKey ?? key),
    steps: [...new Set(fields.map((key) => correctionFieldInfo(key)?.step ?? 0))].filter(
      (step) => step > 0,
    ),
    round: app.reviews.filter((r) => r.decision === 'rejected').length || 1,
  };
}
