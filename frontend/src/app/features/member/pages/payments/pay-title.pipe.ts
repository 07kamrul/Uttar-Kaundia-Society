import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { monthNameKey } from '../../../../shared/constants/months';
import { toBanglaDigits } from '../../../../shared/pipes/bn-format';

const INSTALLMENT_TITLE = /(\d{1,2})\/(\d{4})\s*$/;

/**
 * The server sends installment titles as "কিস্তি MM/YYYY"; show them as a
 * month name and year in the active language. Anything else is shown as sent.
 */
@Pipe({ name: 'payTitle', pure: false })
export class PayTitlePipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(title: string, kind: string): string {
    if (kind !== 'installment') return title;
    const match = INSTALLMENT_TITLE.exec(title);
    if (!match) return title;
    const month = Number(match[1]);
    if (month < 1 || month > 12) return title;
    const lang = this.translate.currentLang() === 'en' ? 'en' : 'bn';
    const year = lang === 'bn' ? toBanglaDigits(match[2]) : match[2];
    return `${this.translate.instant(monthNameKey(month))} ${year}`;
  }
}
