import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { formatPhone } from './phone-format';

/**
 * `{{ member.mobile | phoneText }}` -> `+৮৮০ ১৭১২ ৩৪৫৬৭৮` / `+880 1712 345678`.
 * Text only (no links). Impure so it re-runs on a language switch; reading the
 * language signal in transform() also makes OnPush views re-check.
 */
@Pipe({ name: 'phoneText', pure: false })
export class PhoneTextPipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(value: string | null | undefined): string {
    return formatPhone(value, this.translate.currentLang() === 'en' ? 'en' : 'bn');
  }
}
