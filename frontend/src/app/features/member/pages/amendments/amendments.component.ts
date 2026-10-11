import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { ConfirmModalComponent } from '../../../../shared/confirm-modal/confirm-modal.component';
import { LanguageService } from '../../../../core/services/language.service';
import {
  AmendmentsService,
  type AmendmentProposal,
  type ConstitutionVersion,
} from '../../../../core/services/amendments.service';
import { localizeDigits } from '../../../../core/services/resolution-book.service';

@Component({
  selector: 'app-member-amendments',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, IconComponent, ConfirmModalComponent],
  template: `
    <div class="page-container">
      <header class="gov-hero">
        <span class="gov-hero-icon"><app-icon name="doc" [size]="22" /></span>
        <div class="gov-hero-text">
          <h1 class="gov-hero-title">{{ 'amendments.memberTitle' | translate }}</h1>
          <p class="gov-hero-sub">{{ 'amendments.memberSubtitle' | translate }}</p>
        </div>
        @if (versions().length) {
          <div class="gov-hero-side">
            <span class="ds-badge">{{ 'amendments.versionLabel' | translate: { version: digits(currentVersionNo()) } }}</span>
          </div>
        }
      </header>

      @if (error()) {
        <div class="error-box" role="alert"><p style="margin: 0">{{ error() }}</p></div>
      }

      <!-- Propose -->
      <section class="ds-card">
        <div class="ds-card-header">
          <span class="ds-card-icon"><app-icon name="plus" [size]="18" /></span>
          <div class="ds-card-heading">
            <h2 class="ds-card-title">{{ 'amendments.proposeTitle' | translate }}</h2>
            <p class="ds-card-sub">{{ 'amendments.proposeHint' | translate }}</p>
          </div>
        </div>
        <div class="ds-card-body">
          <form (ngSubmit)="propose()" #createForm="ngForm">
            <div class="field">
              <label for="am-title">{{ 'amendments.title' | translate }}</label>
              <input id="am-title" class="field-control" name="title" [(ngModel)]="formTitle" maxlength="255" required />
            </div>
            <div class="field">
              <label for="am-rationale">{{ 'amendments.rationale' | translate }}</label>
              <textarea id="am-rationale" class="field-control" rows="3" name="rationale"
                        [(ngModel)]="formRationale" maxlength="10000" required></textarea>
            </div>
            <div class="field">
              <label for="am-text">{{ 'amendments.proposedText' | translate }}</label>
              <textarea id="am-text" class="field-control" rows="5" name="proposedText"
                        [(ngModel)]="formText" maxlength="100000" required></textarea>
            </div>
            <label class="am-dissolution">
              <input type="checkbox" name="isDissolution" [(ngModel)]="formDissolution" />
              <span>{{ 'amendments.isDissolution' | translate }}</span>
            </label>
            @if (formDissolution) {
              <p class="am-dissolution-warning" role="alert">
                <app-icon name="alert" [size]="16" />
                {{ dissolutionNotice() }}
              </p>
            }
            @if (formError()) {
              <p class="field-error">{{ formError() }}</p>
            }
            @if (submitSuccess()) {
              <p class="gov-success"><app-icon name="check-circle" [size]="16" /> {{ 'amendments.submitSuccess' | translate }}</p>
            }
            <div class="form-actions">
              <button type="submit" class="btn btn-primary"
                      [disabled]="createForm.invalid || !formTitle.trim() || !formText.trim() || saving()">
                {{ 'amendments.submit' | translate }}
              </button>
            </div>
          </form>
        </div>
      </section>

      <!-- My proposals -->
      <section class="ds-card">
        <div class="ds-card-header">
          <span class="ds-card-icon"><app-icon name="doc" [size]="18" /></span>
          <div class="ds-card-heading">
            <h2 class="ds-card-title">{{ 'amendments.myProposals' | translate }}</h2>
          </div>
        </div>
        <div class="ds-card-body">
          @if (loading()) {
            @for (i of [1, 2]; track i) {
              <div class="skeleton-line" style="height: 64px; margin-bottom: 8px"></div>
            }
          } @else if (proposals().length === 0) {
            <div class="gov-empty">
              <span class="gov-empty-icon"><app-icon name="doc" [size]="22" /></span>
              <p>{{ 'amendments.noProposals' | translate }}</p>
            </div>
          } @else {
            <div class="am-list">
              @for (proposal of proposals(); track proposal.id) {
                <article class="gov-item" [class.gov-item-green]="proposal.status === 'adopted'" [class.gov-item-red]="proposal.status === 'rejected'" [class.gov-item-amber]="proposal.status === 'scheduled' || proposal.status === 'withdrawn'" [class.gov-item-blue]="proposal.status === 'submitted'">
                  <div class="gov-item-head">
                    <strong class="am-title">{{ proposal.title }}</strong>
                    <span class="ds-tag" [attr.data-tone]="statusTone(proposal.status)">
                      {{ 'amendments.statuses.' + proposal.status | translate }}
                    </span>
                    @if (proposal.isDissolution) {
                      <span class="ds-tag ds-tag-amber">{{ 'amendments.dissolutionTag' | translate }}</span>
                    }
                  </div>
                  <p class="am-meta gov-item-chiprow">
                    <span class="ds-mono">{{ proposal.proposalNo }}</span>
                    · {{ 'amendments.majority.' + proposal.requiredMajority | translate }}
                    @if (proposal.adoptedVersionNo) {
                      · {{ 'amendments.adoptedAsVersion' | translate: { version: digits(proposal.adoptedVersionNo) } }}
                    }
                  </p>
                  <p class="am-text-preview">{{ proposal.proposedText }}</p>
                  @if (proposal.decisionNote) {
                    <div class="gov-item-note">
                      <strong>{{ 'amendments.decisionNote' | translate }}</strong>
                      <p>{{ proposal.decisionNote }}</p>
                    </div>
                  }
                  @if (proposal.status === 'submitted' || proposal.status === 'scheduled') {
                    <button type="button" class="btn btn-secondary btn-sm" (click)="askWithdraw(proposal)">
                      {{ 'amendments.withdraw' | translate }}
                    </button>
                  }
                </article>
              }
            </div>
          }
        </div>
      </section>

      <!-- Constitution versions -->
      <section class="ds-card">
        <div class="ds-card-header">
          <span class="ds-card-icon"><app-icon name="layers" [size]="18" /></span>
          <div class="ds-card-heading">
            <h2 class="ds-card-title">{{ 'amendments.versionsTitle' | translate }}</h2>
            <p class="ds-card-sub">{{ 'amendments.versionsHint' | translate }}</p>
          </div>
        </div>
        <div class="ds-card-body">
          @if (versions().length === 0) {
            <div class="gov-empty">
              <span class="gov-empty-icon"><app-icon name="layers" [size]="22" /></span>
              <p>{{ 'amendments.noVersions' | translate }}</p>
            </div>
          } @else {
            <div class="am-list">
              @for (version of versions(); track version.id) {
                <article class="am-version" [class.is-current]="version.isCurrent" [class.is-open]="expandedVersionId() === version.id">
                  <button type="button" class="am-version-head" (click)="toggleVersion(version.id)" [attr.aria-expanded]="expandedVersionId() === version.id">
                    <strong>{{ 'amendments.versionLabel' | translate: { version: digits(version.versionNo) } }}</strong>
                    @if (version.isCurrent) {
                      <span class="ds-tag ds-tag-green">{{ 'amendments.currentVersion' | translate }}</span>
                    }
                    <app-icon class="am-version-chevron" name="chevron-down" [size]="16" />
                  </button>
                  @if (expandedVersionId() === version.id) {
                    <div class="am-version-body">
                      @if (version.changesSummary) {
                        <p class="am-meta gov-item-chiprow">{{ version.changesSummary }}</p>
                      }
                      <pre class="am-version-text">{{ version.fullText }}</pre>
                    </div>
                  }
                </article>
              }
            </div>
          }
        </div>
      </section>

      <!-- প্রত্যাহার নিশ্চিতকরণ -->
      <app-confirm-modal
        [open]="withdrawTarget() !== null"
        [title]="'amendments.withdraw' | translate"
        [message]="'amendments.withdrawConfirm' | translate"
        [confirmLabel]="'amendments.withdraw' | translate"
        [loading]="saving()"
        (confirm)="confirmWithdraw()"
        (cancel)="withdrawTarget.set(null)"
      />
    </div>
  `,
  styles: [
    `
      .page-container { display: grid; gap: 1rem; }
      .am-list { display: grid; gap: 0.85rem; }
      .am-title { font-size: 0.95rem; line-height: 1.45; overflow-wrap: anywhere; }
      .am-meta { width: 100%; }
      .am-text-preview { color: var(--gray-600); font-size: 0.88rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      /* Dissolution opt-in: checkbox + conditional warning kept together. */
      .am-dissolution { display: flex; align-items: center; gap: 0.45rem; margin: 0.4rem 0; font-size: 0.875rem; color: var(--gray-700); cursor: pointer; }
      .am-dissolution-warning { display: flex; align-items: center; gap: 0.45rem; color: var(--gold-strong); background: var(--amber-50); border: 1px solid var(--amber-200); border-radius: 0.4rem; padding: 0.55rem 0.75rem; margin: 0 0 0.5rem; font-size: 0.85rem; line-height: 1.6; }
      /* Constitution versions: accordion rows; current version highlighted. */
      .am-version {
        border: 1px solid var(--gray-200);
        border-radius: var(--radius-sm);
        background: var(--gray-50);
        overflow: hidden;
        transition: border-color 0.15s;
      }
      .am-version.is-current { border-color: color-mix(in srgb, var(--emerald-600) 35%, var(--gray-200)); }
      .am-version.is-open { background: var(--surface); }
      .am-version-head {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        width: 100%;
        padding: 0.75rem 0.9rem;
        border: none;
        background: transparent;
        font: inherit;
        color: var(--gray-800);
        text-align: start;
        cursor: pointer;
      }
      .am-version-head strong { flex: 1; min-width: 0; }
      .am-version-chevron { color: var(--gray-500); transition: transform 0.18s ease; flex-shrink: 0; }
      .am-version.is-open .am-version-chevron { transform: rotate(180deg); }
      .am-version-body { padding: 0 0.9rem 0.9rem; display: grid; gap: 0.55rem; }
      .am-version-text { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; margin: 0; max-height: 320px; overflow-y: auto; width: 100%; padding: 0.75rem; border: 1px dashed var(--gray-200); border-radius: var(--radius-sm); background: var(--gray-50); }
    `,
  ],
})
export class MemberAmendmentsComponent implements OnInit {
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly formError = signal('');
  readonly submitSuccess = signal(false);
  readonly proposals = signal<AmendmentProposal[]>([]);
  readonly versions = signal<ConstitutionVersion[]>([]);
  readonly expandedVersionId = signal<number | null>(null);
  readonly withdrawTarget = signal<AmendmentProposal | null>(null);

