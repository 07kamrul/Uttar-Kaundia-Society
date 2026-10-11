import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
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
  imports: [FormsModule, TranslatePipe, IconComponent, DatePickerComponent],
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
          @for (i of [1, 2, 3]; track i) {
            <div class="skeleton-line" style="height: 48px; margin-bottom: 8px"></div>
          }
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
        <div class="modal-backdrop" (click)="formOpen = false">
          <div class="modal-card" (click)="$event.stopPropagation()">
            <h3>{{ editing ? ('assetRegister.editTitle' | translate) : ('assetRegister.addTitle' | translate) }}</h3>
            <form (ngSubmit)="save()">
              <div class="field">
                <label for="ar-name">{{ 'assetRegister.name' | translate }}</label>
                <input id="ar-name" class="field-control" name="name" [(ngModel)]="formName" required />
              </div>
              <div class="field">
                <label for="ar-category">{{ 'assetRegister.category' | translate }}</label>
                <input id="ar-category" class="field-control" name="category" [(ngModel)]="formCategory" required />
              </div>
              <div class="field">
                <label for="ar-date">{{ 'assetRegister.acquired' | translate }}</label>
                <app-date-picker id="ar-date" name="acquisitionDate" [(ngModel)]="formDate" required></app-date-picker>
              </div>
              <div class="field">
                <label for="ar-value">{{ 'assetRegister.value' | translate }}</label>
                <input id="ar-value" class="field-control" type="number" min="0" step="0.01"
                       name="value" [(ngModel)]="formValue" required />
              </div>
              <div class="field">
                <label for="ar-condition">{{ 'assetRegister.condition' | translate }}</label>
                <select id="ar-condition" class="field-control" name="condition" [(ngModel)]="formCondition">
                  @for (condition of conditions; track condition) {
                    <option [value]="condition">{{ 'assetRegister.conditions.' + condition | translate }}</option>
                  }
                </select>
              </div>
              <div class="field">
                <label for="ar-location">{{ 'assetRegister.location' | translate }}</label>
                <input id="ar-location" class="field-control" name="location" [(ngModel)]="formLocation" />
              </div>
              <div class="field">
                <label for="ar-description">{{ 'assetRegister.description' | translate }}</label>
                <textarea id="ar-description" class="field-control" rows="2" name="description" [(ngModel)]="formDescription"></textarea>
              </div>
              @if (formError) {
                <p class="field-error">{{ formError }}</p>
              }
              <div class="ar-actions">
                <button type="submit" class="btn btn-primary" [disabled]="busy">
                  {{ 'common.save' | translate }}
                </button>
                <button type="button" class="btn btn-secondary" (click)="formOpen = false">
                  {{ 'common.cancel' | translate }}
                </button>
              </div>
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
      .modal-backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 45%); display: grid; place-items: center; padding: 1rem; z-index: 60; }
      .modal-card { background: var(--surface, #fff); border-radius: 0.6rem; padding: 1.25rem; width: min(560px, 100%); max-height: 85vh; overflow: auto; }
      .ar-actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
      .error-box { color: var(--red-600, #9c3a2c); }
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
