import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../../core/services/auth.service';
import { ElectionsService } from '../../../../core/services/elections.service';
import { FeatureFlagService } from '../../../../core/services/feature-flag.service';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { MY_LAND_TILES, ORGANISATION_TILES, isNavItemVisible } from '../../../shell/nav-areas';
import type { NavItem } from '../../../shell/nav-config';

type HubKind = 'my-land' | 'organisation';

const ELECTION_ROUTE = '/elections';
const ACTIVE_ELECTION_STATUSES = ['nominations_open', 'voting'];

/**
 * "আমার জমি" and "সংগঠন": lightweight tile pages. Tiles follow the same
 * permission rules as the old menu items; nothing here is a new capability.
 */
@Component({
  selector: 'app-hub',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent],
  templateUrl: './hub.component.html',
  styleUrl: './hub.component.scss',
})
export class HubComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly flags = inject(FeatureFlagService);
  private readonly elections = inject(ElectionsService);
  private readonly kind: HubKind = inject(ActivatedRoute).snapshot.data['hub'] === 'my-land' ? 'my-land' : 'organisation';

  readonly titleKey = this.kind === 'my-land' ? 'hub.myLand.title' : 'hub.organisation.title';
  readonly electionActive = signal(false);

  private readonly visible = computed(() => {
    const source = this.kind === 'my-land' ? MY_LAND_TILES : ORGANISATION_TILES;
    return source.filter((t) => isNavItemVisible(t, this.auth.role, (keys) => this.auth.hasAnyPermission(keys)));
  });

  /** Tiles without a heading; elections first while an election is running. */
  readonly mainTiles = computed<NavItem[]>(() => {
    const mergedEntries = this.flags.isEnabled('nav_merged_entries');
    const plain = this.visible().filter((t) => !t.group || (t.group === 'help' && !mergedEntries));
    if (!this.electionActive()) return plain;
    return [...plain.filter((t) => t.route === ELECTION_ROUTE), ...plain.filter((t) => t.route !== ELECTION_ROUTE)];
  });
  readonly helpTiles = computed(() =>
    this.flags.isEnabled('nav_merged_entries') ? this.visible().filter((t) => t.group === 'help') : [],
  );
  readonly moreTiles = computed(() => this.visible().filter((t) => t.group === 'more'));

  ngOnInit(): void {
    if (this.kind !== 'organisation' || !this.visible().some((t) => t.route === ELECTION_ROUTE)) return;
    this.elections.listElections().subscribe({
      next: (page) => this.electionActive.set(page.items.some((e) => ACTIVE_ELECTION_STATUSES.includes(e.status))),
      error: () => this.electionActive.set(false),
    });
  }

  isElection(tile: NavItem): boolean {
    return tile.route === ELECTION_ROUTE && this.electionActive();
  }
}
