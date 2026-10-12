import { ChangeDetectionStrategy, Component, HostListener, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { LanguageService } from '../../../../core/services/language.service';
import {
  RegistersService,
  type WelfareActivity,
  type WelfareActivityType,
} from '../../../../core/services/registers.service';
import { SectionLoaderComponent } from '../../../../shared/section-loader/section-loader.component';
import { DatePickerComponent } from '../../../../shared/date-picker/date-picker.component';
import { localizeDigits } from '../../../../core/services/resolution-book.service';

@Component({
  selector: 'app-welfare-activities',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, IconComponent, DatePickerComponent, SectionLoaderComponent],
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1 class="page-title"><app-icon name="users" [size]="22" /> {{ 'welfareActivities.title' | translate }}</h1>
          <p class="page-subtitle">{{ 'welfareActivities.subtitle' | translate }}</p>
        </div>
        <div class="header-actions">
          <button type="button" class="btn btn-secondary" (click)="downloadPdf()" [disabled]="pdfBusy()">
            <app-icon name="download" [size]="16" /> {{ 'welfareActivities.downloadPdf' | translate }}
          </button>
          <button type="button" class="btn btn-primary" (click)="openForm()">
            <app-icon name="plus" [size]="16" /> {{ 'welfareActivities.add' | translate }}
          </button>
        </div>
      </div>

      @if (error()) {
        <div class="card card-pad error-box" role="alert">
          {{ error() }}
          <button type="button" class="btn btn-secondary btn-sm" (click)="load()">{{ 'common.retry' | translate }}</button>
        </div>
      }

      <div class="am-toolbar">
        <select class="field-control" [(ngModel)]="typeFilter" (ngModelChange)="load()" [disabled]="loading()"
                [attr.aria-label]="'welfareActivities.type' | translate">
          <option value="">{{ 'welfareActivities.allTypes' | translate }}</option>
          @for (type of activityTypes; track type) {
            <option [value]="type">{{ 'welfareActivities.types.' + type | translate }}</option>
          }
        </select>
        @if (!loading() && activities().length > 0) {
          <span class="wa-count">{{ digits(activities().length) }}</span>
        }
      </div>

      <section class="card">
        @if (loading()) {
          <app-section-loader variant="rows" [count]="3" />
        } @else if (error() && activities().length === 0) {
          <!-- error box above carries the retry -->
        } @else if (activities().length === 0) {
          <div class="ds-empty">{{ 'welfareActivities.empty' | translate }}</div>
        } @else {
          <div class="wa-list">
            @for (activity of activities(); track activity.id) {
              <article class="wa-item">
                <div class="wa-item-icon" aria-hidden="true">
                  <app-icon name="sparkle" [size]="20" />
                </div>
                <div class="wa-item-main">
                  <div class="wa-item-head">
                    <strong class="wa-item-title">{{ activity.title }}</strong>
                    <span class="ds-tag ds-tag-blue">{{ 'welfareActivities.types.' + activity.activityType | translate }}</span>
                    <span class="ds-tag"><app-icon name="doc" [size]="12" /> {{ activity.activityDate }}</span>
                  </div>
                  <p class="wa-meta">
                    {{ 'welfareActivities.participants' | translate: { count: digits(activity.participantsCount) } }}
                    @if (activity.organizer) {
                      · {{ activity.organizer }}
                    }
                  </p>
                  @if (activity.outcome) {
                    <p class="wa-outcome">{{ activity.outcome }}</p>
                  }
                </div>
                <div class="wa-actions">
                  <button type="button" class="btn btn-secondary btn-sm" (click)="openForm(activity)">
                    <app-icon name="edit" [size]="14" /> {{ 'common.edit' | translate }}
                  </button>
                  <button type="button" class="btn btn-danger btn-sm" (click)="remove(activity)">
                    <app-icon name="trash" [size]="14" /> {{ 'common.delete' | translate }}
                  </button>
                </div>
              </article>
            }
          </div>
        }
      </section>

      @if (formOpen) {
        <div class="dlg-backdrop" (click)="formOpen = false">
          <div class="dlg wa-dlg" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
            <div class="dlg-head">
              <div class="dlg-heading">
                <h2 class="dlg-title">
                  <span class="dlg-title-icon"><app-icon name="sparkle" [size]="18" /></span>
                  {{ editing ? ('welfareActivities.editTitle' | translate) : ('welfareActivities.addTitle' | translate) }}
                </h2>
                <p class="dlg-sub">{{ 'welfareActivities.formHint' | translate }}</p>
              </div>
              <button type="button" class="dlg-close" (click)="formOpen = false" [attr.aria-label]="'common.close' | translate">
                <app-icon name="x" [size]="18" />
              </button>
            </div>
            <form (ngSubmit)="save()" class="wa-form">
              <div class="dlg-body">
                <div class="field wa-field-full">
                  <label for="wa-title">{{ 'welfareActivities.titleLabel' | translate }} *</label>
                  <input id="wa-title" class="field-control" name="title" [(ngModel)]="formTitle" required />
                </div>
                <div class="field">
                  <label for="wa-date">{{ 'welfareActivities.date' | translate }}</label>
                  <app-date-picker id="wa-date" name="activityDate" [(ngModel)]="formDate" required></app-date-picker>
                </div>
                <div class="field">
                  <label for="wa-type">{{ 'welfareActivities.type' | translate }}</label>
                  <select id="wa-type" class="field-control" name="activityType" [(ngModel)]="formType">
                    @for (type of activityTypes; track type) {
                      <option [value]="type">{{ 'welfareActivities.types.' + type | translate }}</option>
                    }
                  </select>
                </div>
                <div class="field">
                  <label for="wa-count">{{ 'welfareActivities.participantsLabel' | translate }}</label>
                  <input id="wa-count" class="field-control" type="number" min="0" name="participantsCount"
                         [(ngModel)]="formParticipants" required />
                </div>
                <div class="field">
                  <label for="wa-organizer">{{ 'welfareActivities.organizer' | translate }}</label>
                  <input id="wa-organizer" class="field-control" name="organizer" [(ngModel)]="formOrganizer" />
                </div>
                <div class="field wa-field-full">
                  <label for="wa-outcome">{{ 'welfareActivities.outcome' | translate }}</label>
                  <textarea id="wa-outcome" class="field-control" rows="3" name="outcome" [(ngModel)]="formOutcome"></textarea>
                </div>
                @if (formError()) {
                  <p class="dlg-error wa-field-full">{{ formError() }}</p>
                }
              </div>
              <div class="dlg-foot">
                <button type="button" class="btn btn-secondary" (click)="formOpen = false">
                  {{ 'common.cancel' | translate }}
                </button>
                <button type="submit" class="btn btn-primary" [disabled]="busy()">
                  @if (busy()) {
                    <span class="spinner"></span>
                  }
                  {{ 'common.save' | translate }}
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
      .am-toolbar { display: flex; align-items: center; gap: 0.6rem; }
      .am-toolbar .field-control { max-width: 240px; }
      .wa-count {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: 1.7rem; height: 1.7rem; padding: 0 0.5rem;
        border-radius: 999px; background: var(--emerald-50); color: var(--emerald-800);
        font-size: 0.8rem; font-weight: 700;
      }
      .wa-list { display: grid; gap: 0.85rem; padding: 1rem; }
      .wa-item {
        display: flex; gap: 0.85rem; align-items: flex-start;
        padding: 0.9rem 1rem; border-radius: var(--radius-md);
        background: var(--surface-2); border: 1px solid var(--gray-200);
      }
      .wa-item-icon {
        display: flex; align-items: center; justify-content: center;
        width: 2.4rem; height: 2.4rem; flex-shrink: 0;
        border-radius: var(--radius-sm); background: var(--emerald-50); color: var(--emerald-800);
      }
      .wa-item-main { flex: 1; min-width: 0; display: grid; gap: 0.35rem; justify-items: start; }
      .wa-item-head { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
      .wa-item-title { font-size: 0.98rem; overflow-wrap: anywhere; }
      .wa-meta { margin: 0; font-size: 0.82rem; color: var(--gray-600); }
      .wa-outcome { margin: 0; font-size: 0.9rem; overflow-wrap: anywhere; }
      .wa-actions { display: flex; gap: 0.5rem; flex-shrink: 0; }
      .wa-dlg { --dlg-width: 40rem; }
      .wa-form { display: flex; flex-direction: column; min-height: 0; flex: 1; }
      .wa-form .dlg-body {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .wa-field-full { grid-column: 1 / -1; }
      .error-box { color: var(--red-600, #9c3a2c); }
      @media (max-width: 640px) {
        .am-toolbar .field-control { max-width: none; width: 100%; }
        .header-actions { width: 100%; }
        .header-actions .btn { flex: 1 1 100%; min-height: 2.5rem; }
        .wa-item { flex-direction: column; }
        .wa-item-icon { width: 2.1rem; height: 2.1rem; }
        .wa-actions { width: 100%; }
        .wa-actions .btn { flex: 1; min-height: 2.5rem; }
        .wa-form .dlg-body { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class WelfareActivitiesComponent implements OnInit {
  readonly activityTypes: WelfareActivityType[] = ['training', 'welfare', 'other'];
  readonly activities = signal<WelfareActivity[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  typeFilter: WelfareActivityType | '' = '';
  formOpen = false;
  editing: WelfareActivity | null = null;
  formTitle = '';
  formDate = new Date().toISOString().slice(0, 10);
  formType: WelfareActivityType = 'welfare';
  formParticipants = 0;
  formOrganizer = '';
  formOutcome = '';
  readonly formError = signal('');
  readonly busy = signal(false);
  readonly pdfBusy = signal(false);

  private readonly registers = inject(RegistersService);
  private readonly language = inject(LanguageService);
  private readonly translate = inject(TranslateService);
  readonly lang = this.language.lang;

  ngOnInit(): void {
    this.load();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.formOpen) this.formOpen = false;
  }

  digits(value: number | string): string {
    return localizeDigits(value, this.lang());
  }

  load(silent = false): void {
    if (!silent) this.loading.set(true);
    this.error.set('');
    this.registers
      .activities({ activityType: this.typeFilter || undefined })
      .subscribe({
        next: (activities) => {
          this.activities.set(activities);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(this.translate.instant('welfareActivities.loadError'));
          this.loading.set(false);
        },
      });
  }

  openForm(activity?: WelfareActivity): void {
    this.editing = activity ?? null;
    this.formTitle = activity?.title ?? '';
    this.formDate = activity?.activityDate ?? new Date().toISOString().slice(0, 10);
    this.formType = activity?.activityType ?? 'welfare';
    this.formParticipants = activity?.participantsCount ?? 0;
    this.formOrganizer = activity?.organizer ?? '';
    this.formOutcome = activity?.outcome ?? '';
    this.formError.set('');
    this.formOpen = true;
  }

  save(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.formError.set('');
    const input = {
      activityDate: this.formDate,
      title: this.formTitle.trim(),
      activityType: this.formType,
      participantsCount: this.formParticipants ?? 0,
      organizer: this.formOrganizer.trim() || null,
      outcome: this.formOutcome.trim() || null,
    };
    const request$ = this.editing
      ? this.registers.updateActivity(this.editing.id, input)
      : this.registers.createActivity(input);
    request$.subscribe({
      next: () => {
        this.busy.set(false);
        this.formOpen = false;
        this.load(true);
      },
      error: (err) => {
        this.busy.set(false);
        this.formError.set(
          (typeof err?.error?.detail === 'string' && err.error.detail) ||
            this.translate.instant('common.saveFailed'),
        );
      },
    });
  }

  remove(activity: WelfareActivity): void {
    this.registers.deleteActivity(activity.id).subscribe({
      next: () => this.load(true),
      error: () => this.error.set(this.translate.instant('common.saveFailed')),
    });
  }

  downloadPdf(): void {
    if (this.pdfBusy()) return;
    this.pdfBusy.set(true);
    this.registers.downloadActivitiesPdf().subscribe({
      next: (blob) => {
        this.pdfBusy.set(false);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `welfare-activities-${new Date().toISOString().slice(0, 10)}.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: () => {
        this.pdfBusy.set(false);
        this.error.set(this.translate.instant('common.loadFailed'));
      },
    });
  }
}
