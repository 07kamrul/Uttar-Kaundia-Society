import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import { HelplineService } from './helpline.service';

const PUBLIC_URL = `${environment.apiBaseUrl}/public/helpline`;
const ADMIN_URL = `${environment.apiBaseUrl}/admin/helpline`;

describe('HelplineService', () => {
  let http: HttpTestingController;
  let service: HelplineService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(HelplineService);
  });
  afterEach(() => http.verify());

  it('is disabled until loaded', () => {
    expect(service.helpline().enabled).toBe(false);
  });

  it('loads once and exposes the numbers', () => {
    service.ensureLoaded();
    service.ensureLoaded();
    http.expectOne(PUBLIC_URL).flush({ phone: '+8801711000000', whatsapp: null, hours_text: 'সকাল ৯টা থেকে ৫টা', enabled: true });
    expect(service.helpline()).toEqual({
      phone: '+8801711000000',
      whatsapp: null,
      hoursText: 'সকাল ৯টা থেকে ৫টা',
      enabled: true,
    });
  });

  it('stays disabled when the server fails', () => {
    service.ensureLoaded();
    http.expectOne(PUBLIC_URL).flush('x', { status: 500, statusText: 'err' });
    expect(service.helpline().enabled).toBe(false);
  });

  it('saves through the admin endpoint and updates the cached value', () => {
    let done = false;
    service.save({ phone: '01711000000', whatsapp: '', hoursText: '' }).subscribe(() => (done = true));
    const req = http.expectOne(ADMIN_URL);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ phone: '01711000000', whatsapp: '', hours_text: '' });
    req.flush({ phone: '+8801711000000', whatsapp: null, hours_text: null, enabled: true });
    expect(done).toBe(true);
    expect(service.helpline().phone).toBe('+8801711000000');
  });

  it('reads the current values for the admin form', () => {
    service.loadForAdmin().subscribe();
    http.expectOne(PUBLIC_URL).flush({ phone: null, whatsapp: '+8801711000000', hours_text: null, enabled: true });
    expect(service.helpline().whatsapp).toBe('+8801711000000');
  });
});
