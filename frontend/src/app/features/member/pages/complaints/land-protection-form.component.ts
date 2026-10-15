import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { DatePickerComponent } from '../../../../shared/date-picker/date-picker.component';
import { ComplaintConstants, GovernanceService } from '../../../../core/services/governance.service';

@Component({
  selector: 'app-land-protection-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, FormsModule, IconComponent, DatePickerComponent],
  template: `
    <div class="page-container">
      <header class="page-header">
        <h1><app-icon name="shield" /> {{ 'complaintsModule.land.title' | translate }}</h1>
        <p class="muted">{{ 'complaintsModule.land.subtitle' | translate }}</p>
      </header>

      @if (constants(); as c) {
        @if (emergencyDanger) {
          <div class="card danger-card">
            <h2>{{ 'complaintsModule.land.emergencyTitle' | translate }}</h2>
            <ul>
              @for (contact of c.emergency_contacts; track contact.key) {
                <li><strong>{{ contact.number }}</strong> — {{ contact.bn }}</li>
              }
            </ul>
          </div>
        }
      }

      <form (ngSubmit)="submit()" #form="ngForm">
        <section class="card">
          <h2>{{ 'complaintsModule.land.sectionComplainant' | translate }}</h2>
          <div class="field">
            <label for="complainantName">{{ 'complaintsModule.land.complainantName' | translate }}</label>
            <input id="complainantName" name="complainantName" [(ngModel)]="model.complainant_name" required />
          </div>
          <div class="field">
            <label for="complainantContact">{{ 'complaintsModule.land.complainantContact' | translate }}</label>
            <input id="complainantContact" name="complainantContact" [(ngModel)]="model.complainant_contact" />
          </div>
        </section>

        <section class="card">
          <h2>{{ 'complaintsModule.land.sectionLand' | translate }}</h2>
          <div class="field">
            <label for="landLocation">{{ 'complaintsModule.land.location' | translate }}</label>
            <input id="landLocation" name="landLocation" [(ngModel)]="model.land_location" required />
          </div>
          <div class="field-row">
            <div class="field">
              <label for="dagNo">{{ 'complaintsModule.land.dagNo' | translate }}</label>
              <input id="dagNo" name="dagNo" [(ngModel)]="model.dag_no" required />
            </div>
            <div class="field">
              <label for="khatianNo">{{ 'complaintsModule.land.khatianNo' | translate }}</label>
              <input id="khatianNo" name="khatianNo" [(ngModel)]="model.khatian_no" required />
            </div>
          </div>
        </section>

        <section class="card">
          <h2>{{ 'complaintsModule.land.sectionIncident' | translate }}</h2>
          <div class="field">
            <label for="accusedParty">{{ 'complaintsModule.land.accusedParty' | translate }}</label>
            <input id="accusedParty" name="accusedParty" [(ngModel)]="model.accused_party" required />
          </div>
          <div class="field">
            <label for="incidentDate">{{ 'complaintsModule.land.incidentDate' | translate }}</label>
            <app-date-picker inputId="incidentDate" name="incidentDate" [(value)]="model.incident_date"></app-date-picker>
          </div>
          <div class="field">
            <label for="incidentDescription">{{ 'complaintsModule.land.incidentDescription' | translate }}</label>
            <textarea id="incidentDescription" name="incidentDescription" rows="4" [(ngModel)]="model.incident_description" required></textarea>
          </div>
          <div class="checkbox-row">
            <input id="emergencyDanger" type="checkbox" [(ngModel)]="emergencyDanger" name="emergencyDanger" />
            <label for="emergencyDanger">{{ 'complaintsModule.land.emergencyPrompt' | translate }}</label>
          </div>
        </section>

        @if (constants(); as c) {
          <section class="card">
            <h2>{{ 'complaintsModule.land.sectionEvidence' | translate }}</h2>
            @for (item of c.land_evidence_checklist; track item) {
              <div class="checkbox-row">
                <input
                  type="checkbox"
                  [id]="'ev-' + $index"
                  [checked]="evidenceSet().has(item)"
                  (change)="toggleEvidence(item, $event)"
                />
                <label [for]="'ev-' + $index">{{ item }}</label>
              </div>
            }
            <div class="field">
              <label for="evidence">{{ 'complaintsModule.land.evidenceFile' | translate }}</label>
              <input id="evidence" type="file" accept=".jpg,.jpeg,.png,.pdf" (change)="onEvidence($event)" />
            </div>
          </section>
        }

        <section class="card">
          <h2>{{ 'complaintsModule.land.sectionConsent' | translate }}</h2>
          <div class="field">
            <label for="signatureName">{{ 'complaintsModule.land.signatureName' | translate }}</label>
            <input id="signatureName" name="signatureName" [(ngModel)]="model.signature_name" required />
          </div>
          <div class="field">
            <label for="signatureDate">{{ 'complaintsModule.land.signatureDate' | translate }}</label>
            <app-date-picker inputId="signatureDate" name="signatureDate" [(value)]="model.signature_date"></app-date-picker>
          </div>
          <div class="checkbox-row">
            <input id="disclaimer" type="checkbox" [(ngModel)]="model.disclaimer_acknowledged" name="disclaimer_acknowledged" required />
            <label for="disclaimer">{{ 'complaintsModule.land.disclaimer' | translate }}</label>
          </div>
          <div class="checkbox-row">
            <input id="consent" type="checkbox" [(ngModel)]="model.consent" name="consent" required />
            <label for="consent">{{ 'complaintsModule.land.consent' | translate }}</label>
          </div>
          @if (formError()) { <p class="field-error">{{ formError() | translate }}</p> }
          <button class="btn-primary" type="submit" [disabled]="form.invalid || submitting()">
            {{ 'complaintsModule.land.submit' | translate }}
          </button>
        </section>
      </form>
    </div>
  `,
  styles: [
    `
      .page-container { display: grid; gap: 1rem; }
      .page-header h1 { display: flex; align-items: center; gap: 0.5rem; }
      .muted { color: var(--gray-600, #667); }
      .danger-card { border: 2px solid var(--red-600, #9c3a2c); }
      .field-row > *, .page-container > * { min-width: 0; }
      @media (max-width: 639px) { form button[type="submit"] { width: 100%; min-height: 44px; } }
      .field-row { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); }
    `,
  ],
})
export class LandProtectionFormComponent implements OnInit {
  private readonly governance = inject(GovernanceService);
  private readonly router = inject(Router);

