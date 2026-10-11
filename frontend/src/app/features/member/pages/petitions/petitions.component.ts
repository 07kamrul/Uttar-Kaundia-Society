import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { LanguageService } from '../../../../core/services/language.service';
import { GovernanceService } from '../../../../core/services/governance.service';
import {
  PetitionsService,
  type Petition,
} from '../../../../core/services/petitions.service';
import { localizeDigits } from '../../../../core/services/resolution-book.service';

@Component({
  selector: 'app-member-petitions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, FormsModule, IconComponent, NgTemplateOutlet],
  template: `
    <div class="page-container">
      <header class="gov-hero">
        <span class="gov-hero-icon"><app-icon name="doc" [size]="22" /></span>
        <div class="gov-hero-text">
          <h1 class="gov-hero-title">{{ 'petitions.title' | translate }}</h1>
          <p class="gov-hero-sub">{{ 'petitions.subtitle' | translate }}</p>
        </div>
        <div class="gov-hero-side">
          <span class="ds-badge">{{ 'petitions.thresholdHint' | translate: { percent: digits(thresholdPercent()) } }}</span>
          @if (petitionResponseDays() > 0) {
            <span class="ds-badge">{{ 'petitions.responseDaysHint' | translate: { days: digits(petitionResponseDays()) } }}</span>
          }
        </div>
      </header>

      @if (error()) {
        <div class="error-box" role="alert"><p style="margin: 0">{{ error() }}</p></div>
      }

      <div class="pt-split">
        <!-- নতুন পিটিশন -->
        <section class="ds-card">
          <div class="ds-card-header">
            <span class="ds-card-icon"><app-icon name="plus" [size]="18" /></span>
            <div class="ds-card-heading">
              <h2 class="ds-card-title">{{ 'petitions.createTitle' | translate }}</h2>
            </div>
          </div>
          <div class="ds-card-body">
            <form (ngSubmit)="createPetition()" #createForm="ngForm">
              <div class="field">
                <label for="pt-title">{{ 'petitions.petitionTitle' | translate }}</label>
                <input id="pt-title" class="field-control" name="title" [(ngModel)]="newTitle" maxlength="255" required />
              </div>
              <div class="field">
                <label for="pt-justification">{{ 'petitions.justification' | translate }}</label>
                <textarea id="pt-justification" class="field-control" rows="4" maxlength="5000" name="justification" [(ngModel)]="newJustification" required></textarea>
              </div>
              @if (formError()) {
                <p class="field-error">{{ formError() }}</p>
              }
              @if (createSuccess()) {
                <p class="gov-success"><app-icon name="check-circle" [size]="16" /> {{ 'petitions.createSuccess' | translate }}</p>
              }
              <div class="form-actions">
                <button type="submit" class="btn btn-primary" [disabled]="createForm.invalid || !newTitle.trim() || !newJustification.trim() || saving()">
                  {{ 'petitions.create' | translate }}
                </button>
              </div>
            </form>
          </div>
        </section>

        <!-- স্বাক্ষর করুন: পিটিশন আইডি দিয়ে -->
        <section class="ds-card">
          <div class="ds-card-header">
            <span class="ds-card-icon"><app-icon name="check" [size]="18" /></span>
            <div class="ds-card-heading">
              <h2 class="ds-card-title">{{ 'petitions.signTitle' | translate }}</h2>
              <p class="ds-card-sub">{{ 'petitions.signHint' | translate }}</p>
            </div>
          </div>
          <div class="ds-card-body">
            <form (ngSubmit)="signById()" #signForm="ngForm">
              <div class="field pt-id-field">
                <label for="pt-sign-id">{{ 'petitions.petitionId' | translate }}</label>
                <input id="pt-sign-id" class="field-control" type="number" min="1" name="signPetitionId" [(ngModel)]="signPetitionId" required />
              </div>
              @if (signErrorText()) {
                <p class="field-error">{{ signErrorText() }}</p>
              }
              @if (signSuccessText()) {
                <p class="gov-success"><app-icon name="check-circle" [size]="16" /> {{ signSuccessText() | translate }}</p>
              }
              <div class="form-actions">
                <button type="submit" class="btn btn-secondary" [disabled]="signForm.invalid || !signPetitionId || signing()">
                  {{ 'petitions.sign' | translate }}
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>

      <!-- আমার পিটিশন -->
      <section class="ds-card">
        <div class="ds-card-header">
          <span class="ds-card-icon"><app-icon name="doc" [size]="18" /></span>
          <div class="ds-card-heading">
            <h2 class="ds-card-title">{{ 'petitions.myPetitions' | translate }}</h2>
          </div>
        </div>
        <div class="ds-card-body">
          @if (loading()) {
            @for (i of [1, 2]; track i) { <div class="skeleton-line" style="height: 64px; margin-bottom: 8px"></div> }
          } @else if (petitions().length === 0) {
            <div class="gov-empty">
              <span class="gov-empty-icon"><app-icon name="doc" [size]="22" /></span>
              <p>{{ 'petitions.empty' | translate }}</p>
            </div>
          } @else {
            <div class="pt-list">
              @for (petition of petitions(); track petition.id) {
                <ng-container [ngTemplateOutlet]="petitionCard" [ngTemplateOutletContext]="{ $implicit: petition }" />
              }
            </div>
          }
        </div>
      </section>

      <!-- স্বাক্ষরিত পিটিশনের অগ্রগতি -->
      @if (signedPetitions().length > 0) {
        <section class="ds-card">
          <div class="ds-card-header">
            <span class="ds-card-icon"><app-icon name="check" [size]="18" /></span>
            <div class="ds-card-heading">
              <h2 class="ds-card-title">{{ 'petitions.signedPetitions' | translate }}</h2>
            </div>
          </div>
          <div class="ds-card-body">
            <div class="pt-list">
              @for (petition of signedPetitions(); track petition.id) {
                <ng-container [ngTemplateOutlet]="petitionCard" [ngTemplateOutletContext]="{ $implicit: petition }" />
              }
            </div>
          </div>
        </section>
      }

      <!-- পিটিশন কার্ড -->
      <ng-template #petitionCard let-petition>
        <article class="gov-item" [class.gov-item-green]="petition.status === 'scheduled' || petition.status === 'responded'" [class.gov-item-red]="petition.status === 'rejected'" [class.gov-item-blue]="petition.status === 'submitted' || petition.status === 'under_review'">
          <div class="gov-item-head">
            <strong class="pt-title">{{ petition.title }}</strong>
            <span class="ds-tag" [attr.data-tone]="petition.status === 'scheduled' || petition.status === 'responded' ? 'good' : petition.status === 'rejected' ? 'bad' : 'neutral'">
              {{ 'petitions.statuses.' + petition.status | translate }}
            </span>
          </div>
          <p class="pt-justification">{{ petition.justification }}</p>

          <div class="pt-progress-row">
            <div class="gov-meter" role="progressbar" [attr.aria-valuenow]="petition.signatureCount" [attr.aria-valuemax]="petition.requiredCount">
              <span class="gov-meter-fill" [style.width.%]="progressPercent(petition)"></span>
            </div>
            <strong class="pt-progress-pct" [class.pt-progress-pct-met]="progressPercent(petition) >= 100">{{ digits(progressPercent(petition)) }}%</strong>
          </div>
          <p class="gov-item-chiprow">
            <span class="ds-mono">{{ petition.petitionNo }}</span>
            · {{ 'petitions.signatures' | translate: { count: digits(petition.signatureCount), required: digits(petition.requiredCount) } }}
            @if (petition.responseDue) {
              · {{ 'petitions.responseDue' | translate: { date: fmtDate(petition.responseDue) } }}
            }
          </p>

          @if (petition.sla; as sla) {
            <span class="ds-badge" [attr.data-tone]="sla.state === 'overdue' ? 'bad' : sla.state === 'due_soon' ? 'warn' : 'good'">
              {{ 'petitions.sla.' + sla.state | translate }}
            </span>
          }

          @if (petition.committeeResponse) {
            <div class="gov-item-note">
              <strong>{{ 'petitions.committeeResponse' | translate }}</strong>
              <p>{{ petition.committeeResponse }}</p>
            </div>
          }
        </article>
      </ng-template>
    </div>
  `,
  styles: [
    `
      .page-container { display: grid; gap: 1rem; }
      /* Create + sign side by side on wide screens. */
      .pt-split { display: grid; gap: 1rem; align-items: start; }
      @media (min-width: 1024px) {
        .pt-split { grid-template-columns: 3fr 2fr; }
      }
      .pt-id-field { max-width: 14rem; }
      .pt-list { display: grid; gap: 0.85rem; }
      .pt-title { font-size: 0.95rem; line-height: 1.45; overflow-wrap: anywhere; }
      .pt-justification { color: var(--gray-600); font-size: 0.88rem; }
      .pt-progress-row { display: flex; align-items: center; gap: 0.7rem; width: 100%; }
      .pt-progress-row .gov-meter { flex: 1; max-width: none; }
      .pt-progress-pct { font-size: 0.85rem; font-variant-numeric: tabular-nums; color: var(--gray-700); flex-shrink: 0; }
      .pt-progress-pct-met { color: var(--emerald-700); }
    `,
  ],
})
export class MemberPetitionsComponent implements OnInit {
  private readonly petitionsService = inject(PetitionsService);
  private readonly governance = inject(GovernanceService);
  private readonly language = inject(LanguageService);

