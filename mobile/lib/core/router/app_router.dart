import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/pages/forgot_password_page.dart';
import '../../features/auth/pages/login_page.dart';
import '../../features/auth/pages/reset_password_page.dart';
import '../../features/dashboard/presentation/pages/dashboard_page.dart';
import '../../features/governance/pages/amendments_page.dart';
import '../../features/governance/pages/complaints_page.dart';
import '../../features/governance/pages/elections_page.dart';
import '../../features/governance/pages/emergency_help_page.dart';
import '../../features/governance/pages/land_complaint_page.dart';
import '../../features/governance/pages/petitions_page.dart';
import '../../features/governance/pages/service_standard_page.dart';
import '../../features/governance/pages/welfare_fund_page.dart';
import '../../features/home/home_status_page.dart';
import '../../features/home/my_land_hub_page.dart';
import '../../features/home/organisation_hub_page.dart';
import '../../features/member/domain/merged_payment_entities.dart';
import '../../features/member/pages/payments_page.dart';
import '../../features/home/home_page.dart';
import '../../features/management/pages/config_lists_page.dart';
import '../../features/management/pages/events_management_page.dart';
import '../../features/management/pages/fee_settings_page.dart';
import '../../features/management/pages/finance_management_page.dart';
import '../../features/management/pages/installments_management_page.dart';
import '../../features/management/pages/member_detail_page.dart';
import '../../features/management/pages/members_list_page.dart';
import '../../features/management/pages/notices_management_page.dart';
import '../../features/management/pages/payment_verifications_page.dart';
import '../../features/management/pages/picnic_payments_page.dart';
import '../../features/management/pages/property_requests_page.dart';
import '../../features/management/pages/roadmap_management_page.dart';
import '../../features/management/pages/society_costs_page.dart';
import '../../features/management/pages/submission_detail_page.dart';
import '../../features/management/pages/submissions_list_page.dart';
import '../../features/management/pages/today_page.dart';
import '../../features/member/pages/change_password_page.dart';
import '../../features/member/pages/cost_shares_page.dart';
import '../../features/member/pages/fund_transparency_page.dart';
import '../../features/member/pages/installments_page.dart';
import '../../features/member/pages/picnic_payment_page.dart';
import '../../features/member/pages/profile_page.dart';
import '../../features/member/pages/property_request_form_page.dart';
import '../../features/member/pages/resolution_book_detail_page.dart';
import '../../features/member/pages/resolution_book_form_page.dart';
import '../../features/member/pages/resolution_book_page.dart';
import '../../features/member/pages/roadmap_page.dart';
import '../../features/neighbours/presentation/pages/neighbours_page.dart';
import '../../features/plot_boundary/presentation/pages/boundary_editor_page.dart';
import '../../features/plot_boundary/domain/plot_boundary_entities.dart';
import '../../features/plot_boundary/presentation/pages/plot_map_page.dart';
import '../../features/public_content/event_detail_page.dart';
import '../../features/public_content/events_page.dart';
import '../../features/public_content/notice_detail_page.dart';
import '../../features/public_content/notices_page.dart';
import '../../features/registration/registration_page.dart';
import '../../features/settings/shell_page.dart';
import '../../features/superadmin/pages/audit_log_page.dart';
import '../../features/superadmin/pages/roles_page.dart';
import '../di/injector.dart';
import '../feature_flags/feature_flag.dart';
import '../feature_flags/feature_flag_builder.dart';
import '../enums/enums.dart';
import '../pages/forbidden_page.dart';
import '../auth/session.dart';
import 'guards.dart';

