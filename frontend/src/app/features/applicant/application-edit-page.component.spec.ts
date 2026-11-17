import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { NEVER, Observable, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FeatureFlagKey } from '../../core/services/feature-flag.service';
import { FeatureFlagService } from '../../core/services/feature-flag.service';
import { RegistrationService } from '../../core/services/registration.service';
import { RegistrationDraftService } from '../public-registration/services/registration-draft.service';
import { ApplicantService, type ApplicantApplication } from './applicant.service';
import { ApplicationEditPageComponent } from './application-edit-page.component';

function create(
  getApplication: () => Observable<ApplicantApplication>,
  flags: FeatureFlagKey[] = [],
) {
  const enabled = new Set(flags);
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      provideTranslateService(),
      {
        provide: FeatureFlagService,
        useValue: { isEnabled: (k: FeatureFlagKey) => enabled.has(k) },
      },
      { provide: ApplicantService, useValue: { getApplication } },
    ],
  });
  const configSpy = vi
    .spyOn(TestBed.inject(RegistrationService), 'getRegistrationConfig')
    .mockReturnValue(NEVER);
  const saveSpy = vi.spyOn(TestBed.inject(RegistrationDraftService), 'saveNow');
  const fixture = TestBed.createComponent(ApplicationEditPageComponent);
  fixture.detectChanges();
  return { page: fixture.componentInstance, configSpy, saveSpy };
}

describe('ApplicationEditPageComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('never writes the applicant data into the public registration draft', () => {
    const { page, saveSpy } = create(() => NEVER);

    page.goToStep(page.currentStep);

    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('keeps the wizard disabled when the stored application fails to load', () => {
    const { page } = create(() => throwError(() => new Error('offline')));

    expect(page.feeLoading()).toBe(true);
    expect(page.serverError).toBeTruthy();
  });

  it('loads the registration config in the non-simplified UI too', () => {
    const { configSpy } = create(() => NEVER);

    expect(configSpy).toHaveBeenCalledTimes(1);
  });
});
