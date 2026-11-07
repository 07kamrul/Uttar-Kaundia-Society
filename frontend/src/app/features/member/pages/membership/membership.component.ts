import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SectionLoaderComponent } from '../../../../shared/section-loader/section-loader.component';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { LanguageService } from '../../../../core/services/language.service';
import {
  GovernanceService,
  MembershipAction,
  MembershipApplication,
  MembershipAppeal,
  FeeWaiver,
  SlaInfo,
} from '../../../../core/services/governance.service';
import { PhoneInputComponent } from '../../../../shared/phone-input/phone-input.component';

type Tab = 'applications' | 'appeals' | 'waivers' | 'notices';

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

@Component({
  selector: 'app-membership',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SectionLoaderComponent, TranslatePipe, DatePipe, FormsModule, IconComponent, PhoneInputComponent],
  templateUrl: './membership.component.html',
  styles: [
    `
      .page-container { display: grid; gap: 1rem; }
      .mb-tab-bar { margin-bottom: 0.25rem; }
      .ds-tab app-icon { vertical-align: -3px; margin-inline-end: 0.3rem; }
      /* Two-column field grid on wide screens; fields keep their global look. */
      .mb-grid { display: grid; gap: 0 1.1rem; }
      @media (min-width: 768px) {
        .mb-grid { grid-template-columns: 1fr 1fr; }
        .mb-grid .field-row { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; gap: 0 1.1rem; }
      }
      .mb-docs {
        display: grid;
        gap: 0 1.1rem;
        margin-top: 0.4rem;
        padding-top: 0.9rem;
        border-top: 1px dashed var(--gray-200);
      }
      @media (min-width: 768px) {
        .mb-docs { grid-template-columns: 1fr 1fr; }
      }
      .mb-consent { margin: 0.6rem 0 0.4rem; font-size: 0.875rem; line-height: 1.6; }
      .mb-months { max-width: 12rem; }
      .timeline-row td { background: var(--gray-50); }
      .mb-note { color: var(--gray-500); }
    `,
  ],
})
export class MembershipComponent implements OnInit {
  private readonly governance = inject(GovernanceService);
  private readonly translate = inject(TranslateService);
  readonly lang = inject(LanguageService).lang;

  readonly tab = signal<Tab>('applications');
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly submitting = signal(false);
  readonly applications = signal<MembershipApplication[]>([]);
  readonly appeals = signal<MembershipAppeal[]>([]);
  readonly waivers = signal<FeeWaiver[]>([]);
  readonly actions = signal<Array<MembershipAction & { responseText?: string }>>([]);
  readonly applySuccess = signal(false);

  readonly apply = {
    fullName: '',
    fatherName: '',
    motherName: '',
    mobile: '',
    email: '',
    ownershipType: 'owner',
    addressHouse: '',
    consent: false,
  };
  nidFile: File | null = null;
  ownershipFile: File | null = null;
  readonly applyError = signal('');
  pendingAppealApplicationId: number | null = null;

  appealTarget = '';
  appealGrounds = '';
  readonly appealError = signal('');

  waiverType: 'waiver' | 'installment' = 'waiver';
  waiverReason = '';
  waiverMonths: number | null = null;
  readonly waiverError = signal('');

