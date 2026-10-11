import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { IconComponent } from '../../../../shared/icon/icon.component';
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
  imports: [FormsModule, TranslatePipe, IconComponent],
  template: `
    <div class="page-container">
      <header class="page-header">
        <h1 class="page-title"><app-icon name="doc" [size]="22" /> {{ 'amendments.memberTitle' | translate }}</h1>
        <p class="page-subtitle">{{ 'amendments.memberSubtitle' | translate }}</p>
      </header>

      @if (error()) {
        <div class="error-box" role="alert"><p style="margin: 0">{{ error() }}</p></div>
      }

      <!-- Propose -->
      <section class="card">
        <h2 class="am-section-title">{{ 'amendments.proposeTitle' | translate }}</h2>
        <p class="field-hint">{{ 'amendments.proposeHint' | translate }}</p>
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
          <label class="checkbox-row">
            <input type="checkbox" name="isDissolution" [(ngModel)]="formDissolution" />
            {{ 'amendments.isDissolution' | translate }}
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
          <button type="submit" class="btn btn-primary"
                  [disabled]="createForm.invalid || !formTitle.trim() || !formText.trim() || saving()">
            {{ 'amendments.submit' | translate }}
          </button>
        </form>
      </section>

      <!-- My proposals -->
      <section class="card">
        <h2 class="am-section-title">{{ 'amendments.myProposals' | translate }}</h2>
        @if (loading()) {
          @for (i of [1, 2]; track i) {
            <div class="skeleton-line" style="height: 64px; margin-bottom: 8px"></div>
          }
        } @else if (proposals().length === 0) {
          <div class="ds-empty">{{ 'amendments.noProposals' | translate }}</div>
        } @else {
          <div class="am-list">
            @for (proposal of proposals(); track proposal.id) {
              <article class="am-item">
                <div class="am-item-head">
                  <strong>{{ proposal.title }}</strong>
                  <span class="ds-tag" [class.ds-tag-blue]="proposal.status === 'submitted'"
                        [class.ds-tag-amber]="proposal.status === 'scheduled'"
                        [class.ds-tag-green]="proposal.status === 'adopted'"
                        [class.ds-tag-gold]="proposal.status === 'rejected' || proposal.status === 'withdrawn'">
                    {{ 'amendments.statuses.' + proposal.status | translate }}
                  </span>
                  @if (proposal.isDissolution) {
                    <span class="ds-tag ds-tag-amber">{{ 'amendments.dissolutionTag' | translate }}</span>
                  }
                </div>
                <p class="am-meta">
                  {{ proposal.proposalNo }}
                  · {{ 'amendments.majority.' + proposal.requiredMajority | translate }}
                  @if (proposal.adoptedVersionNo) {
                    · {{ 'amendments.adoptedAsVersion' | translate: { version: digits(proposal.adoptedVersionNo) } }}
                  }
                </p>
                <p class="am-text-preview">{{ proposal.proposedText }}</p>
                @if (proposal.decisionNote) {
                  <div class="am-note">
                    <strong>{{ 'amendments.decisionNote' | translate }}</strong>
                    <p>{{ proposal.decisionNote }}</p>
                  </div>
                }
                @if (proposal.status === 'submitted' || proposal.status === 'scheduled') {
                  <button type="button" class="btn btn-secondary btn-sm" (click)="withdraw(proposal)">
                    {{ 'amendments.withdraw' | translate }}
                  </button>
                }
              </article>
            }
          </div>
        }
      </section>

      <!-- Constitution versions -->
      <section class="card">
        <h2 class="am-section-title">{{ 'amendments.versionsTitle' | translate }}</h2>
        <p class="field-hint">{{ 'amendments.versionsHint' | translate }}</p>
        @if (versions().length === 0) {
          <div class="ds-empty">{{ 'amendments.noVersions' | translate }}</div>
        } @else {
          <div class="am-list">
            @for (version of versions(); track version.id) {
              <article class="am-item">
                <div class="am-item-head">
                  <strong>{{ 'amendments.versionLabel' | translate: { version: digits(version.versionNo) } }}</strong>
                  @if (version.isCurrent) {
                    <span class="ds-tag ds-tag-green">{{ 'amendments.currentVersion' | translate }}</span>
                  }
                </div>
                @if (version.changesSummary) {
                  <p class="am-meta">{{ version.changesSummary }}</p>
                }
                @if (expandedVersionId() === version.id) {
                  <pre class="am-version-text">{{ version.fullText }}</pre>
                  <button type="button" class="btn btn-secondary btn-sm" (click)="expandedVersionId.set(null)">
                    {{ 'common.close' | translate }}
                  </button>
                } @else {
                  <button type="button" class="btn btn-secondary btn-sm" (click)="expandedVersionId.set(version.id)">
                    {{ 'amendments.viewText' | translate }}
                  </button>
                }
              </article>
            }
          </div>
        }
      </section>
    </div>
  `,
  styles: [
    `
      .page-container { display: grid; gap: 1rem; }
      .page-title { display: flex; align-items: center; gap: 0.5rem; }
      .am-section-title { font-size: 1.05rem; font-weight: 700; margin: 0 0 0.5rem; }
      .am-list { display: grid; gap: 0.85rem; }
      .am-item { display: grid; gap: 0.45rem; justify-items: start; padding: 0.85rem; border-radius: 0.5rem; background: var(--surface-2, #f7f7f5); border: 1px solid var(--gray-200, #e5e7eb); }
      .am-item-head { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
      .am-meta { margin: 0; font-size: 0.82rem; color: var(--gray-600); }
      .am-text-preview { margin: 0; font-size: 0.9rem; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .am-note { border-inline-start: 3px solid var(--emerald-600, #2e5138); padding-inline-start: 0.6rem; }
      .am-note p { margin: 0.2rem 0 0; font-size: 0.9rem; overflow-wrap: anywhere; }
      .am-version-text { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; margin: 0; max-height: 320px; overflow-y: auto; width: 100%; }
      .am-dissolution-warning { display: flex; align-items: center; gap: 0.4rem; color: var(--amber-700, #8a6116); background: var(--surface-2, #f7f7f5); border: 1px solid var(--gold, #c9a34c); border-radius: 0.4rem; padding: 0.5rem 0.75rem; margin: 0 0 0.5rem; }
      .error-box { background: var(--surface-2, #f7f7f5); border: 1px solid var(--red-600, #9c3a2c); border-radius: 0.5rem; padding: 0.75rem; color: var(--red-600, #9c3a2c); }
    `,
  ],
})
export class MemberAmendmentsComponent implements OnInit {
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly formError = signal('');
  readonly proposals = signal<AmendmentProposal[]>([]);
  readonly versions = signal<ConstitutionVersion[]>([]);
  readonly expandedVersionId = signal<number | null>(null);

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
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          this.formError.set(err?.error?.detail || 'amendments.submitError');
        },
      });
  }

  withdraw(proposal: AmendmentProposal): void {
    this.amendments.withdrawProposal(proposal.id).subscribe({
      next: () => this.load(),
      error: (err) => this.error.set(err?.error?.detail || 'amendments.withdrawError'),
    });
  }
}
