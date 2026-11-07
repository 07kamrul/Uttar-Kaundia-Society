import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../../public/i18n/bn.json';
import { ReportDialogComponent } from './report-dialog.component';

function setup(inputs: { note?: string; sending?: boolean; sent?: boolean } = {}) {
  TestBed.configureTestingModule({
    imports: [ReportDialogComponent],
    providers: [provideTranslateService()],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const fixture = TestBed.createComponent(ReportDialogComponent);
  fixture.componentRef.setInput('note', inputs.note ?? '');
  fixture.componentRef.setInput('sending', inputs.sending ?? false);
  fixture.componentRef.setInput('sent', inputs.sent ?? false);
  const cmp = fixture.componentInstance;
  const spies = { send: vi.fn(), cancelled: vi.fn(), noteChange: vi.fn() };
  cmp.send.subscribe(spies.send);
  cmp.cancelled.subscribe(spies.cancelled);
  cmp.noteChange.subscribe(spies.noteChange);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const sendBtn = () => el.querySelector<HTMLButtonElement>('[data-testid="report-send"]');
  return { el, spies, sendBtn };
}

describe('ReportDialogComponent', () => {
  it('is a labelled modal dialog', () => {
    const { el } = setup();
    const dialog = el.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(el.querySelector('#' + dialog.getAttribute('aria-labelledby'))).not.toBeNull();
  });

  it('disables send for a blank note', () => {
    expect(setup({ note: '   ' }).sendBtn()!.disabled).toBe(true);
  });

  it('disables send while sending', () => {
    expect(setup({ note: 'x', sending: true }).sendBtn()!.disabled).toBe(true);
  });

  it('emits send when a note is present', () => {
    const { sendBtn, spies } = setup({ note: 'Fence is wrong' });
    sendBtn()!.click();
    expect(spies.send).toHaveBeenCalledTimes(1);
  });

  it('emits the typed note', () => {
    const { el, spies } = setup();
    const area = el.querySelector('textarea')!;
    area.value = 'abc';
    area.dispatchEvent(new Event('input'));
    expect(spies.noteChange).toHaveBeenCalledWith('abc');
  });

  it('cancels on Escape and on backdrop click', () => {
    const { el, spies } = setup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    (el.querySelector('.modal-backdrop') as HTMLElement).click();
    expect(spies.cancelled).toHaveBeenCalledTimes(2);
  });

  it('shows the thank-you state without a send button once sent', () => {
    const { el, sendBtn } = setup({ sent: true });
    expect(el.querySelector('.report-done')).not.toBeNull();
    expect(sendBtn()).toBeNull();
  });
});
