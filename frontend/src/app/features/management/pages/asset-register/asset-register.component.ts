import { ChangeDetectionStrategy, Component, HostListener, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SectionLoaderComponent } from '../../../../shared/section-loader/section-loader.component';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { LanguageService } from '../../../../core/services/language.service';
import {
  RegistersService,
  type AssetCondition,
  type SocietyAsset,
} from '../../../../core/services/registers.service';
import { formatTaka } from '../../../../core/services/finance.service';
import { DatePickerComponent } from '../../../../shared/date-picker/date-picker.component';
import { localizeDigits } from '../../../../core/services/resolution-book.service';

@Component({
  selector: 'app-asset-register',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, IconComponent, DatePickerComponent, SectionLoaderComponent],
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1 class="page-title"><app-icon name="inbox" [size]="22" /> {{ 'assetRegister.title' | translate }}</h1>
          <p class="page-subtitle">{{ 'assetRegister.subtitle' | translate }}</p>
        </div>
        <div class="header-actions">
          <button type="button" class="btn btn-secondary" (click)="downloadPdf()" [disabled]="pdfBusy">
            {{ 'assetRegister.downloadPdf' | translate }}
          </button>
          <button type="button" class="btn btn-primary" (click)="openForm()">
            <app-icon name="plus" [size]="16" /> {{ 'assetRegister.add' | translate }}
          </button>
        </div>
      </div>

      @if (error()) {
        <div class="card card-pad error-box" role="alert">{{ error() }}</div>
      }

      <div class="am-toolbar">
        <input class="field-control" type="search" [placeholder]="'assetRegister.search' | translate"
               [(ngModel)]="search" (ngModelChange)="load()" />
        <label class="checkbox-row">
          <input type="checkbox" [(ngModel)]="includeInactive" (ngModelChange)="load()" />
          {{ 'assetRegister.includeInactive' | translate }}
        </label>
      </div>

      <section class="card">
        @if (loading()) {
          <app-section-loader variant="rows" [count]="4" />
        } @else if (assets().length === 0) {
          <div class="ds-empty">{{ 'assetRegister.empty' | translate }}</div>
        } @else {
          <div class="data-table-wrap">
            <table class="data-table data-table-cards">
              <thead>
                <tr>
                  <th>{{ 'assetRegister.code' | translate }}</th>
                  <th>{{ 'assetRegister.name' | translate }}</th>
                  <th>{{ 'assetRegister.category' | translate }}</th>
                  <th>{{ 'assetRegister.acquired' | translate }}</th>
                  <th>{{ 'assetRegister.value' | translate }}</th>
                  <th>{{ 'assetRegister.condition' | translate }}</th>
                  <th>{{ 'common.actions' | translate }}</th>
                </tr>
              </thead>
              <tbody>
                @for (asset of assets(); track asset.id) {
                  <tr>
                    <td [attr.data-label]="'assetRegister.code' | translate">{{ asset.assetCode }}</td>
                    <td [attr.data-label]="'assetRegister.name' | translate">
                      {{ asset.name }}
                      @if (asset.location) {
                        <span class="muted">· {{ asset.location }}</span>
                      }
                      @if (!asset.isActive) {
                        <span class="ds-tag ds-tag-amber">{{ 'assetRegister.inactive' | translate }}</span>
                      }
                    </td>
                    <td [attr.data-label]="'assetRegister.category' | translate">{{ asset.category }}</td>
                    <td [attr.data-label]="'assetRegister.acquired' | translate">{{ asset.acquisitionDate }}</td>
                    <td [attr.data-label]="'assetRegister.value' | translate">{{ taka(asset.value) }}</td>
                    <td [attr.data-label]="'assetRegister.condition' | translate">
                      <span class="ds-tag" [class.ds-tag-green]="asset.condition === 'good'"
                            [class.ds-tag-blue]="asset.condition === 'fair'"
                            [class.ds-tag-amber]="asset.condition === 'poor'"
                            [class.ds-tag-gold]="asset.condition === 'lost'">
                        {{ 'assetRegister.conditions.' + asset.condition | translate }}
                      </span>
                    </td>
                    <td [attr.data-label]="'common.actions' | translate" class="row-actions" (click)="$event.stopPropagation()">
                      <button type="button" class="btn btn-secondary btn-sm" (click)="openForm(asset)">
                        {{ 'common.edit' | translate }}
                      </button>
                      @if (asset.isActive) {
                        <button type="button" class="btn btn-danger btn-sm" (click)="deactivate(asset)">
                          {{ 'common.delete' | translate }}
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      @if (formOpen) {
        <div class="modal-backdrop ar-backdrop" (click)="closeForm()">
          <div class="ar-modal" role="dialog" aria-modal="true" aria-labelledby="ar-modal-title"
               (click)="$event.stopPropagation()">
            <header class="ar-modal-head">
              <div class="ar-modal-icon" aria-hidden="true">
                <app-icon name="inbox" [size]="20" />
              </div>
              <div class="ar-modal-heading">
                <h3 id="ar-modal-title">
                  {{ editing ? ('assetRegister.editTitle' | translate) : ('assetRegister.addTitle' | translate) }}
                </h3>
                <p>{{ 'assetRegister.formSubtitle' | translate }}</p>
              </div>
              <button type="button" class="ar-modal-close" (click)="closeForm()"
                      [attr.aria-label]="'common.close' | translate">
                <app-icon name="close" [size]="18" />
              </button>
            </header>

            <form (ngSubmit)="save()" class="ar-modal-body">
              <div class="ar-grid">
                <div class="field ar-span-2">
                  <label for="ar-name">{{ 'assetRegister.name' | translate }}<span class="required" aria-hidden="true">*</span></label>
                  <input id="ar-name" class="field-control" name="name" [(ngModel)]="formName" required autofocus
                         [placeholder]="'assetRegister.namePh' | translate" />
                </div>

                <div class="field">
                  <label for="ar-category">{{ 'assetRegister.category' | translate }}<span class="required" aria-hidden="true">*</span></label>
                  <input id="ar-category" class="field-control" name="category" [(ngModel)]="formCategory" required
                         [placeholder]="'assetRegister.categoryPh' | translate" />
                </div>

                <div class="field">
                  <span class="ar-group-label" id="ar-condition-label">{{ 'assetRegister.condition' | translate }}</span>
                  <div class="ar-conditions" role="radiogroup" aria-labelledby="ar-condition-label">
                    @for (condition of conditions; track condition) {
                      <button type="button" class="ar-condition" role="radio"
                              [class.active]="formCondition === condition"
                              [attr.aria-checked]="formCondition === condition"
                              (click)="formCondition = condition">
                        {{ 'assetRegister.conditions.' + condition | translate }}
                      </button>
                    }
                  </div>
                </div>

                <div class="field">
                  <label for="ar-date">{{ 'assetRegister.acquired' | translate }}</label>
                  <app-date-picker inputId="ar-date" name="acquisitionDate" [(ngModel)]="formDate"></app-date-picker>
                </div>

                <div class="field">
                  <label for="ar-value">{{ 'assetRegister.value' | translate }}<span class="required" aria-hidden="true">*</span></label>
                  <div class="ar-amount">
                    <span class="ar-amount-currency" aria-hidden="true">৳</span>
                    <input id="ar-value" type="number" min="0" step="0.01" inputmode="decimal" name="value"
                           [(ngModel)]="formValue" required />
                  </div>
                </div>

                <div class="field ar-span-2">
                  <label for="ar-location">{{ 'assetRegister.location' | translate }}</label>
                  <input id="ar-location" class="field-control" name="location" [(ngModel)]="formLocation"
                         [placeholder]="'assetRegister.locationPh' | translate" />
                </div>

                <div class="field ar-span-2">
                  <label for="ar-description">{{ 'assetRegister.description' | translate }}</label>
                  <textarea id="ar-description" class="field-control" rows="3" name="description" [(ngModel)]="formDescription"
                            [placeholder]="'assetRegister.descriptionPh' | translate"></textarea>
                </div>
              </div>

              <p class="field-hint">{{ 'assetRegister.requiredHint' | translate }}</p>

              @if (formError) {
                <p class="ar-form-error" role="alert">
                  <app-icon name="alert" [size]="16" /> {{ formError }}
                </p>
              }

              <footer class="ar-modal-foot">
                <button type="button" class="btn btn-secondary" (click)="closeForm()">
                  {{ 'common.cancel' | translate }}
                </button>
                <button type="submit" class="btn btn-primary" [disabled]="busy">
                  @if (busy) {
                    <span class="spinner" aria-hidden="true"></span>
                  } @else {
                    <app-icon name="check" [size]="16" aria-hidden="true" />
                  }
                  {{ 'common.save' | translate }}
                </button>
              </footer>
            </form>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .page-container { display: grid; gap: 1rem; }
      .page-title { display: flex; align-items: center; gap: 0.5rem; }
      .header-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .am-toolbar { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
      .am-toolbar .field-control { max-width: 280px; }
      .row-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
      .header-actions .btn { min-height: 40px; }
      .error-box { color: var(--red-600, #9c3a2c); }

      /* ---------- Add/Edit asset modal ---------- */
      .ar-backdrop { z-index: 60; }
      .ar-modal {
        background: var(--modal-surface, var(--surface, #fff));
        border-radius: 1rem;
        width: min(640px, 100%);
        max-height: 88vh;
        max-height: 88dvh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 24px 64px -16px rgb(0 0 0 / 35%);
        box-sizing: border-box;
      }
      .ar-modal-head {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 1.1rem 1.25rem;
        border-bottom: 1px solid var(--gray-200);
      }
      .ar-modal-icon {
        flex: none;
        display: grid;
        place-items: center;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 0.75rem;
        background: var(--emerald-50);
        color: var(--emerald-800);
      }
      .ar-modal-heading { flex: 1; min-width: 0; }
      .ar-modal-heading h3 { margin: 0; font-size: 1.15rem; line-height: 1.3; }
      .ar-modal-heading p { margin: 0.15rem 0 0; font-size: 0.85rem; color: var(--gray-600); }
      .ar-modal-close {
        flex: none;
        display: grid;
        place-items: center;
        width: 2.25rem;
        height: 2.25rem;
        border: none;
        border-radius: 0.5rem;
        background: transparent;
        color: var(--gray-600);
        cursor: pointer;
      }
      .ar-modal-close:hover { background: var(--gray-100); color: var(--gray-800); }

      .ar-modal-body { padding: 1.1rem 1.25rem 1.25rem; overflow-y: auto; }
      .ar-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.9rem 1rem;
        align-items: start;
      }
      .ar-span-2 { grid-column: span 2; }
      .ar-grid .field { margin-bottom: 0; }
      .ar-group-label { font-size: 0.875rem; font-weight: 500; color: var(--gray-700); }

      /* Condition: touch-friendly segmented picker instead of a select */
      .ar-conditions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.4rem;
        margin-top: 0.25rem;
      }
      .ar-condition {
        min-height: 2.5rem;
        padding: 0.4rem 0.5rem;
        font: inherit;
        font-weight: 600;
        font-size: 0.9rem;
        color: var(--gray-700);
        background: var(--gray-50);
        border: 1px solid var(--gray-200);
        border-radius: 0.55rem;
        cursor: pointer;
        transition: border-color 0.15s, background 0.15s, color 0.15s, box-shadow 0.15s;
      }
      .ar-condition:hover { border-color: var(--emerald-600); }
      .ar-condition.active {
        background: var(--emerald-50);
        border-color: var(--emerald-700);
        color: var(--emerald-900);
        box-shadow: inset 0 0 0 1px var(--emerald-700);
      }

      /* Value input with ৳ prefix; native number spinner hidden */
      .ar-amount {
        display: flex;
        align-items: stretch;
        border: 1px solid var(--field-border, var(--gray-300));
        border-radius: var(--field-radius, 0.5rem);
        background: var(--field-bg, #fff);
        overflow: hidden;
        transition: border-color 0.15s, box-shadow 0.15s;
      }
      .ar-amount:focus-within {
        border-color: var(--field-border-focus, var(--emerald-700));
        box-shadow: var(--field-focus-ring, none);
      }
      .ar-amount-currency {
        display: grid;
        place-items: center;
        padding: 0 0.7rem;
        font-weight: 700;
        color: var(--gray-600);
        background: var(--gray-50);
        border-right: 1px solid var(--gray-200);
      }
      .ar-amount input[type='number'] {
        flex: 1;
        min-width: 0;
        width: 100%;
        border: none;
        background: transparent;
        box-shadow: none;
      }
      .ar-amount input[type='number']:focus { outline: none; box-shadow: none; }
      .ar-amount input[type='number']::-webkit-outer-spin-button,
      .ar-amount input[type='number']::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      .ar-amount input[type='number'] { -moz-appearance: textfield; appearance: textfield; }

      .ar-required-hint { margin: 0.9rem 0 0; }
      .ar-form-error {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        margin: 0.9rem 0 0;
        padding: 0.6rem 0.75rem;
        border-radius: 0.5rem;
        background: rgb(220 38 38 / 8%);
        color: var(--red-600);
        font-size: 0.875rem;
        font-weight: 600;
      }

      .ar-modal-foot {
        position: sticky;
        bottom: 0;
        display: flex;
        justify-content: flex-end;
        gap: 0.6rem;
        margin-top: 1.1rem;
        padding-top: 1rem;
        border-top: 1px solid var(--gray-200);
        background: var(--modal-surface, var(--surface, #fff));
      }
      .ar-modal-foot .btn { min-height: 2.5rem; }

      @media (max-width: 640px) {
        .am-toolbar .field-control { max-width: none; width: 100%; }
        .header-actions, .header-actions .btn { width: 100%; justify-content: center; }
      }
      @media (max-width: 560px) {
        .ar-grid { grid-template-columns: 1fr; }
        .ar-span-2 { grid-column: auto; }
        .ar-modal-foot { flex-direction: row-reverse; }
        .ar-modal-foot .btn { flex: 1; }
      }
      /* Bottom-sheet feel on phones */
      @media (max-width: 480px) {
        .ar-backdrop { align-items: flex-end; padding: 0; }
        .ar-modal {
          width: 100%;
          max-height: 92vh;
          max-height: 92dvh;
          border-radius: 1.125rem 1.125rem 0 0;
        }
        .ar-modal-head { padding: 1rem; }
        .ar-modal-body { padding: 1rem; }
      }
    `,
  ],
})
export class AssetRegisterComponent implements OnInit {
  readonly conditions: AssetCondition[] = ['good', 'fair', 'poor', 'lost'];
  readonly assets = signal<SocietyAsset[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  search = '';
  includeInactive = false;
  formOpen = false;
  editing: SocietyAsset | null = null;
  formName = '';
  formCategory = '';
  formDate = new Date().toISOString().slice(0, 10);
  formValue: number | null = null;
  formCondition: AssetCondition = 'good';
  formLocation = '';
  formDescription = '';
  formError = '';
  busy = false;
  pdfBusy = false;

  private readonly registers = inject(RegistersService);
  private readonly language = inject(LanguageService);
  private readonly translate = inject(TranslateService);
  readonly lang = this.language.lang;

  ngOnInit(): void {
    this.load();
  }

  taka(value: number): string {
    return formatTaka(value, this.lang());
  }

  digits(value: number | string): string {
    return localizeDigits(value, this.lang());
  }

  load(): void {
    this.loading.set(true);
    this.registers
      .assets({ includeInactive: this.includeInactive, search: this.search.trim() || undefined })
      .subscribe({
        next: (assets) => {
          this.assets.set(assets);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('assetRegister.loadError');
          this.loading.set(false);
        },
      });
  }

  openForm(asset?: SocietyAsset): void {
    this.editing = asset ?? null;
    this.formName = asset?.name ?? '';
    this.formCategory = asset?.category ?? '';
    this.formDate = asset?.acquisitionDate ?? new Date().toISOString().slice(0, 10);
    this.formValue = asset?.value ?? null;
    this.formCondition = asset?.condition ?? 'good';
    this.formLocation = asset?.location ?? '';
    this.formDescription = asset?.description ?? '';
    this.formError = '';
    this.formOpen = true;
  }

  closeForm(): void {
    this.formOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.formOpen) this.closeForm();
  }

  save(): void {
    if (this.busy || this.formValue == null) return;
    this.busy = true;
    this.formError = '';
    const input = {
      name: this.formName.trim(),
      category: this.formCategory.trim(),
      acquisitionDate: this.formDate,
      value: this.formValue,
      condition: this.formCondition,
      location: this.formLocation.trim() || null,
      description: this.formDescription.trim() || null,
    };
    const request$ = this.editing
      ? this.registers.updateAsset(this.editing.id, input)
      : this.registers.createAsset(input);
    request$.subscribe({
      next: () => {
        this.busy = false;
        this.formOpen = false;
        this.load();
      },
      error: (err) => {
        this.busy = false;
        this.formError =
          (typeof err?.error?.detail === 'string' && err.error.detail) ||
          this.translate.instant('common.saveFailed');
      },
    });
  }

  deactivate(asset: SocietyAsset): void {
    const reason = window.prompt(this.translate.instant('assetRegister.deactivateReason'));
    if (reason === null || !reason.trim()) return;
    this.registers.deactivateAsset(asset.id, reason.trim()).subscribe({
      next: () => this.load(),
      error: () => this.error.set(this.translate.instant('common.saveFailed')),
    });
  }

  downloadPdf(): void {
    if (this.pdfBusy) return;
    this.pdfBusy = true;
    this.registers.downloadRegisterPdf().subscribe({
      next: (blob) => {
        this.pdfBusy = false;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `asset-register-${new Date().toISOString().slice(0, 10)}.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: () => {
        this.pdfBusy = false;
        this.error.set(this.translate.instant('common.loadFailed'));
      },
    });
  }
}
