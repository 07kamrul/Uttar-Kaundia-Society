import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { AttachmentService } from '../../../../core/services/attachment.service';
import { MemberProfile, MemberService } from '../../../../core/services/member.service';
import { IdCardModalComponent } from './id-card-modal.component';

const profile = {
  memberId: 'UKAMKS-1',
  fullName: 'JANE DOE',
  status: 'approved',
  dob: '1990-01-01',
  mobile: '01712345678',
  nid: '1234567890',
  fatherOrHusband: 'John Doe',
  urgentContactName: 'John',
  urgentContactMobile: '+966501234567',
  receiptNo: '1',
  submissionDate: '2026-01-01',
} as unknown as MemberProfile;

describe('IdCardModalComponent phone display (text only)', () => {
  function setup(lang: 'bn' | 'en') {
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService({ fallbackLang: 'bn' }),
        { provide: MemberService, useValue: { getProfile: () => of(profile) } },
        { provide: AttachmentService, useValue: { load: () => Promise.reject(new Error('unused')) } },
      ],
    });
    TestBed.inject(TranslateService).use(lang);
    const fixture = TestBed.createComponent(IdCardModalComponent);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    fixture.detectChanges();
    return fixture;
  }

  it('shows the member mobile in international format on both sides of the card', () => {
    const fixture = setup('en');
    const text: string = fixture.nativeElement.textContent;
    expect(text.split('+880 1712 345678').length - 1).toBe(2);
    expect(text).not.toContain('01712345678');
  });

  it('formats the emergency contact number too', () => {
    const fixture = setup('en');
    expect(fixture.nativeElement.textContent).toContain('John · +966 50 123 4567');
  });

  it('uses Bangla digits in bn mode', () => {
    const fixture = setup('bn');
    expect(fixture.nativeElement.textContent).toContain('+৮৮০ ১৭১২ ৩৪৫৬৭৮');
  });

  it('has no call, WhatsApp or copy controls on the card', () => {
    const fixture = setup('en');
    expect(fixture.nativeElement.querySelector('a[href^="tel:"], a[href^="https://wa.me"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-phone-link')).toBeNull();
  });

  it('exposes the same text for the exported PNG', () => {
    const fixture = setup('en');
    expect(fixture.componentInstance.phoneText('01712345678')).toBe('+880 1712 345678');
    expect(fixture.componentInstance.phoneText('')).toBe('—');
    expect(fixture.componentInstance.phoneText(undefined)).toBe('—');
  });
});
