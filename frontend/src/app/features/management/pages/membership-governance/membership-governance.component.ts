import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { SectionLoaderComponent } from '../../../../shared/section-loader/section-loader.component';
import {
  ArrearItem,
  DataCorrectionRequest,
  FeeWaiver,
  GovernanceService,
  MembershipAction,
  MembershipAppeal,
} from '../../../../core/services/governance.service';

type Tab = 'waivers' | 'actions' | 'appeals' | 'corrections' | 'arrears';

@Component({
  selector: 'app-membership-governance',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, FormsModule, IconComponent, SectionLoaderComponent],
  template: `
    <div class="page-container">
      <header class="page-header">
        <h1><app-icon name="shield" /> {{ 'membershipGovernance.title' | translate }}</h1>
      </header>

      <nav class="tab-row">
        <button type="button" class="tab" [class.active]="tab() === 'waivers'" (click)="selectTab('waivers')">{{ 'membershipGovernance.tabs.waivers' | translate }}</button>
        <button type="button" class="tab" [class.active]="tab() === 'actions'" (click)="selectTab('actions')">{{ 'membershipGovernance.tabs.actions' | translate }}</button>
        <button type="button" class="tab" [class.active]="tab() === 'appeals'" (click)="selectTab('appeals')">{{ 'membershipGovernance.tabs.appeals' | translate }}</button>
        <button type="button" class="tab" [class.active]="tab() === 'corrections'" (click)="selectTab('corrections')">{{ 'membershipGovernance.tabs.corrections' | translate }}</button>
        <button type="button" class="tab" [class.active]="tab() === 'arrears'" (click)="selectTab('arrears')">{{ 'membershipGovernance.tabs.arrears' | translate }}</button>
      </nav>

      <!-- Waivers -->
      @if (tab() === 'waivers') {
        <section class="card">
          <h2>{{ 'membershipGovernance.waivers.title' | translate }}</h2>
          @if (pending().waivers) {
            <app-section-loader [count]="4" />
          } @else {
            @if (waivers().length === 0) { <div class="ds-empty">{{ 'membershipGovernance.empty.waivers' | translate }}</div> }
            <div class="data-table data-table-cards">
              <table>
                <tbody>
                  @for (waiver of waivers(); track waiver.id) {
                    <tr>
                      <td [attr.data-label]="'membershipGovernance.member' | translate">{{ waiver.member_name || waiver.member_id }}</td>
                      <td [attr.data-label]="'membershipGov.waivers.type' | translate">{{ 'membershipGov.waivers.type' + waiver.type | translate }}</td>
                      <td [attr.data-label]="'membershipGov.waivers.reason' | translate">{{ waiver.reason }}</td>
                      <td [attr.data-label]="'membershipGov.status' | translate">
                        <span class="ds-tag" [attr.data-tone]="waiver.status === 'approved' ? 'good' : waiver.status === 'rejected' ? 'bad' : 'warn'">
                          {{ 'membershipGov.waiverStatuses.' + waiver.status | translate }}
                        </span>
                      </td>
                      @if (waiver.status === 'pending') {
                        <td [attr.data-label]="'common.actions' | translate">
                          <button type="button" class="btn-primary" (click)="decideWaiver(waiver.id, 'approved')">{{ 'membershipGovernance.approve' | translate }}</button>
                          <button type="button" class="btn-danger" (click)="decideWaiver(waiver.id, 'rejected')">{{ 'membershipGovernance.reject' | translate }}</button>
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }

      <!-- Suspension / termination workflow -->
      @if (tab() === 'actions') {
        <section class="card">
          <h2>{{ 'membershipGovernance.actions.issueNotice' | translate }}</h2>
          <form (ngSubmit)="issueNotice()" #noticeForm="ngForm">
            <div class="field-row">
              <div class="field">
                <label for="noticeMemberId">{{ 'membershipGovernance.memberId' | translate }}</label>
                <input id="noticeMemberId" type="number" name="memberId" [(ngModel)]="noticeMemberId" required />
              </div>
              <div class="field">
                <label for="noticeReason">{{ 'membershipGovernance.actions.reason' | translate }}</label>
                <input id="noticeReason" name="reason" [(ngModel)]="noticeReason" required />
              </div>
            </div>
            <button class="btn-primary" type="submit" [disabled]="noticeForm.invalid">{{ 'membershipGovernance.actions.sendNotice' | translate }}</button>
          </form>
        </section>
        <section class="card">
          <h2>{{ 'membershipGovernance.actions.title' | translate }}</h2>
          @if (pending().actions) {
            <app-section-loader [count]="4" />
          } @else {
            @if (actions().length === 0) { <div class="ds-empty">{{ 'membershipGovernance.empty.actions' | translate }}</div> }
            <div class="data-table data-table-cards">
              <table>
                <tbody>
                  @for (action of actions(); track action.id) {
                    <tr>
                      <td [attr.data-label]="'membershipGovernance.member' | translate">{{ action.member_name || action.member_id }}</td>
                      <td [attr.data-label]="'membershipGov.notices.type' | translate">{{ 'membershipGov.notices.type' + action.type | translate }}</td>
                      <td [attr.data-label]="'membershipGov.notices.reason' | translate">{{ action.reason }}</td>
                      <td [attr.data-label]="'membershipGov.notices.deadline' | translate">{{ action.response_deadline || '—' }}</td>
                      <td [attr.data-label]="'membershipGov.status' | translate">
                        <span class="ds-tag" [attr.data-tone]="action.status === 'decided' ? 'bad' : action.status === 'cancelled' ? 'neutral' : 'warn'">
                          {{ 'membershipGov.actionStatuses.' + action.status | translate }}
                        </span>
                      </td>
                      <td [attr.data-label]="'common.actions' | translate">
                        @if (action.status === 'noticed' || action.status === 'awaiting_response') {
                          <button type="button" class="btn-primary" (click)="decide(action.id, true)">{{ 'membershipGovernance.actions.confirmSuspend' | translate }}</button>
                          <button type="button" class="btn-secondary" (click)="decide(action.id, false)">{{ 'membershipGovernance.actions.drop' | translate }}</button>
                        }
                        @if (action.status === 'draft') {
                          <button type="button" class="btn-secondary" (click)="notice(action.id)">{{ 'membershipGovernance.actions.markNoticed' | translate }}</button>
                          <button type="button" class="btn-danger" (click)="cancel(action.id)">{{ 'membershipGovernance.actions.cancel' | translate }}</button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }

      <!-- Appeals assignment -->
      @if (tab() === 'appeals') {
        <section class="card">
          <h2>{{ 'membershipGovernance.appeals.title' | translate }}</h2>
          <p class="muted">{{ 'membershipGovernance.appeals.reviewerRule' | translate }}</p>
          @if (pending().appeals) {
            <app-section-loader [count]="4" />
          } @else {
            @if (appeals().length === 0) { <div class="ds-empty">{{ 'membershipGovernance.empty.appeals' | translate }}</div> }
            <div class="data-table data-table-cards">
              <table>
                <tbody>
                  @for (appeal of appeals(); track appeal.id) {
                    <tr>
                      <td [attr.data-label]="'common.id' | translate">#{{ appeal.id }}</td>
                      <td [attr.data-label]="'membershipGov.appeals.grounds' | translate">{{ appeal.grounds }}</td>
                      <td [attr.data-label]="'membershipGov.appeals.reviewer' | translate">{{ appeal.reviewer_name || '—' }}</td>
                      <td [attr.data-label]="'membershipGov.status' | translate">{{ 'membershipGov.appealStatuses.' + appeal.status | translate }}</td>
                      <td [attr.data-label]="'common.actions' | translate">
                        @if (appeal.status === 'submitted' || appeal.status === 'under_review') {
                          <div class="field">
                            <input type="number" [placeholder]="'membershipGovernance.appeals.reviewerId' | translate" [(ngModel)]="reviewerIds[appeal.id]" />
                            <button type="button" class="btn-secondary" (click)="assign(appeal.id)">{{ 'membershipGovernance.appeals.assign' | translate }}</button>
                          </div>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }

      <!-- Data correction queue -->
      @if (tab() === 'corrections') {
        <section class="card">
          <h2>{{ 'membershipGovernance.corrections.title' | translate }}</h2>
          @if (pending().corrections) {
            <app-section-loader [count]="4" />
          } @else {
            @if (corrections().length === 0) { <div class="ds-empty">{{ 'membershipGovernance.empty.corrections' | translate }}</div> }
            <div class="data-table data-table-cards">
              <table>
                <tbody>
                  @for (request of corrections(); track request.id) {
                    <tr>
                      <td [attr.data-label]="'membershipGovernance.member' | translate">{{ request.member_name || request.member_id }}</td>
                      <td [attr.data-label]="'membershipGovernance.corrections.field' | translate">{{ request.field }} → {{ request.requested_value }}</td>
                      <td [attr.data-label]="'membershipGov.waivers.reason' | translate">{{ request.reason }}</td>
                      <td [attr.data-label]="'membershipGov.status' | translate">{{ 'membershipGovernance.corrections.' + request.status | translate }}</td>
                      @if (request.status === 'pending') {
                        <td [attr.data-label]="'common.actions' | translate">
                          <button type="button" class="btn-primary" (click)="decideCorrection(request.id, 'applied')">{{ 'membershipGovernance.corrections.apply' | translate }}</button>
                          <button type="button" class="btn-danger" (click)="decideCorrection(request.id, 'rejected')">{{ 'membershipGovernance.reject' | translate }}</button>
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }

      <!-- Arrears -->
      @if (tab() === 'arrears') {
        <section class="card">
          <h2>{{ 'membershipGovernance.arrears.title' | translate }}</h2>
          @if (pending().arrears) {
            <app-section-loader [count]="4" />
          } @else {
            @if (arrears().length === 0) { <div class="ds-empty">{{ 'membershipGovernance.empty.arrears' | translate }}</div> }
            <div class="data-table data-table-cards">
              <table>
                <tbody>
                  @for (item of arrears(); track item.member_id) {
                    <tr>
                      <td [attr.data-label]="'membershipGovernance.member' | translate">{{ item.full_name }}</td>
                      <td [attr.data-label]="'membershipGovernance.arrears.months' | translate">{{ item.months_expected }}</td>
                      <td [attr.data-label]="'membershipGovernance.arrears.expected' | translate">{{ item.expected_amount }}</td>
                      <td [attr.data-label]="'membershipGovernance.arrears.paid' | translate">{{ item.paid_amount }}</td>
                      <td [attr.data-label]="'membershipGovernance.arrears.due' | translate">
                        @if (item.in_arrears) {
                          <span class="ds-badge" data-tone="bad">{{ item.arrears_amount }}</span>
                        } @else {
                          <span class="ds-badge" data-tone="good">0</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: [
    `
      .page-container { display: grid; gap: 1rem; }
      .page-header h1 { display: flex; align-items: center; gap: 0.5rem; }
      .muted { color: var(--gray-600, #667); }
      .field-row { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); }
    `,
  ],
})
export class MembershipGovernanceComponent implements OnInit {
  private readonly governance = inject(GovernanceService);

  readonly tab = signal<Tab>('waivers');
  readonly pending = signal<Record<Tab, boolean>>({ waivers: true, actions: true, appeals: true, corrections: true, arrears: true });
  readonly waivers = signal<FeeWaiver[]>([]);
  readonly actions = signal<MembershipAction[]>([]);
  readonly appeals = signal<MembershipAppeal[]>([]);
  readonly corrections = signal<DataCorrectionRequest[]>([]);
  readonly arrears = signal<ArrearItem[]>([]);
  reviewerIds: Record<number, number | undefined> = {};

  noticeMemberId: number | null = null;
  noticeReason = '';

  ngOnInit(): void {
    this.loadTab('waivers');
    this.loadTab('actions');
    this.loadTab('appeals');
    this.loadTab('corrections');
    this.loadTab('arrears');
  }

  /** Switching tabs refreshes that tab's data and shows its loader until it arrives. */
  selectTab(tab: Tab): void {
    this.tab.set(tab);
    this.loadTab(tab);
  }

  /** Silent refresh after an action: keeps current rows on screen (the global bar shows progress). */
  load(): void {
    this.refresh('waivers');
    this.refresh('actions');
    this.refresh('appeals');
    this.refresh('corrections');
    this.refresh('arrears');
  }

  private loadTab(tab: Tab): void {
    this.pending.update((p) => ({ ...p, [tab]: true }));
    this.refresh(tab);
  }

  private refresh(tab: Tab): void {
    const done = () => this.pending.update((p) => ({ ...p, [tab]: false }));
    const handlers = {
      waivers: () => this.governance.adminWaivers().subscribe({ next: (rows) => { this.waivers.set(rows); done(); }, error: done }),
      actions: () => this.governance.adminActions().subscribe({ next: (rows) => { this.actions.set(rows); done(); }, error: done }),
      appeals: () => this.governance.adminAppeals().subscribe({ next: (rows) => { this.appeals.set(rows); done(); }, error: done }),
      corrections: () => this.governance.adminCorrections().subscribe({ next: (rows) => { this.corrections.set(rows); done(); }, error: done }),
      arrears: () => this.governance.membersArrears().subscribe({ next: (data) => { this.arrears.set(data.items); done(); }, error: done }),
    } satisfies Record<Tab, () => unknown>;
    handlers[tab]();
  }

  decideWaiver(id: number, status: 'approved' | 'rejected'): void {
    this.governance.decideWaiver(id, status).subscribe({ next: () => this.load() });
  }

  issueNotice(): void {
    if (!this.noticeMemberId || !this.noticeReason.trim()) return;
    this.governance.suspensionNotice(this.noticeMemberId, this.noticeReason).subscribe({
      next: () => {
        this.noticeReason = '';
        this.load();
      },
    });
  }

  notice(id: number): void {
    this.governance.noticeAction(id).subscribe({ next: () => this.load() });
  }

  decide(id: number, confirm: boolean): void {
    this.governance
      .decideAction(id, confirm ? 'সাসপেনশন নিশ্চিত' : 'মামলা খারিজ', confirm)
      .subscribe({ next: () => this.load() });
  }

  cancel(id: number): void {
    this.governance.cancelAction(id).subscribe({ next: () => this.load() });
  }

  assign(appealId: number): void {
    const reviewerId = this.reviewerIds[appealId];
    if (!reviewerId) return;
    this.governance.assignAppeal(appealId, reviewerId).subscribe({ next: () => this.load() });
  }

  decideCorrection(id: number, status: 'applied' | 'rejected'): void {
    this.governance.decideCorrection(id, status).subscribe({ next: () => this.load() });
  }
}
