import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PasswordFieldComponent } from '../../../../shared/password-field/password-field.component';
import { AuthService } from '../../../../core/services/auth.service';
import { FeatureFlagService } from '../../../../core/services/feature-flag.service';
import { errorCodeOf } from '../../../../core/errors/user-error';
import { passwordPolicyFor } from '../../../member/pages/change-password/change-password.component';

/** The server codes the password pages map to their own plain message. */
const PASSWORD_SERVER_CODES: ReadonlySet<string> = new Set([
  'PASSWORD_TOO_SHORT',
  'PASSWORD_TOO_COMMON',
  'PASSWORD_SAME_AS_CURRENT',
  'PASSWORD_TOO_WEAK',
]);

@Component({
  selector: 'app-reset-password',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ReactiveFormsModule, TranslatePipe, PasswordFieldComponent],
  templateUrl: './reset-password.component.html',
})
export class ResetPasswordComponent {
  token = '';
  tokenMissing = false;
  form: FormGroup;
  error = '';
  submitting = false;
  submitAttempted = false;
  resetDone = false;
  /** password_policy_v2: length-only client check, different hint. */
  readonly policyV2: boolean;

  private readonly cdr = inject(ChangeDetectorRef);

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private route: ActivatedRoute,
    private translate: TranslateService,
    private flags: FeatureFlagService,
  ) {
    this.policyV2 = this.flags.isEnabled('password_policy_v2');
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    this.tokenMissing = this.token.trim().length === 0;
    this.form = this.fb.group(
      {
        // v1 = today: no client-side policy check on reset (server-only).
        // v2 = length-only check, so the obvious failures never reach the API.
        newPassword: ['', this.policyV2 ? [Validators.required, passwordPolicyFor(true)] : [Validators.required]],
        confirmPassword: ['', Validators.required],
      },
      { validators: (group) =>
        group.value.newPassword !== group.value.confirmPassword
          ? { mismatch: true }
          : null,
      },
    );
  }

  showError(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!control && control.invalid && (control.touched || this.submitAttempted);
  }

  errorMessage(controlName: string): string {
    if (controlName === 'confirmPassword' && this.form.hasError('mismatch')) {
      return this.translate.instant('auth.resetPassword.mismatchError');
    }
    return this.translate.instant('auth.resetPassword.passwordRequiredError');
  }

  passwordHintVisible(): boolean {
    const control = this.form.get('newPassword');
    return !!control && control.invalid && (control.touched || this.submitAttempted);
  }

  /** Flag-aware hint: v1 mentions the digit, v2 only the length. */
  get hintKey(): string {
    return this.policyV2 ? 'auth.resetPassword.passwordHintV2' : 'auth.resetPassword.passwordHint';
  }

  onSubmit(): void {
    this.submitAttempted = true;
    if (this.form.invalid) return;
    this.error = '';
    this.submitting = true;
    this.auth.resetPassword(this.token, this.form.value.newPassword).subscribe({
      next: () => {
        this.submitting = false;
        this.resetDone = true;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.submitting = false;
        const code = errorCodeOf(err);
        if (err?.status === 422 && code !== null && PASSWORD_SERVER_CODES.has(code)) {
          this.error = this.translate.instant(`errors.code.${code}`);
        } else if (err?.status === 422) {
          this.error = this.translate.instant('auth.resetPassword.weakPasswordError');
        } else if (err?.status === 400) {
          this.error = this.translate.instant('auth.resetPassword.invalidTokenError');
        } else {
          this.error = this.translate.instant('auth.resetPassword.errors.resetFailed');
        }
        this.cdr.markForCheck();
      },
    });
  }
}
