import 'package:flutter/material.dart';

import '../../../l10n/app_localizations.dart';
import '../auth/session.dart';
import '../enums/enums.dart';
import '../feature_flags/feature_flag.dart';
import '../feature_flags/feature_flags_service.dart';

/// One config list drives both bottom-nav (member) and drawer
/// (management / super admin), permission-filtered at runtime.
class NavItem {
  const NavItem({
    required this.labelKey,
    required this.route,
    required this.icon,
    this.requiredPermission,
    this.tier,
    this.area,
  });

  final String Function(AppLocalizations) labelKey;
  final String route;
  final IconData icon;
  final String? requiredPermission;
  final LandingTierFilter? tier;

  /// Five-area (Batch 3) parent of this route; null for management items.
  final NavArea? area;
}

enum LandingTierFilter { member, management, superAdmin }

/// The five member areas behind `nav_five_areas`.
enum NavArea { home, payments, land, organisation, profile }

class AppNav {
  const AppNav._();

  static const memberAreaPermission = 'profile.view_own';

  static String Function(AppLocalizations) _t(String Function(AppLocalizations) f) => f;

  static final List<NavItem> items = [
    NavItem(
      labelKey: _t((l) => l.navDashboard),
      route: '/dashboard',
      icon: Icons.dashboard_outlined,
      area: NavArea.home,
    ),
    NavItem(
      labelKey: _t((l) => l.navProfile),
      route: '/profile',
      icon: Icons.person_outline,
      requiredPermission: 'profile.view_own',
      tier: LandingTierFilter.member,
      area: NavArea.profile,
    ),
    NavItem(
      labelKey: _t((l) => l.navInstallments),
      route: '/installments',
      icon: Icons.payments_outlined,
      requiredPermission: 'profile.view_own',
      tier: LandingTierFilter.member,
      area: NavArea.payments,
    ),
    NavItem(
      labelKey: _t((l) => l.navCostShares),
      route: '/cost-shares',
      icon: Icons.pie_chart_outline,
      requiredPermission: 'profile.view_own',
      tier: LandingTierFilter.member,
      area: NavArea.payments,
    ),
    // Batch 2: single payments entry, only listed when pay_merged_page is on
    // (see [visibleFor]); replaces /installments and /cost-shares.
    NavItem(
      labelKey: _t((l) => l.navAreaPayments),
      route: '/payments',
      icon: Icons.payments_outlined,
      requiredPermission: 'profile.view_own',
      tier: LandingTierFilter.member,
      area: NavArea.payments,
    ),
    // 5th member entry: lands under "More", primary tabs stay unchanged.
    NavItem(
      labelKey: _t((l) => l.navNeighbours),
      route: '/neighbours',
      icon: Icons.holiday_village_outlined,
      requiredPermission: AppPermissions.neighbourView,
      tier: LandingTierFilter.member,
      area: NavArea.land,
    ),
    // 6th member entry: lands under "More", primary tabs stay unchanged.
    NavItem(
      labelKey: _t((l) => l.navPlotMap),
      route: '/plot-map',
      icon: Icons.map_outlined,
      requiredPermission: 'boundary.view',
      tier: LandingTierFilter.member,
      area: NavArea.land,
    ),
    NavItem(
      labelKey: _t((l) => l.navNotices),
      route: '/notices',
      icon: Icons.campaign_outlined,
      area: NavArea.organisation,
    ),
    NavItem(
      labelKey: _t((l) => l.navEvents),
      route: '/events',
      icon: Icons.event_outlined,
      area: NavArea.organisation,
    ),
    NavItem(
      labelKey: _t((l) => l.navFundTransparency),
      route: '/fund-transparency',
      icon: Icons.volunteer_activism_outlined,
      area: NavArea.organisation,
    ),
    NavItem(
      labelKey: _t((l) => l.navRoadmap),
      route: '/roadmap',
      icon: Icons.map_outlined,
      area: NavArea.organisation,
    ),
    NavItem(
      labelKey: _t((l) => l.navResolutionBook),
      route: '/resolution-book',
      icon: Icons.menu_book_outlined,
      area: NavArea.organisation,
    ),
    NavItem(
      labelKey: _t((l) => l.navSubmissions),
      route: '/submissions',
      icon: Icons.fact_check_outlined,
      requiredPermission: 'membership.review',
    ),
    NavItem(
      labelKey: _t((l) => l.navMembersList),
      route: '/members',
      icon: Icons.groups_outlined,
      requiredPermission: 'member.view_all',
    ),
    NavItem(
      labelKey: _t((l) => l.navInstallments),
      route: '/installments-management',
      icon: Icons.receipt_long_outlined,
      requiredPermission: 'manage_finance',
    ),
    NavItem(
      labelKey: _t((l) => l.navFeeSettings),
      route: '/fee-settings',
      icon: Icons.settings_suggest_outlined,
      requiredPermission: 'manage_fee_settings',
    ),
    NavItem(
      labelKey: _t((l) => l.navSocietyCosts),
      route: '/society-costs',
      icon: Icons.account_balance_wallet_outlined,
      requiredPermission: 'manage_costs',
    ),
    NavItem(
      labelKey: _t((l) => l.navFinanceManagement),
      route: '/finance-management',
      icon: Icons.account_balance_outlined,
      requiredPermission: 'manage_finance',
    ),
    NavItem(
      labelKey: _t((l) => l.navConfigLists),
      route: '/config-lists',
      icon: Icons.tune_outlined,
      requiredPermission: 'manage_system_config',
    ),
    NavItem(
      labelKey: _t((l) => l.navNoticesManagement),
      route: '/notices-management',
      icon: Icons.edit_note_outlined,
      requiredPermission: 'manage_notices',
    ),
    NavItem(
      labelKey: _t((l) => l.navEventsManagement),
      route: '/events-management',
      icon: Icons.edit_calendar_outlined,
      requiredPermission: 'manage_notices',
    ),
    NavItem(
      labelKey: _t((l) => l.navRolesPermissions),
      route: '/roles',
      icon: Icons.admin_panel_settings_outlined,
      requiredPermission: 'manage_roles',
      tier: LandingTierFilter.superAdmin,
    ),
    NavItem(
      labelKey: _t((l) => l.navAuditLog),
      route: '/audit-log',
      icon: Icons.history_outlined,
      requiredPermission: 'view_audit_log',
      tier: LandingTierFilter.superAdmin,
    ),
  ];