  readonly lang = this.language.lang;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly signing = signal(false);
  readonly error = signal('');
  readonly petitions = signal<Petition[]>([]);
  readonly signedPetitions = signal<Petition[]>([]);
  readonly signErrorText = signal('');
  readonly signSuccessText = signal('');
  readonly formError = signal('');
  readonly createSuccess = signal(false);
  readonly thresholdPercent = signal(20);
  readonly petitionResponseDays = signal(30);

  // Plain form state (ngModel mutation pattern).
  newTitle = '';
  newJustification = '';
  signPetitionId: number | null = null;

  ngOnInit(): void {
    this.governance.constants().subscribe({
      next: (constants) => this.petitionResponseDays.set(constants.notice_periods.petition_response_days),
      error: () => this.petitionResponseDays.set(0),
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.petitionsService.myPetitions().subscribe({
      next: (page) => {
        this.petitions.set(page.items);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('petitions.loadError');
        this.loading.set(false);
      },
    });
  }

  createPetition(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.formError.set('');
    this.createSuccess.set(false);
    this.petitionsService
      .createPetition({ title: this.newTitle.trim(), justification: this.newJustification.trim() })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.newTitle = '';
          this.newJustification = '';
          this.createSuccess.set(true);
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          this.formError.set(err?.error?.detail || 'petitions.createError');
        },
      });
  }

  /** Direct sign: the progress endpoint 403s non-signers, so the flow signs
   * first and reads progress afterwards. 409 (already signed / closed) and
   * 403 (ineligible) surface verbatim in Bangla. */
  signById(): void {
    const id = Number(this.signPetitionId);
    if (!Number.isFinite(id) || id <= 0 || this.signing()) return;
    this.signing.set(true);
    this.signErrorText.set('');
    this.signSuccessText.set('');
    this.petitionsService.signPetition(id).subscribe({
      next: (signed) => {
        this.signing.set(false);
        this.signSuccessText.set('petitions.signSuccess');
        this.signPetitionId = null;
        this.upsertSigned(signed);
      },
      error: (err) => {
        this.signing.set(false);
        this.signErrorText.set(err?.error?.detail || 'petitions.signError');
      },
    });
  }

  private upsertSigned(petition: Petition): void {
    this.signedPetitions.set([
      petition,
      ...this.signedPetitions().filter((item) => item.id !== petition.id),
    ]);
  }

  progressPercent(petition: Petition): number {
    if (petition.requiredCount <= 0) return petition.signatureCount > 0 ? 100 : 0;
    return Math.min(100, Math.round((petition.signatureCount * 100) / petition.requiredCount));
  }

  fmtDate(iso: string | null): string {
    if (!iso) return '—';
    const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleDateString(this.lang() === 'bn' ? 'bn-BD' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  digits(value: number | string): string {
    return localizeDigits(value, this.lang());
  }
}