GoRouter buildRouter() {
  return GoRouter(
    initialLocation: '/',
    redirect: appRedirect,
    routes: [
      GoRoute(path: '/', builder: (_, __) => const HomePage()),
      GoRoute(path: '/register', builder: (_, __) => const RegistrationPage()),
      GoRoute(path: '/login', builder: (_, s) {
        final returnUrl = s.uri.queryParameters['returnUrl'];
        return LoginPage(returnUrl: returnUrl);
      }),
      GoRoute(path: '/forgot-password', builder: (_, __) => const ForgotPasswordPage()),
      GoRoute(path: '/reset-password', builder: (_, __) => const ResetPasswordPage()),
      GoRoute(path: '/notices', builder: (_, __) => const NoticesPage()),
      GoRoute(path: '/notices/:id', builder: (_, s) => NoticeDetailPage(id: s.pathParameters['id']!)),
      GoRoute(path: '/events', builder: (_, __) => const EventsPage()),
      GoRoute(path: '/events/:id', builder: (_, s) => EventDetailPage(id: s.pathParameters['id']!)),
      GoRoute(path: '/403', builder: (_, __) => const ForbiddenPage()),

      // Authenticated shell (bottom nav / drawer, permission-filtered).
      ShellRoute(
        builder: (context, state, child) => ShellPage(child: child),
        routes: [
          GoRoute(path: '/dashboard', builder: (_, __) => const DashboardSwitch()),
          GoRoute(path: '/payments', builder: _paymentsBuilder),
          GoRoute(path: '/my-land', builder: (_, __) => const MyLandHubPage()),
          GoRoute(path: '/organisation', builder: (_, __) => const OrganisationHubPage()),
          GoRoute(path: '/emergency-help', builder: (_, __) => const EmergencyHelpPage()),
          GoRoute(
            path: '/complaints',
            builder: (_, __) => const ComplaintsPage(),
            routes: [GoRoute(path: 'land-protection', builder: (_, __) => const LandComplaintPage())],
          ),
          GoRoute(path: '/service-standard', builder: (_, __) => const ServiceStandardPage()),
          GoRoute(path: '/elections', builder: (_, __) => const ElectionsPage()),
          GoRoute(path: '/petitions', builder: (_, __) => const PetitionsPage()),
          GoRoute(path: '/welfare-fund', builder: (_, __) => const WelfareFundPage()),
          GoRoute(path: '/amendments', builder: (_, __) => const AmendmentsPage()),
          GoRoute(path: '/profile', builder: (_, __) => const ProfilePage()),
          GoRoute(path: '/installments', builder: (_, __) => const InstallmentsPage()),
          GoRoute(path: '/cost-shares', builder: (_, __) => const CostSharesPage()),
          GoRoute(path: '/neighbours', builder: (_, __) => const NeighboursPage()),
          GoRoute(
            path: PlotMapPage.pageRoute,
            builder: (_, __) => const PlotMapPage(),
            routes: [
              GoRoute(
                path: 'draw',
                builder: (_, s) {
                  // An own boundary to edit (PUT) can be passed as `extra`.
                  // A property id to preselect (new boundary) can be passed too.
                  final extra = s.extra;
                  return BoundaryEditorPage(
                    editing: extra is PlotBoundary ? extra : null,
                    initialPropertyId: extra is String ? extra : null,
                  );
                },
              ),
            ],
          ),
          GoRoute(path: '/change-password', builder: (_, __) => const ChangePasswordPage()),
          GoRoute(path: '/fund-transparency', builder: (_, __) => const FundTransparencyPage()),
          GoRoute(path: '/roadmap', builder: (_, __) => const RoadmapPage()),
          GoRoute(
            path: '/resolution-book',
            builder: (_, __) => const ResolutionBookPage(),
            routes: [
              GoRoute(
                path: 'meeting/:id',
                builder: (_, s) =>
                    ResolutionBookDetailPage(id: s.pathParameters['id']!),
              ),
              GoRoute(path: 'add', builder: (_, __) => const ResolutionBookFormPage()),
              GoRoute(
                path: 'edit/:id',
                builder: (_, s) =>
                    ResolutionBookFormPage(id: s.pathParameters['id']),
              ),
            ],
          ),
          GoRoute(
            path: '/property-requests/new',
            builder: (_, __) => const PropertyRequestFormPage(),
          ),
          GoRoute(
            path: '/property-requests/:propertyId/edit',
            builder: (_, s) =>
                PropertyRequestFormPage(propertyId: s.pathParameters['propertyId']),
          ),
          GoRoute(path: '/picnic-payment', builder: (_, __) => const PicnicPaymentPage()),
          GoRoute(
            path: '/submissions',
            builder: (_, __) => const SubmissionsListPage(),
            routes: [
              GoRoute(
                path: ':id',
                builder: (_, s) => SubmissionDetailPage(id: s.pathParameters['id']!),
              ),
            ],
          ),
          GoRoute(path: '/property-requests', builder: (_, __) => const PropertyRequestsPage()),
          GoRoute(
            path: '/members',
            builder: (_, __) => const MembersListPage(),
            routes: [
              GoRoute(
                path: ':id',
                builder: (_, s) => MemberDetailPage(id: s.pathParameters['id']!),
              ),
            ],
          ),
          GoRoute(
            path: '/installments-management',
            builder: (_, __) => const InstallmentsManagementPage(),
          ),
          GoRoute(path: '/picnic-payments', builder: (_, __) => const PicnicPaymentsPage()),
          GoRoute(path: '/fee-settings', builder: (_, __) => const FeeSettingsPage()),
          GoRoute(path: '/society-costs', builder: (_, __) => const SocietyCostsPage()),
          GoRoute(path: '/finance-management', builder: (_, __) => const FinanceManagementPage()),
          GoRoute(
            path: '/payment-verifications',
            builder: (_, __) => const PaymentVerificationsPage(),
          ),
          GoRoute(path: '/roadmap-management', builder: (_, __) => const RoadmapManagementPage()),
          GoRoute(path: '/config-lists', builder: (_, __) => const ConfigListsPage()),
          GoRoute(path: '/notices-management', builder: (_, __) => const NoticesManagementPage()),
          GoRoute(path: '/events-management', builder: (_, __) => const EventsManagementPage()),
          GoRoute(path: '/roles', builder: (_, __) => const RolesPage()),
          GoRoute(path: '/audit-log', builder: (_, __) => const AuditLogPage()),
        ],
      ),
    ],
  );
}