  readonly decidableApplications = computed(() =>
    this.applications().filter((a) => a.status === 'rejected'),
  );
  readonly decidableActions = computed(() =>
    this.actions().filter((a) => a.status === 'decided'),
  );

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    let remaining = 4;
    const done = (): void => {
      remaining -= 1;
      if (remaining === 0) this.loading.set(false);
    };
    this.governance.myApplications().subscribe({
      next: (rows) => {
        this.applications.set(rows);
        done();
      },
      error: () => {
        this.error.set(true);
        done();
      },
    });
    this.governance.myAppeals().subscribe({ next: (rows) => { this.appeals.set(rows); done(); }, error: () => done() });
    this.governance.myWaivers().subscribe({ next: (rows) => { this.waivers.set(rows); done(); }, error: () => done() });
    this.governance.myActions().subscribe({ next: (rows) => { this.actions.set(rows); done(); }, error: () => done() });
  }

  onNid(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.nidFile = input.files?.[0] ?? null;
  }

  onOwnership(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.ownershipFile = input.files?.[0] ?? null;
  }

  submitApplication(): void {
    if (!this.apply.consent) return;
    this.submitting.set(true);
    this.applyError.set('');
    this.applySuccess.set(false);
    this.governance.submitApplication({ ...this.apply }).subscribe({
      next: (created) => {
        if (this.nidFile || this.ownershipFile) {
          this.governance
            .uploadApplicationDocuments(created.id, this.nidFile, this.ownershipFile)
            .subscribe({ complete: () => this.load() });
        } else {
          this.load();
        }
        this.submitting.set(false);
        this.applySuccess.set(true);
      },
      error: () => {
        this.applyError.set('common.saveFailed');
        this.submitting.set(false);
      },
    });
  }

  fileAppealFor(app: MembershipApplication): void {
    this.tab.set('appeals');
    this.appealTarget = `app-${app.id}`;
  }

  submitAppeal(): void {
    this.appealError.set('');
    const target = this.appealTarget;
    const payload = target.startsWith('app-')
      ? { application_id: Number(target.slice(4)), grounds: this.appealGrounds }
      : { membership_action_id: Number(target.slice(7)), grounds: this.appealGrounds };
    this.submitting.set(true);
    this.governance.fileAppeal(payload).subscribe({
      next: () => {
        this.appealGrounds = '';
        this.appealTarget = '';
        this.submitting.set(false);
        this.governance.myAppeals().subscribe({ next: (rows) => this.appeals.set(rows) });
      },
      error: (err) => {
        this.appealError.set(
          err.status === 409 ? 'membershipGov.appeals.windowClosed' : 'common.saveFailed',
        );
        this.submitting.set(false);
      },
    });
  }

  submitWaiver(): void {
    if (!this.waiverReason.trim()) {
      this.waiverError.set('membershipGov.waivers.reasonRequired');
      return;
    }
    this.waiverError.set('');
    this.submitting.set(true);
    this.governance
      .applyWaiver({
        type: this.waiverType,
        reason: this.waiverReason,
        months: this.waiverMonths ?? undefined,
      })
      .subscribe({
        next: () => {
          this.waiverReason = '';
          this.waiverMonths = null;
          this.submitting.set(false);
          this.governance.myWaivers().subscribe({ next: (rows) => this.waivers.set(rows) });
        },
        error: () => {
          this.waiverError.set('common.saveFailed');
          this.submitting.set(false);
        },
      });
  }

  canRespond(action: MembershipAction & { responseText?: string }): boolean {
    return action.status === 'noticed' || action.status === 'awaiting_response';
  }

  submitResponse(action: MembershipAction & { responseText?: string }): void {
    if (!action.responseText?.trim()) return;
    this.governance.respondToAction(action.id, action.responseText).subscribe({
      next: (updated) => {
        this.actions.update((rows) => rows.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
      },
    });
  }

  statusTone(status: string): string {
    if (status === 'approved' || status === 'upheld' || status === 'applied') return 'good';
    if (status === 'rejected' || status === 'overturned' || status === 'decided') return 'bad';
    if (status === 'under_review' || status === 'noticed' || status === 'awaiting_response') return 'warn';
    return 'neutral';
  }

  slaTone(sla: SlaInfo): string {
    if (sla.state === 'met') return 'good';
    if (sla.state === 'overdue') return 'bad';
    if (sla.state === 'due_soon') return 'warn';
    return 'neutral';
  }

  slaLabel(sla: SlaInfo): string {
    const key = `membershipGov.sla.${sla.state}`;
    return `${this.translate.instant(key)} (${sla.days_remaining})`;
  }
}
