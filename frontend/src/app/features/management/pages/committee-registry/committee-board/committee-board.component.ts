import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { IconComponent } from '../../../../../shared/icon/icon.component';
import type { RegistryPost, SeatHolder, TermStatus } from '../../../../../core/services/committee-registry.service';
import { localizeDigits } from '../../../../../core/services/resolution-book.service';
import {
  DEFAULT_TONE,
  EXECUTIVE_TIERS,
  POST_TONES,
  STANDING_COUNCIL,
  type PillTone,
} from './committee-board.config';

/** One card on the board: a sitting holder, or a vacant seat (holder null). */
export interface BoardCard {
  trackId: string;
  postKey: string;
  postLabel: string;
  tone: PillTone;
  holder: SeatHolder | null;
  status: TermStatus;
  routineWorkOnly: boolean;
  warning: string | null;
}

export interface BoardRow {
  id: string;
  cards: BoardCard[];
}

export type BoardFilter = 'all' | 'filled' | 'vacant';

/** কমিটি বোর্ড — the registry rendered as a tiered org-chart poster. */
@Component({
  selector: 'app-committee-board',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, NgTemplateOutlet, FormsModule, IconComponent],
  template: `
    <section class="cb-board" [attr.aria-label]="'committeeRegistry.board.title' | translate">
      <header class="cb-head">
        <p class="cb-org">{{ 'brand.org' | translate }}</p>
        <h2 class="cb-ribbon">{{ 'committeeRegistry.board.title' | translate }}</h2>
        @if (termYears(); as years) {
          <p class="cb-years">({{ years }})</p>
        }
        <div class="cb-stats" role="list">
          <span class="cb-stat" role="listitem">
            {{ digits(stats().total) }} · {{ 'committeeRegistry.board.statPosts' | translate }}
          </span>
          <span class="cb-stat cb-stat-good" role="listitem">
            {{ digits(stats().filled) }} · {{ 'committeeRegistry.board.statFilled' | translate }}
          </span>
          <span class="cb-stat cb-stat-warn" role="listitem">
            {{ digits(stats().vacant) }} · {{ 'committeeRegistry.board.statVacant' | translate }}
          </span>
          @if (stats().attention > 0) {
            <span class="cb-stat cb-stat-attention" role="listitem">
              {{ digits(stats().attention) }} · {{ 'committeeRegistry.board.statAttention' | translate }}
            </span>
          }
        </div>
      </header>

      <div class="cb-toolbar">
        <div class="cb-filters" role="group" [attr.aria-label]="'committeeRegistry.board.filter' | translate">
          <button
            type="button"
            class="cb-chip"
            [class.cb-chip-active]="filter() === 'all'"
            [attr.aria-pressed]="filter() === 'all'"
            (click)="filter.set('all')"
          >
            {{ 'committeeRegistry.filterAll' | translate }}
          </button>
          <button
            type="button"
            class="cb-chip"
            [class.cb-chip-active]="filter() === 'filled'"
            [attr.aria-pressed]="filter() === 'filled'"
            (click)="filter.set('filled')"
          >
            {{ 'committeeRegistry.board.filterFilled' | translate }}
          </button>
          <button
            type="button"
            class="cb-chip"
            [class.cb-chip-active]="filter() === 'vacant'"
            [attr.aria-pressed]="filter() === 'vacant'"
            (click)="filter.set('vacant')"
          >
            {{ 'committeeRegistry.board.filterVacant' | translate }}
          </button>
        </div>
        <label class="cb-search">
          <app-icon name="search" [size]="16" />
          <input
            type="search"
            [placeholder]="'committeeRegistry.board.searchPlaceholder' | translate"
            [ngModel]="search()"
            (ngModelChange)="search.set($event)"
            [attr.aria-label]="'committeeRegistry.board.searchPlaceholder' | translate"
          />
        </label>
      </div>

      @if (matches().length === 0) {
        <div class="cb-empty">
          <app-icon name="search" [size]="22" />
          <p>{{ 'committeeRegistry.board.noMatch' | translate }}</p>
        </div>
      } @else {
        @for (row of visibleExecutiveRows(); track row.id) {
          <div class="cb-row" [attr.data-tier]="row.id">
            @for (card of row.cards; track card.trackId) {
              <ng-container [ngTemplateOutlet]="cardTpl" [ngTemplateOutletContext]="{ $implicit: card }" />
            }
          </div>
        }

        @if (visibleStanding().cards.length) {
          <h3 class="cb-subhead">{{ 'committeeRegistry.board.standingCouncil' | translate }}</h3>
          <div class="cb-row" data-tier="standing">
            @for (card of visibleStanding().cards; track card.trackId) {
              <ng-container [ngTemplateOutlet]="cardTpl" [ngTemplateOutletContext]="{ $implicit: card }" />
            }
          </div>
        }
      }

      <footer class="cb-foot">{{ 'committeeRegistry.board.tagline' | translate }}</footer>
    </section>

    <ng-template #cardTpl let-card>
      <article
        class="cb-card"
        [class.cb-vacant]="!card.holder"
        [attr.aria-label]="card.holder ? card.holder.fullName : card.postLabel"
      >
        <div class="cb-photo">
          @if (card.holder && card.holder.photoUrl && !brokenPhotos().has(card.holder.id)) {
            <img [src]="card.holder.photoUrl" [alt]="card.holder.fullName" loading="lazy" (error)="markBroken(card.holder.id)" />
          } @else if (card.holder) {
            <span class="cb-initials" aria-hidden="true">{{ initials(card.holder.fullName) }}</span>
          } @else {
            <span class="cb-seat-icon" aria-hidden="true">
              <app-icon name="user" [size]="26" />
            </span>
          }
        </div>
        <span class="cb-pill" [attr.data-tone]="card.tone">{{ card.postLabel }}</span>
        @if (card.holder) {
          <p class="cb-name">{{ card.holder.fullName }}</p>
          <p class="cb-meta">
            @if (card.holder.memberId) {
              {{ 'committeeRegistry.board.memberId' | translate }}: {{ digits(card.holder.memberId) }}
            }
            @if (card.status === 'caretaker' || card.status === 'expired') {
              <span class="cb-flag">{{ 'committeeRegistry.statuses.' + card.status | translate }}</span>
            }
          </p>
          @if (card.warning) {
            <p class="cb-warning">{{ 'committeeRegistry.expiredWarning' | translate }}</p>
          }
        } @else {
          <p class="cb-name cb-name-vacant">{{ 'committeeRegistry.statuses.vacant' | translate }}</p>
          @if (canManage()) {
            <button type="button" class="cb-assign" (click)="assign.emit(card.postKey)">
              <app-icon name="plus" [size]="14" />
              {{ 'committeeRegistry.board.assignMember' | translate }}
            </button>
          }
        }
      </article>
    </ng-template>
  `,
  styles: `
    :host { display: block; margin-bottom: 1rem; }
    /* Palette mirrors styles/_tokens.scss (dark-green + gold + cream). Deep
       greens and on-dark gold are fixed literals because the header keeps a
       dark surface in both themes; surface/text tokens use the shared vars so
       the board body flips with the theme automatically. */
    .cb-board {
      --cb-deep: #1f3d2a;        /* --emerald-700 (light value, kept fixed) */
      --cb-deeper: #122718;      /* --emerald-900 (light value, kept fixed) */
      --cb-main: #2e5138;        /* --emerald-600 (light value, kept fixed) */
      --cb-gold: #a9791e;        /* --gold on light surfaces */
      --cb-gold-on-dark: #ddbb68;/* --gold in dark theme; used on the dark header */
      --cb-card-bg: var(--surface, #fff);
      --cb-text: var(--gray-800, #1a2a20);
      --cb-muted: var(--gray-500, #78826f);
      position: relative;
      overflow: hidden;
      border-radius: var(--radius-lg, 16px);
      background: linear-gradient(180deg, var(--gray-50, #faf8f1) 0%, var(--surface, #fff) 55%, var(--surface-2, #f3efe3) 100%);
      box-shadow: var(--shadow-md);
    }
    .cb-head {
      text-align: center;
      padding: 20px 16px 22px;
      background: linear-gradient(135deg, var(--cb-deeper) 0%, var(--cb-deep) 100%);
      border-bottom: 4px solid var(--cb-gold-on-dark);
      color: #fff;
    }
    .cb-org { margin: 0; font-family: var(--font-heading); font-weight: 700; font-size: clamp(1.05rem, 2.6vw, 1.6rem); color: var(--cb-gold-on-dark); }
    .cb-ribbon {
      display: inline-block;
      margin: 10px 0 8px;
      padding: 6px 30px;
      font-size: clamp(1rem, 2.4vw, 1.4rem);
      color: var(--cb-deeper);
      background: linear-gradient(90deg, var(--cb-gold) 0%, #c9a34c 100%);
      clip-path: polygon(14px 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 14px 100%, 0 50%);
    }
    .cb-years {
      display: block; width: fit-content; margin: 0 auto 10px; padding: 3px 18px; border-radius: 999px;
      background: var(--cb-deep); border: 2px solid var(--cb-gold-on-dark); font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    /* Stat strip: total / filled / vacant / needs-attention. */
    .cb-stats { display: flex; justify-content: center; gap: 0.45rem; flex-wrap: wrap; }
    .cb-stat {
      display: inline-flex; align-items: center; gap: 0.3rem;
      padding: 0.28rem 0.7rem; border-radius: 999px;
      background: rgb(255 255 255 / 0.14); border: 1px solid rgb(255 255 255 / 0.25);
      font-size: 0.76rem; font-weight: 700; white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .cb-stat-good { background: rgb(143 195 151 / 0.22); border-color: rgb(143 195 151 / 0.55); }
    .cb-stat-warn { background: rgb(221 187 104 / 0.22); border-color: rgb(221 187 104 / 0.55); }
    .cb-stat-attention { background: rgb(226 145 126 / 0.25); border-color: rgb(226 145 126 / 0.55); }

    /* Filter chips + search row. */
    .cb-toolbar {
      display: flex; align-items: center; justify-content: space-between;
      gap: 0.6rem; flex-wrap: wrap;
      padding: 0.7rem 1rem; border-bottom: 1px solid color-mix(in srgb, var(--cb-muted) 22%, transparent);
    }
    .cb-filters { display: flex; gap: 0.35rem; flex-wrap: wrap; }
    .cb-chip {
      display: inline-flex; align-items: center;
      padding: 0.42rem 0.9rem; border: 1px solid color-mix(in srgb, var(--cb-muted) 35%, transparent);
      border-radius: 999px; background: var(--cb-card-bg); color: var(--cb-text);
      font: inherit; font-size: 0.8rem; font-weight: 600; cursor: pointer;
      min-height: 36px;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    .cb-chip:hover { border-color: var(--cb-main); }
    .cb-chip-active { background: var(--cb-deep); border-color: var(--cb-deep); color: #fff; }
    .cb-search {
      display: inline-flex; align-items: center; gap: 0.4rem;
      padding: 0.35rem 0.7rem; border-radius: 999px; min-height: 36px;
      border: 1px solid color-mix(in srgb, var(--cb-muted) 35%, transparent);
      background: var(--cb-card-bg); color: var(--cb-muted);
    }
    .cb-search input {
      border: none; background: transparent; color: var(--cb-text);
      font: inherit; font-size: 0.82rem; min-width: 0; width: 160px; outline: none;
    }
    .cb-search:focus-within { border-color: var(--cb-main); }
    @media (max-width: 480px) {
      .cb-toolbar { flex-direction: column; align-items: stretch; }
      .cb-search input { width: 100%; }
    }

    .cb-empty {
      display: grid; place-items: center; gap: 0.4rem;
      padding: 2.5rem 1rem; color: var(--cb-muted); font-weight: 600;
    }
    .cb-empty p { margin: 0; }

    /* Tiers: leadership rows centred flex; later tiers a responsive grid. */
    .cb-row {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
      gap: 18px 16px; padding: 18px 16px 4px;
      justify-items: center;
    }
    .cb-row[data-tier='president'],
    .cb-row[data-tier='vice'],
    .cb-row[data-tier='general'],
    .cb-row[data-tier='joint'],
    .cb-row[data-tier='standing'] {
      grid-template-columns: none;
      display: flex; flex-wrap: wrap; justify-content: center;
    }
    .cb-row[data-tier='president'] .cb-card,
    .cb-row[data-tier='vice'] .cb-card,
    .cb-row[data-tier='general'] .cb-card,
    .cb-row[data-tier='joint'] .cb-card,
    .cb-row[data-tier='standing'] .cb-card { width: 190px; }
    .cb-subhead { margin: 22px 16px 0; text-align: center; font-size: 1rem; color: var(--cb-text); }
    .cb-card {
      width: 100%; max-width: 210px;
      display: flex; flex-direction: column; align-items: center; text-align: center;
      padding: 10px 8px 12px; border-radius: 12px;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .cb-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
    .cb-photo {
      width: 104px; height: 104px; border-radius: 10px; overflow: hidden;
      background: var(--cb-card-bg);
      border: 3px solid var(--cb-card-bg);
      box-shadow: 0 0 0 2px var(--cb-gold), var(--shadow-sm);
      display: grid; place-items: center;
    }
    .cb-photo img { width: 100%; height: 100%; object-fit: cover; }
    .cb-initials { font-size: 2rem; font-weight: 700; color: var(--emerald-700, var(--cb-deep)); }
    .cb-seat-icon { display: grid; place-items: center; color: var(--cb-muted); opacity: 0.6; }
    .cb-vacant .cb-photo { box-shadow: none; border: 2px dashed var(--cb-muted); }
    .cb-pill {
      position: relative; margin-top: -12px; max-width: 100%;
      padding: 4px 12px; border-radius: 999px;
      font-size: 0.72rem; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase;
      color: #fff; background: var(--pill, var(--cb-deep));
      box-shadow: 0 2px 6px rgb(0 0 0 / 0.18);
    }
    /* Muted, palette-aligned tones; all >= 4.5:1 against white text. */
    .cb-pill[data-tone='navy'] { --pill: #1f3d2a; }
    .cb-pill[data-tone='teal'] { --pill: #1f5f4e; }
    .cb-pill[data-tone='purple'] { --pill: #5b3a7a; }
    .cb-pill[data-tone='blue'] { --pill: #2c5282; }
    .cb-pill[data-tone='green'] { --pill: #3d6b35; }
    .cb-pill[data-tone='orange'] { --pill: #9c4a1a; }
    .cb-pill[data-tone='pink'] { --pill: #96255f; }
    .cb-pill[data-tone='gold'] { --pill: #8a611a; }
    .cb-name { margin: 6px 0 0; font-weight: 700; font-size: 0.92rem; color: var(--cb-text); overflow-wrap: anywhere; }
    .cb-name-vacant { color: var(--cb-muted); font-weight: 600; }
    .cb-meta { margin: 2px 0 0; font-size: 0.8rem; color: var(--cb-muted); }
    .cb-flag {
      display: inline-block; margin-left: 4px; padding: 0 6px; border-radius: 6px;
      background: var(--amber-50, #f1e4c3); color: var(--gold-strong, #8a611a); font-size: 0.7rem; font-weight: 600;
    }
    .cb-warning { margin: 4px 0 0; font-size: 0.72rem; color: var(--gold-strong, #8a611a); font-weight: 600; }
    /* Admin-only action on vacant seats. */
    .cb-assign {
      display: inline-flex; align-items: center; gap: 0.3rem;
      margin-top: 0.5rem; padding: 0.42rem 0.85rem;
      border: none; border-radius: 999px; min-height: 36px;
      background: var(--cb-deep); color: #fff;
      font: inherit; font-size: 0.78rem; font-weight: 700; cursor: pointer;
      transition: background 0.15s;
    }
    .cb-assign:hover { background: var(--cb-main); }
    .cb-assign:focus-visible { outline: 2px solid var(--cb-gold); outline-offset: 2px; }
    .cb-foot {
      margin-top: 22px; padding: 14px 16px; text-align: center;
      font-style: italic; font-weight: 600; color: #fff;
      background: linear-gradient(135deg, var(--cb-deeper) 0%, var(--cb-deep) 100%);
      border-top: 4px solid var(--cb-gold-on-dark);
    }
    @media (max-width: 560px) {
      .cb-row { grid-template-columns: repeat(2, 1fr); gap: 14px 10px; padding: 14px 10px 4px; }
      .cb-row[data-tier='president'],
      .cb-row[data-tier='vice'],
      .cb-row[data-tier='general'],
      .cb-row[data-tier='joint'],
      .cb-row[data-tier='standing'] { display: flex; }
      .cb-card { max-width: none; }
      .cb-photo { width: 96px; height: 96px; }
    }
  `,
})
export class CommitteeBoardComponent {
  readonly posts = input.required<RegistryPost[]>();
  readonly lang = input<string>('bn');
  /** Admin-only: vacant seats get an "add member" button that emits `assign`. */
  readonly canManage = input<boolean>(false);
  /** Emitted with the post key when an admin asks to fill a vacant seat. */
  readonly assign = output<string>();

