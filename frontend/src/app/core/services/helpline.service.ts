import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { map, tap, type Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { NO_CACHE } from '../interceptors/cache-context';
import { SKIP_LOADER } from '../interceptors/loader-context';

export interface Helpline {
  phone: string | null;
  whatsapp: string | null;
  hoursText: string | null;
  /** True when a phone or WhatsApp number is set; the help button shows only then. */
  enabled: boolean;
}

export interface HelplineInput {
  phone: string;
  whatsapp: string;
  hoursText: string;
}

interface HelplineApi {
  phone: string | null;
  whatsapp: string | null;
  hours_text: string | null;
  enabled: boolean;
}

const OFF: Helpline = { phone: null, whatsapp: null, hoursText: null, enabled: false };

const toHelpline = (api: HelplineApi): Helpline => ({
  phone: api.phone,
  whatsapp: api.whatsapp,
  hoursText: api.hours_text,
  enabled: api.enabled === true,
});

/** The society helpline (admin-editable). Read once per session; failures leave it off. */
@Injectable({ providedIn: 'root' })
export class HelplineService {
  private readonly http = inject(HttpClient);
  private readonly publicUrl = `${environment.apiBaseUrl}/public/helpline`;
  private readonly adminUrl = `${environment.apiBaseUrl}/admin/helpline`;
  private readonly state = signal<Helpline>(OFF);
  private requested = false;

  readonly helpline = this.state.asReadonly();

  /** Fetches the helpline the first time it is called; later calls do nothing. */
  ensureLoaded(): void {
    if (this.requested) return;
    this.requested = true;
    this.fetch().subscribe({ error: () => this.state.set(OFF) });
  }

  loadForAdmin(): Observable<Helpline> {
    return this.fetch(true);
  }

  save(input: HelplineInput): Observable<Helpline> {
    return this.http
      .put<HelplineApi>(this.adminUrl, {
        phone: input.phone,
        whatsapp: input.whatsapp,
        hours_text: input.hoursText,
      })
      .pipe(
        map(toHelpline),
        tap((value) => this.state.set(value)),
      );
  }

  private fetch(fresh = false): Observable<Helpline> {
    const context = new HttpContext().set(SKIP_LOADER, true).set(NO_CACHE, fresh);
    return this.http.get<HelplineApi>(this.publicUrl, { context }).pipe(
      map(toHelpline),
      tap((value) => this.state.set(value)),
    );
  }
}
