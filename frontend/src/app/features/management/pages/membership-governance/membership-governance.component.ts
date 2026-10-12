import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { SectionLoaderComponent } from '../../../../shared/section-loader/section-loader.component';
import { ConfirmModalComponent } from '../../../../shared/confirm-modal/confirm-modal.component';
import { LanguageService } from '../../../../core/services/language.service';
import { formatTaka } from '../../../../core/services/finance.service';
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
  imports: [TranslatePipe, FormsModule, IconComponent, SectionLoaderComponent, ConfirmModalComponent, DatePipe],
  template: `
    <div class="page-container">
      <header class="gov-hero">
        <span class="gov-hero-icon"><app-icon name="shield" [size]="22" /></span>
        <div class="gov-hero-text">
          <h1 class="gov-hero-title">{{ 'membershipGovernance.title' | translate }}</h1>
          <p class="gov-hero-sub">{{ 'membershipGovernance.subtitle' | translate }}</p>
        </div>
      </header>

      <nav class="ds-tab-bar" role="tablist" aria-label="{{ 'membershipGovernance.title' | translate }}">
        <button type="button" role="tab" class="ds-tab" [class.is-active]="tab() === 'waivers'" [attr.aria-selected]="tab() === 'waivers'" (click)="selectTab('waivers')">
          <app-icon name="coin" [size]="16" /> {{ 'membershipGovernance.tabs.waivers' | translate }}
          @if (ready('waivers')) { <span class="ds-tab-count">{{ waivers().length }}</span> }
        </button>
        <button type="button" role="tab" class="ds-tab" [class.is-active]="tab() === 'actions'" [attr.aria-selected]="tab() === 'actions'" (click)="selectTab('actions')">
          <app-icon name="alert" [size]="16" /> {{ 'membershipGovernance.tabs.actions' | translate }}
          @if (ready('actions')) { <span class="ds-tab-count">{{ actions().length }}</span> }
        </button>
        <button type="button" role="tab" class="ds-tab" [class.is-active]="tab() === 'appeals'" [attr.aria-selected]="tab() === 'appeals'" (click)="selectTab('appeals')">
          <app-icon name="id-card" [size]="16" /> {{ 'membershipGovernance.tabs.appeals' | translate }}
          @if (ready('appeals')) { <span class="ds-tab-count">{{ appeals().length }}</span> }
        </button>
        <button type="button" role="tab" class="ds-tab" [class.is-active]="tab() === 'corrections'" [attr.aria-selected]="tab() === 'corrections'" (click)="selectTab('corrections')">
          <app-icon name="edit" [size]="16" /> {{ 'membershipGovernance.tabs.corrections' | translate }}
          @if (ready('corrections')) { <span class="ds-tab-count">{{ corrections().length }}</span> }
        </button>
        <button type="button" role="tab" class="ds-tab" [class.is-active]="tab() === 'arrears'" [attr.aria-selected]="tab() === 'arrears'" (click)="selectTab('arrears')">
          <app-icon name="chart" [size]="16" /> {{ 'membershipGovernance.tabs.arrears' | translate }}
          @if (ready('arrears')) { <span class="ds-tab-count">{{ arrears().length }}</span> }
        </button>
      </nav>

      <!-- ================= Waivers ================= -->
      @if (tab() === 'waivers') {
        <section class="ds-card">
          <div class="ds-card-header">
            <span class="ds-card-icon"><app-icon name="coin" [size]="18" /></span>
            <div class="ds-card-heading">
              <h2 class="ds-card-title">{{ 'membershipGovernance.waivers.title' | translate }}</h2>
              <p class="ds-card-sub">{{ 'membershipGovernance.waivers.sub' | translate }}</p>
            </div>
          </div>
          <div class="ds-card-body">
            @if (pending().waivers) {
              <app-section-loader variant="rows" [count]="3" />
            } @else if (failed().waivers) {
              <div class="gov-empty">
                <span class="gov-empty-icon"><app-icon name="alert" [size]="22" /></span>
                <p class="field-error">{{ 'common.loadFailed' | translate }}</p>
                <button type="button" class="btn btn-secondary btn-sm" (click)="loadTab('waivers')">{{ 'common.retry' | translate }}</button>
              </div>
            } @else {
              @if (waivers().length === 0) {
                <div class="gov-empty">
                  <span class="gov-empty-icon"><app-icon name="coin" [size]="22" /></span>
                  <p>{{ 'membershipGovernance.empty.waivers' | translate }}</p>
                </div>
              } @else {
                <div class="data-table data-table-cards">
                  <table>
                    <thead>
                      <tr>
                        <th>{{ 'membershipGovernance.member' | translate }}</th>
                        <th>{{ 'membershipGov.waivers.type' | translate }}</th>
                        <th>{{ 'membershipGov.waivers.reason' | translate }}</th>
                        <th>{{ 'membershipGov.status' | translate }}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (waiver of waivers(); track waiver.id) {
                        <tr>
                          <td [attr.data-label]="'membershipGovernance.member' | translate">
                            <span class="member-cell">
                              <span class="member-name">{{ waiver.member_name || '—' }}</span>
                              <span class="ds-mono member-id">#{{ waiver.member_id }}</span>
                            </span>
                          </td>
                          <td [attr.data-label]="'membershipGov.waivers.type' | translate">
                            <span class="ds-tag">{{ 'membershipGov.waivers.type' + waiver.type | translate }}</span>
                            @if (waiver.type === 'installment' && waiver.months) {
                              <span class="ds-mono months-note">{{ waiver.months }} {{ 'membershipGovernance.waivers.monthsShort' | translate }}</span>
                            }
                          </td>
                          <td [attr.data-label]="'membershipGov.waivers.reason' | translate" class="reason-cell">{{ waiver.reason }}</td>
                          <td [attr.data-label]="'membershipGov.status' | translate">
                            <span class="ds-tag" [attr.data-tone]="statusTone(waiver.status)">{{ 'membershipGov.waiverStatuses.' + waiver.status | translate }}</span>
                          </td>
                          @if (waiver.status === 'pending') {
                            <td [attr.data-label]="'common.actions' | translate">
                              <div class="row-actions">
                                <button type="button" class="btn btn-primary btn-sm" (click)="decideWaiver(waiver.id, 'approved')">{{ 'membershipGovernance.approve' | translate }}</button>
                                <button type="button" class="btn btn-danger btn-sm" (click)="decideWaiver(waiver.id, 'rejected')">{{ 'membershipGovernance.reject' | translate }}</button>
                              </div>
                            </td>
                          } @else {
                            <td [attr.data-label]="'common.actions' | translate"><span class="ds-mono row-date">{{ waiver.decided_at ? (waiver.decided_at | date: 'yyyy-MM-dd') : '—' }}</span></td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            }
          </div>
        </section>
      }

      <!-- ================= Suspension / termination workflow ================= -->
      @if (tab() === 'actions') {
        <section class="ds-card">
          <div class="ds-card-header">
            <span class="ds-card-icon"><app-icon name="mail" [size]="18" /></span>
            <div class="ds-card-heading">
              <h2 class="ds-card-title">{{ 'membershipGovernance.actions.issueNotice' | translate }}</h2>
              <p class="ds-card-sub">{{ 'membershipGovernance.actions.noticeSub' | translate }}</p>
            </div>
          </div>
          <div class="ds-card-body">
            <form (ngSubmit)="issueNotice()" #noticeForm="ngForm">
              <div class="field-row">
                <div class="field">
                  <label for="noticeMemberId">{{ 'membershipGovernance.memberId' | translate }}</label>
                  <input id="noticeMemberId" class="field-control" type="number" name="memberId" [(ngModel)]="noticeMemberId" required />
                </div>
                <div class="field">
                  <label for="noticeReason">{{ 'membershipGovernance.actions.reason' | translate }}</label>
                  <input id="noticeReason" class="field-control" name="reason" [(ngModel)]="noticeReason" required />
                </div>
              </div>
              @if (noticeSuccess()) {
                <p class="gov-success"><app-icon name="check-circle" [size]="16" /> {{ 'membershipGovernance.actions.noticeSuccess' | translate }}</p>
              }
              <div class="form-actions">
                <button class="btn btn-primary" type="submit" [disabled]="noticeForm.invalid">{{ 'membershipGovernance.actions.sendNotice' | translate }}</button>
              </div>
            </form>
          </div>
        </section>
        <section class="ds-card">
          <div class="ds-card-header">
            <span class="ds-card-icon"><app-icon name="alert" [size]="18" /></span>
            <div class="ds-card-heading">
              <h2 class="ds-card-title">{{ 'membershipGovernance.actions.title' | translate }}</h2>
              <p class="ds-card-sub">{{ 'membershipGovernance.actions.listSub' | translate }}</p>
            </div>
          </div>
          <div class="ds-card-body">
            @if (pending().actions) {
              <app-section-loader variant="rows" [count]="3" />
            } @else if (failed().actions) {
              <div class="gov-empty">
                <span class="gov-empty-icon"><app-icon name="alert" [size]="22" /></span>
                <p class="field-error">{{ 'common.loadFailed' | translate }}</p>
                <button type="button" class="btn btn-secondary btn-sm" (click)="loadTab('actions')">{{ 'common.retry' | translate }}</button>
              </div>
            } @else {
              @if (actions().length === 0) {
                <div class="gov-empty">
                  <span class="gov-empty-icon"><app-icon name="check-circle" [size]="22" /></span>
                  <p>{{ 'membershipGovernance.empty.actions' | translate }}</p>
                </div>
              } @else {
                <div class="data-table data-table-cards">
                  <table>
                    <thead>
                      <tr>
                        <th>{{ 'membershipGovernance.member' | translate }}</th>
                        <th>{{ 'membershipGov.notices.type' | translate }}</th>
                        <th>{{ 'membershipGov.notices.reason' | translate }}</th>
                        <th>{{ 'membershipGov.notices.deadline' | translate }}</th>
                        <th>{{ 'membershipGov.status' | translate }}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (action of actions(); track action.id) {
                        <tr>
                          <td [attr.data-label]="'membershipGovernance.member' | translate">
                            <span class="member-cell">
                              <span class="member-name">{{ action.member_name || '—' }}</span>
                              <span class="ds-mono member-id">#{{ action.member_id }}</span>
                            </span>
                          </td>
                          <td [attr.data-label]="'membershipGov.notices.type' | translate">
                            <span class="ds-tag" [attr.data-tone]="action.type === 'terminate' ? 'bad' : 'warn'">{{ 'membershipGov.notices.type' + action.type | translate }}</span>
                          </td>
                          <td [attr.data-label]="'membershipGov.notices.reason' | translate" class="reason-cell">{{ action.reason }}</td>
                          <td [attr.data-label]="'membershipGov.notices.deadline' | translate"><span class="ds-mono">{{ action.response_deadline ? (action.response_deadline | date: 'yyyy-MM-dd') : '—' }}</span></td>
                          <td [attr.data-label]="'membershipGov.status' | translate">
                            <span class="ds-tag" [attr.data-tone]="statusTone(action.status)">{{ 'membershipGov.actionStatuses.' + action.status | translate }}</span>
                          </td>
                          <td [attr.data-label]="'common.actions' | translate">
                            <div class="row-actions">
                              @if (action.status === 'noticed' || action.status === 'awaiting_response') {
                                <button type="button" class="btn btn-danger btn-sm" (click)="askSuspend(action)">{{ 'membershipGovernance.actions.confirmSuspend' | translate }}</button>
                                <button type="button" class="btn btn-secondary btn-sm" (click)="decide(action.id, false)">{{ 'membershipGovernance.actions.drop' | translate }}</button>
                              }
                              @if (action.status === 'draft') {
                                <button type="button" class="btn btn-primary btn-sm" (click)="notice(action.id)">{{ 'membershipGovernance.actions.markNoticed' | translate }}</button>
                                <button type="button" class="btn btn-secondary btn-sm" (click)="cancel(action.id)">{{ 'membershipGovernance.actions.cancel' | translate }}</button>
                              }
                            </div>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            }
          </div>
        </section>
      }

      <!-- ================= Appeals ================= -->
      @if (tab() === 'appeals') {
        <section class="ds-card">
          <div class="ds-card-header">
            <span class="ds-card-icon"><app-icon name="id-card" [size]="18" /></span>
            <div class="ds-card-heading">
              <h2 class="ds-card-title">{{ 'membershipGovernance.appeals.title' | translate }}</h2>
              <p class="ds-card-sub">{{ 'membershipGovernance.appeals.sub' | translate }}</p>
            </div>
          </div>
          <div class="ds-card-body">
            <div class="gov-notice"><app-icon name="alert" [size]="18" /><p>{{ 'membershipGovernance.appeals.reviewerRule' | translate }}</p></div>
            @if (pending().appeals) {
              <app-section-loader variant="rows" [count]="3" />
            } @else if (failed().appeals) {
              <div class="gov-empty">
                <span class="gov-empty-icon"><app-icon name="alert" [size]="22" /></span>
                <p class="field-error">{{ 'common.loadFailed' | translate }}</p>
                <button type="button" class="btn btn-secondary btn-sm" (click)="loadTab('appeals')">{{ 'common.retry' | translate }}</button>
              </div>
            } @else {
              @if (appeals().length === 0) {
                <div class="gov-empty">
                  <span class="gov-empty-icon"><app-icon name="id-card" [size]="22" /></span>
                  <p>{{ 'membershipGovernance.empty.appeals' | translate }}</p>
                </div>
              } @else {
                <div class="data-table data-table-cards">
                  <table>
                    <thead>
                      <tr>
                        <th>{{ 'common.id' | translate }}</th>
                        <th>{{ 'membershipGov.appeals.grounds' | translate }}</th>
                        <th>{{ 'membershipGovernance.appeals.filedAt' | translate }}</th>
                        <th>{{ 'membershipGov.appeals.reviewer' | translate }}</th>
                        <th>{{ 'membershipGov.status' | translate }}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (appeal of appeals(); track appeal.id) {
                        <tr>
                          <td [attr.data-label]="'common.id' | translate"><span class="ds-mono">#{{ appeal.id }}</span></td>
                          <td [attr.data-label]="'membershipGov.appeals.grounds' | translate" class="reason-cell">{{ appeal.grounds }}</td>
                          <td [attr.data-label]="'membershipGovernance.appeals.filedAt' | translate"><span class="ds-mono">{{ appeal.filed_at | date: 'yyyy-MM-dd' }}</span></td>
                          <td [attr.data-label]="'membershipGov.appeals.reviewer' | translate">{{ appeal.reviewer_name || '—' }}</td>
                          <td [attr.data-label]="'membershipGov.status' | translate">
                            <span class="ds-tag" [attr.data-tone]="statusTone(appeal.status)">{{ 'membershipGov.appealStatuses.' + appeal.status | translate }}</span>
                          </td>
                          <td [attr.data-label]="'common.actions' | translate">
                            @if (appeal.status === 'submitted' || appeal.status === 'under_review') {
                              <div class="row-actions assign-cell">
                                <input class="field-control assign-input" type="number" [placeholder]="'membershipGovernance.appeals.reviewerId' | translate" [(ngModel)]="reviewerIds[appeal.id]" [attr.aria-label]="'membershipGovernance.appeals.reviewerId' | translate" />
                                <button type="button" class="btn btn-secondary btn-sm" (click)="assign(appeal.id)">{{ 'membershipGovernance.appeals.assign' | translate }}</button>
                              </div>
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            }
          </div>
        </section>
      }

      <!-- ================= Data corrections ================= -->
      @if (tab() === 'corrections') {
        <section class="ds-card">
          <div class="ds-card-header">
            <span class="ds-card-icon"><app-icon name="edit" [size]="18" /></span>
            <div class="ds-card-heading">
              <h2 class="ds-card-title">{{ 'membershipGovernance.corrections.title' | translate }}</h2>
              <p class="ds-card-sub">{{ 'membershipGovernance.corrections.sub' | translate }}</p>
            </div>
          </div>
          <div class="ds-card-body">
            @if (pending().corrections) {
              <app-section-loader variant="rows" [count]="3" />
            } @else if (failed().corrections) {
              <div class="gov-empty">
                <span class="gov-empty-icon"><app-icon name="alert" [size]="22" /></span>
                <p class="field-error">{{ 'common.loadFailed' | translate }}</p>
                <button type="button" class="btn btn-secondary btn-sm" (click)="loadTab('corrections')">{{ 'common.retry' | translate }}</button>
              </div>
            } @else {
              @if (corrections().length === 0) {
                <div class="gov-empty">
                  <span class="gov-empty-icon"><app-icon name="edit" [size]="22" /></span>
                  <p>{{ 'membershipGovernance.empty.corrections' | translate }}</p>
                </div>
              } @else {
                <div class="data-table data-table-cards">
                  <table>
                    <thead>
                      <tr>
                        <th>{{ 'membershipGovernance.member' | translate }}</th>
                        <th>{{ 'membershipGovernance.corrections.field' | translate }}</th>
                        <th>{{ 'membershipGov.waivers.reason' | translate }}</th>
                        <th>{{ 'membershipGov.status' | translate }}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (request of corrections(); track request.id) {
                        <tr>
                          <td [attr.data-label]="'membershipGovernance.member' | translate">
                            <span class="member-cell">
                              <span class="member-name">{{ request.member_name || '—' }}</span>
                              <span class="ds-mono member-id">#{{ request.member_id }}</span>
                            </span>
                          </td>
                          <td [attr.data-label]="'membershipGovernance.corrections.field' | translate">
                            <span class="change-cell">
                              <span class="ds-mono">{{ request.field }}</span>
                              <app-icon name="chevron-right" [size]="13" />
                              <span class="ds-mono change-value">{{ request.requested_value }}</span>
                            </span>
                          </td>
                          <td [attr.data-label]="'membershipGov.waivers.reason' | translate" class="reason-cell">{{ request.reason }}</td>
                          <td [attr.data-label]="'membershipGov.status' | translate">
                            <span class="ds-tag" [attr.data-tone]="statusTone(request.status)">{{ 'membershipGovernance.corrections.' + request.status | translate }}</span>
                          </td>
                          @if (request.status === 'pending') {
                            <td [attr.data-label]="'common.actions' | translate">
                              <div class="row-actions">
                                <button type="button" class="btn btn-primary btn-sm" (click)="decideCorrection(request.id, 'applied')">{{ 'membershipGovernance.corrections.apply' | translate }}</button>
                                <button type="button" class="btn btn-danger btn-sm" (click)="decideCorrection(request.id, 'rejected')">{{ 'membershipGovernance.reject' | translate }}</button>
                              </div>
                            </td>
                          } @else {
                            <td [attr.data-label]="'common.actions' | translate"><span class="ds-mono row-date">{{ request.handled_at ? (request.handled_at | date: 'yyyy-MM-dd') : '—' }}</span></td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            }
          </div>
        </section>
      }

      <!-- ================= Arrears ================= -->
      @if (tab() === 'arrears') {
        <section class="ds-card">
          <div class="ds-card-header">
            <span class="ds-card-icon"><app-icon name="chart" [size]="18" /></span>
            <div class="ds-card-heading">
              <h2 class="ds-card-title">{{ 'membershipGovernance.arrears.title' | translate }}</h2>
              <p class="ds-card-sub">{{ 'membershipGovernance.arrears.sub' | translate }}</p>
            </div>
          </div>
          <div class="ds-card-body">
            @if (pending().arrears) {
              <app-section-loader variant="rows" [count]="3" />
            } @else if (failed().arrears) {
              <div class="gov-empty">
                <span class="gov-empty-icon"><app-icon name="alert" [size]="22" /></span>
                <p class="field-error">{{ 'common.loadFailed' | translate }}</p>
                <button type="button" class="btn btn-secondary btn-sm" (click)="loadTab('arrears')">{{ 'common.retry' | translate }}</button>
              </div>
            } @else {
              @if (arrears().length === 0) {
                <div class="gov-empty">
                  <span class="gov-empty-icon"><app-icon name="chart" [size]="22" /></span>
                  <p>{{ 'membershipGovernance.empty.arrears' | translate }}</p>
                </div>
              } @else {
                <div class="totals-grid">
                  <div class="totals-tile">
                    <span class="totals-label">{{ 'membershipGovernance.arrears.totalExpected' | translate }}</span>
                    <span class="ds-mono totals-value">{{ taka(arrearsTotals().expected) }}</span>
                  </div>
                  <div class="totals-tile">
                    <span class="totals-label">{{ 'membershipGovernance.arrears.totalPaid' | translate }}</span>
                    <span class="ds-mono totals-value is-good">{{ taka(arrearsTotals().paid) }}</span>
                  </div>
                  <div class="totals-tile" [class.is-due]="arrearsTotals().due > 0">
                    <span class="totals-label">{{ 'membershipGovernance.arrears.totalDue' | translate }}</span>
                    <span class="ds-mono totals-value" [class.is-bad]="arrearsTotals().due > 0">{{ taka(arrearsTotals().due) }}</span>
                  </div>
                </div>
                <div class="data-table data-table-cards">
                  <table>
                    <thead>
                      <tr>
                        <th>{{ 'membershipGovernance.member' | translate }}</th>
                        <th>{{ 'membershipGovernance.arrears.months' | translate }}</th>
                        <th>{{ 'membershipGovernance.arrears.expected' | translate }}</th>
                        <th>{{ 'membershipGovernance.arrears.paid' | translate }}</th>
                        <th>{{ 'membershipGovernance.arrears.due' | translate }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (item of arrears(); track item.member_id) {
                        <tr>
                          <td [attr.data-label]="'membershipGovernance.member' | translate">
                            <span class="member-cell">
                              <span class="member-name">{{ item.full_name }}</span>
                              <span class="ds-mono member-id">#{{ item.member_id }}</span>
                            </span>
                          </td>
                          <td [attr.data-label]="'membershipGovernance.arrears.months' | translate"><span class="ds-mono">{{ item.months_expected }}</span></td>
                          <td [attr.data-label]="'membershipGovernance.arrears.expected' | translate"><span class="ds-mono">{{ taka(item.expected_amount) }}</span></td>
                          <td [attr.data-label]="'membershipGovernance.arrears.paid' | translate"><span class="ds-mono">{{ taka(item.paid_amount) }}</span></td>
                          <td [attr.data-label]="'membershipGovernance.arrears.due' | translate">
                            @if (item.in_arrears) {
                              <span class="ds-badge" data-tone="bad"><span class="ds-mono">{{ taka(item.arrears_amount) }}</span></span>
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
            }
          </div>
        </section>
      }
    </div>

    <!-- Suspension is a permanent decision: confirm it in a modal first. -->
    <app-confirm-modal
      [open]="suspendTarget() !== null"
      [title]="'membershipGovernance.actions.confirmSuspend' | translate"
      [message]="'membershipGovernance.actions.suspendConfirm' | translate"
      [confirmLabel]="'membershipGovernance.actions.confirmSuspend' | translate"
      [danger]="true"
      [loading]="suspending()"
      (confirm)="confirmSuspend()"
      (cancel)="suspendTarget.set(null)"
    />
  `,
  styles: [
    `
      .page-container { display: grid; gap: 1rem; }
      .ds-tab app-icon { vertical-align: -3px; margin-inline-end: 0.3rem; }
      .ds-tab-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.35rem;
        margin-inline-start: 0.35rem;
        padding: 0.05rem 0.4rem;
        border-radius: 999px;
        background: var(--emerald-800);
        color: #fff;
        font-size: 0.7rem;
        font-weight: 700;
        vertical-align: 1px;
      }
      .field-row { display: grid; gap: 0.75rem; grid-template-columns: 1fr; }
      @media (min-width: 640px) {
        .field-row { grid-template-columns: minmax(0, 14rem) 1fr; align-items: end; }
      }
      .member-cell { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
      .member-name { font-weight: 600; color: var(--gray-800); word-break: break-word; }
      .member-id { font-size: 0.72rem; color: var(--gray-500); }
      .reason-cell { max-width: 22rem; word-break: break-word; }
      .months-note { display: inline-block; margin-inline-start: 0.4rem; font-size: 0.75rem; color: var(--gray-500); }
      .row-date { font-size: 0.78rem; color: var(--gray-500); }
      .change-cell { display: inline-flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; font-size: 0.82rem; color: var(--gray-600); }
      .change-value { color: var(--emerald-800); font-weight: 600; }
      .assign-cell { gap: 0.5rem; }
      .assign-input { max-width: 9.5rem; }
      /* Arrears summary tiles. */
      .totals-grid { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr)); margin-bottom: 1rem; }
      .totals-tile {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        padding: 0.8rem 0.95rem;
        border: 1px solid var(--gray-200);
        border-radius: var(--radius-md, 0.5rem);
        background: var(--gray-50);
      }
      .totals-tile.is-due { border-color: color-mix(in srgb, var(--red-500, #c0392b) 35%, var(--gray-200)); background: color-mix(in srgb, var(--red-500, #c0392b) 5%, var(--surface)); }
      .totals-label { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--gray-500); }
      .totals-value { font-size: 1.05rem; font-weight: 700; color: var(--gray-800); }
      .totals-value.is-good { color: var(--emerald-700); }
      .totals-value.is-bad { color: var(--red-600, #b03a2e); }
      /* The reviewer-rule notice sits inside the card body. */
      .ds-card-body .gov-notice { margin-bottom: 1rem; }
    `,
  ],
})
export class MembershipGovernanceComponent implements OnInit {
  private readonly governance = inject(GovernanceService);
  private readonly lang = inject(LanguageService).lang;