/// The landing page. nav_five_areas: members get the "আমার অবস্থা" home.
/// admin_console: admins get "আজকের কাজ". Everyone else (and every flag off)
/// keeps the dashboard. [legacy] / [today] are test seams.
class DashboardSwitch extends StatelessWidget {
  const DashboardSwitch({super.key, this.legacy, this.today});

  final Widget? legacy;
  final Widget? today;

  @override
  Widget build(BuildContext context) {
    final tier = sl<SessionManager>().session?.landingTier;
    return FeatureFlagBuilder(
      flag: FeatureFlag.adminConsole,
      builder: (_, console) => FeatureFlagBuilder(
        flag: FeatureFlag.navFiveAreas,
        builder: (_, areas) {
          if (console && tier != null && tier != LandingTier.member) {
            return today ?? const TodayPage();
          }
          if (areas && tier == LandingTier.member) return const HomeStatusPage();
          return legacy ?? const DashboardPage();
        },
      ),
    );
  }
}

/// `/payments?kind=installment|other_fee|cost_share&status=…&fee=picnic`.
Widget _paymentsBuilder(BuildContext context, GoRouterState state) {
  final q = state.uri.queryParameters;
  final status = PaymentItemStatusX.fromApi(q['status']);
  return PaymentsPage(
    initialKind: PaymentKindX.fromApi(q['kind']),
    initialStatus: status == PaymentItemStatus.unknown ? null : status,
    initialFee: q['fee'],
    onFiltersChanged: (kind, status) => context.go(Uri(path: '/payments', queryParameters: {
      if (kind != null) 'kind': kind.apiValue,
      if (status != null) 'status': status.apiValue,
    }).toString()),
  );
}

/// Landing route after successful login.
String destinationAfterLogin(Session session, String? returnUrl) {
  if (returnUrl != null && returnUrl.isNotEmpty && returnUrl != '/login') return returnUrl;
  return landingRoute(session);
}

void goAfterUnauthorized() {
  sl<SessionManager>();
}
