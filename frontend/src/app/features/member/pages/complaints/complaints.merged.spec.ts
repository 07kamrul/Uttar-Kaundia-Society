import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { FeatureFlagService } from '../../../../core/services/feature-flag.service';
import { GovernanceService } from '../../../../core/services/governance.service';
import { LanguageService } from '../../../../core/services/language.service';
import { ComplaintsComponent } from './complaints.component';
import { signal } from '@angular/core';

function create(merged: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideTranslateService(),
      provideRouter([]),
      { provide: FeatureFlagService, useValue: { isEnabled: (k: string) => merged && k === 'nav_merged_entries' } },
      { provide: LanguageService, useValue: { lang: signal('bn') } },
      {
        provide: GovernanceService,
        useValue: {
          complaintConstants: () => of({ anti_retaliation_notice: 'x' }),
          myComplaints: () => of([]),
        },
      },
    ],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const f = TestBed.createComponent(ComplaintsComponent);
  f.detectChanges();
  return f.nativeElement as HTMLElement;
}

describe('ComplaintsComponent (nav_merged_entries)', () => {
  it('links to the service standard from the complaints page once it left the menu', () => {
    expect(create(true).querySelector('a[href="/service-standard"]')).not.toBeNull();
  });

  it('does not add that link while the flag is off', () => {
    expect(create(false).querySelector('a[href="/service-standard"]')).toBeNull();
  });
});
