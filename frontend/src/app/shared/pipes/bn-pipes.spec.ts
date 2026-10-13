import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DatePipe } from '@angular/common';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { BnDatePipe, BnNumberPipe, TakaPipe } from './bn-pipes';

@Component({
  imports: [BnDatePipe, BnNumberPipe, TakaPipe, DatePipe],
  template: `
    <span id="d">{{ when() | bnDate }}</span>
    <span id="ds">{{ when() | bnDate: 'short' }}</span>
    <span id="n">{{ amount() | bnNumber }}</span>
    <span id="t">{{ amount() | taka }}</span>
    <span id="t2">{{ amount() | taka: 2 }}</span>
    <span id="angular">{{ when() | date: 'longDate' }}</span>
  `,
})
class HostComponent {
  readonly when = signal<Date | null>(new Date(2026, 9, 11));
  readonly amount = signal<number | null>(1200);
}

describe('bn pipes', () => {
  let translate: TranslateService;

  function setup(lang: string) {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideTranslateService({ fallbackLang: 'bn' })],
    });
    translate = TestBed.inject(TranslateService);
    translate.use(lang);
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const text = (id: string) => (fixture.nativeElement.querySelector(`#${id}`) as HTMLElement).textContent;
    return { fixture, text };
  }

  it('renders Bangla output in bn mode', () => {
    const { text } = setup('bn');
    expect(text('d')).toBe('১১ অক্টোবর ২০২৬');
    expect(text('ds')).toBe('১১/১০/২০২৬');
    expect(text('n')).toBe('১,২০০');
    expect(text('t')).toBe('৳ ১,২০০');
    expect(text('t2')).toBe('৳ ১,২০০.০০');
  });

  it('renders English output in en mode', () => {
    const { text } = setup('en');
    expect(text('d')).toBe('11 Oct 2026');
    expect(text('ds')).toBe('11/10/2026');
    expect(text('n')).toBe('1,200');
    expect(text('t')).toBe('৳ 1,200');
  });

  it('defaults to Bangla when no language has been selected yet', () => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideTranslateService({ fallbackLang: 'bn' })],
    });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('#n') as HTMLElement).textContent).toBe('১,২০০');
  });

  it('updates an OnPush-style view when the language switches', () => {
    const { fixture, text } = setup('bn');
    translate.use('en');
    fixture.detectChanges();
    expect(text('d')).toBe('11 Oct 2026');
    expect(text('t')).toBe('৳ 1,200');

    translate.use('bn');
    fixture.detectChanges();
    expect(text('d')).toBe('১১ অক্টোবর ২০২৬');
  });

  it('follows input changes', () => {
    const { fixture, text } = setup('bn');
    fixture.componentInstance.amount.set(1234567);
    fixture.detectChanges();
    expect(text('n')).toBe('১২,৩৪,৫৬৭');
  });

  it('renders nothing for null input', () => {
    const { fixture, text } = setup('bn');
    fixture.componentInstance.when.set(null);
    fixture.componentInstance.amount.set(null);
    fixture.detectChanges();
    expect(text('d')).toBe('');
    expect(text('n')).toBe('');
    expect(text('t')).toBe('');
  });

  it('leaves the built-in date pipe untouched (no global LOCALE_ID change)', () => {
    const { text } = setup('bn');
    expect(text('angular')).toBe('October 11, 2026');
  });
});
