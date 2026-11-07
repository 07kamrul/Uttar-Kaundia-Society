import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { DatePickerComponent } from '../../../../shared/date-picker/date-picker.component';
import { MemberPickerComponent, type MemberPickerOption } from '../../../../shared/member-picker/member-picker.component';
import { ConfirmModalComponent } from '../../../../shared/confirm-modal/confirm-modal.component';
import { AdminService } from '../../../../core/services/admin.service';
import { LanguageService } from '../../../../core/services/language.service';
import { SectionLoaderComponent } from '../../../../shared/section-loader/section-loader.component';
import { CommitteeBoardComponent } from './committee-board/committee-board.component';
import {
  CommitteeRegistryService,
  type PostHistory,
  type PostVacancy,
  type RegistryPost,
  type SlaInfo,
} from '../../../../core/services/committee-registry.service';
import { localizeDigits } from '../../../../core/services/resolution-book.service';

type Tone = 'good' | 'bad' | 'warn' | 'neutral';

interface TermFormState {
  editingTermId: number | null;
  postKey: string;
  memberId: number[];
  termStart: string;
  termEnd: string;
  isCaretaker: boolean;
  notes: string;
}

@Component({
  selector: 'app-committee-registry',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, FormsModule, IconComponent, DatePickerComponent, MemberPickerComponent, ConfirmModalComponent, SectionLoaderComponent, CommitteeBoardComponent],
  templateUrl: './committee-registry.component.html',
  styles: [
    `
      .page-container { display: grid; gap: 1rem; }
      .page-title { display: flex; align-items: center; gap: 0.5rem; }
      .cr-section-title { font-size: 1.05rem; font-weight: 700; margin: 0 0 0.75rem; }
      .cr-actions { display: flex; gap: 0.35rem; flex-wrap: wrap; }
      .cr-field-grid { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
      .cr-form-actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
      .cr-history { padding: 0.35rem 0.25rem; }
      .cr-history h3 { font-size: 0.9rem; font-weight: 700; margin: 0.35rem 0; }
      .cr-history ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.35rem; }
      .cr-history li { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; font-size: 0.9rem; }
      .cr-note { color: var(--gray-600); font-size: 0.88rem; overflow-wrap: anywhere; }
      .cr-response { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 0.88rem; margin: 0; }
      .cr-section-head {
        display: flex; align-items: flex-start; justify-content: space-between;
        gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.75rem;
      }
      .cr-section-head .cr-section-title { margin: 0; }
      .cr-section-sub { margin: 0.2rem 0 0; font-size: 0.85rem; color: var(--gray-600); line-height: 1.6; }
      .cr-vacancy-list { display: grid; gap: 0.75rem; }
      .cr-vacancy-post { font-size: 0.95rem; }
      .cr-chip { display: inline-flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
      .cr-chip app-icon { color: var(--gray-500); flex-shrink: 0; }
      .cr-chip-overdue { color: var(--red-700); font-weight: 700; }
      .cr-chip-member { font-weight: 600; color: var(--gray-700); }
      .cr-chip-avatar {
        display: inline-flex; align-items: center; justify-content: center;
        width: 1.5rem; height: 1.5rem; border-radius: 50%;
        background: var(--emerald-50); color: var(--emerald-800);
        font-size: 0.68rem; font-weight: 700; flex-shrink: 0;
      }
      :root[data-theme='dark'] .cr-chip-avatar { background: color-mix(in srgb, var(--emerald-700) 30%, transparent); }
      @media (prefers-color-scheme: dark) {
        :root:not([data-theme='light']) .cr-chip-avatar { background: color-mix(in srgb, var(--emerald-700) 30%, transparent); }
      }

      /* Summary stat chips in the section header. */
      .cr-case-stats { display: flex; gap: 0.4rem; flex-wrap: wrap; }
      .cr-stat {
        display: inline-flex; align-items: center; gap: 0.3rem;
        padding: 0.28rem 0.65rem; border-radius: 999px;
        font-size: 0.78rem; font-weight: 700; white-space: nowrap;
      }
      .cr-stat-warn { background: color-mix(in srgb, #b45309 12%, transparent); color: #92400e; }
      .cr-stat-info { background: color-mix(in srgb, #4a7fb5 12%, transparent); color: #2c5282; }
      .cr-stat-good { background: color-mix(in srgb, var(--emerald-600) 12%, transparent); color: var(--emerald-800); }
      :root[data-theme='dark'] .cr-stat-warn { color: #fbbf24; }
      :root[data-theme='dark'] .cr-stat-info { color: #9dc3ec; }
      @media (prefers-color-scheme: dark) {
        :root:not([data-theme='light']) .cr-stat-warn { color: #fbbf24; }
        :root:not([data-theme='light']) .cr-stat-info { color: #9dc3ec; }
      }

      /* Board / table switch above the registry. */
      .cr-view-toggle { display: flex; gap: 0.35rem; justify-content: flex-end; margin-bottom: 0.75rem; }

      /* Status filter tabs. */
      .cr-filter-tabs {
        display: flex; gap: 0.35rem; flex-wrap: nowrap;
        overflow-x: auto; padding-bottom: 0.3rem; margin-bottom: 0.75rem;
        border-bottom: 1px solid var(--gray-200);
        scrollbar-width: thin;
      }
      .cr-filter-tab {
        display: inline-flex; align-items: center; gap: 0.4rem;
        padding: 0.4rem 0.8rem; border: 1px solid transparent; border-radius: 999px;
        background: transparent; color: var(--gray-600);
        font: inherit; font-size: 0.82rem; font-weight: 600;
        cursor: pointer; white-space: nowrap;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
      }
      .cr-filter-tab:hover { background: var(--gray-100); color: var(--gray-800); }
      .cr-filter-tab-active {
        background: var(--emerald-600); color: #fff;
        border-color: var(--emerald-600);
      }
      .cr-filter-tab-active:hover { background: var(--emerald-700); color: #fff; }
      .cr-filter-count {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: 1.35rem; padding: 0 0.35rem; border-radius: 999px;
        background: color-mix(in srgb, currentColor 15%, transparent);
        font-size: 0.72rem; font-weight: 700;
      }

      /* Filed → review → decided stepper. */
      .cr-steps {
        display: flex; align-items: center; gap: 0;
        list-style: none; margin: 0; padding: 0; width: 100%;
      }
      .cr-step { display: flex; align-items: center; flex: 1 1 0; min-width: 0; }
      .cr-step:last-child { flex: 0 0 auto; }
      .cr-step-dot {
        width: 0.7rem; height: 0.7rem; border-radius: 50%; flex-shrink: 0;
        background: var(--gray-200); border: 2px solid var(--gray-300);
        box-sizing: border-box;
      }
      .cr-step-current .cr-step-dot { background: var(--emerald-600); border-color: var(--emerald-600); box-shadow: 0 0 0 3px color-mix(in srgb, var(--emerald-600) 20%, transparent); }
      .cr-step-done .cr-step-dot { background: var(--emerald-600); border-color: var(--emerald-600); }
      .cr-step-label {
        margin-inline-start: 0.35rem; font-size: 0.72rem; font-weight: 600;
        color: var(--gray-500); white-space: nowrap;
      }
      .cr-step-current .cr-step-label, .cr-step-done .cr-step-label { color: var(--emerald-800); }
      .cr-step:not(:last-child)::after {
        content: ''; flex: 1 1 auto; height: 2px;
        margin: 0 0.45rem; background: var(--gray-200);
      }
      .cr-step-done:not(:last-child)::after { background: var(--emerald-600); }
      @media (max-width: 480px) {
        .cr-step-label { display: none; }
        .cr-step-current:first-child .cr-step-label,
        .cr-step-current:last-child .cr-step-label { display: inline; }
      }

      .cr-empty-title { font-weight: 700; color: var(--gray-700); }
      .cr-empty-hint { margin-top: -0.25rem !important; font-size: 0.82rem; }
      .cr-box-label {
        margin: 0 0 0.15rem; font-size: 0.72rem; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.04em; color: var(--gray-500);
      }
      .cr-response-box { width: 100%; border-inline-start: 3px solid #4a7fb5; padding-inline-start: 0.65rem; }
      .cr-note-box { width: 100%; padding-inline-start: 0.65rem; }
      .cr-note-box p { color: var(--gray-700); }
      :root[data-theme='dark'] .cr-response-box { border-inline-start-color: #7fa8d9; }
      @media (prefers-color-scheme: dark) {
        :root:not([data-theme='light']) .cr-response-box { border-inline-start-color: #7fa8d9; }
      }
      .cr-inline-form {
        width: 100%; display: grid; gap: 0.6rem; padding: 0.8rem;
        border: 1px dashed var(--gray-300); border-radius: var(--radius-sm);
        background: var(--surface);
      }
      .cr-inline-form .field-hint { margin: 0; }
      .cr-inline-form .cr-form-actions { margin-top: 0; }
      .cr-vacancy-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; width: 100%; }
      @media (max-width: 640px) {
        .cr-vacancy-actions .btn { flex: 1 1 100%; }
        .cr-form-actions { flex-direction: column; }
        .cr-form-actions .btn { width: 100%; }
        .cr-case-stats { width: 100%; }
        .cr-stat { flex: 1 1 auto; justify-content: center; }
      }
      .ds-warn-banner {
        display: flex; align-items: center; gap: 0.5rem;
        padding: 0.6rem 0.9rem; border-radius: 0.5rem; font-weight: 600;
        background: color-mix(in srgb, #b45309 12%, var(--surface-2, #fff));
        border: 1px solid color-mix(in srgb, #b45309 35%, transparent);
        color: #92400e;
      }
      :root[data-theme='dark'] .ds-warn-banner { color: #fbbf24; }
      @media (prefers-color-scheme: dark) {
        :root:not([data-theme='light']) .ds-warn-banner { color: #fbbf24; }
      }
    `,
  ],
})
export class CommitteeRegistryComponent implements OnInit {
  private readonly registry = inject(CommitteeRegistryService);
  private readonly adminService = inject(AdminService);
  private readonly language = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  readonly lang = this.language.lang;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly posts = signal<RegistryPost[]>([]);
  readonly view = signal<'board' | 'table'>('board');
  readonly vacancies = signal<PostVacancy[]>([]);
  readonly members = signal<MemberPickerOption[]>([]);

