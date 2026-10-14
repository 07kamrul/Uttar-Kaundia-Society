import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../public/i18n/bn.json';
import { LoadErrorComponent } from './load-error.component';

@Component({
  imports: [LoadErrorComponent],
  template: `<app-load-error [error]="error()" fallbackKey="member.profile.loadError" (retry)="retry()" />`,
})
class Host {
  readonly error = signal<unknown>(null);
  retry = vi.fn();
}

function setup(error: unknown) {
  TestBed.configureTestingModule({ imports: [Host], providers: [provideTranslateService()] });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.error.set(error);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, host: fixture.componentInstance };
}

describe('LoadErrorComponent', () => {
  it('shows an alert with a retry button that emits retry', () => {
    const { el, host } = setup(new Error('x'));
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    const button = el.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toContain('আবার চেষ্টা করুন');
    button.click();
    expect(host.retry).toHaveBeenCalledTimes(1);
  });

  it('uses the plain network message for a status-0 error and never the server text', () => {
    const { el } = setup(new HttpErrorResponse({ status: 0, error: { detail: 'Traceback secret' } }));
    expect(el.textContent).toContain(bn.errors.network);
    expect(el.textContent).not.toContain('Traceback');
  });

  it('falls back to the page message for an unknown error', () => {
    const { el } = setup(new Error('boom'));
    expect(el.textContent).toContain(bn.member.profile.loadError);
  });
});
