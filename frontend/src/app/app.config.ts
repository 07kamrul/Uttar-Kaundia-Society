import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, withPreloading } from '@angular/router';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideTranslateService, TranslateLoader } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { routes } from './app.routes';
import { firstValueFrom } from 'rxjs';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { cacheInterceptor } from './core/interceptors/cache.interceptor';
import { loaderInterceptor } from './core/interceptors/loader.interceptor';
import { AuthService } from './core/services/auth.service';
import { MediaTokenService } from './core/services/media-token.service';
import { SelectivePreloadingStrategy } from './core/routing/selective-preloading.strategy';
import { FeatureFlagService } from './core/services/feature-flag.service';
import './core/i18n/register-bn-locale';

// Bump when i18n JSON content changes so browsers don't serve a stale cached
// copy; a stale en.json silently falls back to Bangla per key (fallbackLang).
const I18N_CACHE_BUST = 'v20261014a';

function createTranslateLoader(http: HttpClient): TranslateHttpLoader {
  return new TranslateHttpLoader(http, '/i18n/', `.json?${I18N_CACHE_BUST}`);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withPreloading(SelectivePreloadingStrategy)),
    // Order matters: auth adds the token the cache keys on, and cache hits return
    // before the loader interceptor so instant responses never flash a loader.
    provideHttpClient(withInterceptors([authInterceptor, cacheInterceptor, loaderInterceptor])),
    // A restored session needs its /uploads media token before pages map file URLs.
    provideAppInitializer(() => {
      if (!inject(AuthService).token) return;
      return firstValueFrom(inject(MediaTokenService).start());
    }),
    // Feature flags load once; load() never rejects (falls back to all-off) so startup is never blocked.
    provideAppInitializer(() => inject(FeatureFlagService).load()),
    provideTranslateService({
      loader: {
        provide: TranslateLoader,
        useFactory: createTranslateLoader,
        deps: [HttpClient],
      },
      fallbackLang: 'bn',
    }),
  ],
};
