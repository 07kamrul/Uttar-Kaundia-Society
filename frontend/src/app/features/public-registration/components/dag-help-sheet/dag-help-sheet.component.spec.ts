import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { DagHelpSheetComponent } from './dag-help-sheet.component';

describe('DagHelpSheetComponent', () => {
  function create(open: boolean): ComponentFixture<DagHelpSheetComponent> {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('bn', bn);
    translate.use('bn');
    const fixture = TestBed.createComponent(DagHelpSheetComponent);
    fixture.componentRef.setInput('open', open);
    fixture.detectChanges();
    return fixture;
  }

  it('renders nothing while closed', () => {
    expect((create(false).nativeElement as HTMLElement).querySelector('[role=dialog]')).toBeNull();
  });

  it('opens as a labelled dialog explaining where each number is', () => {
    const root = create(true).nativeElement as HTMLElement;
    const dialog = root.querySelector('[role=dialog]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const text = root.textContent ?? '';
    expect(text).toContain('দাগ ও খতিয়ান নম্বর কোথায় থাকে');
    expect(text).toContain('খতিয়ান নম্বর: কাগজের উপরের দিকে');
    expect(text).toContain('সিএস দাগ: পুরনো জরিপের নম্বর');
    expect(text).toContain('আরএস দাগ: পরের জরিপের নম্বর');
  });

  it('draws a schematic porcha with the khatian, CS dag and RS dag fields highlighted', () => {
    const root = create(true).nativeElement as HTMLElement;
    const svg = root.querySelector('svg') as SVGElement;
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.querySelectorAll('[data-highlight]').length).toBe(3);
    // Schematic only: no real numbers, just placeholders.
    expect(svg.textContent).not.toMatch(/[0-9০-৯]{3,}/);
  });

  it('closes from the close button and on Escape', () => {
    const fixture = create(true);
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    const button = fixture.nativeElement.querySelector('[data-testid="close-sheet"]') as HTMLButtonElement;
    expect(button.classList.contains('tap-48')).toBe(true);
    expect(button.textContent).toContain('বন্ধ করুন');
    button.click();
    fixture.nativeElement.querySelector('[role=dialog]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toBe(2);
  });
});