  readonly termForm = signal<TermFormState | null>(null);
  readonly histories = signal<Record<string, PostHistory | undefined>>({});
  readonly removalVacancyId = signal<number | null>(null);
  readonly decisionVacancyId = signal<number | null>(null);

  readonly resignPost = signal<RegistryPost | null>(null);
  readonly decideTarget = signal<{ vacancy: PostVacancy; decision: 'removed' | 'retained' } | null>(null);

  readonly caseFilter = signal<'all' | 'pending' | 'progress' | 'decided'>('all');

  // Plain form state: template-driven ngModel mutates these directly and the
  // DOM event marks the OnPush component dirty (same pattern as the
  // membership-governance page).
  investigationNote = '';
  decisionNote = '';

  readonly anyExpired = computed(() => this.posts().some((post) => post.status === 'expired'));

  readonly counts = computed(() => {
    const counts = { pending: 0, progress: 0, decided: 0 };
    for (const vacancy of this.vacancies()) {
      if (vacancy.status === 'pending_acknowledgement') counts.pending += 1;
      else if (vacancy.status === 'decided') counts.decided += 1;
      else counts.progress += 1;
    }
    return counts;
  });

  readonly filteredVacancies = computed(() => {
    const filter = this.caseFilter();
    if (filter === 'all') return this.vacancies();
    return this.vacancies().filter((vacancy) => {
      if (filter === 'pending') return vacancy.status === 'pending_acknowledgement';
      if (filter === 'decided') return vacancy.status === 'decided';
      return vacancy.status === 'investigation' || vacancy.status === 'acknowledged';
    });
  });

