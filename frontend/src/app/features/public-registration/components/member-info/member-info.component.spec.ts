import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormBuilder, FormGroup } from '@angular/forms';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { buildRegistrationForm } from '../../registration-form.builder';
import { NO_UI_FLAGS, type RegistrationUiFlags } from '../../registration-ui-flags';
import { MemberInfoComponent } from './member-info.component';

describe('MemberInfoComponent', () => {
  let form: FormGroup;

  function create(ui: Partial<RegistrationUiFlags> = {}): ComponentFixture<MemberInfoComponent> {
    form = buildRegistrationForm(new FormBuilder());
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('bn', bn);
    translate.use('bn');
    const fixture = TestBed.createComponent(MemberInfoComponent);
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('ui', { ...NO_UI_FLAGS, ...ui });
    fixture.detectChanges();
    return fixture;
  }

  const q = (f: ComponentFixture<MemberInfoComponent>, sel: string) =>
    f.nativeElement.querySelector(sel) as HTMLElement | null;

  function typeInto(f: ComponentFixture<MemberInfoComponent>, sel: string, text: string): void {
    const input = q(f, sel) as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    f.detectChanges();
  }

  describe('all flags off', () => {
    it('keeps the date picker, the nationality field and no WhatsApp toggle', () => {
      const f = create();
      expect(q(f, 'app-date-picker')).not.toBeNull();
      expect(q(f, 'app-dob-select')).toBeNull();
      expect(q(f, '#nationality')).not.toBeNull();
      expect(q(f, '[data-testid="whatsapp-toggle"]')).toBeNull();
      expect(q(f, '#nid')!.getAttribute('inputmode')).toBeNull();
    });

    it('does not rewrite Bangla digits typed into NID', () => {
      const f = create();
      typeInto(f, '#nid', '১২৩');
      expect(form.get('nid')!.value).toBe('১২৩');
    });
  });

  describe('reg_simplified_ui', () => {
    it('uses day / month / year selects for the date of birth', () => {
      const f = create({ simplified: true });
      expect(q(f, 'app-dob-select')).not.toBeNull();
      expect(q(f, 'app-date-picker')).toBeNull();
    });

    it('gives NID a numeric keyboard and turns Bangla digits into ASCII', () => {
      const f = create({ simplified: true });
      expect(q(f, '#nid')!.getAttribute('inputmode')).toBe('numeric');
      typeInto(f, '#nid', '১২৩৪৫৬৭৮৯০');
      expect(form.get('nid')!.value).toBe('1234567890');
      expect(form.get('nid')!.valid).toBe(true);
    });

    it('offers the WhatsApp toggle and stores has_whatsapp', () => {
      const f = create({ simplified: true });
      const toggle = q(f, '[data-testid="whatsapp-toggle"]') as HTMLInputElement;
      expect(toggle).not.toBeNull();
      expect(f.nativeElement.textContent).toContain('এই নম্বরে হোয়াটসঅ্যাপ আছে');
      toggle.click();
      expect(form.get('hasWhatsapp')!.value).toBe(true);
      toggle.click();
      expect(form.get('hasWhatsapp')!.value).toBe(false);
    });
  });

  describe('reg_hide_nationality', () => {
    it('hides the nationality field and keeps the default', () => {
      const f = create({ hideNationality: true });
      expect(q(f, '#nationality')).toBeNull();
      expect(form.get('nationality')!.value).toBe('বাংলাদেশী');
    });

    it('reveals it only when "অন্য দেশের নাগরিক" is ticked, and resets on untick', () => {
      const f = create({ hideNationality: true });
      const tick = q(f, '[data-testid="foreign-national"]') as HTMLInputElement;
      expect(f.nativeElement.textContent).toContain('আমি অন্য দেশের নাগরিক');
      tick.click();
      f.detectChanges();
      expect(q(f, '#nationality')).not.toBeNull();
      typeInto(f, '#nationality', 'ভারতীয়');
      tick.click();
      f.detectChanges();
      expect(q(f, '#nationality')).toBeNull();
      expect(form.get('nationality')!.value).toBe('বাংলাদেশী');
    });

    it('starts open when a restored draft already has another nationality', () => {
      form = buildRegistrationForm(new FormBuilder());
      form.patchValue({ nationality: 'ভারতীয়' });
      TestBed.configureTestingModule({ providers: [provideTranslateService()] });
      const f = TestBed.createComponent(MemberInfoComponent);
      f.componentRef.setInput('form', form);
      f.componentRef.setInput('ui', { ...NO_UI_FLAGS, hideNationality: true });
      f.detectChanges();
      expect(q(f, '#nationality')).not.toBeNull();
    });
  });

  it('shows a compressing hint while the photo is being made smaller', () => {
    const f = create({ simplified: true });
    f.componentRef.setInput('photoBusy', true);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('ছবি ছোট করা হচ্ছে');
  });
});
