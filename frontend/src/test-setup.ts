import { beforeEach } from 'vitest';

/**
 * LanguageService restores the UI language from localStorage. Specs that
 * toggle it (lang-switch, shells) would otherwise leak 'en' into later spec
 * files in the same worker, and specs that only load bn.json then render raw
 * i18n keys — an order-dependent flake. Reset just that key before each test.
 */
const LANG_KEY = 'krmf_lang';

beforeEach(() => {
  try {
    localStorage.removeItem(LANG_KEY);
  } catch {
    // No localStorage in this environment: nothing can leak.
  }
});