  ngOnInit(): void {
    this.load();
    this.adminService.listMembers().subscribe({
      next: (members) =>
        this.members.set(
          members
            .filter((member) => member.status === 'approved')
            .map((member) => ({
              id: Number(member.id),
              fullName: member.fullName,
              memberId: member.memberId,
            })),
        ),
      error: () => this.members.set([]),
    });
  }

  load(): void {
    this.loading.set(true);
    this.registry.overview().subscribe({
      next: (overview) => {
        this.posts.set(overview.posts);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('committeeRegistry.loadError');
        this.loading.set(false);
      },
    });
    this.loadVacancies();
  }

  loadVacancies(): void {
    this.registry.vacancies().subscribe({
      next: (page) => this.vacancies.set(page.items),
      error: () => this.vacancies.set([]),
    });
  }

  memberOptions(): MemberPickerOption[] {
    return this.members();
  }

  postLabel(post: RegistryPost): string {
    return this.lang() === 'bn' ? post.bn : post.en;
  }

  postNameByKey(postKey: string): string {
    const post = this.posts().find((candidate) => candidate.key === postKey);
    return post ? this.postLabel(post) : postKey;
  }

  hasOpenVacancyFor(postKey: string): boolean {
    return this.vacancies().some(
      (vacancy) => vacancy.postKey === postKey && (vacancy.status === 'pending_acknowledgement' || vacancy.status === 'investigation'),
    );
  }

