import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { DATA_SAVER_KEY, DataSaverService } from './data-saver.service';

class MemoryStorage {
  private readonly entries = new Map<string, string>();
  get length(): number {
    return this.entries.size;
  }
  clear(): void {
    this.entries.clear();
  }
  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.entries.delete(key);
  }
  setItem(key: string, value: string): void {
    this.entries.set(key, String(value));
  }
}

function create(stored: string | null, connection?: { saveData: boolean }): DataSaverService {
  TestBed.resetTestingModule();
  const storage = new MemoryStorage();
  if (stored !== null) storage.setItem(DATA_SAVER_KEY, stored);
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true, ...(connection ? { connection } : {}) },
    configurable: true,
    writable: true,
  });
  TestBed.configureTestingModule({});
  return TestBed.inject(DataSaverService);
}

afterEach(() => {
  // navigator is restored by the next create(); drop a stale connection shape.
  Object.defineProperty(globalThis, 'navigator', { value: globalThis.navigator, configurable: true });
});

describe('DataSaverService', () => {
  it('is off by default when nothing is stored and the browser reports nothing', () => {
    expect(create(null).enabled()).toBe(false);
  });

  it('follows navigator.connection.saveData while unset', () => {
    expect(create(null, { saveData: true }).enabled()).toBe(true);
  });

  it('keeps the stored choice even when the browser asks for data saving', () => {
    expect(create('0', { saveData: true }).enabled()).toBe(false);
    expect(create('1').enabled()).toBe(true);
  });

  it('setEnabled persists the choice and updates the signal', () => {
    const service = create(null);
    service.setEnabled(true);
    expect(service.enabled()).toBe(true);
    expect(globalThis.localStorage.getItem(DATA_SAVER_KEY)).toBe('1');
    service.setEnabled(false);
    expect(service.enabled()).toBe(false);
    expect(globalThis.localStorage.getItem(DATA_SAVER_KEY)).toBe('0');
  });

  it('survives a broken localStorage without throwing', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
      configurable: true,
      writable: true,
    });
    TestBed.configureTestingModule({});
    expect(() => TestBed.inject(DataSaverService)).not.toThrow();
  });
});
