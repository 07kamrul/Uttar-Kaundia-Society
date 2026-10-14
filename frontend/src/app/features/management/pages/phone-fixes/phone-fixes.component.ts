import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toUserMessageKey } from '../../../../core/errors/user-error';
import { PhoneFixService, type PhoneFix } from '../../../../core/services/phone-fix.service';
import { PhoneInputComponent } from '../../../../shared/phone-input/phone-input.component';
import { isValidInternationalPhone } from '../../../../shared/phone-input/phone-number';
import { SectionLoaderComponent } from '../../../../shared/section-loader/section-loader.component';

type LoadState = 'loading' | 'error' | 'ready';

/** "ফোন নম্বর ঠিক করুন": numbers the migration could not convert; one PUT per row (member.manage). */
@Component({
  selector: 'app-phone-fixes',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, PhoneInputComponent, SectionLoaderComponent],
  template: `
    <div class="phone-fixes-page">
      <h1 class="page-title">{{ 'adminConsole.phoneFixes.title' | translate }}</h1>
      <p class="page-subtitle">{{ 'adminConsole.phoneFixes.subtitle' | translate }}</p>
      @switch (state()) {
        @case ('loading') {
          <app-section-loader variant="rows" [count]="4" />
        }
        @case ('error') {
          <div class="error-box" role="alert">
            <p style="margin: 0 0 0.5rem">{{ 'adminConsole.phoneFixes.loadError' | translate }}</p>
            <button type="button" class="btn btn-secondary" (click)="load()">{{ 'common.retry' | translate }}</button>
          </div>
        }
        @default {
          @for (fix of fixes(); track fix.id) {
            <section class="card fix-row" data-testid="fix-row">
              <p class="fix-who">
                <strong>{{ fix.memberName || '—' }}</strong>
                @if (fix.memberCode) { <span class="muted"> {{ fix.memberCode }}</span> }
              </p>
              <p class="fix-field">{{ fieldLabel(fix) }}</p>
              <p class="fix-raw">{{ 'adminConsole.phoneFixes.raw' | translate }}: <code>{{ fix.rawValue }}</code></p>
              <app-phone-input [ngModel]="values()[fix.id] ?? ''" (ngModelChange)="setValue(fix.id, $event)" />
              @if (errors()[fix.id]; as key) {
                <p class="field-error" role="alert" data-testid="fix-error">{{ key | translate }}</p>
              }
              <button
                type="button"
                class="btn btn-primary"
                data-testid="fix-save"
                [disabled]="!isValid(fix.id) || busy() === fix.id"
                (click)="save(fix)"
              >
                {{ 'adminConsole.phoneFixes.save' | translate }}
              </button>
            </section>
          } @empty {
            <p class="empty-state" data-testid="fix-empty">{{ 'adminConsole.phoneFixes.empty' | translate }}</p>
          }
        }
      }
    </div>
  `,
  styles: `
    .fix-row { display: grid; gap: 0.5rem; padding: 1rem; margin-bottom: 0.75rem; }
    .fix-row p { margin: 0; }
    .fix-row .btn { min-height: 48px; justify-self: start; }
  `,
})
export class PhoneFixesComponent implements OnInit {
  private readonly service = inject(PhoneFixService);
  private readonly translate = inject(TranslateService);

  readonly state = signal<LoadState>('loading');
  readonly fixes = signal<PhoneFix[]>([]);
  readonly values = signal<Record<number, string>>({});
  readonly errors = signal<Record<number, string>>({});
  readonly busy = signal<number | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.service.list().subscribe({
      next: (rows) => {
        this.fixes.set(rows);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  fieldLabel(fix: PhoneFix): string {
    const key = `adminConsole.phoneFixes.field.${fix.entityType}.${fix.field}`;
    const text = this.translate.instant(key);
    return text === key ? fix.field : text;
  }

  setValue(id: number, value: string): void {
    this.values.update((v) => ({ ...v, [id]: value }));
    this.errors.update(({ [id]: _drop, ...rest }) => rest);
  }

  isValid(id: number): boolean {
    return isValidInternationalPhone(this.values()[id]);
  }

  save(fix: PhoneFix): void {
    const mobile = this.values()[fix.id];
    if (!this.isValid(fix.id) || this.busy() !== null) return;
    this.busy.set(fix.id);
    this.service.resolve(fix.id, mobile).subscribe({
      next: () => {
        this.busy.set(null);
        this.fixes.update((rows) => rows.filter((r) => r.id !== fix.id));
      },
      error: (err: unknown) => {
        this.busy.set(null);
        this.errors.update((e) => ({ ...e, [fix.id]: toUserMessageKey(err) }));
      },
    });
  }
}
