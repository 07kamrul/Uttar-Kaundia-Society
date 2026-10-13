import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { GovernanceService } from '../../../../core/services/governance.service';
import { MembershipComponent } from './membership.component';

describe('MembershipComponent application form - mobile field', () => {
  async function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService({ fallbackLang: 'en' }),
        {
          provide: GovernanceService,
          useValue: {
            myApplications: () => of([]),
            myAppeals: () => of([]),
            myWaivers: () => of([]),
            myActions: () => of([]),
          },
        },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', { phoneInput: { invalid: 'Number is not correct' } });
    translate.use('en');
    const fixture = TestBed.createComponent(MembershipComponent);
    fixture.detectChanges();
    // ngModel registers its control on a microtask; wait so typing reaches the model.
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  async function typeMobile(fixture: Awaited<ReturnType<typeof setup>>, text: string) {
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input#mobile')!;
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('uses the international phone input (country picker + tel keyboard), not a plain text box', async () => {
    const fixture = await setup();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-phone-input')).not.toBeNull();
    const input = root.querySelector<HTMLInputElement>('input#mobile')!;
    expect(input.type).toBe('tel');
    expect(input.getAttribute('inputmode')).toBe('tel');
    expect(root.querySelector('.phone-country-trigger')).not.toBeNull();
  });

  it('stores the number as E.164, accepting Bangla digits', async () => {
    const fixture = await setup();
    await typeMobile(fixture, '০১৭১২৩৪৫৬৭৮');
    expect(fixture.componentInstance.apply.mobile).toBe('+8801712345678');
  });

  it('shows the invalid-number message for an impossible number', async () => {
    const fixture = await setup();
    await typeMobile(fixture, '0171');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Number is not correct');
  });

  it('shows no message for a valid number', async () => {
    const fixture = await setup();
    await typeMobile(fixture, '01712345678');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Number is not correct');
  });
});
