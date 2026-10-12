import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../services/auth.service';
import {
  MAX_CONCURRENT_PRELOADS,
  PRELOAD_IDLE,
  SelectivePreloadingStrategy,
} from './selective-preloading.strategy';

describe('SelectivePreloadingStrategy', () => {
  function strategy(
    permissions: string[],
    idle: Observable<void> = of(undefined),
  ): SelectivePreloadingStrategy {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            hasAnyPermission: (keys: string[]) => keys.some((k) => permissions.includes(k)),
          },
        },
        { provide: PRELOAD_IDLE, useValue: idle },
      ],
    });
    return TestBed.inject(SelectivePreloadingStrategy);
  }

  function preload(
    strategy: SelectivePreloadingStrategy,
    data: Record<string, unknown> | undefined,
  ): { called: boolean; value: unknown } {
    let called = false;
    let value: unknown;
    strategy
      .preload({ path: 'x', data } as never, () => {
        called = true;
        return of('chunk');
      })
      .subscribe((v) => (value = v));
    return { called, value };
  }

  it('preloads routes with no requiredPermissions for every session', () => {
    const result = preload(strategy([]), undefined);
    expect(result.called).toBe(true);
    expect(result.value).toBe('chunk');
  });

  it('preloads gated routes when the session holds one of the required permissions', () => {
    const result = preload(strategy(['manage_roles']), {
      requiredPermissions: ['manage_roles', 'manage_users'],
    });
    expect(result.called).toBe(true);
    expect(result.value).toBe('chunk');
  });

  it('does not download gated chunks for a session missing every required permission', () => {
    const result = preload(strategy([]), { requiredPermissions: ['manage_roles'] });
    expect(result.called).toBe(false);
    expect(result.value).toBeNull();
  });

  it('never preloads routes flagged preload: false (heavy chunks load on first visit)', () => {
    const result = preload(strategy(['x']), { preload: false });
    expect(result.called).toBe(false);
    expect(result.value).toBeNull();
  });

  it('starts the chunk fetch only after the browser is idle', () => {
    const idle = new Subject<void>();
    const s = strategy([], idle);
    const fn = vi.fn(() => of('chunk'));

    s.preload({ path: 'x' } as never, fn).subscribe();
    expect(fn).not.toHaveBeenCalled();

    idle.next();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('runs at most MAX_CONCURRENT_PRELOADS chunk fetches at a time and drains the queue', () => {
    const s = strategy([]);
    const downloads = Array.from({ length: MAX_CONCURRENT_PRELOADS + 2 }, () => new Subject<string>());
    const started: number[] = [];

    downloads.forEach((download, index) =>
      s
        .preload({ path: `r${index}` } as never, () => {
          started.push(index);
          return download;
        })
        .subscribe(),
    );

    expect(started).toEqual([0, 1]);

    downloads[0].next('a');
    downloads[0].complete();
    expect(started).toEqual([0, 1, 2]);

    downloads[1].next('b');
    downloads[1].complete();
    expect(started).toEqual([0, 1, 2, 3]);
  });

  it('frees its slot when a chunk fetch fails so the queue keeps moving', () => {
    const s = strategy([]);
    const failing = new Subject<string>();
    const started: string[] = [];
    const run = (name: string, source: Observable<string>) =>
      s
        .preload({ path: name } as never, () => {
          started.push(name);
          return source;
        })
        .subscribe({ error: () => undefined });

    run('a', failing);
    run('b', new Subject<string>());
    run('c', of('ok'));
    expect(started).toEqual(['a', 'b']);

    failing.error(new Error('offline'));
    expect(started).toEqual(['a', 'b', 'c']);
  });
});
