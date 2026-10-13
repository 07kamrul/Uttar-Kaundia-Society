import type { Routes } from '@angular/router';
import { permissionGuard } from './core/guards/permission.guard';

/**
 * Management-area pages (Executive Committee / Administrator / Super Admin).
 * Loaded as one lazy group so members never download this route table; the
 * group's own guard and preload permissions stay in app.routes.ts.
 */
export const MANAGEMENT_ROUTES: Routes = [
  {
    path: 'submissions',
    canActivate: [permissionGuard(['membership.review'])],
    loadComponent: () =>
      import('./features/management/pages/submissions-list/submissions-list.component').then(
        (m) => m.SubmissionsListComponent,
      ),
  },
  {
    path: 'submissions/:id',
    canActivate: [permissionGuard(['membership.review'])],
    loadComponent: () =>
      import('./features/management/pages/submission-detail/submission-detail.component').then(
        (m) => m.SubmissionDetailComponent,
      ),
  },
  {
    path: 'property-requests',
    canActivate: [permissionGuard(['property.review'])],
    loadComponent: () =>
      import('./features/management/pages/property-requests/property-requests.component').then(
        (m) => m.PropertyRequestsComponent,
      ),
  },
  {
    path: 'members',
    canActivate: [permissionGuard(['member.view_all'])],
    loadComponent: () =>
      import('./features/management/pages/members-list/members-list.component').then(
        (m) => m.MembersListComponent,
      ),
  },
  {
    path: 'installments-management',
    canActivate: [permissionGuard(['manage_finance'])],
    loadComponent: () =>
      import('./features/management/pages/installments-management/installments-management.component').then(
        (m) => m.InstallmentsManagementComponent,
      ),
  },
  {
    path: 'fees-management',
    canActivate: [permissionGuard(['manage_finance'])],
    loadComponent: () =>
      import('./features/management/pages/fees-management/fees-management.component').then(
        (m) => m.FeesManagementComponent,
      ),
  },
  {
    // The standalone Picnic Payments screen was folded into the
    // unified Fee Payments list; old links land there with the
    // picnic fee-type filter preselected so nothing 404s.
    // (redirectTo cannot carry canActivate — Angular rejects that
    // combination at bootstrap, NG04014. The target route carries
    // the same manage_finance guard.)
    path: 'picnic-payments',
    redirectTo: () => '/fees-management?feeType=picnic',
  },
  {
    path: 'fee-settings',
    canActivate: [permissionGuard(['manage_fee_settings'])],
    loadComponent: () =>
      import('./features/management/pages/fee-settings/fee-settings.component').then(
        (m) => m.FeeSettingsComponent,
      ),
  },
  {
    path: 'society-costs',
    canActivate: [permissionGuard(['manage_costs'])],
    loadComponent: () =>
      import('./features/management/pages/society-costs/society-costs.component').then(
        (m) => m.SocietyCostsComponent,
      ),
  },
  {
    path: 'finance-management',
    canActivate: [permissionGuard(['manage_finance'])],
    loadComponent: () =>
      import('./features/management/pages/finance-management/finance-management.component').then(
        (m) => m.FinanceManagementComponent,
      ),
  },
  {
    path: 'payment-verifications',
    canActivate: [permissionGuard(['manage_finance'])],
    loadComponent: () =>
      import('./features/management/pages/payment-verifications/payment-verifications.component').then(
        (m) => m.PaymentVerificationsComponent,
      ),
  },
  {
    path: 'roadmap-management',
    canActivate: [permissionGuard(['manage_roadmap'])],
    loadComponent: () =>
      import('./features/management/pages/roadmap-management/roadmap-management.component').then(
        (m) => m.RoadmapManagementComponent,
      ),
  },
  {
    path: 'plot-boundaries',
    data: { preload: false },
    canActivate: [permissionGuard(['boundary.review'])],
    loadComponent: () =>
      import(
        './features/management/pages/plot-boundaries/plot-boundaries.component'
      ).then((m) => m.PlotBoundariesComponent),
  },
  {
    path: 'config-lists',
    canActivate: [permissionGuard(['manage_system_config'])],
    loadComponent: () =>
      import('./features/management/pages/config-lists/config-lists.component').then(
        (m) => m.ConfigListsComponent,
      ),
  },
  // `-management` suffix mirrors installments-management: the public
  // /notices and /events routes already own the unsuffixed paths.
  {
    path: 'notices-management',
    canActivate: [permissionGuard(['manage_notices'])],
    loadComponent: () =>
      import('./features/management/pages/notices/notices.component').then(
        (m) => m.NoticesComponent,
      ),
  },
  {
    path: 'membership-review',
    canActivate: [permissionGuard(['membership_application.manage'])],
    loadComponent: () =>
      import(
        './features/management/pages/membership-review/membership-review.component'
      ).then((m) => m.MembershipReviewComponent),
  },
  {
    path: 'membership-governance',
    canActivate: [
      permissionGuard([
        'member_waiver.manage',
        'member_suspension.manage',
        'membership_appeal.manage',
      ]),
    ],
    loadComponent: () =>
      import(
        './features/management/pages/membership-governance/membership-governance.component'
      ).then((m) => m.MembershipGovernanceComponent),
  },
  {
    path: 'complaints-admin',
    canActivate: [permissionGuard(['complaint.manage', 'complaint.investigate'])],
    loadComponent: () =>
      import(
        './features/management/pages/complaints-admin/complaints-admin.component'
      ).then((m) => m.ComplaintsAdminComponent),
  },
  {
    path: 'events-management',
    canActivate: [permissionGuard(['manage_notices'])],
    loadComponent: () =>
      import('./features/management/pages/events/events.component').then(
        (m) => m.EventsComponent,
      ),
  },
  {
    // Modules 2 & 3 (governance expansion)
    path: 'committee-registry',
    canActivate: [permissionGuard(['committee_registry.manage'])],
    loadComponent: () =>
      import(
        './features/management/pages/committee-registry/committee-registry.component'
      ).then((m) => m.CommitteeRegistryComponent),
  },
  {
    path: 'elections-admin',
    canActivate: [permissionGuard(['election.manage'])],
    loadComponent: () =>
      import(
        './features/management/pages/elections-admin/elections-admin.component'
      ).then((m) => m.ElectionsAdminComponent),
  },
  {
    // Module 4 (governance expansion): fund controls hub - income
    // sources, two-person threshold, signatories, audit reports,
    // welfare requests. One section per permission.
    path: 'fund-controls',
    canActivate: [
      permissionGuard([
        'fund.manage',
        'signatory.manage',
        'audit_report.manage',
        'welfare_fund.review',
      ]),
    ],
    loadComponent: () =>
      import(
        './features/management/pages/fund-controls/fund-controls.component'
      ).then((m) => m.FundControlsComponent),
  },
  {
    // Module 6 (governance expansion): constitution amendment
    // lifecycle and version register.
    path: 'amendments-admin',
    canActivate: [permissionGuard(['amendment.manage'])],
    loadComponent: () =>
      import(
        './features/management/pages/amendments/amendments.component'
      ).then((m) => m.AmendmentsComponent),
  },
  {
    // Module 7 (governance expansion): registers.
    path: 'asset-register',
    canActivate: [permissionGuard(['asset_register.manage'])],
    loadComponent: () =>
      import(
        './features/management/pages/asset-register/asset-register.component'
      ).then((m) => m.AssetRegisterComponent),
  },
  {
    path: 'welfare-activities',
    canActivate: [permissionGuard(['welfare_activity.manage'])],
    loadComponent: () =>
      import(
        './features/management/pages/welfare-activities/welfare-activities.component'
      ).then((m) => m.WelfareActivitiesComponent),
  },
];