  readonly filter = signal<BoardFilter>('all');
  readonly search = signal('');

  private readonly broken = signal<ReadonlySet<number>>(new Set());
  readonly brokenPhotos = this.broken.asReadonly();

  readonly executiveRows = computed<BoardRow[]>(() => {
    const byKey = new Map(this.posts().map((post) => [post.key, post]));
    const placed = new Set(EXECUTIVE_TIERS.flatMap((tier) => tier.postKeys));
    const rows = EXECUTIVE_TIERS.map((tier) => ({
      id: tier.id,
      cards: tier.postKeys.flatMap((key) => {
        const post = byKey.get(key);
        return post ? this.cardsFor(post) : [];
      }),
    }));
    const leftovers = this.posts().filter(
      (post) => !placed.has(post.key) && post.council !== STANDING_COUNCIL,
    );
    const all = leftovers.length
      ? [...rows, { id: 'other', cards: leftovers.flatMap((post) => this.cardsFor(post)) }]
      : rows;
    return all.filter((row) => row.cards.length > 0);
  });

  readonly standingRow = computed<BoardRow>(() => ({
    id: 'standing',
    cards: this.posts()
      .filter((post) => post.council === STANDING_COUNCIL)
      .flatMap((post) => this.cardsFor(post)),
  }));

