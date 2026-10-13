import { registerLocaleData } from '@angular/common';
import localeBn from '@angular/common/locales/bn';

/**
 * Registers Bangla CLDR data so `formatDate(..., 'bn')` and
 * `| date: fmt : undefined : 'bn'` work (month/weekday names).
 *
 * Deliberately NOT paired with a global `LOCALE_ID` provider: Angular's `| date`,
 * `| number` and `| currency` pipes read LOCALE_ID, so setting it to 'bn' would
 * silently change every existing page's output and ignore the in-app language
 * toggle. Language-aware output goes through the bn* pipes in shared/pipes/.
 */
registerLocaleData(localeBn, 'bn');
