import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormBuilder, FormGroup } from '@angular/forms';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import {
  applicableDocsArray,
  buildApplicableDocGroup,
  buildPropertyGroup,
  buildRegistrationForm,
  propertiesArray,
} from '../../registration-form.builder';
import { ReviewSummaryComponent } from './review-summary.component';

describe('ReviewSummaryComponent', () => {
  const fb = new FormBuilder();
  let form: FormGroup;

  function create(simplified: boolean): ComponentFixture<ReviewSummaryComponent> {
    form = buildRegistrationForm(fb);
    form.patchValue({
      fullName: 'রহিম',
      fatherOrHusband: 'করিম',
      mother: 'রহিমা',
      dob: '1990-02-03',
      nid: '1234567890',
      mobile: '+8801711111111',
      hasWhatsapp: true,
      email: 'a@b.co',
      currentAddress: { house: '১২', road: 'মেইন রোড', postOffice: 'সাভার', upazila: 'সাভার', district: 'ঢাকা', division: 'ঢাকা' },
      permanentAddress: { house: '৫', road: '', postOffice: 'সাভার', upazila: 'সাভার', district: 'ঢাকা', division: 'ঢাকা' },
      urgentContactName: 'করিম',
      admissionFee: 500,
      subscription: 60,
      paymentMethod: 'bkash',
      receiptNo: 'T123',
      declarationAccepted: true,
    });
    for (const khatian of ['২২১৪', '৩৩০১']) {
      const group = buildPropertyGroup(fb);
      group.patchValue({
        propertyType: ['জমি'],
        khatianNo: khatian,
        dagNo: { cs: '৩৪৫', rs: '' },
        dagUnknown: khatian === '৩৩০১',
        landQuantity: '২.৫',
        myShareQuantity: '১',
        ownership: 'একক',
      });
      applicableDocsArray(group).push(buildApplicableDocGroup(fb, 'খতিয়ান/পর্চা'));
      propertiesArray(form).push(group);
    }
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('bn', bn);
    translate.use('bn');
    const fixture = TestBed.createComponent(ReviewSummaryComponent);
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('simplified', simplified);
    fixture.detectChanges();
    return fixture;
  }

  it('legacy: keeps the four-card summary with "সম্পাদনা করুন"', () => {
    const root = create(false).nativeElement as HTMLElement;
    expect(root.textContent).toContain('সম্পাদনা করুন');
    expect(root.textContent).not.toContain('পরিবর্তন করুন');
  });

  it('simplified: lists every property with its khatian number and amounts', () => {
    const text = (create(true).nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('সম্পত্তি ১');
    expect(text).toContain('সম্পত্তি ২');
    expect(text).toContain('২২১৪');
    expect(text).toContain('৩৩০১');
    expect(text).toContain('দাগ জানা নেই, অফিস লিখে দেবে');
  });

  it('simplified: shows plain-language answers (Bangla digits, taka, method name)', () => {
    const text = (create(true).nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('রহিম');
    expect(text).toContain('বিকাশ');
    expect(text).toContain('৳ ৫০০');
    expect(text).toContain('T123');
    expect(text).toContain('১২৩৪৫৬৭৮৯০');
  });

  it('simplified: every section has a "পরিবর্তন করুন" button that opens its step', () => {
    const fixture = create(true);
    const steps: number[] = [];
    fixture.componentInstance.editStep.subscribe((s) => steps.push(s));
    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[data-testid^="edit-"]')];
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(Array(5).fill('পরিবর্তন করুন'));
    buttons.forEach((b) => b.click());
    expect(steps).toEqual([1, 2, 3, 4, 5]);
    buttons.forEach((b) => expect(b.classList.contains('tap-48')).toBe(true));
  });
});
