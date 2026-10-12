import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { SectionLoaderComponent } from './section-loader.component';

describe('SectionLoaderComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SectionLoaderComponent],
      providers: [provideTranslateService()],
    });
  });

  function render(inputs: { variant?: 'rows' | 'cards' | 'form'; count?: number } = {}): HTMLElement {
    const fixture = TestBed.createComponent(SectionLoaderComponent);
    if (inputs.variant) fixture.componentRef.setInput('variant', inputs.variant);
    if (inputs.count) fixture.componentRef.setInput('count', inputs.count);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('announces itself as a status region', () => {
    const el = render();

    expect(el.querySelector('[role="status"]')).not.toBeNull();
  });

  it('renders the requested number of skeleton rows by default', () => {
    const el = render({ count: 3 });

    expect(el.querySelectorAll('.skeleton-row').length).toBe(3);
  });

  it('renders card placeholders for the cards variant', () => {
    const el = render({ variant: 'cards', count: 2 });

    expect(el.querySelectorAll('.sl-card').length).toBe(2);
    expect(el.querySelector('.skeleton-row')).toBeNull();
  });

  it('renders labelled field placeholders for the form variant', () => {
    const el = render({ variant: 'form', count: 2 });

    expect(el.querySelectorAll('.sl-field').length).toBe(2);
  });
});