  /** data-tone for the vacancy status tag; '' falls back to the blue class in the template. */
  vacancyStatusTone(vacancy: PostVacancy): 'good' | 'warn' | 'bad' | '' {
    if (vacancy.status === 'decided') return 'good';
    if (vacancy.status === 'pending_acknowledgement') return 'warn';
    if (vacancy.status === 'investigation') return 'bad';
    return '';
  }

  /** data-tone for the SLA badge; '' falls back to the blue class in the template. */
  slaTone(sla: SlaInfo): 'good' | 'warn' | 'bad' | '' {
    if (sla.state === 'met') return 'good';
    if (sla.state === 'due_soon') return 'warn';
    if (sla.state === 'overdue') return 'bad';
    return '';
  }

  /** Whole days until the member response deadline; negative once overdue. */
  slaDays(vacancy: PostVacancy): number | null {
    if (!vacancy.responseDeadline || vacancy.status === 'decided') return null;
    const deadline = new Date(`${vacancy.responseDeadline.length === 10 ? vacancy.responseDeadline + 'T00:00:00' : vacancy.responseDeadline}`);
    if (Number.isNaN(deadline.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((deadline.getTime() - today.getTime()) / 86_400_000);
  }

  slaAbsDays(vacancy: PostVacancy): number {
    return Math.abs(this.slaDays(vacancy) ?? 0);
  }

  initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  memberName(vacancy: PostVacancy): string {
    return vacancy.member?.fullName ?? String(vacancy.memberId ?? '');
  }

  /** Filed → Under review → Decided rail for the case card. */
  caseSteps(vacancy: PostVacancy): { labelKey: string; done: boolean; current: boolean }[] {
    const filed = true;
    const review = vacancy.status === 'acknowledged' || vacancy.status === 'investigation';
    const decided = vacancy.status === 'decided';
    return [
      { labelKey: 'committeeRegistry.steps.filed', done: filed && (review || decided), current: filed && !review && !decided },
      { labelKey: 'committeeRegistry.steps.review', done: review && decided, current: review && !decided },
      { labelKey: 'committeeRegistry.steps.decided', done: decided, current: decided },
    ];
  }

  historyFor(postKey: string): PostHistory | undefined {
    return this.histories()[postKey];
  }

  toggleHistory(postKey: string): void {
    if (this.histories()[postKey]) {
      const next = { ...this.histories() };
      delete next[postKey];
      this.histories.set(next);
      return;
    }
    this.registry.postHistory(postKey).subscribe({
      next: (history) => this.histories.set({ ...this.histories(), [postKey]: history }),
      error: () => this.error.set('committeeRegistry.loadError'),
    });
  }

  removalFor(vacancyId: number): number | null {
    return this.removalVacancyId() === vacancyId ? vacancyId : null;
  }

  decisionFor(vacancyId: number): number | null {
    return this.decisionVacancyId() === vacancyId ? vacancyId : null;
  }

  toggleDecision(vacancyId: number): void {
    this.decisionNote = '';
    this.decisionVacancyId.set(this.decisionVacancyId() === vacancyId ? null : vacancyId);
  }

  // ----- term form -----

  startEditTerm(post: RegistryPost): void {
    this.termForm.set({
      editingTermId: post.term?.id ?? null,
      postKey: post.key,
      memberId: post.term?.memberId ? [post.term.memberId] : [],
      termStart: post.term?.termStart ?? '',
      termEnd: post.term?.termEnd ?? '',
      isCaretaker: post.term?.isCaretaker ?? false,
      notes: post.term?.notes ?? '',
    });
  }

  closeTermForm(): void {
    this.termForm.set(null);
  }

  saveTerm(): void {
    const form = this.termForm();
    if (!form || !form.memberId.length || !form.termStart || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    const memberId = form.memberId[0];
    if (form.editingTermId !== null) {
      this.registry
        .updateTerm(form.editingTermId, {
          termStart: form.termStart,
          termEnd: form.termEnd || null,
          isCaretaker: form.isCaretaker,
          notes: form.notes || null,
        })
        .subscribe({ next: () => this.afterSave(), error: (err) => this.fail(err) });
    } else {
      this.registry
        .createTerm({
          postKey: form.postKey,
          memberId,
          termStart: form.termStart,
          termEnd: form.termEnd || null,
          isCaretaker: form.isCaretaker,
          notes: form.notes || null,
        })
        .subscribe({ next: () => this.afterSave(), error: (err) => this.fail(err) });
    }
  }

  private afterSave(): void {
    this.saving.set(false);
    this.termForm.set(null);
    this.histories.set({});
    this.load();
  }

  // ----- resignation / removal -----

  askResign(post: RegistryPost): void {
    this.resignPost.set(post);
  }

  confirmResign(): void {
    const post = this.resignPost();
    if (!post?.holder) return;
    this.saving.set(true);
    this.registry
      .submitResignation(post.key, '', post.holder.id)
      .subscribe({ next: () => { this.saving.set(false); this.resignPost.set(null); this.loadVacancies(); this.load(); }, error: (err) => this.fail(err) });
  }

  startRemoval(vacancy: PostVacancy): void {
    this.removalVacancyId.set(vacancy.id);
    this.investigationNote = '';
  }

  issueRemoval(vacancy: PostVacancy): void {
    const note = this.investigationNote.trim();
    if (!note) return;
    this.saving.set(true);
    this.registry.issueRemovalNotice(vacancy.id, note).subscribe({
      next: () => {
        this.saving.set(false);
        this.removalVacancyId.set(null);
        this.investigationNote = '';
        this.loadVacancies();
      },
      error: (err) => this.fail(err),
    });
  }

  acknowledge(vacancy: PostVacancy): void {
    this.saving.set(true);
    this.registry.acknowledgeVacancy(vacancy.id).subscribe({
      next: () => { this.saving.set(false); this.loadVacancies(); },
      error: (err) => this.fail(err),
    });
  }

  askDecide(vacancy: PostVacancy, decision: 'removed' | 'retained'): void {
    this.decideTarget.set({ vacancy, decision });
    this.decisionNote = '';
  }

  decideMessage(): string {
    const target = this.decideTarget();
    if (!target) return '';
    const key =
      target.decision === 'removed'
        ? 'committeeRegistry.decideRemovedConfirm'
        : 'committeeRegistry.decideRetainedConfirm';
    return this.translate.instant(key, {
      member: target.vacancy.member?.fullName ?? String(target.vacancy.memberId ?? ''),
    });
  }

  confirmDecide(): void {
    const target = this.decideTarget();
    if (!target || !this.decisionNote.trim()) return;
    this.saving.set(true);
    this.registry
      .decideVacancy(target.vacancy.id, target.decision, this.decisionNote)
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.decideTarget.set(null);
          this.loadVacancies();
          this.load();
        },
        error: (err) => this.fail(err),
      });
  }

  // ----- helpers -----

  private fail(err: { error?: { detail?: string } }): void {
    this.saving.set(false);
    this.error.set(err.error?.detail || 'committeeRegistry.actionError');
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
