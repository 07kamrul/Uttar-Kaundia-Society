import { HttpErrorResponse } from '@angular/common/http';
import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PasswordFieldComponent } from '../../../../shared/password-field/password-field.component';
import { AuthService } from '../../../../core/services/auth.service';
import { FeatureFlagService } from '../../../../core/services/feature-flag.service';
import { errorCodeOf } from '../../../../core/errors/user-error';

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ReactiveFormsModule, TranslatePipe, PasswordFieldComponent],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  form: FormGroup;
  error = '';
  submitting = false;
  submitAttempted = false;

  private readonly cdr = inject(ChangeDetectorRef);

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private translate: TranslateService,
    private flags: FeatureFlagService,
  ) {
    this.form = this.fb.group({
      identifier: ['', Validators.required],
      password: ['', Validators.required],
    });
  }

  /**
   * login_by_phone: mobile and member email are accepted identifiers, so the
   * label, helper and error wording all switch with the flag.
   */
  get byPhone(): boolean {
    return this.flags.isEnabled('login_by_phone');
  }

  get identifierLabel(): string {
    return this.byPhone ? 'auth.login.identifierLabelV2' : 'auth.login.identifierLabel';
  }

  showError(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!control && control.invalid && (control.touched || this.submitAttempted);
  }

  errorMessage(controlName: string): string {
    const messages: Record<string, string> = {
      identifier: this.translate.instant('auth.login.identifierRequiredError'),
      password: this.translate.instant('auth.login.passwordRequiredError'),
    };
    return messages[controlName] ?? '';
  }

  /**
   * Status/code based message for a failed login. With the flag on a 409
   * carrying LOGIN_AMBIGUOUS_IDENTIFIER asks for email/member ID; the server's
   * raw detail text is never shown.
   */
  private loginError(err: unknown): string {
    if (!this.byPhone) return this.translate.instant('auth.login.loginFailedError');
    const status = err instanceof HttpErrorResponse ? err.status : 0;
    if (status === 429) return this.translate.instant('auth.login.errorRateLimited');
    if (status === 409 && errorCodeOf(err) === 'LOGIN_AMBIGUOUS_IDENTIFIER') {
      return this.translate.instant('errors.code.LOGIN_AMBIGUOUS_IDENTIFIER');
    }
    return this.translate.instant('auth.login.errorInvalidV2');
  }

  onSubmit(): void {
    this.submitAttempted = true;
    if (this.form.invalid) return;
    this.error = '';
    this.submitting = true;
    const { identifier, password } = this.form.value;
    this.auth.login(identifier.trim().toLowerCase(), password).subscribe({
      next: (res) => {
        this.submitting = false;
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        if (res.must_change_password) {
          this.router.navigate(['/change-password']);
        } else if (returnUrl) {
          this.router.navigateByUrl(returnUrl);
        } else {
          this.router.navigate(['/dashboard']);
        }
        this.cdr.markForCheck();
      },
      error: (err: unknown) => {
        this.submitting = false;
        this.error = this.loginError(err);
        this.cdr.markForCheck();
      },
    });
  }
}
