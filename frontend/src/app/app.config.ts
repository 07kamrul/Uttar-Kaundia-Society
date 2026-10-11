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
import { loaderInterceptor } from './core/interceptors/loader.interceptor';
import { AuthService } from './core/services/auth.service';
import { MediaTokenService } from './core/services/media-token.service';
import { SelectivePreloadingStrategy } from './core/routing/selective-preloading.strategy';

// Bump when i18n JSON content changes so browsers don't serve a stale cached
// copy; a stale en.json silently falls back to Bangla per key (fallbackLang).
const I18N_CACHE_BUST = 'v20261012a';

function createTranslateLoader(http: HttpClient): TranslateHttpLoader {
  return new TranslateHttpLoader(http, '/i18n/', `.json?${I18N_CACHE_BUST}`);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withPreloading(SelectivePreloadingStrategy)),
    provideHttpClient(withInterceptors([authInterceptor, loaderInterceptor])),
    // A restored session needs its /uploads media token before pages map file URLs.
    provideAppInitializer(() => {
      if (!inject(AuthService).token) return;
      return firstValueFrom(inject(MediaTokenService).start());
    }),
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
