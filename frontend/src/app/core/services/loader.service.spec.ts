import { LoaderService } from './loader.service';

describe('LoaderService', () => {
  let loader: LoaderService;

  beforeEach(() => {
    vi.useFakeTimers();
    loader = new LoaderService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not show for requests faster than the show delay', () => {
    const end = loader.begin('bar');
    vi.advanceTimersByTime(LoaderService.SHOW_DELAY_MS - 50);
    end();
    vi.advanceTimersByTime(1000);

    expect(loader.visible()).toBe(false);
  });

  it('shows after the show delay while work is pending', () => {
    loader.begin('bar');
    vi.advanceTimersByTime(LoaderService.SHOW_DELAY_MS);

    expect(loader.visible()).toBe(true);
    expect(loader.mode()).toBe('bar');
  });

  it('stays visible for the minimum display time once shown', () => {
    const end = loader.begin('bar');
    vi.advanceTimersByTime(LoaderService.SHOW_DELAY_MS);
    end();

    expect(loader.visible()).toBe(true);
    vi.advanceTimersByTime(LoaderService.MIN_VISIBLE_MS);
    expect(loader.visible()).toBe(false);
  });

  it('keeps one loader until the last parallel task finishes', () => {
    const endA = loader.begin('bar');
    const endB = loader.begin('bar');
    vi.advanceTimersByTime(LoaderService.SHOW_DELAY_MS);
    endA();
    vi.advanceTimersByTime(LoaderService.MIN_VISIBLE_MS);

    expect(loader.visible()).toBe(true);
    endB();
    vi.advanceTimersByTime(LoaderService.MIN_VISIBLE_MS);
    expect(loader.visible()).toBe(false);
  });

  it('prefers overlay mode while any overlay task is active', () => {
    loader.begin('bar');
    const endOverlay = loader.begin('overlay');
    vi.advanceTimersByTime(LoaderService.SHOW_DELAY_MS);

    expect(loader.mode()).toBe('overlay');
    endOverlay();
    expect(loader.mode()).toBe('bar');
  });

  it('ignores repeated end calls for the same task', () => {
    const endA = loader.begin('bar');
    loader.begin('bar');
    endA();
    endA();

    expect(loader.activeCount()).toBe(1);
  });

  it('flags slow work after the slow threshold and resets afterwards', () => {
    const end = loader.begin('overlay');
    vi.advanceTimersByTime(LoaderService.SLOW_AFTER_MS);
    expect(loader.isSlow()).toBe(true);

    end();
    vi.advanceTimersByTime(LoaderService.MIN_VISIBLE_MS);
    expect(loader.isSlow()).toBe(false);
  });
});
