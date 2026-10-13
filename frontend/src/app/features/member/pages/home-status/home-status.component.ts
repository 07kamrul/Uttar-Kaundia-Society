import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal, type WritableSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import type { Observable } from 'rxjs';
import type { EventItem, Notice } from '../../../../core/models/content.model';
import { ContentService } from '../../../../core/services/content.service';
import { FeatureFlagService } from '../../../../core/services/feature-flag.service';
import { InstallmentPaymentService } from '../../../../core/services/installment-payment.service';
import { MemberPaymentsService } from '../../../../core/services/member-payments.service';
import { MemberService } from '../../../../core/services/member.service';
import { IconComponent, type IconName } from '../../../../shared/icon/icon.component';
import { BnDatePipe, TakaPipe } from '../../../../shared/pipes/bn-pipes';
import { SectionLoaderComponent } from '../../../../shared/section-loader/section-loader.component';

export type NextStep =
  | { kind: 'pending' }
  | { kind: 'needs_dag' }
  | { kind: 'dues'; amount: number }
  | { kind: 'ok' };

export interface NextStepInput {
  status: string;
  needsDag: boolean;
  /** Null while the dues are unknown; the card then never claims there are any. */
  totalDue: number | null;
}

/** The single most useful thing for the member to do next, most urgent first. */
export function nextStepOf(input: NextStepInput): NextStep {
  if (input.status === 'pending') return { kind: 'pending' };
  if (input.needsDag) return { kind: 'needs_dag' };
  if (input.totalDue !== null && input.totalDue > 0) return { kind: 'dues', amount: input.totalDue };
  return { kind: 'ok' };
}

type LoadState = 'loading' | 'error' | 'ready';

interface Card<T> {
  state: WritableSignal<LoadState>;
  data: WritableSignal<T>;
}

function makeCard<T>(initial: T): Card<T> {
  return { state: signal<LoadState>('loading'), data: signal<T>(initial) };
}

function loadCard<T, R>(card: Card<T>, source: Observable<R>, pick: (value: R) => T): void {
  card.state.set('loading');
  source.subscribe({
    next: (value) => {
      card.data.set(pick(value));
      card.state.set('ready');
    },
    error: () => card.state.set('error'),
  });
}

interface Shortcut {
  labelKey: string;
  icon: IconName;
  route: string;
  query?: Record<string, string>;
}

const stamp = (n: Notice): number => Date.parse(n.publishAt ?? n.createdAt) || 0;

/**
 * "আমার অবস্থা": the member's home when nav_five_areas is on. A status card
 * with the next step, dues, latest notice, next event, big shortcut buttons.
 * Every card loads on its own, with a skeleton and its own retry.
 */
@Component({
  selector: 'app-home-status',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, TakaPipe, BnDatePipe, IconComponent, SectionLoaderComponent],
  templateUrl: './home-status.component.html',
  styleUrl: './home-status.component.scss',
})
export class HomeStatusComponent implements OnInit {
  private readonly members = inject(MemberService);
  private readonly merged = inject(MemberPaymentsService);
  private readonly installments = inject(InstallmentPaymentService);
  private readonly content = inject(ContentService);
  private readonly flags = inject(FeatureFlagService);

  readonly profileCard = makeCard<{ status: string; needsDag: boolean; name: string } | null>(null);
  readonly duesCard = makeCard<number>(0);
  readonly noticeCard = makeCard<Notice | null>(null);
  readonly eventCard = makeCard<EventItem | null>(null);

  readonly payRoute = this.flags.isEnabled('pay_merged_page') ? '/payments' : '/installments';
  readonly payQuery = { pay: '1' };

  readonly shortcuts: readonly Shortcut[] = [
    { labelKey: 'member.payments.payNow', icon: 'wallet', route: this.payRoute, query: this.payQuery },
    { labelKey: 'nav.myLand', icon: 'map', route: '/my-land' },
    { labelKey: 'nav.notices', icon: 'doc', route: '/notices' },
    { labelKey: 'nav.events', icon: 'pin', route: '/events' },
    { labelKey: 'nav.myProfile', icon: 'user', route: '/profile' },
    { labelKey: 'help.desk', icon: 'alert', route: '/emergency-help' },
  ];

  /** The status card needs both the profile and the dues; it stays in its own loading/error state until then. */
  readonly nextStep = computed<NextStep | null>(() => {
    const profile = this.profileCard.data();
    if (this.profileCard.state() !== 'ready' || !profile) return null;
    return nextStepOf({
      status: profile.status,
      needsDag: profile.needsDag,
      totalDue: this.duesCard.state() === 'ready' ? this.duesCard.data() : null,
    });
  });

  ngOnInit(): void {
    this.loadProfile();
    this.loadDues();
    this.loadNotice();
    this.loadEvent();
  }

  loadProfile(): void {
    loadCard(this.profileCard, this.members.getProfile(), (p) => ({
      status: p.status,
      needsDag: p.properties.some((prop) => !prop.dagNoCs && !prop.dagNoRs),
      name: p.fullName,
    }));
  }

  loadDues(): void {
    if (this.flags.isEnabled('pay_merged_page')) {
      loadCard(this.duesCard, this.merged.summary(), (s) => s.totalDue);
    } else {
      loadCard(this.duesCard, this.installments.getPayable(), (s) => s.totalDue);
    }
  }

  loadNotice(): void {
    loadCard(this.noticeCard, this.content.listNotices(), (list) =>
      list.length === 0 ? null : [...list].sort((a, b) => stamp(b) - stamp(a))[0],
    );
  }

  loadEvent(): void {
    const now = Date.now();
    loadCard(this.eventCard, this.content.listEvents(), (list) => {
      const upcoming = list
        .filter((e) => Date.parse(e.startAt) >= now)
        .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
      return upcoming[0] ?? null;
    });
  }
}
