import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { toUserMessageKey } from '../../../../core/errors/user-error';
import { HelplineService, type Helpline } from '../../../../core/services/helpline.service';

/** System-config card: the society helpline shown on members' "সাহায্য দরকার?" button (manage_system_config). */
@Component({
  selector: 'app-helpline-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <section class="card card-pad" data-testid="helpline-card" style="margin-bottom:1.5rem">
      <h2 style="font-size:1rem;margin-top:0">{{ 'admin.helpline.title' | translate }}</h2>
      <p class="field-hint">{{ 'admin.helpline.hint' | translate }}</p>
      <div class="form-grid">
        <div class="field">
          <label for="helplinePhone">{{ 'admin.helpline.phone' | translate }}</label>
          <input id="helplinePhone" type="tel" data-testid="helpline-phone" [value]="phone()" (input)="phone.set(valueOf($event))" />
        </div>
        <div class="field">
          <label for="helplineWhatsapp">{{ 'admin.helpline.whatsapp' | translate }}</label>
          <input id="helplineWhatsapp" type="tel" data-testid="helpline-whatsapp" [value]="whatsapp()" (input)="whatsapp.set(valueOf($event))" />
        </div>
        <div class="field form-grid-full">
          <label for="helplineHours">{{ 'admin.helpline.hours' | translate }}</label>
          <input id="helplineHours" type="text" maxlength="200" data-testid="helpline-hours" [value]="hours()" (input)="hours.set(valueOf($event))" />
        </div>
      </div>
      @if (error()) {
        <p class="field-error" data-testid="helpline-error" role="alert">{{ error() | translate }}</p>
      }
      @if (saved()) {
        <p class="field-hint" data-testid="helpline-saved" role="status">{{ 'admin.helpline.saved' | translate }}</p>
      }
      <button type="button" class="btn btn-primary" data-testid="helpline-save" [disabled]="saving()" (click)="save()">
        {{ 'admin.helpline.save' | translate }}
      </button>
    </section>
  `,
})
export class HelplineCardComponent implements OnInit {
  private readonly service = inject(HelplineService);
  readonly phone = signal('');
  readonly whatsapp = signal('');
  readonly hours = signal('');
  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly error = signal('');

  ngOnInit(): void {
    this.service.loadForAdmin().subscribe({
      next: (h) => this.show(h),
      error: () => this.error.set('admin.helpline.loadError'),
    });
  }

  valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  save(): void {
    this.saving.set(true);
    this.saved.set(false);
    this.error.set('');
    this.service.save({ phone: this.phone(), whatsapp: this.whatsapp(), hoursText: this.hours() }).subscribe({
      next: (h) => {
        this.show(h);
        this.saving.set(false);
        this.saved.set(true);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.error.set(toUserMessageKey(err));
      },
    });
  }

  private show(h: Helpline): void {
    this.phone.set(h.phone ?? '');
    this.whatsapp.set(h.whatsapp ?? '');
    this.hours.set(h.hoursText ?? '');
  }
}
