import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  BnDateInput,
  BnDateStyle,
  BnLang,
  BnNumberInput,
  formatBnDate,
  formatBnNumber,
  formatTakaAmount,
} from './bn-format';

/** Active UI language; Bangla until a language is selected. */
function currentLang(translate: TranslateService): BnLang {
  // Reading the signal inside transform() makes OnPush views re-check on a language switch.
  return translate.currentLang() === 'en' ? 'en' : 'bn';
}

/**
 * The pipes are impure so they re-run when the language changes while the input
 * does not. Each one memoizes its last result, so the extra per-check cost is a
 * few comparisons rather than a re-format.
 */
abstract class LangAwarePipe<TInput, TArg> implements PipeTransform {
  private readonly translate = inject(TranslateService);
  private last: { input: TInput; arg: TArg; lang: BnLang; output: string } | null = null;

  protected abstract format(input: TInput, lang: BnLang, arg: TArg): string;

  protected run(input: TInput, arg: TArg): string {
    const lang = currentLang(this.translate);
    const last = this.last;
    if (last && last.lang === lang && Object.is(last.input, input) && Object.is(last.arg, arg)) {
      return last.output;
    }
    const output = this.format(input, lang, arg);
    this.last = { input, arg, lang, output };
    return output;
  }

  abstract transform(input: TInput, arg?: TArg): string;
}

/** `{{ d | bnDate }}` -> `১১ অক্টোবর ২০২৬` / `11 Oct 2026`; `bnDate:'short'` -> `১১/১০/২০২৬` / `11/10/2026`. */
@Pipe({ name: 'bnDate', pure: false })
export class BnDatePipe extends LangAwarePipe<BnDateInput, BnDateStyle> {
  protected format(input: BnDateInput, lang: BnLang, style: BnDateStyle): string {
    return formatBnDate(input, lang, style);
  }

  transform(input: BnDateInput, style: BnDateStyle = 'long'): string {
    return this.run(input, style);
  }
}

/** `{{ n | bnNumber }}` -> `১,২৩,৪৫৬` / `1,23,456` (lakh grouping); optional fixed decimals. */
@Pipe({ name: 'bnNumber', pure: false })
export class BnNumberPipe extends LangAwarePipe<BnNumberInput, number | undefined> {
  protected format(input: BnNumberInput, lang: BnLang, decimals: number | undefined): string {
    return formatBnNumber(input, lang, decimals);
  }

  transform(input: BnNumberInput, decimals?: number): string {
    return this.run(input, decimals);
  }
}

/** `{{ amount | taka }}` -> `৳ ১,২০০` / `৳ 1,200`; decimals appear only when needed unless given. */
@Pipe({ name: 'taka', pure: false })
export class TakaPipe extends LangAwarePipe<BnNumberInput, number | undefined> {
  protected format(input: BnNumberInput, lang: BnLang, decimals: number | undefined): string {
    return formatTakaAmount(input, lang, decimals);
  }

  transform(input: BnNumberInput, decimals?: number): string {
    return this.run(input, decimals);
  }
}
