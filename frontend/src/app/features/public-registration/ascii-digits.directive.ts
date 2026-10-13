import { Directive, ElementRef, HostListener, Input, inject } from '@angular/core';
import { NgControl } from '@angular/forms';
import { toAsciiDigits } from '../../core/services/digits.helper';

/**
 * Turns Bangla digits (১২৩) typed on a phone keyboard into ASCII (123) as the
 * member types, so validators and the server only ever see ASCII digits.
 * `[appAsciiDigits]="false"` switches it off (the flag-off form is untouched).
 */
@Directive({
  selector: 'input[appAsciiDigits]',
  standalone: true,
})
export class AsciiDigitsDirective {
  @Input('appAsciiDigits') enabled: boolean | '' = true;

  private readonly element = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private readonly control = inject(NgControl, { optional: true });

  @HostListener('input')
  normalise(): void {
    if (this.enabled === false) return;
    const raw = this.element.nativeElement.value;
    const ascii = toAsciiDigits(raw);
    if (ascii === raw) return;
    this.element.nativeElement.value = ascii;
    this.control?.control?.setValue(ascii);
  }
}
