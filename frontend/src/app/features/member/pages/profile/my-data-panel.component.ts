import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { IconComponent } from '../../../../shared/icon/icon.component';
import {
  DataCorrectionRequest,
  GovernanceService,
  MyDocument,
} from '../../../../core/services/governance.service';

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

/** Profile panel: "আমার তথ্য দেখুন / সংশোধনের অনুরোধ" — lists the member's own
 * uploaded documents (authenticated streaming downloads, never the raw
 * /uploads URL) and files data-correction requests to the committee. */
@Component({
  selector: 'app-my-data-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, FormsModule, IconComponent],
  template: `
    <section class="card data-panel">
      <div class="panel-head">
        <span class="panel-icon"><app-icon name="eye" [size]="16" /></span>
        <h2>{{ 'myData.title' | translate }}</h2>
      </div>

      <div class="panel-block">
        <h3 class="block-title">
          <app-icon name="doc" [size]="15" />
          {{ 'myData.documents' | translate }}
          @if (documents().length) {
            <span class="count-pill">{{ documents().length }}</span>
          }
        </h3>
        @if (documents().length === 0) {
          <div class="panel-empty">
            <span class="panel-empty-icon"><app-icon name="doc" [size]="20" /></span>
            <p>{{ 'myData.noDocuments' | translate }}</p>
          </div>
        } @else {
          <div class="doc-list">
            @for (doc of documents(); track doc.url) {
              <button type="button" class="btn btn-secondary btn-sm doc-chip" (click)="download(doc)">
                <app-icon name="doc" [size]="14" />
                <span class="doc-name">{{ doc.label }}</span>
                <app-icon name="download" [size]="14" />
              </button>
            }
          </div>
        }
        @if (downloadError()) { <p class="field-error">{{ 'myData.downloadError' | translate }}</p> }
      </div>

      <div class="panel-block">
        <h3 class="block-title">
          <app-icon name="edit" [size]="15" />
          {{ 'myData.requestCorrection' | translate }}
        </h3>
        <form (ngSubmit)="submitCorrection()" #form="ngForm">
          <div class="form-grid">
            <div class="field">
              <label for="field">{{ 'myData.field' | translate }}</label>
              <input id="field" name="field" [(ngModel)]="field" required [placeholder]="'myData.fieldPlaceholder' | translate" />
            </div>
            <div class="field">
              <label for="requestedValue">{{ 'myData.requestedValue' | translate }}</label>
              <input id="requestedValue" name="requestedValue" [(ngModel)]="requestedValue" required />
            </div>
          </div>
          <div class="field">
            <label for="reason">{{ 'myData.reason' | translate }}</label>
            <textarea id="reason" name="reason" rows="3" [(ngModel)]="reason" required></textarea>
          </div>
          @if (submitSuccess()) {
            <div class="success-banner" role="status">
              <app-icon name="check-circle" [size]="16" />
              <p>{{ 'myData.submitSuccess' | translate }}</p>
            </div>
          }
          @if (submitError()) { <p class="field-error">{{ submitError() | translate }}</p> }
          <div class="form-actions">
            <button class="btn btn-primary" type="submit" [disabled]="form.invalid || submitting()">
              @if (submitting()) { <span class="spinner"></span> }
              {{ 'myData.submit' | translate }}
            </button>
          </div>
        </form>
      </div>

      <div class="panel-block">
        <h3 class="block-title">
          <app-icon name="inbox" [size]="15" />
          {{ 'myData.myRequests' | translate }}
          @if (requests().length) {
            <span class="count-pill">{{ requests().length }}</span>
          }
        </h3>
        @if (requests().length === 0) {
          <div class="panel-empty">
            <span class="panel-empty-icon"><app-icon name="inbox" [size]="20" /></span>
            <p>{{ 'myData.noRequests' | translate }}</p>
          </div>
        } @else {
          <ul class="request-list">
            @for (request of requests(); track request.id) {
              <li class="request-item">
                <span class="request-field">{{ request.field }}</span>
                <span class="request-value">{{ request.requested_value }}</span>
                <span class="ds-tag" [attr.data-tone]="request.status === 'applied' ? 'good' : request.status === 'rejected' ? 'bad' : 'warn'">
                  {{ 'myData.statuses.' + request.status | translate }}
                </span>
              </li>
            }
          </ul>
        }
      </div>
    </section>
  `,
  styles: [
    `
      .data-panel { padding: 1.25rem; display: grid; gap: 1.4rem; max-width: 56rem; }
      .panel-head { display: flex; align-items: center; gap: 0.55rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--gray-200); }
      .panel-head h2 { margin: 0; font-size: 1rem; font-weight: 700; color: var(--emerald-800); }
      .panel-icon {
        display: inline-flex; align-items: center; justify-content: center;
        width: 1.7rem; height: 1.7rem; border-radius: 0.55rem; flex-shrink: 0;
        color: var(--emerald-800); background: var(--emerald-50);
        border: 1px solid color-mix(in srgb, var(--emerald-200) 55%, transparent);
      }

      .panel-block { display: grid; gap: 0.7rem; }
      .block-title { margin: 0; display: flex; align-items: center; gap: 0.45rem; font-size: 0.92rem; font-weight: 700; color: var(--gray-800); }
      .block-title app-icon { color: var(--gray-500); }
      .count-pill {
        margin-left: auto; font-size: 0.72rem; font-weight: 700; color: var(--gray-700);
        background: var(--gray-50); border: 1px solid var(--gray-200);
        border-radius: 999px; padding: 0.1rem 0.6rem;
      }

      .doc-list { display: flex; flex-wrap: wrap; gap: 0.5rem; }
      .doc-chip { max-width: 100%; }
      .doc-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

      .form-grid { display: grid; gap: 0 0.9rem; grid-template-columns: 1fr; }
      @media (min-width: 640px) { .form-grid { grid-template-columns: 1fr 1fr; } }
      form { display: grid; gap: 0.9rem; }
      .form-actions { display: flex; justify-content: flex-end; }

      .success-banner {
        display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.7rem 0.9rem;
        border-radius: 0.6rem; background: var(--emerald-50); color: var(--emerald-700);
        border: 1px solid color-mix(in srgb, var(--emerald-600) 30%, transparent);
        font-size: 0.88rem;
      }
      .success-banner p { margin: 0; }
      .success-banner app-icon { flex-shrink: 0; margin-top: 0.1rem; }

      .panel-empty {
        display: grid; justify-items: center; gap: 0.35rem; padding: 1.1rem; text-align: center;
        border: 1px dashed var(--gray-200); border-radius: 0.7rem; color: var(--gray-500);
      }
      .panel-empty p { margin: 0; font-size: 0.85rem; font-weight: 500; }
      .panel-empty-icon {
        display: inline-flex; align-items: center; justify-content: center;
        width: 2.2rem; height: 2.2rem; border-radius: 999px;
        background: var(--surface-2); color: var(--gray-400);
      }

      .request-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
      .request-item {
        display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
        padding: 0.65rem 0.85rem; border: 1px solid var(--gray-200); border-radius: 0.6rem;
        background: var(--surface);
      }
      .request-field {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8rem; font-weight: 700;
        color: var(--gray-700); background: var(--surface-2); border: 1px solid var(--gray-200);
        border-radius: 0.4rem; padding: 0.15rem 0.5rem; overflow-wrap: anywhere;
      }
      .request-value { flex: 1; min-width: 8rem; font-size: 0.9rem; color: var(--gray-800); overflow-wrap: anywhere; }
      .request-item .ds-tag { margin-left: auto; }

      @media (max-width: 540px) {
        .data-panel { padding: 1rem; }
        .form-actions .btn { width: 100%; }
        .request-item .ds-tag { margin-left: 0; }
      }
    `,
  ],
})
export class MyDataPanelComponent implements OnInit {
  private readonly governance = inject(GovernanceService);

