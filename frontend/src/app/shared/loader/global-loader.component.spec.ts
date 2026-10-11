import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { GlobalLoaderComponent } from './global-loader.component';
import { LoaderService } from '../../core/services/loader.service';

describe('GlobalLoaderComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [GlobalLoaderComponent],
      providers: [provideRouter([]), provideTranslateService()],
    });
  });

  afterEach(() => vi.useRealTimers());

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(GlobalLoaderComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function showFor(mode: 'bar' | 'overlay'): HTMLElement {
    const fixture = TestBed.createComponent(GlobalLoaderComponent);
    TestBed.inject(LoaderService).begin(mode);
    vi.advanceTimersByTime(LoaderService.SHOW_DELAY_MS);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders nothing while idle', () => {
    const el = render();

    expect(el.querySelector('.gl-bar')).toBeNull();
    expect(el.querySelector('.gl-overlay')).toBeNull();
  });

  it('renders the top bar for read work', () => {
    const el = showFor('bar');

    expect(el.querySelector('.gl-bar[role="progressbar"]')).not.toBeNull();
    expect(el.querySelector('.gl-overlay')).toBeNull();
  });

  it('renders the blocking overlay for write work', () => {
    const el = showFor('overlay');

    expect(el.querySelector('.gl-overlay[aria-modal="true"]')).not.toBeNull();
    expect(el.querySelector('.gl-bar')).toBeNull();
  });
});
