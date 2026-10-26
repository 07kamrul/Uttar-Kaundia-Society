import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { CommitteeBoardComponent } from './committee-board.component';
import type { RegistryPost, SeatHolder } from '../../../../../core/services/committee-registry.service';

function seat(id: number, fullName: string, extra: Partial<SeatHolder> = {}): SeatHolder {
  return { id, fullName, memberId: `M-${id}`, status: 'active', ...extra };
}

function post(key: string, holders: SeatHolder[], council = 'executive'): RegistryPost {
  return {
    key,
    bn: `${key}-bn`,
    en: `${key}-en`,
    council,
    holder: holders[0] ?? null,
    holders,
    term: holders.length
      ? {
          id: 1, postKey: key, memberId: holders[0].id, termStart: '2026-01-01', termEnd: '2028-12-31',
          isCaretaker: false, status: 'active', replacedByTermId: null, notes: null, createdAt: null,
        }
      : null,
    status: holders.length ? 'active' : 'vacant',
    routineWorkOnly: false,
    warning: null,
    openVacancy: false,
  };
}

describe('CommitteeBoardComponent', () => {
  function create(posts: RegistryPost[], lang = 'en'): ComponentFixture<CommitteeBoardComponent> {
    TestBed.configureTestingModule({
      imports: [CommitteeBoardComponent],
      providers: [provideTranslateService()],
    });
    const fixture = TestBed.createComponent(CommitteeBoardComponent);
    fixture.componentRef.setInput('posts', posts);
    fixture.componentRef.setInput('lang', lang);
    fixture.detectChanges();
    return fixture;
  }

  it('orders posts into tiers from president down to executive members', () => {
    const fixture = create([
      post('executive_member', [seat(5, 'Eve One'), seat(6, 'Eve Two')]),
      post('treasurer', [seat(4, 'Tara')]),
      post('general_secretary', [seat(3, 'Gina')]),
      post('president', [seat(1, 'Paul')]),
    ]);

    const tiers = fixture.componentInstance.executiveRows().map((row) => row.id);

    expect(tiers).toEqual(['president', 'general', 'secretaries', 'members']);
  });

  it('renders one card per sitting seat on multi-seat posts', () => {
    const fixture = create([post('executive_member', [seat(5, 'Eve One'), seat(6, 'Eve Two')])]);

    const names = [...fixture.nativeElement.querySelectorAll('[data-tier="members"] .cb-name')].map(
      (el: Element) => el.textContent?.trim(),
    );

    expect(names).toEqual(['Eve One', 'Eve Two']);
  });

  it('shows a vacant placeholder card when a post has no holder', () => {
    const fixture = create([post('president', [])]);

    const card = fixture.nativeElement.querySelector('.cb-card');

    expect(card.classList).toContain('cb-vacant');
  });

  it('shows the photo when present and initials otherwise', () => {
    const fixture = create([
      post('president', [seat(1, 'Paul Smith', { photoUrl: '/uploads/p.jpg' })]),
      post('treasurer', [seat(2, 'Tara Khan')]),
    ]);

    const img = fixture.nativeElement.querySelector('[data-tier="president"] img');
    const initials = fixture.nativeElement.querySelector('[data-tier="secretaries"] .cb-initials');

    expect(img.getAttribute('src')).toBe('/uploads/p.jpg');
    expect(initials.textContent.trim()).toBe('TK');
  });

  it('falls back to initials when the photo fails to load', () => {
    const fixture = create([post('president', [seat(1, 'Paul Smith', { photoUrl: '/uploads/p.jpg' })])]);

    fixture.nativeElement.querySelector('img').dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('.cb-initials').textContent.trim()).toBe('PS');
  });

  it('puts the standing council in its own section and uses localized labels and years', () => {
    const fixture = create(
      [post('president', [seat(1, 'Paul')]), post('standing_council_member', [seat(9, 'Sam')], 'standing')],
      'bn',
    );

    const standing = fixture.nativeElement.querySelector('[data-tier="standing"] .cb-pill');

    expect(standing.textContent.trim()).toBe('standing_council_member-bn');
    expect(fixture.componentInstance.executiveRows().map((row) => row.id)).toEqual(['president']);
    expect(fixture.componentInstance.termYears()).toBe('২০২৬ - ২০২৮');
  });

  it('keeps unknown executive posts visible in a trailing tier', () => {
    const fixture = create([post('new_secretary', [seat(7, 'Nina')])]);

    expect(fixture.componentInstance.executiveRows().map((row) => row.id)).toEqual(['other']);
  });
});
