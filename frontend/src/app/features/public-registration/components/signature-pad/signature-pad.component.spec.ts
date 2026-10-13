import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormBuilder, FormGroup } from '@angular/forms';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { SignaturePadComponent } from './signature-pad.component';

describe('SignaturePadComponent', () => {
  let form: FormGroup;

  function create(initial = ''): ComponentFixture<SignaturePadComponent> {
    form = new FormBuilder().group({ memberSignature: [initial] });
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('bn', bn);
    translate.use('bn');
    const fixture = TestBed.createComponent(SignaturePadComponent);
    fixture.componentRef.setInput('form', form);
    fixture.detectChanges();
    return fixture;
  }

  it('is labelled optional and has a canvas, a clear button and a photo upload with text', () => {
    const root = create().nativeElement as HTMLElement;
    expect(root.textContent).toContain('স্বাক্ষর (ইচ্ছা হলে)');
    expect(root.querySelector('canvas')).not.toBeNull();
    expect(root.textContent).toContain('মুছে ফেলুন');
    expect(root.textContent).toContain('সইয়ের ছবি দিন');
  });

  it('never makes the signature required', () => {
    create();
    expect(form.get('memberSignature')!.valid).toBe(true);
    expect(form.valid).toBe(true);
  });

  it('stores an uploaded signature photo as a data URL', async () => {
    const fixture = create();
    const input = fixture.nativeElement.querySelector('input[type=file]') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], 'sig.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(String(form.get('memberSignature')!.value)).toMatch(/^data:image\/png;base64,/);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('স্বাক্ষর নেওয়া হয়েছে');
  });

  it('clear empties the stored signature', () => {
    const fixture = create('data:image/png;base64,AAAA');
    const clear = [...fixture.nativeElement.querySelectorAll('button')].find((b) =>
      (b as HTMLElement).textContent?.includes('মুছে ফেলুন'),
    ) as HTMLButtonElement;
    clear.click();
    expect(form.get('memberSignature')!.value).toBe('');
  });

  it('gives every control at least a 48px tap target', () => {
    const root = create().nativeElement as HTMLElement;
    const controls = root.querySelectorAll('button, label.btn');
    expect(controls.length).toBeGreaterThan(0);
    controls.forEach((el) => expect(el.classList.contains('tap-48')).toBe(true));
  });
});
