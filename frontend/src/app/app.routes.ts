import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { permissionGuard } from './core/guards/permission.guard';
import { roleGuard } from './core/guards/role.guard';
import { payMergedRedirect } from './core/guards/pay-merged-redirect.guard';
import {
  MANAGEMENT_AREA_PERMISSIONS,
  MEMBER_PAYMENT_ROLES,
  SUPER_ADMIN_AREA_PERMISSIONS,
} from './core/services/auth.service';

// Member-area baseline permission - see auth.service.ts's landingTier()/area
// guards for why this, not role name, is the right check (Super Admin's full
// permission catalog includes it too, by design).
const MEMBER_AREA_PERMISSIONS = ['profile.view_own'];

// Shared by the two five-area hub routes (my-land, organisation).
const loadHub = () => import('./features/member/pages/hubs/hub.component').then((m) => m.HubComponent);

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/public-shell/public-shell.component').then((m) => m.PublicShellComponent),
    children: [
      {
        path: '',
        loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./features/public-registration/registration-page.component').then(
            (m) => m.RegistrationPageComponent,
          ),
      },
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/pages/login/login.component').then((m) => m.LoginComponent),
      },
      {
        path: 'forgot-password',
        loadComponent: () =>
          import('./features/auth/pages/forgot-password/forgot-password.component').then(
            (m) => m.ForgotPasswordComponent,
          ),
      },
      {
        path: 'reset-password',
        loadComponent: () =>
          import('./features/auth/pages/reset-password/reset-password.component').then(
            (m) => m.ResetPasswordComponent,
          ),
      },
      {
        path: 'notices',
        loadComponent: () =>
          import('./features/public-pages/notices/notices-page.component').then(
            (m) => m.NoticesPageComponent,
          ),
      },
      {
        path: 'notices/:id',
        loadComponent: () =>
          import('./features/public-pages/notices/notice-detail-page.component').then(
            (m) => m.NoticeDetailPageComponent,
          ),
      },
      {
        path: 'events',
        loadComponent: () =>
          import('./features/public-pages/events/events-page.component').then(
            (m) => m.EventsPageComponent,
          ),
      },
      {
        path: 'events/:id',
        loadComponent: () =>
          import('./features/public-pages/events/event-detail-page.component').then(
            (m) => m.EventDetailPageComponent,
          ),
      },
      {
        path: '403',
        loadComponent: () =>
          import('./core/pages/forbidden/forbidden.component').then((m) => m.ForbiddenComponent),
      },
    ],
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      // Member area - any authenticated account holding the member-tier
      // permission (member role, or Super Admin's full catalog).
      {
        path: '',
        canActivate: [permissionGuard(MEMBER_AREA_PERMISSIONS)],
        children: [
          {
            path: 'profile',
            loadComponent: () =>
              import('./features/member/pages/profile/profile.component').then(
                (m) => m.ProfileComponent,
              ),
          },
          {
            // Five-area navigation hub (nav_five_areas).
            path: 'my-land',
            data: { hub: 'my-land' },
            loadComponent: loadHub,
          },
          {
            // Merged payments page (pay_merged_page); the three old routes
            // below redirect here while that flag is on.
            path: 'payments',
            canActivate: [roleGuard(MEMBER_PAYMENT_ROLES)],
            loadComponent: () =>
              import('./features/member/pages/payments/payments.component').then((m) => m.PaymentsComponent),
          },
          {
            path: 'installments',
            canActivate: [payMergedRedirect('installment')],
            loadComponent: () =>
              import('./features/member/pages/installments/installments.component').then(
                (m) => m.InstallmentsComponent,
              ),
          },
          {
            path: 'property-requests/new',
            loadComponent: () =>
              import('./features/member/pages/property-request-form/property-request-form.component').then(
                (m) => m.PropertyRequestFormComponent,
              ),
          },
          {
            path: 'property-requests/:propertyId/edit',
            loadComponent: () =>
              import('./features/member/pages/property-request-form/property-request-form.component').then(
                (m) => m.PropertyRequestFormComponent,
              ),
          },
          {
            path: 'other-fees',
            // Member payers only (MEMBER_PAYMENT_ROLES): fee managers are
            // redirected to Fee Settings, never shown the payment form.
            canActivate: [payMergedRedirect('other_fee'), roleGuard(MEMBER_PAYMENT_ROLES)],
            loadComponent: () =>
              import('./features/member/pages/other-fees/other-fees.component').then(
                (m) => m.OtherFeesComponent,
              ),
          },
          {
            // The standalone Picnic Fee page became a fee type inside Other
            // Fees; old links land there with picnic preselected.
            path: 'picnic-payment',
            redirectTo: () => '/other-fees?type=picnic',
          },
          {
            // The plain "Fees" page was folded into Other Fees too.
            path: 'fees',
            redirectTo: () => '/other-fees',
          },
          {
            path: 'cost-shares',
            canActivate: [payMergedRedirect('cost_share')],
            loadComponent: () =>
              import('./features/member/pages/cost-shares/cost-shares.component').then(
                (m) => m.CostSharesComponent,
              ),
          },
          {
            path: 'neighbours',
            canActivate: [permissionGuard(['neighbour.view'])],
            loadComponent: () =>
              import('./features/member/pages/neighbours/neighbours.component').then(
                (m) => m.NeighboursComponent,
              ),
          },
          {
            path: 'plot-map',
            // Leaflet chunk (~480 kB): fetched on first visit, never preloaded.
            data: { preload: false },
            canActivate: [permissionGuard(['boundary.view'])],
            loadComponent: () =>
              import('./features/member/pages/plot-map/plot-map.component').then(
                (m) => m.PlotMapComponent,
              ),
          },
          {
            // Modules 1 & 5 (governance expansion)
            path: 'membership',
            loadComponent: () =>
              import('./features/member/pages/membership/membership.component').then(
                (m) => m.MembershipComponent,
              ),
          },
          {
            path: 'complaints',
            loadComponent: () =>
              import('./features/member/pages/complaints/complaints.component').then(
                (m) => m.ComplaintsComponent,
              ),
          },
          {
            path: 'complaints/land-protection',
            canActivate: [permissionGuard(['land_complaint.create'])],
            loadComponent: () =>
              import(
                './features/member/pages/complaints/land-protection-form.component'
              ).then((m) => m.LandProtectionFormComponent),
          },
          {
            path: 'service-standard',
            canActivate: [permissionGuard(['service_standard.view'])],
            loadComponent: () =>
              import(
                './features/member/pages/service-standard/service-standard.component'
              ).then((m) => m.ServiceStandardComponent),
          },
          {
            // Modules 2 & 3 (governance expansion): member election
            // participation - vote and/or stand as a candidate.
            path: 'elections',
            canActivate: [permissionGuard(['election.vote', 'election.candidate'])],
            loadComponent: () =>
              import('./features/member/pages/elections/elections.component').then(
                (m) => m.MemberElectionsComponent,
              ),
          },
          {
            path: 'petitions',
            canActivate: [permissionGuard(['petition.create'])],
            loadComponent: () =>
              import('./features/member/pages/petitions/petitions.component').then(
                (m) => m.MemberPetitionsComponent,
              ),
          },
          {
            // Modules 4 & 6 (governance expansion): member welfare-fund
            // applications and constitution amendment participation.
            path: 'welfare-fund',
            canActivate: [permissionGuard(['welfare_fund.apply'])],
            loadComponent: () =>
              import('./features/member/pages/welfare-fund/welfare-fund.component').then(
                (m) => m.WelfareFundComponent,
              ),
          },
          {
            path: 'amendments',
            canActivate: [permissionGuard(['amendment.propose', 'service_standard.view'])],
            loadComponent: () =>
              import('./features/member/pages/amendments/amendments.component').then(
                (m) => m.MemberAmendmentsComponent,
              ),
          },
          {
            path: 'change-password',
            loadComponent: () =>
              import('./features/member/pages/change-password/change-password.component').then(
                (m) => m.ChangePasswordComponent,
              ),
          },
        ],
      },
      // Dashboard is reachable by every authenticated tier - its own internal
      // switch (auth.landingTier()) picks the right content, so it sits
      // outside both area guards below.
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        // Five-area navigation hub; every tier may open it, tiles follow the old menu permissions.
        path: 'organisation',
        data: { hub: 'organisation' },
        loadComponent: loadHub,
      },
      // Fund transparency sits outside the member-area guard like /dashboard:
      // every authenticated tier (member, committee, admin) may read it - the
      // backend exposes approved transactions to any logged-in account.
      {
        path: 'fund-transparency',
        loadComponent: () =>
          import('./features/member/pages/fund-transparency/fund-transparency.component').then(
            (m) => m.FundTransparencyComponent,
          ),
      },
      // Society roadmap: read-only progress view for every authenticated tier.
      {
        path: 'roadmap',
        loadComponent: () =>
          import('./features/member/pages/roadmap/roadmap.component').then(
            (m) => m.RoadmapComponent,
          ),
      },
      // Resolution book - readable by every authenticated account; the
      // add/edit routes are separately committee-gated (the server
      // enforces the same split via manage_resolution_book).
      {
        path: 'resolution-book',
        loadComponent: () =>
          import('./features/member/pages/resolution-book/resolution-book.component').then(
            (m) => m.ResolutionBookComponent,
          ),
      },
      {
        path: 'resolution-book/meeting/:id',
        loadComponent: () =>
          import('./features/member/pages/resolution-book/meeting-detail.component').then(
            (m) => m.MeetingDetailComponent,
          ),
      },
      {
        // জরুরি নিরাপদ পদক্ষেপ - static help page, open to any authenticated
        // account (also linked from the public complaint forms).
        path: 'emergency-help',
        loadComponent: () =>
          import(
            './features/member/pages/complaints/emergency-help.component'
          ).then((m) => m.EmergencyHelpComponent),
      },
      {
        path: 'resolution-book/add',
        canActivate: [permissionGuard(['manage_resolution_book'])],
        loadComponent: () =>
          import('./features/member/pages/resolution-book/meeting-form.component').then(
            (m) => m.MeetingFormComponent,
          ),
      },
      {
        path: 'resolution-book/edit/:id',
        canActivate: [permissionGuard(['manage_resolution_book'])],
        loadComponent: () =>
          import('./features/member/pages/resolution-book/meeting-form.component').then(
            (m) => m.MeetingFormComponent,
          ),
      },
      // Management area - Executive Committee/Administrator (any manage_*/
      // approve_*/view_* key from their default tuples), Super Admin included.
      {
        path: '',
        canActivate: [permissionGuard(MANAGEMENT_AREA_PERMISSIONS)],
        data: { requiredPermissions: MANAGEMENT_AREA_PERMISSIONS },
        loadChildren: () => import('./management.routes').then((m) => m.MANAGEMENT_ROUTES),
      },
      // Super Admin area - manage_users/manage_roles/view_audit_log exist
      // only in the Super Admin's full permission catalog today.
      {
        path: '',
        canActivate: [permissionGuard(SUPER_ADMIN_AREA_PERMISSIONS)],
        data: { requiredPermissions: SUPER_ADMIN_AREA_PERMISSIONS },
        children: [
          {
            path: 'roles',
            canActivate: [permissionGuard(['manage_roles', 'manage_users'])],
            loadComponent: () =>
              import('./features/management/pages/role-management/role-management.component').then(
                (m) => m.RoleManagementComponent,
              ),
          },
          {
            path: 'audit-log',
            canActivate: [permissionGuard(['view_audit_log'])],
            loadComponent: () =>
              import('./features/management/pages/audit-log/audit-log.component').then(
                (m) => m.AuditLogComponent,
              ),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
