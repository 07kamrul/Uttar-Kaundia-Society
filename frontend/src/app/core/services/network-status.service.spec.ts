import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { SLOW_REQUEST_MS, NetworkStatusService } from './network-status.service';

function create(effectiveType?: string): NetworkStatusService {
  TestBed.resetTestingModule();
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true, ...(effectiveType ? { connection: { effectiveType } } : {}) },
    configurable: true,
    writable: true,
  });
  TestBed.configureTestingModule({});
  return TestBed.inject(NetworkStatusService);
}

function fire(name: 'offline' | 'online'): void {
  window.dispatchEvent(new Event(name));
}

describe('NetworkStatusService', () => {
  it('starts online when the browser is online', () => {
    expect(create().problem()).toBeNull();
  });

  it('a known slow effectiveType marks the network slow', () => {
    expect(create('slow-2g').problem()).toBe('slow');
    expect(create('2g').problem()).toBe('slow');
    expect(create('4g').problem()).toBeNull();
  });

  it('the offline event switches to offline; coming back emits reconnected', () => {
    const service = create();
    let reconnected = 0;
    service.reconnected$.subscribe(() => reconnected++);
    fire('offline');
    expect(service.problem()).toBe('offline');
    fire('online');
    expect(service.problem()).toBeNull();
    expect(reconnected).toBe(1);
  });

  it('reconnected only fires on a real offline-to-online transition', () => {
    const service = create();
    let reconnected = 0;
    service.reconnected$.subscribe(() => reconnected++);
    fire('online');
    expect(reconnected).toBe(0);
  });

  it('a request slower than the threshold marks the network slow again', () => {
    const service = create();
    service.noteLatency(SLOW_REQUEST_MS + 1);
    expect(service.problem()).toBe('slow');
    service.noteLatency(200);
    expect(service.problem()).toBeNull();
  });
});