  readonly constants = signal<ComplaintConstants | null>(null);
  readonly evidenceSet = signal<Set<string>>(new Set());
  readonly submitting = signal(false);
  readonly formError = signal('');
  emergencyDanger = false;
  evidenceFile: File | null = null;

  model = {
    complainant_name: '',
    complainant_contact: '',
    land_location: '',
    dag_no: '',
    khatian_no: '',
    accused_party: '',
    incident_date: '',
    incident_description: '',
    signature_name: '',
    signature_date: '',
    disclaimer_acknowledged: false,
    consent: false,
  };

  ngOnInit(): void {
    this.governance.complaintConstants().subscribe({ next: (c) => this.constants.set(c) });
  }

  toggleEvidence(item: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.evidenceSet.update((set) => {
      const next = new Set(set);
      if (checked) next.add(item);
      else next.delete(item);
      return next;
    });
  }

  onEvidence(event: Event): void {
    this.evidenceFile = (event.target as HTMLInputElement).files?.[0] ?? null;
  }

  submit(): void {
    if (!this.model.disclaimer_acknowledged || !this.model.consent) return;
    this.submitting.set(true);
    this.formError.set('');
    const payload = {
      ...this.model,
      emergency_danger: this.emergencyDanger,
      evidence_checklist: Array.from(this.evidenceSet()),
    };
    this.governance.submitLandComplaint(payload, this.evidenceFile).subscribe({
      next: () => this.router.navigate(['/complaints']),
      error: (err) => {
        this.formError.set(err.status === 422 ? 'complaintsModule.land.missingFields' : 'common.saveFailed');
        this.submitting.set(false);
      },
    });
  }
}