  readonly tab = signal<Tab>('waivers');
  readonly pending = signal<Record<Tab, boolean>>({ waivers: true, actions: true, appeals: true, corrections: true, arrears: true });
  readonly failed = signal<Record<Tab, boolean>>({ waivers: false, actions: false, appeals: false, corrections: false, arrears: false });
  readonly waivers = signal<FeeWaiver[]>([]);
  readonly actions = signal<MembershipAction[]>([]);
  readonly appeals = signal<MembershipAppeal[]>([]);
  readonly corrections = signal<DataCorrectionRequest[]>([]);
  readonly arrears = signal<ArrearItem[]>([]);
  readonly noticeSuccess = signal(false);
  readonly suspending = signal(false);
  readonly suspendTarget = signal<MembershipAction | null>(null);
  reviewerIds: Record<number, number | undefined> = {};

  noticeMemberId: number | null = null;
  noticeReason = '';

  readonly arrearsTotals = computed(() => {
    const items = this.arrears();
    return {
      expected: items.reduce((sum, item) => sum + (item.expected_amount || 0), 0),
      paid: items.reduce((sum, item) => sum + (item.paid_amount || 0), 0),
      due: items.reduce((sum, item) => sum + (item.arrears_amount || 0), 0),
    };
  });

  /** A tab is ready once its first load finished (loader gone, no error): counts may show. */
  ready(tab: Tab): boolean {
    return !this.pending()[tab] && !this.failed()[tab];
  }