  /// Items the current user may open. With [mergedPayments] (pay_merged_page)
  /// the single payments entry replaces installments and cost shares.
  static List<NavItem> visibleFor({
    required LandingTier landingTier,
    required bool Function(String) can,
    bool mergedPayments = false,
  }) {
    return items.where((item) {
      if (item.route == '/payments' && !mergedPayments) return false;
      if (mergedPayments && (item.route == '/installments' || item.route == '/cost-shares')) return false;
      if (item.tier == LandingTierFilter.member && landingTier != LandingTier.member) {
        return false;
      }
      if (item.tier == LandingTierFilter.superAdmin && landingTier != LandingTier.superAdmin) {
        return false;
      }
      final p = item.requiredPermission;
      return p == null || can(p);
    }).toList();
  }

  // ---- Batch 3: five member areas -----------------------------------------

  /// The five bottom-bar / sidebar areas. Payments goes to /payments when
  /// pay_merged_page is on, otherwise to /installments. Areas the member has no
  /// permission for are dropped; [can] defaults to allowing everything.
  static List<NavItem> memberAreas(FeatureFlagsService flags, {bool Function(String)? can}) {
    final allowed = can ?? (_) => true;
    final merged = flags.isEnabled(FeatureFlag.payMergedPage);
    const member = AppPermissions.memberArea;
    final areas = <NavItem>[
      NavItem(
        labelKey: _t((l) => l.navAreaHome),
        route: '/dashboard',
        icon: Icons.home_outlined,
        area: NavArea.home,
      ),
      NavItem(
        labelKey: _t((l) => l.navAreaPayments),
        route: merged ? '/payments' : '/installments',
        icon: Icons.payments_outlined,
        requiredPermission: member,
        area: NavArea.payments,
      ),
      NavItem(
        labelKey: _t((l) => l.navAreaLand),
        route: '/my-land',
        icon: Icons.landscape_outlined,
        requiredPermission: member,
        area: NavArea.land,
      ),
      NavItem(
        labelKey: _t((l) => l.navAreaOrganisation),
        route: '/organisation',
        icon: Icons.account_balance_outlined,
        area: NavArea.organisation,
      ),
      NavItem(
        labelKey: _t((l) => l.navAreaProfile),
        route: '/profile',
        icon: Icons.person_outline,
        requiredPermission: member,
        area: NavArea.profile,
      ),
    ];
    return areas.where((a) => a.requiredPermission == null || allowed(a.requiredPermission!)).toList();
  }

  /// Parent area of [path] (query ignored); null for management routes.
  static NavArea? areaForRoute(String path) {
    final clean = path.split('?').first;
    for (final entry in _areaPrefixes.entries) {
      for (final prefix in entry.value) {
        if (clean == prefix || clean.startsWith('$prefix/')) return entry.key;
      }
    }
    return null;
  }

  static const _areaPrefixes = <NavArea, List<String>>{
    NavArea.home: ['/dashboard'],
    NavArea.payments: ['/payments', '/installments', '/cost-shares', '/picnic-payment'],
    NavArea.land: ['/my-land', '/neighbours', '/plot-map', '/property-requests'],
    NavArea.organisation: [
      '/organisation', '/notices', '/events', '/fund-transparency', '/roadmap', '/resolution-book',
    ],
    NavArea.profile: ['/profile', '/change-password'],
  };

  /// Tiles of the "আমার জমি" / "সংগঠন" hubs, filtered by the same permission
  /// rules as the old menu items. Home, payments and profile have no hub.
  static List<NavItem> hubItems(NavArea area, {required bool Function(String) can}) {
    final routes = _hubRoutes[area] ?? const <String>[];
    return [
      for (final route in routes)
        for (final item in _hubCatalog)
          if (item.route == route && (item.requiredPermission == null || can(item.requiredPermission!))) item,
    ];
  }

  static const _hubRoutes = <NavArea, List<String>>{
    NavArea.land: ['/property-requests/new', '/neighbours', '/plot-map'],
    NavArea.organisation: [
      '/notices', '/events', '/resolution-book', '/fund-transparency', '/roadmap',
    ],
  };

  static final List<NavItem> _hubCatalog = [
    ...items.where((i) => i.area == NavArea.land || i.area == NavArea.organisation),
    NavItem(
      labelKey: _t((l) => l.navPropertyRequest),
      route: '/property-requests/new',
      icon: Icons.note_add_outlined,
      requiredPermission: 'profile.view_own',
      tier: LandingTierFilter.member,
      area: NavArea.land,
    ),
  ];
}
