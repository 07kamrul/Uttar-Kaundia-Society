import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { PhoneLinkComponent } from './phone-link.component';
import { PhoneTextPipe } from './phone-text.pipe';

const BN = {
  phoneLink: { call: 'ফোন করুন', whatsapp: 'হোয়াটসঅ্যাপ', copy: 'কপি করুন', copied: 'কপি হয়েছে' },
};

@Component({
  imports: [PhoneLinkComponent, PhoneTextPipe],
  template: `
    <app-phone-link id="link" [value]="value()" />
    <span id="text">{{ value() | phoneText }}</span>
  `,
})
class HostComponent {
  readonly value = signal<string | null>('+8801712345678');
}

describe('PhoneLinkComponent', () => {
  let writeText: ReturnType<typeof vi.fn>;

  function setup(lang: 'bn' | 'en', value: string | null = '+8801712345678') {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideTranslateService({ fallbackLang: 'bn' })],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('bn', BN);
    translate.use(lang);
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.value.set(value);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    return { fixture, root, link: root.querySelector('#link') as HTMLElement };
  }

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shows the international format with Bangla digits in bn mode', () => {
    const { link } = setup('bn');
    expect(link.textContent).toContain('+৮৮০ ১৭১২ ৩৪৫৬৭৮');
  });

  it('shows ASCII digits in en mode', () => {
    const { link } = setup('en');
    expect(link.textContent).toContain('+880 1712 345678');
  });

  it('links the number with tel:+E.164', () => {
    const { link } = setup('bn');
    const tel = link.querySelector<HTMLAnchorElement>('a[href^="tel:"]');
    expect(tel?.getAttribute('href')).toBe('tel:+8801712345678');
  });

  it('links WhatsApp as https://wa.me/<digits> with a visible text label', () => {
    const { link } = setup('bn');
    const wa = link.querySelector<HTMLAnchorElement>('a[href^="https://wa.me/"]');
    expect(wa?.getAttribute('href')).toBe('https://wa.me/8801712345678');
    expect(wa?.textContent?.trim()).toContain('হোয়াটসঅ্যাপ');
    expect(wa?.getAttribute('rel')).toContain('noopener');
    expect(wa?.querySelector('svg, app-icon')).not.toBeNull();
  });

  it('accepts legacy 01… values using region BD', () => {
    const { link } = setup('en', '01712345678');
    expect(link.querySelector('a[href^="tel:"]')?.getAttribute('href')).toBe('tel:+8801712345678');
    expect(link.textContent).toContain('+880 1712 345678');
  });

  it('copies the E.164 value, not the formatted text', async () => {
    const { fixture, link } = setup('bn', '01712345678');
    link.querySelector<HTMLButtonElement>('button.phone-link-copy')!.click();
    await fixture.whenStable();
    expect(writeText).toHaveBeenCalledWith('+8801712345678');
  });

  it('shows a short copied confirmation, then goes back to the copy label', async () => {
    vi.useFakeTimers();
    const { fixture, link } = setup('bn');
    const button = link.querySelector<HTMLButtonElement>('button.phone-link-copy')!;
    expect(button.textContent).toContain('কপি করুন');
    button.click();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(link.textContent).toContain('কপি হয়েছে');
    await vi.advanceTimersByTimeAsync(2500);
    fixture.detectChanges();
    expect(link.textContent).not.toContain('কপি হয়েছে');
  });

  it('shows only the raw text, with no links or buttons, when unparseable', () => {
    const { link } = setup('bn', 'call after 5');
    expect(link.textContent).toContain('call after 5');
    expect(link.querySelector('a')).toBeNull();
    expect(link.querySelector('button')).toBeNull();
  });

  it('renders nothing for an empty value', () => {
    const { link } = setup('bn', null);
    expect((link.textContent ?? '').trim()).toBe('');
    expect(link.querySelector('a, button')).toBeNull();
  });

  it('updates when the value changes (OnPush)', () => {
    const { fixture, link } = setup('en');
    fixture.componentInstance.value.set('+966501234567');
    fixture.detectChanges();
    expect(link.textContent).toContain('+966 50 123 4567');
    expect(link.querySelector('a[href^="tel:"]')?.getAttribute('href')).toBe('tel:+966501234567');
  });
});

describe('phoneText pipe', () => {
  it('formats text-only values and follows the language', () => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideTranslateService({ fallbackLang: 'bn' })],
    });
    const translate = TestBed.inject(TranslateService);
    translate.use('en');
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const text = () => (fixture.nativeElement.querySelector('#text') as HTMLElement).textContent;
    expect(text()).toBe('+880 1712 345678');
    translate.use('bn');
    fixture.detectChanges();
    expect(text()).toBe('+৮৮০ ১৭১২ ৩৪৫৬৭৮');
  });
});
