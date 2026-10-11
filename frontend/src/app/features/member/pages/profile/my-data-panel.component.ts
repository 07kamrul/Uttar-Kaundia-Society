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
    <section class="card profile-data-panel">
      <h2><app-icon name="eye" /> {{ 'myData.title' | translate }}</h2>

      <h3>{{ 'myData.documents' | translate }}</h3>
      @if (documents().length === 0) {
        <div class="ds-empty">{{ 'myData.noDocuments' | translate }}</div>
      } @else {
        <ul class="doc-list">
          @for (doc of documents(); track doc.url) {
            <li>
              <button type="button" class="btn-secondary" (click)="download(doc)">{{ doc.label }}</button>
            </li>
          }
        </ul>
      }
      @if (downloadError()) { <p class="field-error">{{ 'myData.downloadError' | translate }}</p> }

      <h3>{{ 'myData.requestCorrection' | translate }}</h3>
      <form (ngSubmit)="submitCorrection()" #form="ngForm">
        <div class="field-row">
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
          <textarea id="reason" name="reason" rows="2" [(ngModel)]="reason" required></textarea>
        </div>
        @if (submitError()) { <p class="field-error">{{ submitError() | translate }}</p> }
        <button class="btn-primary" type="submit" [disabled]="form.invalid || submitting()">
          {{ 'myData.submit' | translate }}
        </button>
      </form>

      <h3>{{ 'myData.myRequests' | translate }}</h3>
      @if (requests().length === 0) {
        <div class="ds-empty">{{ 'myData.noRequests' | translate }}</div>
      } @else {
        <div class="data-table data-table-cards">
          <table>
            <tbody>
              @for (request of requests(); track request.id) {
                <tr>
                  <td [attr.data-label]="'myData.field' | translate">{{ request.field }}</td>
                  <td [attr.data-label]="'myData.requestedValue' | translate">{{ request.requested_value }}</td>
                  <td [attr.data-label]="'myData.status' | translate">
                    <span class="ds-tag" [attr.data-tone]="request.status === 'applied' ? 'good' : request.status === 'rejected' ? 'bad' : 'warn'">
                      {{ 'myData.statuses.' + request.status | translate }}
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .doc-list { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 0.5rem; }
      .field-row { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
    `,
  ],
})
export class MyDataPanelComponent implements OnInit {
  private readonly governance = inject(GovernanceService);

  readonly documents = signal<MyDocument[]>([]);
  readonly requests = signal<DataCorrectionRequest[]>([]);
  readonly submitting = signal(false);
  readonly submitError = signal('');
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
    this.governance
      .requestCorrection({ field: this.field, requested_value: this.requestedValue, reason: this.reason })
      .subscribe({
        next: () => {
          this.field = '';
          this.requestedValue = '';
          this.reason = '';
          this.submitting.set(false);
          this.governance.myCorrections().subscribe({ next: (rows) => this.requests.set(rows) });
        },
        error: () => {
          this.submitError.set('common.saveFailed');
          this.submitting.set(false);
        },
      });
  }
}