  readonly stats = computed(() => {
    const cards = [...this.executiveRows(), this.standingRow()].flatMap((row) => row.cards);
    return {
      total: cards.length,
      filled: cards.filter((card) => card.holder !== null).length,
      vacant: cards.filter((card) => card.holder === null).length,
      attention: cards.filter(
        (card) => card.holder !== null && (card.status === 'expired' || card.status === 'caretaker'),
      ).length,
    };
  });

  readonly matches = computed<BoardCard[]>(() => {
    const filter = this.filter();
    const query = this.search().trim().toLowerCase();
    const all = [...this.executiveRows(), this.standingRow()].flatMap((row) => row.cards);
    return all.filter((card) => {
      if (filter === 'filled' && !card.holder) return false;
      if (filter === 'vacant' && card.holder) return false;
      if (!query) return true;
      const haystack = [
        card.postLabel,
        card.postKey,
        card.holder?.fullName ?? '',
        card.holder?.memberId ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  });

  readonly visibleExecutiveRows = computed<BoardRow[]>(() =>
    this.executiveRows()
      .map((row) => ({ ...row, cards: row.cards.filter((card) => this.matches().includes(card)) }))
      .filter((row) => row.cards.length > 0),
  );

  readonly visibleStanding = computed<BoardRow>(() => ({
    ...this.standingRow(),
    cards: this.standingRow().cards.filter((card) => this.matches().includes(card)),
  }));

  /** "2026 - 2028" from the president's term, else the first post with a term. */
  readonly termYears = computed<string | null>(() => {
    const posts = this.posts();
    const anchor = posts.find((post) => post.key === 'president' && post.term) ?? posts.find((post) => post.term);
    const term = anchor?.term;
    if (!term) return null;
    const start = term.termStart.slice(0, 4);
    const end = term.termEnd ? term.termEnd.slice(0, 4) : '';
    return this.digits(end ? `${start} - ${end}` : start);
  });

  initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join('');
  }

  digits(value: string | number): string {
    return localizeDigits(String(value), this.lang());
  }

  markBroken(memberId: number): void {
    this.broken.update((current) => new Set([...current, memberId]));
  }

  private cardsFor(post: RegistryPost): BoardCard[] {
    const postLabel = this.lang() === 'bn' ? post.bn : post.en;
    const tone = POST_TONES[post.key] ?? DEFAULT_TONE;
    const seats: Array<SeatHolder | null> = post.holders.length ? post.holders : [null];
    return seats.map((holder, index) => ({
      trackId: `${post.key}:${holder?.id ?? `vacant-${index}`}`,
      postKey: post.key,
      postLabel,
      tone,
      holder,
      status: holder?.status ?? post.status,
      routineWorkOnly: post.routineWorkOnly,
      warning: holder ? post.warning : null,
    }));
  }
}
