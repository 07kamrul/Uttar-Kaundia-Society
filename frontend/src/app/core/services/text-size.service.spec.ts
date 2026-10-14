import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { TEXT_SIZE_KEY, TextSizeService } from './text-size.service';

class MemoryStorage {
  private readonly entries = new Map<string, string>();
  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.entries.set(key, String(value));
  }
}

function create(stored: string | null): TextSizeService {
  const storage = new MemoryStorage();
  if (stored !== null) storage.setItem(TEXT_SIZE_KEY, stored);
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  document.documentElement.classList.remove('text-lg');
  TestBed.configureTestingModule({});
  return TestBed.inject(TextSizeService);
}

afterEach(() => {
  document.documentElement.classList.remove('text-lg');
});

describe('TextSizeService', () => {
  it('is off by default and leaves the html class alone', () => {
    const service = create(null);
    expect(service.large()).toBe(false);
    expect(document.documentElement.classList.contains('text-lg')).toBe(false);
  });

  it('restores the stored large setting and applies html.text-lg', () => {
    const service = create('lg');
    expect(service.large()).toBe(true);
    expect(document.documentElement.classList.contains('text-lg')).toBe(true);
  });

  it('toggle switches the class and persists it', () => {
    const service = create(null);
    service.toggle();
    expect(service.large()).toBe(true);
    expect(document.documentElement.classList.contains('text-lg')).toBe(true);
    expect(globalThis.localStorage.getItem(TEXT_SIZE_KEY)).toBe('lg');
    service.toggle();
    expect(service.large()).toBe(false);
    expect(document.documentElement.classList.contains('text-lg')).toBe(false);
    expect(globalThis.localStorage.getItem(TEXT_SIZE_KEY)).toBe('0');
  });
});
