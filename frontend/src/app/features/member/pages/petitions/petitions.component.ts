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
      <header class="page-header">
        <h1 class="page-title"><app-icon name="doc" [size]="22" /> {{ 'petitions.title' | translate }}</h1>
        <p class="page-subtitle">{{ 'petitions.subtitle' | translate }}</p>
      </header>

      @if (error()) {
        <div class="error-box" role="alert"><p style="margin: 0">{{ error() }}</p></div>
      }

      <!-- নতুন পিটিশন -->
      <section class="card">
        <h2 class="pt-section-title">{{ 'petitions.createTitle' | translate }}</h2>
        <p class="field-hint">
          {{ 'petitions.thresholdHint' | translate: { percent: digits(thresholdPercent()) } }}
          @if (petitionResponseDays() > 0) {
            · {{ 'petitions.responseDaysHint' | translate: { days: digits(petitionResponseDays()) } }}
          }
        </p>
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
          <button type="submit" class="btn btn-primary" [disabled]="createForm.invalid || !newTitle.trim() || !newJustification.trim() || saving()">
            {{ 'petitions.create' | translate }}
          </button>
        </form>
      </section>

      <!-- স্বাক্ষর করুন: পিটিশন আইডি দিয়ে -->
      <section class="card">
        <h2 class="pt-section-title">{{ 'petitions.signTitle' | translate }}</h2>
        <p class="field-hint">{{ 'petitions.signHint' | translate }}</p>
        <form (ngSubmit)="signById()" #signForm="ngForm">
          <div class="field">
            <label for="pt-sign-id">{{ 'petitions.petitionId' | translate }}</label>
            <input id="pt-sign-id" class="field-control" type="number" min="1" name="signPetitionId" [(ngModel)]="signPetitionId" required />
          </div>
          @if (signErrorText()) {
            <p class="field-error">{{ signErrorText() }}</p>
          }
          @if (signSuccessText()) {
            <p class="pt-success">{{ signSuccessText() | translate }}</p>
          }
          <button type="submit" class="btn btn-secondary" [disabled]="signForm.invalid || !signPetitionId || signing()">
            {{ 'petitions.sign' | translate }}
          </button>
        </form>
      </section>

      <!-- আমার পিটিশন -->
      <section class="card">
        <h2 class="pt-section-title">{{ 'petitions.myPetitions' | translate }}</h2>
        @if (loading()) {
          @for (i of [1, 2]; track i) { <div class="skeleton-line" style="height: 64px; margin-bottom: 8px"></div> }
        } @else if (petitions().length === 0) {
          <div class="ds-empty">{{ 'petitions.empty' | translate }}</div>
        } @else {
          <div class="pt-list">
            @for (petition of petitions(); track petition.id) {
              <ng-container [ngTemplateOutlet]="petitionCard" [ngTemplateOutletContext]="{ $implicit: petition }" />
            }
          </div>
        }
      </section>

      <!-- স্বাক্ষরিত পিটিশনের অগ্রগতি -->
      @if (signedPetitions().length > 0) {
        <section class="card">
          <h2 class="pt-section-title">{{ 'petitions.signedPetitions' | translate }}</h2>
          <div class="pt-list">
            @for (petition of signedPetitions(); track petition.id) {
              <ng-container [ngTemplateOutlet]="petitionCard" [ngTemplateOutletContext]="{ $implicit: petition }" />
            }
          </div>
        </section>
      }

      <!-- পিটিশন কার্ড -->
      <ng-template #petitionCard let-petition>
        <article class="pt-item">
          <div class="pt-item-head">
            <strong>{{ petition.title }}</strong>
            <span class="ds-tag" [class.ds-tag-green]="petition.status === 'scheduled' || petition.status === 'responded'" [class.ds-tag-amber]="petition.status === 'rejected'" [class.ds-tag-blue]="petition.status === 'submitted' || petition.status === 'under_review'">
              {{ 'petitions.statuses.' + petition.status | translate }}
            </span>
          </div>
          <p class="pt-justification">{{ petition.justification }}</p>
          <p class="pt-meta">
            {{ petition.petitionNo }}
            · {{ 'petitions.signatures' | translate: { count: digits(petition.signatureCount), required: digits(petition.requiredCount) } }}
            @if (petition.responseDue) {
              · {{ 'petitions.responseDue' | translate: { date: fmtDate(petition.responseDue) } }}
            }
          </p>

          <div class="pt-progress" role="progressbar" [attr.aria-valuenow]="petition.signatureCount" [attr.aria-valuemax]="petition.requiredCount">
            <span class="pt-progress-fill" [style.width.%]="progressPercent(petition)"></span>
          </div>

          @if (petition.sla; as sla) {
            <span class="ds-badge" [class.ds-badge-green]="sla.state === 'met' || sla.state === 'on_track'" [class.ds-badge-blue]="sla.state === 'due_soon'">
              {{ 'petitions.sla.' + sla.state | translate }}
            </span>
          }

          @if (petition.committeeResponse) {
            <div class="pt-response">
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
      .page-title { display: flex; align-items: center; gap: 0.5rem; }
      .pt-section-title { font-size: 1.05rem; font-weight: 700; margin: 0 0 0.5rem; }
      .pt-list { display: grid; gap: 0.85rem; }
      .pt-item { display: grid; gap: 0.45rem; justify-items: start; padding: 0.85rem; border-radius: 0.5rem; background: var(--surface-2, #f7f7f5); border: 1px solid var(--gray-200, #e5e7eb); }
      .pt-item-head { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
      .pt-justification { margin: 0; font-size: 0.9rem; overflow-wrap: anywhere; }
      .pt-meta { margin: 0; font-size: 0.82rem; color: var(--gray-600); }
      .pt-progress { width: 100%; max-width: 420px; height: 10px; border-radius: 999px; background: var(--gray-200, #e5e7eb); overflow: hidden; }
      .pt-progress-fill { display: block; height: 100%; background: var(--emerald-600, #2e5138); border-radius: 999px; transition: width 0.2s ease; }
      .pt-response { border-inline-start: 3px solid var(--emerald-600, #2e5138); padding-inline-start: 0.6rem; }
      .pt-response p { margin: 0.2rem 0 0; font-size: 0.9rem; white-space: pre-wrap; overflow-wrap: anywhere; }
      .pt-success { color: var(--emerald-700, #2e5138); font-weight: 600; margin: 0 0 0.5rem; }
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
    this.petitionsService
      .createPetition({ title: this.newTitle.trim(), justification: this.newJustification.trim() })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.newTitle = '';
          this.newJustification = '';
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
