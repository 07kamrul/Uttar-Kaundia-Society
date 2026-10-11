import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { ComplaintConstants, GovernanceService } from '../../../../core/services/governance.service';

@Component({
  selector: 'app-emergency-help',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, RouterLink, IconComponent],
  template: `
    <div class="page-container">
      <header class="page-header">
        <h1><app-icon name="alert" /> {{ 'emergency.title' | translate }}</h1>
        <p class="muted">{{ 'emergency.subtitle' | translate }}</p>
      </header>

      <section class="card danger-card">
        <h2>{{ 'emergency.contactsTitle' | translate }}</h2>
        <div class="contacts">
          @for (contact of constants()?.emergency_contacts ?? []; track contact.key) {
            <a class="contact" href="tel:{{ contact.number }}">
              <span class="number">{{ contact.number }}</span>
              <span class="label">{{ contact.bn }}</span>
            </a>
          }
        </div>
      </section>

      <section class="card">
        <h2>{{ 'emergency.stepsTitle' | translate }}</h2>
        <ol class="steps">
          @for (step of steps; track $index) {
            <li>{{ step }}</li>
          }
        </ol>
      </section>

      <div class="actions-row">
        <a class="btn-secondary" routerLink="/complaints/land-protection">{{ 'emergency.fileLandComplaint' | translate }}</a>
        <a class="btn-secondary" routerLink="/complaints">{{ 'emergency.fileComplaint' | translate }}</a>
      </div>
    </div>
  `,
  styles: [
    `
      .page-container { display: grid; gap: 1rem; }
      .page-header h1 { display: flex; align-items: center; gap: 0.5rem; }
      .muted { color: var(--gray-600, #667); }
      .danger-card { border: 2px solid var(--red-600, #9c3a2c); }
      .contacts { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
      .contact { display: grid; gap: 0.15rem; padding: 0.9rem; border-radius: 0.75rem; background: var(--surface-2, #f3efe3); text-decoration: none; }
      .contact .number { font-size: 1.6rem; font-weight: 700; color: var(--red-600, #9c3a2c); }
      .steps { margin-left: 1.2rem; display: grid; gap: 0.5rem; }
      .actions-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    `,
  ],
})
export class EmergencyHelpComponent implements OnInit {
  private readonly governance = inject(GovernanceService);
  readonly constants = signal<ComplaintConstants | null>(null);

  readonly steps = [
    'emergency.steps.0',
    'emergency.steps.1',
    'emergency.steps.2',
    'emergency.steps.3',
    'emergency.steps.4',
  ];

  ngOnInit(): void {
    this.governance.complaintConstants().subscribe({ next: (c) => this.constants.set(c) });
  }
}