  readonly documents = signal<MyDocument[]>([]);
  readonly requests = signal<DataCorrectionRequest[]>([]);
  readonly submitting = signal(false);
  readonly submitError = signal('');
  readonly submitSuccess = signal(false);
  readonly downloadError = signal('');

  field = '';
  requestedValue = '';
  reason = '';

  ngOnInit(): void {
    this.governance.myDocuments().subscribe({ next: (data) => this.documents.set(data.documents) });
    this.governance.myCorrections().subscribe({ next: (rows) => this.requests.set(rows) });
  }

  download(doc: MyDocument): void {
    this.downloadError.set('');
    this.governance.downloadDocument(doc.url).subscribe({
      next: (blob) => saveBlob(blob, doc.label),
      error: () => this.downloadError.set('myData.downloadError'),
    });
  }

  submitCorrection(): void {
    this.submitting.set(true);
    this.submitError.set('');
    this.submitSuccess.set(false);
    this.governance
      .requestCorrection({ field: this.field, requested_value: this.requestedValue, reason: this.reason })
      .subscribe({
        next: () => {
          this.field = '';
          this.requestedValue = '';
          this.reason = '';
          this.submitting.set(false);
          this.submitSuccess.set(true);
          this.governance.myCorrections().subscribe({ next: (rows) => this.requests.set(rows) });
        },
        error: () => {
          this.submitError.set('common.saveFailed');
          this.submitting.set(false);
        },
      });
  }
}
