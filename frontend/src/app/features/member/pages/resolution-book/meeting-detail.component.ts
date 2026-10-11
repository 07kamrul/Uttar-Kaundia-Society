import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { LanguageService } from '../../../../core/services/language.service';
import { AuthService } from '../../../../core/services/auth.service';
import { GovernanceService } from '../../../../core/services/governance.service';
import {
  ResolutionBookService,
  attendanceStatusLabel,
  formatFileSize,
  formatRbDate,
  localizeDigits,
  meetingStatusLabel,
  meetingTypeLabel,
  recordingTypeLabel,
  resolutionStatusLabel,
  type MeetingDetail,
  type Recording,
  type Resolution,
  type ResolutionStatus,
  type VoteMode,
} from '../../../../core/services/resolution-book.service';

const OBJECT_URL_REVOKE_MS = 1000;
const TABS = ['overview', 'attendance', 'resolutions', 'recordings'] as const;
type Tab = (typeof TABS)[number];

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_REVOKE_MS);
}

@Component({
  selector: 'app-meeting-detail',
  standalone: true,
  imports: [TranslatePipe, IconComponent, RouterLink, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './meeting-detail.component.html',
  styleUrl: './meeting-detail.component.scss',
})
export class MeetingDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(ResolutionBookService);
  private readonly language = inject(LanguageService);
  readonly auth = inject(AuthService);
  private readonly governance = inject(GovernanceService);

  readonly meetingId = signal<number | null>(null);
  readonly meeting = signal<MeetingDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly tab = signal<Tab>('overview');
  readonly pdfBusy = signal(false);
  readonly exportError = signal('');
  readonly statusSaving = signal<number | null>(null);
  readonly uploadBusy = signal(false);
  readonly uploadError = signal('');
  readonly tabs = TABS;

  // Module 3: notice publishing / quorum completion / vote mode controls.
  readonly noticeBusy = signal(false);
  readonly noticeError = signal('');
  readonly noticeOverride = signal(false);
  readonly overrideOffered = signal(false);
  readonly completeBusy = signal(false);
  readonly completeError = signal('');
  readonly completeAcknowledge = signal(false);
  readonly resolutionActionError = signal<Record<number, string>>({});
  readonly quorumRequiredFallback = signal<number | null>(null);

  readonly lang = this.language.lang;
  readonly canManage = computed(() => this.auth.hasPermission('manage_resolution_book'));
  readonly canManageMeetings = computed(() => this.auth.hasPermission('meeting.manage'));
  readonly canRecordVotes = computed(() => this.auth.hasPermission('vote_record.manage'));
  readonly attendancePercent = computed(() => this.meeting()?.attendancePercent ?? 0);

  /** Display quorum floor for the current sitting (server records the exact
   * number on completion; until then we show the constitutional 6-of-11). */
  readonly quorumRequired = computed<number | null>(() => {
    const meeting = this.meeting();
    if (!meeting) return null;
    if (meeting.quorumRequired != null) return meeting.quorumRequired;
    if (meeting.councilType === 'agm') return null;
    return this.quorumRequiredFallback();
  });

  readonly belowQuorum = computed(() => {
    const meeting = this.meeting();
    const required = this.quorumRequired();
    if (!meeting || required === null) return false;
    return meeting.attendancePresent < required;
  });

  ngOnInit(): void {
    this.governance.constants().subscribe({
      next: (constants) => {
        const quorum = constants.quorum ?? {};
        this.quorumRequiredFallback.set(
          quorum['executive'] ?? Math.floor((constants.council_size || 11) / 2) + 1,
        );
      },
      error: () => this.quorumRequiredFallback.set(null),
    });
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isFinite(id) || id <= 0) {
      this.router.navigate(['/resolution-book']);
      return;
    }
    this.meetingId.set(id);
    this.load();
  }

  load(): void {
    const id = this.meetingId();
    if (id === null) return;
    this.loading.set(true);
    this.error.set(false);
    this.service.getMeeting(id).subscribe({
      next: (data) => {
        this.meeting.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
  }

  digits(value: number | string): string {
    return localizeDigits(value, this.lang());
  }

  date(iso: string | null): string {
    return formatRbDate(iso, this.lang());
  }

  /** Local date+time label for stored ISO datetimes (notice/schedule). */
  dateTime(iso: string | null): string {
    if (!iso) return '';
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return iso;
    return parsed.toLocaleString(this.lang() === 'bn' ? 'bn-BD' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  typeLabel(type: MeetingDetail['meetingType']): string {
    return meetingTypeLabel(type, this.lang());
  }

  statusLabel(status: MeetingDetail['status']): string {
    return meetingStatusLabel(status, this.lang());
  }

  resolutionStatusLabel(status: ResolutionStatus): string {
    return resolutionStatusLabel(status, this.lang());
  }

  attendanceStatusLabel(status: 'present' | 'absent'): string {
    return attendanceStatusLabel(status, this.lang());
  }

  recordingTypeLabel(type: Recording['fileType']): string {
    return recordingTypeLabel(type, this.lang());
  }

  fileSize(bytes: number): string {
    return formatFileSize(bytes, this.lang());
  }

  downloadPdf(): void {
    const id = this.meetingId();
    if (id === null) return;
    this.pdfBusy.set(true);
    this.exportError.set('');
    this.service.downloadPdf(id).subscribe({
      next: (blob) => {
        saveBlob(blob, `minutes-${this.meeting()?.meetingNo ?? id}.pdf`);
        this.pdfBusy.set(false);
      },
      error: () => {
        this.exportError.set('rb.exportError');
        this.pdfBusy.set(false);
      },
    });
  }

  setResolutionStatus(resolutionId: number, status: ResolutionStatus): void {
    this.statusSaving.set(resolutionId);
    this.service.updateResolution(resolutionId, { status }).subscribe({
      next: (updated) => {
        this.patchResolution(updated);
        this.statusSaving.set(null);
      },
      error: (err) => {
        this.statusSaving.set(null);
        this.setResolutionError(resolutionId, err?.error?.detail || 'rb.detail.actionError');
      },
    });
  }

  /** Module 3: switch a resolution's ballot mode (open/secret/plain). */
  setResolutionVoteMode(resolution: Resolution, mode: VoteMode | null): void {
    this.statusSaving.set(resolution.id);
    this.service.updateResolution(resolution.id, { voteMode: mode }).subscribe({
      next: (updated) => {
        this.patchResolution(updated);
        this.statusSaving.set(null);
        this.clearResolutionError(resolution.id);
      },
      error: (err) => {
        this.statusSaving.set(null);
        this.setResolutionError(resolution.id, err?.error?.detail || 'rb.detail.actionError');
      },
    });
  }

  /** Module 3: the chair's casting vote on a tied recorded vote. */
  setCastingVote(resolution: Resolution, castingVote: string): void {
    this.statusSaving.set(resolution.id);
    const value = castingVote === '' ? null : (castingVote as 'for' | 'against' | 'neutral');
    this.service.updateResolution(resolution.id, { castingVote: value }).subscribe({
      next: (updated) => {
        this.patchResolution(updated);
        this.statusSaving.set(null);
        this.clearResolutionError(resolution.id);
      },
      error: (err) => {
        this.statusSaving.set(null);
        this.setResolutionError(resolution.id, err?.error?.detail || 'rb.detail.actionError');
      },
    });
  }

  /** Module 3: publish the sitting notice (override forces a short notice). */
  publishNotice(): void {
    const id = this.meetingId();
    if (id === null || this.noticeBusy()) return;
    this.noticeBusy.set(true);
    this.noticeError.set('');
    this.service.publishNotice(id, this.noticeOverride()).subscribe({
      next: (meeting) => {
        this.meeting.set(meeting);
        this.noticeBusy.set(false);
        this.noticeOverride.set(false);
        this.overrideOffered.set(false);
      },
      error: (err) => {
        this.noticeBusy.set(false);
        this.noticeError.set(err?.error?.detail || 'rb.detail.actionError');
        if (err?.status === 409) this.overrideOffered.set(true);
      },
    });
  }

  /** Module 3: complete a scheduled sitting, recording quorum. */
  completeMeeting(): void {
    const id = this.meetingId();
    if (id === null || this.completeBusy()) return;
    this.completeBusy.set(true);
    this.completeError.set('');
    this.service.completeMeeting(id, this.completeAcknowledge()).subscribe({
      next: (meeting) => {
        this.meeting.set(meeting);
        this.completeBusy.set(false);
        this.completeAcknowledge.set(false);
      },
      error: (err) => {
        this.completeBusy.set(false);
        this.completeError.set(err?.error?.detail || 'rb.detail.actionError');
        if (err?.status === 409) this.completeAcknowledge.set(false);
      },
    });
  }

  private patchResolution(updated: Resolution): void {
    const current = this.meeting();
    if (current) {
      this.meeting.set({
        ...current,
        resolutions: current.resolutions.map((r) => (r.id === updated.id ? updated : r)),
      });
    }
  }

  private setResolutionError(resolutionId: number, message: string): void {
    this.resolutionActionError.set({ ...this.resolutionActionError(), [resolutionId]: message });
  }

  private clearResolutionError(resolutionId: number): void {
    const next = { ...this.resolutionActionError() };
    delete next[resolutionId];
    this.resolutionActionError.set(next);
  }

  isTied(resolution: Resolution): boolean {
    return resolution.voteFor === resolution.voteAgainst && resolution.voteFor > 0;
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.uploadFile(file);
  }

  uploadFile(file: File): void {
    const id = this.meetingId();
    if (id === null) return;
    this.uploadBusy.set(true);
    this.uploadError.set('');
    this.service.uploadRecording(id, file).subscribe({
      next: (recording) => {
        const current = this.meeting();
        if (current) {
          this.meeting.set({ ...current, recordings: [...current.recordings, recording] });
        }
        this.uploadBusy.set(false);
      },
      error: (err) => {
        this.uploadError.set(err?.error?.detail || 'rb.recordings.uploadError');
        this.uploadBusy.set(false);
      },
    });
  }

  downloadRecording(recording: Recording): void {
    this.service.downloadRecording(recording.id).subscribe({
      next: (blob) => saveBlob(blob, recording.originalName),
      error: () => this.uploadError.set('rb.recordings.downloadError'),
    });
  }
}
