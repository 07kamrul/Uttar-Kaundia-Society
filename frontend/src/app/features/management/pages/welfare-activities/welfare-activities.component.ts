import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { LanguageService } from '../../../../core/services/language.service';
import {
  RegistersService,
  type WelfareActivity,
  type WelfareActivityType,
} from '../../../../core/services/registers.service';
import { DatePickerComponent } from '../../../../shared/date-picker/date-picker.component';
import { localizeDigits } from '../../../../core/services/resolution-book.service';

@Component({
  selector: 'app-welfare-activities',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, IconComponent, DatePickerComponent],
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1 class="page-title"><app-icon name="users" [size]="22" /> {{ 'welfareActivities.title' | translate }}</h1>
          <p class="page-subtitle">{{ 'welfareActivities.subtitle' | translate }}</p>
        </div>
        <div class="header-actions">
          <button type="button" class="btn btn-secondary" (click)="downloadPdf()" [disabled]="pdfBusy">
            {{ 'welfareActivities.downloadPdf' | translate }}
          </button>
          <button type="button" class="btn btn-primary" (click)="openForm()">
            <app-icon name="plus" [size]="16" /> {{ 'welfareActivities.add' | translate }}
          </button>
        </div>
      </div>

      @if (error()) {
        <div class="card card-pad error-box" role="alert">{{ error() }}</div>
      }

      <div class="am-toolbar">
        <select class="field-control" [(ngModel)]="typeFilter" (ngModelChange)="load()">
          <option value="">{{ 'welfareActivities.allTypes' | translate }}</option>
          @for (type of activityTypes; track type) {
            <option [value]="type">{{ 'welfareActivities.types.' + type | translate }}</option>
          }
        </select>
      </div>

      <section class="card">
        @if (loading()) {
          @for (i of [1, 2, 3]; track i) {
            <div class="skeleton-line" style="height: 48px; margin-bottom: 8px"></div>
          }
        } @else if (activities().length === 0) {
          <div class="ds-empty">{{ 'welfareActivities.empty' | translate }}</div>
        } @else {
          <div class="wa-list">
            @for (activity of activities(); track activity.id) {
              <article class="wa-item">
                <div class="wa-item-head">
                  <strong>{{ activity.title }}</strong>
                  <span class="ds-tag ds-tag-blue">{{ 'welfareActivities.types.' + activity.activityType | translate }}</span>
                  <span class="ds-tag">{{ activity.activityDate }}</span>
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
                <div class="wa-actions">
                  <button type="button" class="btn btn-secondary btn-sm" (click)="openForm(activity)">
                    {{ 'common.edit' | translate }}
                  </button>
                  <button type="button" class="btn btn-danger btn-sm" (click)="remove(activity)">
                    {{ 'common.delete' | translate }}
                  </button>
                </div>
              </article>
            }
          </div>
        }
      </section>

      @if (formOpen) {
        <div class="modal-backdrop" (click)="formOpen = false">
          <div class="modal-card" (click)="$event.stopPropagation()">
            <h3>{{ editing ? ('welfareActivities.editTitle' | translate) : ('welfareActivities.addTitle' | translate) }}</h3>
            <form (ngSubmit)="save()">
              <div class="field">
                <label for="wa-title">{{ 'welfareActivities.titleLabel' | translate }}</label>
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
              <div class="field">
                <label for="wa-outcome">{{ 'welfareActivities.outcome' | translate }}</label>
                <textarea id="wa-outcome" class="field-control" rows="3" name="outcome" [(ngModel)]="formOutcome"></textarea>
              </div>
              @if (formError) {
                <p class="field-error">{{ formError }}</p>
              }
              <div class="wa-modal-actions">
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
      .am-toolbar .field-control { max-width: 220px; }
      .wa-list { display: grid; gap: 0.85rem; }
      .wa-item { display: grid; gap: 0.45rem; justify-items: start; padding: 0.85rem; border-radius: 0.5rem; background: var(--surface-2, #f7f7f5); border: 1px solid var(--gray-200, #e5e7eb); }
      .wa-item-head { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
      .wa-meta { margin: 0; font-size: 0.82rem; color: var(--gray-600); }
      .wa-outcome { margin: 0; font-size: 0.9rem; overflow-wrap: anywhere; }
      .wa-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .modal-backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 45%); display: grid; place-items: center; padding: 1rem; z-index: 60; }
      .modal-card { background: var(--surface, #fff); border-radius: 0.6rem; padding: 1.25rem; width: min(560px, 100%); max-height: 85vh; overflow: auto; }
      .wa-modal-actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
      .error-box { color: var(--red-600, #9c3a2c); }
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

  digits(value: number | string): string {
    return localizeDigits(value, this.lang());
  }

  load(): void {
    this.loading.set(true);
    this.registers
      .activities({ activityType: this.typeFilter || undefined })
      .subscribe({
        next: (activities) => {
          this.activities.set(activities);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('welfareActivities.loadError');
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
    this.formError = '';
    this.formOpen = true;
  }

  save(): void {
    if (this.busy) return;
    this.busy = true;
    this.formError = '';
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

  remove(activity: WelfareActivity): void {
    this.registers.deleteActivity(activity.id).subscribe({
      next: () => this.load(),
      error: () => this.error.set(this.translate.instant('common.saveFailed')),
    });
  }

  downloadPdf(): void {
    if (this.pdfBusy) return;
    this.pdfBusy = true;
    this.registers.downloadActivitiesPdf().subscribe({
      next: (blob) => {
        this.pdfBusy = false;
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
        this.pdfBusy = false;
        this.error.set(this.translate.instant('common.loadFailed'));
      },
    });
  }
}
