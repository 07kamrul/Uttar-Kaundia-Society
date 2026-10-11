import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type AssetCondition = 'good' | 'fair' | 'poor' | 'lost';
export type WelfareActivityType = 'training' | 'welfare' | 'other';

export interface SocietyAsset {
  id: number;
  assetCode: string;
  name: string;
  description: string | null;
  category: string;
  acquisitionDate: string;
  value: number;
  condition: AssetCondition;
  location: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface AssetInput {
  name: string;
  description?: string | null;
  category: string;
  acquisitionDate: string;
  value: number;
  condition: AssetCondition;
  location?: string | null;
  notes?: string | null;
}

export interface WelfareActivity {
  id: number;
  activityDate: string;
  title: string;
  activityType: WelfareActivityType;
  participantsCount: number;
  participantNotes: string | null;
  outcome: string | null;
  organizer: string | null;
  notes: string | null;
  createdAt: string;
}

export interface WelfareActivityInput {
  activityDate: string;
  title: string;
  activityType: WelfareActivityType;
  participantsCount: number;
  participantNotes?: string | null;
  outcome?: string | null;
  organizer?: string | null;
  notes?: string | null;
}

interface AssetApiModel {
  id: number;
  asset_code: string;
  name: string;
  description: string | null;
  category: string;
  acquisition_date: string;
  value: string;
  condition: AssetCondition;
  location: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

interface ActivityApiModel {
  id: number;
  activity_date: string;
  title: string;
  activity_type: WelfareActivityType;
  participants_count: number;
  participant_notes: string | null;
  outcome: string | null;
  organizer: string | null;
  notes: string | null;
  created_at: string;
}

function toAsset(api: AssetApiModel): SocietyAsset {
  return {
    id: api.id,
    assetCode: api.asset_code,
    name: api.name,
    description: api.description,
    category: api.category,
    acquisitionDate: api.acquisition_date,
    value: Number(api.value),
    condition: api.condition,
    location: api.location,
    notes: api.notes,
    isActive: api.is_active,
    createdAt: api.created_at,
  };
}

function toActivity(api: ActivityApiModel): WelfareActivity {
  return {
    id: api.id,
    activityDate: api.activity_date,
    title: api.title,
    activityType: api.activity_type,
    participantsCount: api.participants_count,
    participantNotes: api.participant_notes,
    outcome: api.outcome,
    organizer: api.organizer,
    notes: api.notes,
    createdAt: api.created_at,
  };
}

function assetBody(input: Partial<AssetInput>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body['name'] = input.name;
  if (input.description !== undefined) body['description'] = input.description ?? null;
  if (input.category !== undefined) body['category'] = input.category;
  if (input.acquisitionDate !== undefined) body['acquisition_date'] = input.acquisitionDate;
  if (input.value !== undefined) body['value'] = input.value;
  if (input.condition !== undefined) body['condition'] = input.condition;
  if (input.location !== undefined) body['location'] = input.location ?? null;
  if (input.notes !== undefined) body['notes'] = input.notes ?? null;
  return body;
}

function activityBody(input: Partial<WelfareActivityInput>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.activityDate !== undefined) body['activity_date'] = input.activityDate;
  if (input.title !== undefined) body['title'] = input.title;
  if (input.activityType !== undefined) body['activity_type'] = input.activityType;
  if (input.participantsCount !== undefined) body['participants_count'] = input.participantsCount;
  if (input.participantNotes !== undefined) body['participant_notes'] = input.participantNotes ?? null;
  if (input.outcome !== undefined) body['outcome'] = input.outcome ?? null;
  if (input.organizer !== undefined) body['organizer'] = input.organizer ?? null;
  if (input.notes !== undefined) body['notes'] = input.notes ?? null;
  return body;
}

@Injectable({ providedIn: 'root' })
export class RegistersService {
  private readonly adminBase = `${environment.apiBaseUrl}/admin`;
  private readonly memberBase = `${environment.apiBaseUrl}/member`;

  constructor(private http: HttpClient) {}

  // ----- Society assets (asset_register.manage) -----

  assets(options: { includeInactive?: boolean; search?: string } = {}): Observable<SocietyAsset[]> {
    const params: Record<string, string> = {};
    if (options.includeInactive) params['include_inactive'] = 'true';
    if (options.search) params['search'] = options.search;
    return this.http
      .get<AssetApiModel[]>(`${this.adminBase}/assets`, { params })
      .pipe(map((rows) => rows.map(toAsset)));
  }

  createAsset(input: AssetInput): Observable<SocietyAsset> {
    return this.http
      .post<AssetApiModel>(`${this.adminBase}/assets`, assetBody(input))
      .pipe(map(toAsset));
  }

  updateAsset(id: number, changes: Partial<AssetInput> & { isActive?: boolean }): Observable<SocietyAsset> {
    const body = assetBody(changes);
    if (changes.isActive !== undefined) body['is_active'] = changes.isActive;
    return this.http
      .patch<AssetApiModel>(`${this.adminBase}/assets/${id}`, body)
      .pipe(map(toAsset));
  }

  deactivateAsset(id: number, reason: string): Observable<void> {
    return this.http.request<void>('DELETE', `${this.adminBase}/assets/${id}`, {
      body: { reason },
    });
  }

  downloadRegisterPdf(): Observable<Blob> {
    return this.http.get(`${this.adminBase}/assets/register.pdf`, { responseType: 'blob' });
  }

  // ----- Welfare activities (welfare_activity.manage; member read-only) -----

  activities(filters: { activityType?: WelfareActivityType; dateFrom?: string; dateTo?: string } = {}): Observable<WelfareActivity[]> {
    const params: Record<string, string> = {};
    if (filters.activityType) params['activity_type'] = filters.activityType;
    if (filters.dateFrom) params['date_from'] = filters.dateFrom;
    if (filters.dateTo) params['date_to'] = filters.dateTo;
    return this.http
      .get<ActivityApiModel[]>(`${this.adminBase}/welfare-activities`, { params })
      .pipe(map((rows) => rows.map(toActivity)));
  }

  createActivity(input: WelfareActivityInput): Observable<WelfareActivity> {
    return this.http
      .post<ActivityApiModel>(`${this.adminBase}/welfare-activities`, activityBody(input))
      .pipe(map(toActivity));
  }

  updateActivity(id: number, changes: Partial<WelfareActivityInput>): Observable<WelfareActivity> {
    return this.http
      .patch<ActivityApiModel>(`${this.adminBase}/welfare-activities/${id}`, activityBody(changes))
      .pipe(map(toActivity));
  }

  deleteActivity(id: number): Observable<void> {
    return this.http.delete<void>(`${this.adminBase}/welfare-activities/${id}`);
  }

  downloadActivitiesPdf(): Observable<Blob> {
    return this.http.get(`${this.adminBase}/welfare-activities/list.pdf`, { responseType: 'blob' });
  }

  memberActivities(limit = 20): Observable<WelfareActivity[]> {
    return this.http
      .get<ActivityApiModel[]>(`${this.memberBase}/welfare-activities`, {
        params: { limit: String(limit) },
      })
      .pipe(map((rows) => rows.map(toActivity)));
  }
}
