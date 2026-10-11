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
        <div>
          <h1 class="page-title">
            <span class="title-badge"><app-icon name="alert" [size]="17" /></span>
            {{ 'emergency.title' | translate }}
          </h1>
          <p class="page-subtitle">{{ 'emergency.subtitle' | translate }}</p>
        </div>
      </header>

      <section class="card danger-card">
        <div class="card-head danger-head">
          <span class="head-icon"><app-icon name="phone" [size]="16" /></span>
          <h2>{{ 'emergency.contactsTitle' | translate }}</h2>
        </div>
        <div class="contacts">
          @for (contact of constants()?.emergency_contacts ?? []; track contact.key) {
            <a class="contact" href="tel:{{ contact.number }}">
              <span class="contact-number">{{ contact.number }}</span>
              <span class="contact-label">{{ contact.bn }}</span>
              <span class="contact-cta">
                <app-icon name="phone" [size]="13" />
                {{ 'emergency.tapToCall' | translate }}
              </span>
            </a>
          }
        </div>
      </section>

      <section class="card steps-card">
        <div class="card-head steps-head">
          <span class="head-icon steps-icon"><app-icon name="check-circle" [size]="16" /></span>
          <h2>{{ 'emergency.stepsTitle' | translate }}</h2>
        </div>
        <ol class="steps">
          @for (step of steps; track $index) {
            <li>
              <span class="step-no">{{ stepNumbers[$index] }}</span>
              <span class="step-text">{{ step | translate }}</span>
            </li>
          }
        </ol>
      </section>

      <div class="actions-row">
        <a class="btn btn-secondary" routerLink="/complaints/land-protection">
          <app-icon name="doc" [size]="16" />
          {{ 'emergency.fileLandComplaint' | translate }}
        </a>
        <a class="btn btn-secondary" routerLink="/complaints">
          <app-icon name="edit" [size]="16" />
          {{ 'emergency.fileComplaint' | translate }}
        </a>
      </div>
    </div>
  `,
  styles: [
    `
      .page-container { display: grid; gap: 1.25rem; max-width: 56rem; }
      .page-title { display: flex; align-items: center; gap: 0.6rem; margin: 0; font-size: 1.35rem; font-weight: 700; color: var(--emerald-900); }
      .title-badge {
        display: inline-flex; align-items: center; justify-content: center;
        width: 2.1rem; height: 2.1rem; border-radius: 0.6rem; flex-shrink: 0;
        background: var(--red-50); color: var(--red-600); border: 1px solid var(--red-200);
      }
      .page-subtitle { margin: 0.35rem 0 0; color: var(--gray-600); font-size: 0.9rem; }

      .danger-card, .steps-card { padding: 1.25rem; display: grid; gap: 1rem; }
      .danger-card { border-color: var(--red-200); }
      .card-head { display: flex; align-items: center; gap: 0.55rem; padding-bottom: 0.7rem; border-bottom: 1px solid var(--gray-200); }
      .danger-head { border-bottom-color: color-mix(in srgb, var(--red-200) 70%, transparent); }
      .danger-head h2 { margin: 0; font-size: 0.98rem; font-weight: 700; color: var(--red-700); }
      .steps-head { border-bottom-color: color-mix(in srgb, var(--emerald-200) 45%, transparent); }
      .steps-head h2 { margin: 0; font-size: 0.98rem; font-weight: 700; color: var(--emerald-800); }
      .head-icon {
        display: inline-flex; align-items: center; justify-content: center;
        width: 1.7rem; height: 1.7rem; border-radius: 0.55rem; flex-shrink: 0;
        background: var(--red-50); color: var(--red-600); border: 1px solid var(--red-200);
      }
      .steps-icon {
        background: var(--emerald-50); color: var(--emerald-800);
        border-color: color-mix(in srgb, var(--emerald-200) 55%, transparent);
      }

      .contacts { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); }
      .contact {
        display: grid; gap: 0.25rem; padding: 1rem 1.1rem; border-radius: 0.8rem;
        background: var(--red-50); border: 1px solid var(--red-200); text-decoration: none;
        transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
      }
      .contact:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); border-color: var(--red-600); }
      .contact-number { font-size: 1.75rem; font-weight: 800; line-height: 1.1; color: var(--red-600); font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }
      .contact-label { font-size: 0.88rem; font-weight: 600; color: var(--gray-800); }
      .contact-cta { display: inline-flex; align-items: center; gap: 0.3rem; margin-top: 0.2rem; font-size: 0.75rem; font-weight: 700; color: var(--red-700); }

      .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.85rem; }
      .steps li { display: flex; align-items: flex-start; gap: 0.8rem; }
      .step-no {
        flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
        width: 1.7rem; height: 1.7rem; border-radius: 999px;
        background: var(--emerald-50); border: 1px solid color-mix(in srgb, var(--emerald-200) 55%, transparent);
        color: var(--emerald-800); font-size: 0.85rem; font-weight: 800;
      }
      .step-text { padding-top: 0.18rem; line-height: 1.55; color: var(--gray-800); }

      .actions-row { display: flex; flex-wrap: wrap; gap: 0.75rem; }
      @media (max-width: 540px) {
        .actions-row { flex-direction: column; }
        .actions-row .btn { width: 100%; }
        .danger-card, .steps-card { padding: 1rem; }
      }
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

  /** Bengali numerals so the step badges match the Bengali step copy. */
  readonly stepNumbers = ['১', '২', '৩', '৪', '৫'];

  ngOnInit(): void {
    this.governance.complaintConstants().subscribe({ next: (c) => this.constants.set(c) });
  }
}