  taka(value: number): string {
    return formatTaka(value, this.lang());
  }

  statusTone(status: string): string {
    if (status === 'approved' || status === 'applied' || status === 'upheld') return 'good';
    if (status === 'rejected' || status === 'decided' || status === 'overturned') return 'bad';
    if (status === 'cancelled') return 'neutral';
    return 'warn';
  }

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

  loadTab(tab: Tab): void {
    this.pending.update((p) => ({ ...p, [tab]: true }));
    this.failed.update((f) => ({ ...f, [tab]: false }));
    this.refresh(tab);
  }

  private refresh(tab: Tab): void {
    const done = () => this.pending.update((p) => ({ ...p, [tab]: false }));
    const fail = () => {
      done();
      this.failed.update((f) => ({ ...f, [tab]: true }));
    };
    const handlers = {
      waivers: () => this.governance.adminWaivers().subscribe({ next: (rows) => { this.waivers.set(rows); done(); }, error: fail }),
      actions: () => this.governance.adminActions().subscribe({ next: (rows) => { this.actions.set(rows); done(); }, error: fail }),
      appeals: () => this.governance.adminAppeals().subscribe({ next: (rows) => { this.appeals.set(rows); done(); }, error: fail }),
      corrections: () => this.governance.adminCorrections().subscribe({ next: (rows) => { this.corrections.set(rows); done(); }, error: fail }),
      arrears: () => this.governance.membersArrears().subscribe({ next: (data) => { this.arrears.set(data.items); done(); }, error: fail }),
    } satisfies Record<Tab, () => unknown>;
    handlers[tab]();
  }

  decideWaiver(id: number, status: 'approved' | 'rejected'): void {
    this.governance.decideWaiver(id, status).subscribe({ next: () => this.load() });
  }

  issueNotice(): void {
    if (!this.noticeMemberId || !this.noticeReason.trim()) return;
    this.noticeSuccess.set(false);
    this.governance.suspensionNotice(this.noticeMemberId, this.noticeReason).subscribe({
      next: () => {
        this.noticeReason = '';
        this.noticeSuccess.set(true);
        this.load();
      },
    });
  }

  notice(id: number): void {
    this.governance.noticeAction(id).subscribe({ next: () => this.load() });
  }

  askSuspend(action: MembershipAction): void {
    this.suspendTarget.set(action);
  }

  confirmSuspend(): void {
    const action = this.suspendTarget();
    if (!action) return;
    this.suspending.set(true);
    this.governance.decideAction(action.id, 'সাসপেনশন নিশ্চিত', true).subscribe({
      next: () => {
        this.suspending.set(false);
        this.suspendTarget.set(null);
        this.load();
      },
      error: () => {
        this.suspending.set(false);
        this.suspendTarget.set(null);
      },
    });
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
