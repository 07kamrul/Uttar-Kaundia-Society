import {
  Directive,
  ElementRef,
  Injector,
  type OnDestroy,
  type OnInit,
  afterNextRender,
  inject,
  output,
} from '@angular/core';

let nextDialogId = 0;

/**
 * Turns an existing modal panel (usually `.modal-card` inside an `@if`) into
 * an accessible dialog without changing its markup or styles:
 * role="dialog" + aria-modal, labelled by its first heading, Escape emits
 * `dismiss`, focus moves in on open and back to the trigger on close.
 */
@Directive({
  selector: '[appDialog]',
  standalone: true,
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    tabindex: '-1',
    '(document:keydown.escape)': 'dismiss.emit()',
  },
})
export class DialogDirective implements OnInit, OnDestroy {
  readonly dismiss = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private previouslyFocused: HTMLElement | null = null;

  ngOnInit(): void {
    this.previouslyFocused = document.activeElement as HTMLElement | null;
    this.labelFromHeading();
    afterNextRender(() => this.host.nativeElement.focus({ preventScroll: true }), {
      injector: this.injector,
    });
  }

  ngOnDestroy(): void {
    this.previouslyFocused?.focus?.({ preventScroll: true });
    this.previouslyFocused = null;
  }

  private labelFromHeading(): void {
    const el = this.host.nativeElement;
    if (el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby')) return;
    const heading = el.querySelector<HTMLElement>('h1, h2, h3, h4');
    if (!heading) return;
    heading.id ||= `app-dialog-title-${nextDialogId++}`;
    el.setAttribute('aria-labelledby', heading.id);
  }
}
