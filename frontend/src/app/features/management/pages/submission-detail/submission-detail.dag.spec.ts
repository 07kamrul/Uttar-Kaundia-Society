import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import type { SubmissionDetail } from '../../../../core/models/admin.model';
import { AdminService } from '../../../../core/services/admin.service';
import { AttachmentService } from '../../../../core/services/attachment.service';
import { SubmissionReviewService } from './submission-review.service';
import { SubmissionDetailComponent } from './submission-detail.component';

function submission(over: Partial<SubmissionDetail> = {}): SubmissionDetail {
  return {
    id: '1',
    status: 'pending',
    fullName: 'রহিম',
    mobile: '01711111111',
    createdAt: '2026-01-01T00:00:00Z',
    fatherOrHusband: 'x',
    mother: 'y',
    dob: '1990-01-01',
    nationality: 'বাংলাদেশী',
    occupation: '',
    nid: '1234567890',
    gender: 'পুরুষ',
    email: 'a@b.co',
    properties: [
      {
        id: 'p1',
        propertyType: ['জমি'],
        khatianNo: '10',
        dagNoCs: null,
        dagNoRs: null,
        landQuantity: '1',
        ownership: 'একক',
        dagUnknown: true,
        applicableDocs: [],
      },
    ],
    nominees: [],
    admissionFee: '500',
    subscription: '60',
    receiptNo: '1',
    paymentMethod: 'cash',
    needsDag: true,
    ...over,
  };
}

describe('SubmissionDetailComponent: dag and photo', () => {
  const admin = {
    getSubmission: vi.fn(),
    fillDag: vi.fn(),
    uploadPhoto: vi.fn(),
    approveSubmission: vi.fn(),
  };

  function create(data: SubmissionDetail) {
    Object.values(admin).forEach((fn) => fn.mockReset());
    admin.getSubmission.mockReturnValue(of(data));
    TestBed.configureTestingModule({
      imports: [SubmissionDetailComponent],
      providers: [
        provideTranslateService(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['id', '1']]) } } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: AdminService, useValue: admin },
        { provide: SubmissionReviewService, useValue: admin },
        { provide: AttachmentService, useValue: { load: vi.fn(), download: vi.fn() } },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('bn', bn);
    translate.use('bn');
    const fixture = TestBed.createComponent(SubmissionDetailComponent);
    fixture.detectChanges();
    fixture.detectChanges();
    return fixture;
  }

  const q = (f: { nativeElement: HTMLElement }, sel: string) => f.nativeElement.querySelector(sel) as HTMLElement | null;

  it('shows the "দাগ দরকার" badge when the submission needs a dag', () => {
    const f = create(submission());
    expect(q(f, '[data-testid="needs-dag-badge"]')!.textContent).toContain('দাগ দরকার');
  });

  it('shows no badge and no dag form when nothing is missing', () => {
    const f = create(submission({ needsDag: false, properties: [{ ...submission().properties[0], dagUnknown: false, dagNoCs: '5' }] }));
    expect(q(f, '[data-testid="needs-dag-badge"]')).toBeNull();
    expect(q(f, '[data-testid="dag-form"]')).toBeNull();
  });

  it('fills the CS / RS dag through the service and refreshes the submission', () => {
    const f = create(submission());
    const updated = submission({ needsDag: false, properties: [{ ...submission().properties[0], dagUnknown: false, dagNoCs: '345' }] });
    admin.fillDag.mockReturnValue(of(updated));
    const set = (sel: string, v: string) => {
      const input = q(f, sel) as HTMLInputElement;
      input.value = v;
      input.dispatchEvent(new Event('input'));
    };
    set('[data-testid="dag-cs"]', '৩৪৫');
    set('[data-testid="dag-rs"]', '');
    (q(f, '[data-testid="dag-save"]') as HTMLButtonElement).click();
    f.detectChanges();
    expect(admin.fillDag).toHaveBeenCalledWith('1', 'p1', { dagNoCs: '345', dagNoRs: null });
    expect(q(f, '[data-testid="needs-dag-badge"]')).toBeNull();
  });

  it('does not call the server when both dag boxes are blank', () => {
    const f = create(submission());
    (q(f, '[data-testid="dag-save"]') as HTMLButtonElement).click();
    f.detectChanges();
    expect(admin.fillDag).not.toHaveBeenCalled();
    expect(f.nativeElement.textContent).toContain('অন্তত একটি দাগ নম্বর লিখুন।');
  });

  it('shows a plain message when saving the dag fails', () => {
    const f = create(submission());
    admin.fillDag.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    ((q(f, '[data-testid="dag-cs"]')) as HTMLInputElement).value = '1';
    (q(f, '[data-testid="dag-cs"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (q(f, '[data-testid="dag-save"]') as HTMLButtonElement).click();
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('দাগ সংরক্ষণ করা যায়নি');
  });

  it('shows the 409 DAG_REQUIRED message plainly on approve', () => {
    const f = create(submission());
    admin.approveSubmission.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, error: { detail: { code: 'DAG_REQUIRED' } } })),
    );
    f.componentInstance.showApproveModal = true;
    f.componentInstance.approve();
    f.detectChanges();
    expect(f.componentInstance.actionError).toBe(
      'দাগ নম্বর এখনো লেখা হয়নি। আগে দাগ নম্বর লিখুন, তারপর অনুমোদন করুন।',
    );
    expect(f.nativeElement.textContent).toContain('আগে দাগ নম্বর লিখুন, তারপর অনুমোদন করুন।');
  });

  it('keeps the generic message for other approve failures', () => {
    const f = create(submission());
    admin.approveSubmission.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    f.componentInstance.approve();
    expect(f.componentInstance.actionError).toBe(bn.admin.submissionDetail.errors.approveFailed);
  });

  it('has an "ছবি আপলোড" control that sends the file to the photo endpoint', () => {
    const f = create(submission());
    const label = q(f, '[data-testid="photo-upload"]')!;
    expect(label.textContent).toContain('ছবি আপলোড');
    admin.uploadPhoto.mockReturnValue(of(submission()));
    const input = label.querySelector('input[type=file]') as HTMLInputElement;
    const file = new File([new Uint8Array([1])], 'me.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    expect(admin.uploadPhoto).toHaveBeenCalledWith('1', file);
  });
});

