import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueueSearchComponent } from './queue-search.component';

function setup() {
  TestBed.configureTestingModule({ imports: [QueueSearchComponent], providers: [provideTranslateService()] });
  const fixture = TestBed.createComponent(QueueSearchComponent);
  const emitted: string[] = [];
  fixture.componentInstance.search.subscribe((v) => emitted.push(v));
  fixture.detectChanges();
  const input = (fixture.nativeElement as HTMLElement).querySelector('input') as HTMLInputElement;
  const type = (value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  return { fixture, input, type, emitted };
}

describe('QueueSearchComponent', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is a search field with inputmode=search', () => {
    const { input } = setup();
    expect(input.getAttribute('inputmode')).toBe('search');
    expect(input.getAttribute('type')).toBe('search');
  });

  it('waits 300 ms after the last keystroke before emitting', () => {
    const { type, emitted } = setup();
    type('রহ');
    vi.advanceTimersByTime(299);
    expect(emitted).toEqual([]);
    type('রহিম');
    vi.advanceTimersByTime(299);
    expect(emitted).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(emitted).toEqual(['রহিম']);
  });

  it('does not search for a single character', () => {
    const { type, emitted } = setup();
    type('র');
    vi.advanceTimersByTime(1000);
    expect(emitted).toEqual([]);
  });

  it('trims the term and emits an empty string when cleared by typing', () => {
    const { type, emitted } = setup();
    type('  0171  ');
    vi.advanceTimersByTime(300);
    type('');
    vi.advanceTimersByTime(300);
    expect(emitted).toEqual(['0171', '']);
  });

  it('clears with the button, immediately', () => {
    const { fixture, type, emitted, input } = setup();
    type('করিম');
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    ((fixture.nativeElement as HTMLElement).querySelector('[data-testid="search-clear"]') as HTMLButtonElement).click();
    expect(emitted).toEqual(['করিম', '']);
    expect(input.value).toBe('');
  });

  it('does not repeat the same term', () => {
    const { type, emitted } = setup();
    type('করিম');
    vi.advanceTimersByTime(300);
    type('করিম ');
    vi.advanceTimersByTime(300);
    expect(emitted).toEqual(['করিম']);
  });
});