  formTitle = '';
  formRationale = '';
  formText = '';
  formDissolution = false;

  private readonly amendments = inject(AmendmentsService);
  private readonly language = inject(LanguageService);
  private readonly translate = inject(TranslateService);
  readonly lang = this.language.lang;

  ngOnInit(): void {
    this.load();
  }

  dissolutionNotice(): string {
    return this.translate.instant('amendments.dissolutionNotice');
  }

  currentVersionNo(): number {
    return this.versions().find((version) => version.isCurrent)?.versionNo ?? 1;
  }

  statusTone(status: string): string {
    if (status === 'adopted') return 'good';
    if (status === 'rejected') return 'bad';
    if (status === 'scheduled' || status === 'withdrawn') return 'warn';
    return 'neutral';
  }

  toggleVersion(id: number): void {
    this.expandedVersionId.set(this.expandedVersionId() === id ? null : id);
  }

  digits(value: number | string): string {
    return localizeDigits(value, this.lang());
  }

  load(): void {
    this.loading.set(true);
    this.amendments.myProposals().subscribe({
      next: (proposals) => {
        this.proposals.set(proposals);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('amendments.loadError');
        this.loading.set(false);
      },
    });
    this.amendments.versions().subscribe({
      next: (versions) => this.versions.set(versions),
      error: () => this.versions.set([]),
    });
  }

  propose(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.formError.set('');
    this.submitSuccess.set(false);
    this.amendments
      .createProposal({
        title: this.formTitle.trim(),
        rationale: this.formRationale.trim(),
        proposedText: this.formText,
        isDissolution: this.formDissolution,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.formTitle = '';
          this.formRationale = '';
          this.formText = '';
          this.formDissolution = false;
          this.submitSuccess.set(true);
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          this.formError.set(err?.error?.detail || 'amendments.submitError');
        },
      });
  }

  askWithdraw(proposal: AmendmentProposal): void {
    this.withdrawTarget.set(proposal);
  }

  confirmWithdraw(): void {
    const proposal = this.withdrawTarget();
    if (!proposal || this.saving()) return;
    this.saving.set(true);
    this.amendments.withdrawProposal(proposal.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.withdrawTarget.set(null);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.withdrawTarget.set(null);
        this.error.set(err?.error?.detail || 'amendments.withdrawError');
      },
    });
  }
}
