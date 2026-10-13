import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { ConfirmationComponent } from './confirmation.component';

describe('ConfirmationComponent', () => {
  function create(simplified: boolean): ComponentFixture<ConfirmationComponent> {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('bn', bn);
    translate.use('bn');
    const fixture = TestBed.createComponent(ConfirmationComponent);
    fixture.componentRef.setInput('submissionId', '42');
    fixture.componentRef.setInput('simplified', simplified);
    fixture.detectChanges();
    return fixture;
  }

  it('keeps the legacy modal when the simplified UI is off', () => {
    const root = create(false).nativeElement as HTMLElement;
    expect(root.querySelector('.modal-backdrop')).not.toBeNull();
    expect(root.querySelector('.success-screen')).toBeNull();
  });

  it('shows a full screen with three plain lines and the reference', () => {
    const root = create(true).nativeElement as HTMLElement;
    expect(root.querySelector('.success-screen')).not.toBeNull();
    const text = root.textContent ?? '';
    expect(text).toContain('আবেদন জমা হয়েছে');
    expect(text).toContain('অফিস আপনার তথ্য যাচাই করবে');
    expect(text).toContain('আনুমানিক ২০ কর্মদিবসের মধ্যে জানানো হবে');
    expect(text).toContain('42');
  });

  it('copies the reference and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    try {
      const fixture = create(true);
      const copy = fixture.nativeElement.querySelector('[data-testid="copy-reference"]') as HTMLButtonElement;
      expect(copy.textContent).toContain('কপি');
      copy.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
      expect(writeText).toHaveBeenCalledWith('42');
      expect(fixture.nativeElement.textContent).toContain('কপি হয়েছে');
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('emits acknowledge from the done button', () => {
    const fixture = create(true);
    let acknowledged = false;
    fixture.componentInstance.acknowledge.subscribe(() => (acknowledged = true));
    (fixture.nativeElement.querySelector('[data-testid="done"]') as HTMLButtonElement).click();
    expect(acknowledged).toBe(true);
  });
});
