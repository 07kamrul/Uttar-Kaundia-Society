import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { MAX_PROPERTY_COUNT } from '../../../../core/models/registration.model';
import { ConfigListService } from '../../../../core/services/config-list.service';
import { buildPropertyGroup } from '../../registration-form.builder';
import { NO_UI_FLAGS, type RegistrationUiFlags } from '../../registration-ui-flags';
import { PropertyListComponent } from './property-list.component';

describe('PropertyListComponent batch 1 flags', () => {
  let form: FormGroup;
  const fb = new FormBuilder();

  function create(ui: Partial<RegistrationUiFlags> = {}, initial = 1): ComponentFixture<PropertyListComponent> {
    form = fb.group({
      propertyCount: [null],
      properties: fb.array(Array.from({ length: initial }, () => buildPropertyGroup(fb))),
    });
    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
      providers: [
        provideTranslateService(),
        { provide: ConfigListService, useValue: { getValues: (_: string, d: string[]) => of(d) } },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('bn', bn);
    translate.use('bn');
    const fixture = TestBed.createComponent(PropertyListComponent);
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('properties', form.get('properties') as FormArray);
    fixture.componentRef.setInput('ui', { ...NO_UI_FLAGS, ...ui });
    fixture.detectChanges();
    return fixture;
  }

  const q = <T extends HTMLElement>(f: ComponentFixture<unknown>, sel: string) =>
    f.nativeElement.querySelector(sel) as T | null;
  const items = () => (form.get('properties') as FormArray).length;

  describe('reg_add_property_button', () => {
    it('flag off: keeps the count toolbar and has no "add another" button', () => {
      const f = create();
      expect(q(f, '.property-toolbar')).not.toBeNull();
      expect(q(f, '[data-testid="add-another"]')).toBeNull();
    });

    it('replaces the count stepper with "+ আরেকটি সম্পত্তি যোগ করুন"', () => {
      const f = create({ addPropertyButton: true });
      expect(q(f, '.property-toolbar')).toBeNull();
      const add = q<HTMLButtonElement>(f, '[data-testid="add-another"]')!;
      expect(add.textContent).toContain('আরেকটি সম্পত্তি যোগ করুন');
      expect(add.textContent).toContain('+');
      expect(add.classList.contains('tap-48')).toBe(true);
      add.click();
      f.detectChanges();
      expect(items()).toBe(2);
      expect(form.get('propertyCount')!.value).toBe(2);
    });

    it('stops at nine properties and says so', () => {
      const f = create({ addPropertyButton: true }, MAX_PROPERTY_COUNT);
      const add = q<HTMLButtonElement>(f, '[data-testid="add-another"]')!;
      expect(add.disabled).toBe(true);
      expect(f.nativeElement.textContent).toContain('সর্বোচ্চ ৯টি সম্পত্তি দেওয়া যায়।');
      add.click();
      expect(items()).toBe(MAX_PROPERTY_COUNT);
    });

    it('shows a remove button with text on each property once there are two', () => {
      const f = create({ addPropertyButton: true }, 2);
      const removes = f.nativeElement.querySelectorAll('[data-testid="remove-this-property"]') as NodeListOf<HTMLButtonElement>;
      expect(removes.length).toBe(2);
      expect(removes[0].textContent).toContain('এই সম্পত্তি মুছে দিন');
      expect(removes[0].classList.contains('tap-48')).toBe(true);
      removes[1].click();
      f.detectChanges();
      expect(items()).toBe(1);
    });

    it('offers no remove button for the only property', () => {
      const f = create({ addPropertyButton: true }, 1);
      expect(q(f, '[data-testid="remove-this-property"]')).toBeNull();
    });
  });

  describe('reg_dag_unknown', () => {
    it('flag off: no checkbox and no help link', () => {
      const f = create();
      expect(q(f, '[data-testid="dag-unknown"]')).toBeNull();
      expect(q(f, '[data-testid="dag-help-link"]')).toBeNull();
    });

    it('shows the checkbox; ticking sets dagUnknown and clears the dag boxes', () => {
      const f = create({ dagUnknown: true });
      const group = (form.get('properties') as FormArray).at(0);
      group.get('dagNo')!.patchValue({ cs: '12', rs: '34' });
      const box = q<HTMLInputElement>(f, '[data-testid="dag-unknown"]')!;
      expect(f.nativeElement.textContent).toContain('আমি দাগ জানি না — অফিস সাহায্য করবে');
      box.click();
      f.detectChanges();
      expect(group.get('dagUnknown')!.value).toBe(true);
      expect(group.get('dagNo')!.value).toEqual({ cs: '', rs: '' });
      expect(q<HTMLInputElement>(f, '#prop0_dagNoCs')!.disabled).toBe(true);
      box.click();
      f.detectChanges();
      expect(group.get('dagUnknown')!.value).toBe(false);
      expect(q<HTMLInputElement>(f, '#prop0_dagNoCs')!.disabled).toBe(false);
    });

    it('opens the bottom sheet "আমার দাগ কোথায় পাব?" with the sample porcha', () => {
      const f = create({ dagUnknown: true });
      const link = q<HTMLButtonElement>(f, '[data-testid="dag-help-link"]')!;
      expect(link.textContent).toContain('আমার দাগ কোথায় পাব?');
      expect(link.classList.contains('tap-48')).toBe(true);
      expect(q(f, '[role=dialog]')).toBeNull();
      link.click();
      f.detectChanges();
      expect(q(f, '[role=dialog] svg')).not.toBeNull();
      q<HTMLButtonElement>(f, '[data-testid="close-sheet"]')!.click();
      f.detectChanges();
      expect(q(f, '[role=dialog]')).toBeNull();
    });
  });

  describe('reg_simplified_ui number fields', () => {
    it('flag off: no numeric keyboard hint on khatian and dag', () => {
      const f = create();
      expect(q(f, '#prop0_khatianNo')!.getAttribute('inputmode')).toBeNull();
    });

    it('keeps khatian/dag typeable (text, so a slash works), decimal for land, and turns Bangla digits into ASCII', () => {
      const f = create({ simplified: true });
      const group = (form.get('properties') as FormArray).at(0);
      const fields: [string, string, string][] = [
        ['#prop0_khatianNo', 'khatianNo', '২২১৪'],
        ['#prop0_dagNoCs', 'dagNo.cs', '৩৪৫'],
        ['#prop0_dagNoRs', 'dagNo.rs', '৪৫৬'],
        ['#prop0_landQuantity', 'landQuantity', '২.৫'],
        ['#prop0_myShareQuantity', 'myShareQuantity', '১.২৫'],
      ];
      for (const [sel, path, typed] of fields) {
        const input = q<HTMLInputElement>(f, sel)!;
        expect(input.getAttribute('inputmode')).toBe(path === 'landQuantity' || path === 'myShareQuantity' ? 'decimal' : 'text');
        input.value = typed;
        input.dispatchEvent(new Event('input'));
        expect(String(group.get(path)!.value)).toMatch(/^[0-9.]+$/);
      }
      expect(group.get('khatianNo')!.value).toBe('2214');
      expect(group.get('landQuantity')!.value).toBe('2.5');
    });

    it('shows the khatian example', () => {
      const f = create({ simplified: true });
      expect(q<HTMLInputElement>(f, '#prop0_khatianNo')!.placeholder).toBe('যেমন: ২২১৪');
    });
  });

  describe('reg_min_one_proof', () => {
    it('flag off: documents need to be ticked first', () => {
      const f = create();
      expect(q(f, '[data-testid="proof-slot"]')).toBeNull();
    });

    it('shows all four document types as upload slots without ticking', () => {
      const f = create({ minOneProof: true });
      const slots = f.nativeElement.querySelectorAll('[data-testid="proof-slot"]');
      expect(slots.length).toBe(4);
      expect(f.nativeElement.textContent).toContain('অন্তত একটি দিন');
    });

    it('attaching a file to any slot creates its document entry', async () => {
      const f = create({ minOneProof: true });
      const input = f.nativeElement.querySelectorAll('[data-testid="proof-slot"] input[type=file]')[1] as HTMLInputElement;
      const file = new File([new Uint8Array([1, 2, 3])], 'rasid.png', { type: 'image/png' });
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change'));
      await new Promise((resolve) => setTimeout(resolve, 50));
      const docs = (form.get('properties') as FormArray).at(0).get('applicableDocs')!.value;
      expect(docs).toHaveLength(1);
      expect(docs[0].fileName).toBe('rasid.png');
      expect(docs[0].fileDataUrl).toMatch(/^data:image\/png;base64,/);
    });
  });
});