describe('AdminService dag and photo endpoints', () => {
  function setup() {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    return {
      http: TestBed.inject(HttpTestingController),
      service: TestBed.inject(AdminService),
      review: TestBed.inject(SubmissionReviewService),
    };
  }
  const apiDetail = (extra: Record<string, unknown> = {}) => ({
    id: 1, member_id: null, status: 'pending', full_name: 'x', mobile: '0', created_at: '', father_or_husband: '',
    mother: '', dob: '', nationality: '', occupation: '', nid: '', gender: '', email: '', admission_fee: '', subscription: '',
    receipt_no: '', payment_method: '', member_signature: null, member_photo_path: null, receipt_photo_path: null,
    rejection_reason: null, properties: [{ id: 5, property_type: [], property_type_other: null, khatian_no: null, dag_no_cs: null,
      dag_no_rs: null, holding_number: null, land_quantity: null, my_share_quantity: null, ownership: null, joint_owner_count: null,
      applicable_docs: [], dag_unknown: true }], nominees: [], needs_dag: true, ...extra,
  });

  it('maps needs_dag and dag_unknown, in the list and the detail', () => {
    const { http, service } = setup();
    let list: unknown;
    let detail: SubmissionDetail | undefined;
    service.listSubmissions().subscribe((r) => (list = r));
    http.expectOne((r) => r.url.endsWith('/admin/submissions')).flush([{ id: 1, member_id: null, status: 'pending', full_name: 'x', mobile: '0', created_at: '', needs_dag: true }]);
    expect((list as { needsDag: boolean }[])[0].needsDag).toBe(true);
    service.getSubmission('1').subscribe((r) => (detail = r));
    http.expectOne((r) => r.url.endsWith('/admin/submissions/1')).flush(apiDetail());
    expect(detail!.needsDag).toBe(true);
    expect(detail!.properties[0].dagUnknown).toBe(true);
  });

  it('missing needs_dag means false', () => {
    const { http, service } = setup();
    let list: { needsDag?: boolean }[] = [];
    service.listSubmissions().subscribe((r) => (list = r));
    http.expectOne((r) => r.url.endsWith('/admin/submissions')).flush([{ id: 1, member_id: null, status: 'pending', full_name: 'x', mobile: '0', created_at: '' }]);
    expect(list[0].needsDag).toBe(false);
  });

  it('fillDag PATCHes the contract endpoint with snake_case', () => {
    const { http, review } = setup();
    review.fillDag('1', '5', { dagNoCs: '345', dagNoRs: null }).subscribe();
    const req = http.expectOne((r) => r.url.endsWith('/admin/submissions/1/properties/5/dag'));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ dag_no_cs: '345', dag_no_rs: null });
    req.flush(apiDetail({ needs_dag: false }));
  });

  it('uploadPhoto PUTs multipart memberPhoto', () => {
    const { http, review } = setup();
    const file = new File([new Uint8Array([1])], 'me.jpg');
    review.uploadPhoto('1', file).subscribe();
    const req = http.expectOne((r) => r.url.endsWith('/admin/submissions/1/photo'));
    expect(req.request.method).toBe('PUT');
    expect((req.request.body as FormData).get('memberPhoto')).toBeInstanceOf(File);
    req.flush(apiDetail());
  });
});
