import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageService, type LanguageCode } from '../../core/services/language.service';

/** "বাংলা | English" segmented control for the header (nav_five_areas). */
@Component({
  selector: 'app-lang-switch',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <div class="lang-switch" role="group" [attr.aria-label]="'nav.language' | translate">
      @for (code of codes; track code) {
        <button
          type="button"
          class="lang-btn"
          [attr.data-testid]="'lang-' + code"
          [attr.aria-pressed]="lang.lang() === code"
          [class.is-active]="lang.lang() === code"
          (click)="choose(code)"
        >
          {{ 'lang.' + code | translate }}
        </button>
      }
    </div>
  `,
  styles: `
    .lang-switch { display: inline-flex; border: 1px solid var(--gray-300, #d1d5db); border-radius: 999px; overflow: hidden; }
    .lang-btn { min-height: 44px; white-space: nowrap; padding: 0 0.8rem; border: 0; background: transparent; color: inherit; font: inherit; font-size: 0.9rem; cursor: pointer; }
    .lang-btn:focus-visible { outline: 2px solid var(--gold, #d4a017); outline-offset: -3px; }
    .lang-btn.is-active { background: var(--emerald-700, #047857); color: #fff; font-weight: 700; }
  `,
})
export class LangSwitchComponent {
  readonly lang = inject(LanguageService);
  readonly codes: readonly LanguageCode[] = ['bn', 'en'];

  choose(code: LanguageCode): void {
    if (this.lang.lang() !== code) this.lang.setLang(code);
  }
}
