import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import type { RegistryPost, SeatHolder } from '../../../../../core/services/committee-registry.service';
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
}

export interface BoardRow {
  id: string;
  cards: BoardCard[];
}

/** কমিটি বোর্ড — the registry rendered as a tiered org-chart poster. */
@Component({
  selector: 'app-committee-board',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, NgTemplateOutlet],
  template: `
    <section class="cb-board" [attr.aria-label]="'committeeRegistry.board.title' | translate">
      <header class="cb-head">
        <p class="cb-org">{{ 'brand.org' | translate }}</p>
        <h2 class="cb-ribbon">{{ 'committeeRegistry.board.title' | translate }}</h2>
        @if (termYears(); as years) {
          <p class="cb-years">({{ years }})</p>
        }
      </header>

      @for (row of executiveRows(); track row.id) {
        <div class="cb-row" [attr.data-tier]="row.id">
          @for (card of row.cards; track card.trackId) {
            <ng-container [ngTemplateOutlet]="cardTpl" [ngTemplateOutletContext]="{ $implicit: card }" />
          }
        </div>
      }

      @if (standingRow().cards.length) {
        <h3 class="cb-subhead">{{ 'committeeRegistry.board.standingCouncil' | translate }}</h3>
        <div class="cb-row" data-tier="standing">
          @for (card of standingRow().cards; track card.trackId) {
            <ng-container [ngTemplateOutlet]="cardTpl" [ngTemplateOutletContext]="{ $implicit: card }" />
          }
        </div>
      }

      <footer class="cb-foot">{{ 'committeeRegistry.board.tagline' | translate }}</footer>
    </section>

    <ng-template #cardTpl let-card>
      <article class="cb-card" [class.cb-vacant]="!card.holder">
        <div class="cb-photo">
          @if (card.holder && card.holder.photoUrl && !brokenPhotos().has(card.holder.id)) {
            <img [src]="card.holder.photoUrl" [alt]="card.holder.fullName" loading="lazy" (error)="markBroken(card.holder.id)" />
          } @else if (card.holder) {
            <span class="cb-initials" aria-hidden="true">{{ initials(card.holder.fullName) }}</span>
          } @else {
            <span class="cb-initials cb-initials-empty" aria-hidden="true">?</span>
          }
        </div>
        <span class="cb-pill" [attr.data-tone]="card.tone">{{ card.postLabel }}</span>
        @if (card.holder) {
          <p class="cb-name">{{ card.holder.fullName }}</p>
          <p class="cb-meta">
            @if (card.holder.memberId) {
              {{ 'committeeRegistry.board.memberId' | translate }}: {{ digits(card.holder.memberId) }}
            }
            @if (card.holder.status === 'caretaker' || card.holder.status === 'expired') {
              <span class="cb-flag">{{ 'committeeRegistry.statuses.' + card.holder.status | translate }}</span>
            }
          </p>
        } @else {
          <p class="cb-name cb-name-vacant">{{ 'committeeRegistry.statuses.vacant' | translate }}</p>
        }
      </article>
    </ng-template>
  `,
  styles: `
    :host { display: block; margin-bottom: 1rem; }
    .cb-board {
      --cb-navy: #0b2f6b;
      --cb-blue: #1d5fbf;
      --cb-gold: #f2c230;
      --cb-card-bg: var(--surface, #fff);
      --cb-text: var(--gray-800, #1f2937);
      --cb-muted: var(--gray-500, #6b7280);
      position: relative;
      overflow: hidden;
      border-radius: var(--radius-lg, 16px);
      background: linear-gradient(180deg, #eef4fc 0%, #f8fbff 55%, #e8f0fb 100%);
      box-shadow: var(--shadow-md);
    }
    :host-context([data-theme='dark']) .cb-board {
      background: linear-gradient(180deg, #0f1c33 0%, #13233f 60%, #0f1c33 100%);
      --cb-card-bg: #182a4a;
      --cb-text: #e6edf8;
      --cb-muted: #a9b8d0;
    }
    @media (prefers-color-scheme: dark) {
      :host-context(:root:not([data-theme='light'])) .cb-board {
        background: linear-gradient(180deg, #0f1c33 0%, #13233f 60%, #0f1c33 100%);
        --cb-card-bg: #182a4a;
        --cb-text: #e6edf8;
        --cb-muted: #a9b8d0;
      }
    }
    .cb-head {
      text-align: center;
      padding: 22px 16px 26px;
      background: linear-gradient(135deg, var(--cb-navy) 0%, var(--cb-blue) 100%);
      border-bottom: 4px solid var(--cb-gold);
      color: #fff;
    }
    .cb-org { margin: 0; font-family: var(--font-heading); font-weight: 700; font-size: clamp(1.05rem, 2.6vw, 1.6rem); color: var(--cb-gold); }
    .cb-ribbon {
      display: inline-block;
      margin: 10px 0 8px;
      padding: 6px 30px;
      font-size: clamp(1rem, 2.4vw, 1.4rem);
      color: #fff;
      background: linear-gradient(90deg, #0f7a4a, #16a06a);
      clip-path: polygon(14px 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 14px 100%, 0 50%);
    }
    .cb-years {
      display: block; width: fit-content; margin: 0 auto; padding: 3px 18px; border-radius: 999px;
      background: var(--cb-navy); border: 2px solid var(--cb-gold); font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .cb-row {
      display: flex; flex-wrap: wrap; justify-content: center;
      gap: 18px 22px; padding: 18px 16px 4px;
    }
    .cb-subhead { margin: 22px 16px 0; text-align: center; font-size: 1rem; color: var(--cb-text); }
    .cb-card { width: 168px; display: flex; flex-direction: column; align-items: center; text-align: center; }
    .cb-photo {
      width: 118px; height: 118px; border-radius: 10px; overflow: hidden;
      background: var(--cb-card-bg);
      border: 3px solid var(--cb-card-bg);
      box-shadow: 0 0 0 2px #2b8fd6, var(--shadow-sm);
      display: grid; place-items: center;
    }
    .cb-photo img { width: 100%; height: 100%; object-fit: cover; }
    .cb-initials { font-size: 2rem; font-weight: 700; color: var(--cb-blue); }
    .cb-initials-empty { color: var(--cb-muted); }
    .cb-vacant .cb-photo { box-shadow: none; border: 2px dashed var(--cb-muted); }
    .cb-pill {
      position: relative; margin-top: -12px; max-width: 100%;
      padding: 4px 12px; border-radius: 999px;
      font-size: 0.72rem; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase;
      color: #fff; background: var(--pill, #1d5fbf);
      box-shadow: 0 2px 6px rgb(0 0 0 / 0.18);
    }
    .cb-pill[data-tone='navy'] { --pill: #123f8c; }
    .cb-pill[data-tone='teal'] { --pill: #0e7f78; }
    .cb-pill[data-tone='purple'] { --pill: #7b2fa6; }
    .cb-pill[data-tone='blue'] { --pill: #1d5fbf; }
    .cb-pill[data-tone='green'] { --pill: #1f8a4c; }
    .cb-pill[data-tone='orange'] { --pill: #c4561a; }
    .cb-pill[data-tone='pink'] { --pill: #c2257a; }
    .cb-pill[data-tone='gold'] { --pill: #98700f; }
    .cb-name { margin: 6px 0 0; font-weight: 700; font-size: 0.92rem; color: var(--cb-text); overflow-wrap: anywhere; }
    .cb-name-vacant { color: var(--cb-muted); font-weight: 600; }
    .cb-meta { margin: 2px 0 0; font-size: 0.8rem; color: var(--cb-muted); }
    .cb-flag {
      display: inline-block; margin-left: 4px; padding: 0 6px; border-radius: 6px;
      background: #fef3c7; color: #92400e; font-size: 0.7rem; font-weight: 600;
    }
    .cb-foot {
      margin-top: 22px; padding: 14px 16px; text-align: center;
      font-style: italic; font-weight: 600; color: #fff;
      background: linear-gradient(135deg, var(--cb-navy) 0%, var(--cb-blue) 100%);
      border-top: 4px solid var(--cb-gold);
    }
    @media (max-width: 560px) {
      .cb-row { gap: 16px 10px; }
      .cb-card { width: calc(50% - 10px); }
      .cb-photo { width: 96px; height: 96px; }
    }
  `,
})
export class CommitteeBoardComponent {
  readonly posts = input.required<RegistryPost[]>();
  readonly lang = input<string>('bn');

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

  digits(value: string): string {
    return localizeDigits(value, this.lang());
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
    }));
  }
}
