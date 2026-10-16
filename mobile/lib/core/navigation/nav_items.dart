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
    this.requiredAny,
    this.tier,
    this.area,
  });

  final String Function(AppLocalizations) labelKey;
  final String route;
  final IconData icon;
  final String? requiredPermission;

  /// Alternative to [requiredPermission]: any one of these opens the item
  /// (Angular `requiredPermission: [a, b]`).
  final List<String>? requiredAny;
  final LandingTierFilter? tier;

  /// Five-area (Batch 3) parent of this route; null for management items.
  final NavArea? area;

  /// Whether [can] satisfies this item's permission rule (none = open).
  bool isAllowed(bool Function(String) can) {
    final any = requiredAny;
    if (any != null) return any.any(can);
    final p = requiredPermission;
    return p == null || can(p);
  }
}

enum LandingTierFilter { member, management, superAdmin }

/// One heading of the grouped admin menu (nav_advanced_section).
class NavGroup {
  const NavGroup({required this.labelKey, required this.items, this.advanced = false});

  final String Function(AppLocalizations) labelKey;
  final List<NavItem> items;

  /// The "Advanced" tail of Settings (roles, config lists, audit log).
  final bool advanced;
}

/// The five member areas behind `nav_five_areas`.
enum NavArea { home, payments, land, organisation, profile }

class AppNav {
  const AppNav._();

  static const memberAreaPermission = 'profile.view_own';

  static String Function(AppLocalizations) _t(String Function(AppLocalizations) f) => f;

  /// Label for pages whose text is not in the ARB files yet.
  static String Function(AppLocalizations) _bnEn(String bn, String en) =>
      (l) => l.localeName.startsWith('bn') ? bn : en;

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
    bool adminConsole = false,
  }) {
    final visible = items.where((item) {
      if (item.route == '/payments' && !mergedPayments) return false;
      if (mergedPayments && (item.route == '/installments' || item.route == '/cost-shares')) return false;
      if (item.tier == LandingTierFilter.member && landingTier != LandingTier.member) {
        return false;
      }
      if (item.tier == LandingTierFilter.superAdmin && landingTier != LandingTier.superAdmin) {
        return false;
      }
      return item.isAllowed(can);
    }).toList();
    return adminConsole ? _withConsolePages(visible, can) : visible;
  }

  /// admin_console on: the merged pages replace their two-page originals
  /// (submissions, notices + events) and phone fixes joins the member pages.
  static List<NavItem> _withConsolePages(List<NavItem> flat, bool Function(String) can) {
    NavItem console(String route) => _consoleItems.firstWhere((i) => i.route == route);
    final result = <NavItem>[];
    for (final item in flat) {
      switch (item.route) {
        case '/submissions':
          if (console('/applications').isAllowed(can)) result.add(console('/applications'));
        case '/notices-management':
          if (console('/notices-events').isAllowed(can)) result.add(console('/notices-events'));
        case '/events-management':
          break;
        case '/members':
          result.add(item);
          if (console('/phone-fixes').isAllowed(can)) result.add(console('/phone-fixes'));
        default:
          result.add(item);
      }
    }
    return result;
  }

  /// Pages of the admin console (flag admin_console); never in the flat menu
  /// while the flag is off.
  static final List<NavItem> _consoleItems = [
    NavItem(
      labelKey: _t((l) => l.navApplications),
      route: '/applications',
      icon: Icons.inbox_outlined,
      requiredAny: const ['membership.review', 'membership_application.manage'],
    ),
    NavItem(
      labelKey: _t((l) => l.navNoticesEvents),
      route: '/notices-events',
      icon: Icons.campaign_outlined,
      requiredPermission: 'manage_notices',
    ),
    NavItem(
      labelKey: _t((l) => l.navPhoneFixes),
      route: '/phone-fixes',
      icon: Icons.phone_forwarded_outlined,
      requiredPermission: 'member.manage',
    ),
  ];

  /// Read-only cache stats page under Advanced (nav_advanced_section).
  static final NavItem _cacheStatsItem = NavItem(
    labelKey: _t((l) => l.navCacheStats),
    route: '/advanced/cache',
    icon: Icons.storage_outlined,
    requiredPermission: 'manage_system_config',
  );

  // ---- Batch 5: grouped admin menu ----------------------------------------

  /// Routes of each admin group, in menu order. A new admin route in [items]
  /// must be listed here (the menu-guard test fails otherwise).
  static const _adminGroupRoutes = <List<String>>[
    ['/submissions', '/members', '/property-requests'],
    ['/payment-verifications', '/installments-management', '/society-costs', '/finance-management', '/fund-controls'],
    ['/notices-management', '/events-management', ..._registerOrgRoutes],
    ['/fee-settings'],
    ['/config-lists', '/roles', '/audit-log', '/advanced/cache'],
  ];

  /// The same groups with admin_console on: merged queue, merged notices and
  /// events, and the phone-fix page.
  static const _consoleGroupRoutes = <List<String>>[
    ['/applications', '/members', '/property-requests', '/phone-fixes'],
    ['/payment-verifications', '/installments-management', '/society-costs', '/finance-management', '/fund-controls'],
    ['/notices-events', ..._registerOrgRoutes],
    ['/fee-settings'],
    ['/config-lists', '/roles', '/audit-log', '/advanced/cache'],
  ];

  /// Register pages in the organisation group (Angular admin-groups order).
  static const _registerOrgRoutes = ['/committee-registry', '/welfare-activities', '/asset-register'];

  static final List<String Function(AppLocalizations)> _adminGroupLabels = [
    _t((l) => l.adminGroupApplications),
    _t((l) => l.adminGroupMoney),
    _t((l) => l.adminGroupOrganisation),
    _t((l) => l.adminGroupSettings),
    _t((l) => l.adminGroupAdvanced),
  ];

  /// Admin pages that exist in Flutter but were never in the flat menu; they
  /// only appear in the grouped menu.
  static final List<NavItem> _groupOnlyItems = [
    NavItem(
      labelKey: _t((l) => l.navPaymentVerifications),
      route: '/payment-verifications',
      icon: Icons.fact_check_outlined,
      requiredPermission: 'manage_finance',
    ),
    NavItem(
      labelKey: _t((l) => l.navPropertyRequests),
      route: '/property-requests',
      icon: Icons.home_work_outlined,
      requiredPermission: 'property.review',
    ),
    // Governance registers (same permissions as the Angular nav-config).
    NavItem(
      labelKey: _bnEn('কমিটি রেজিস্ট্রি', 'Committee registry'),
      route: '/committee-registry',
      icon: Icons.badge_outlined,
      requiredPermission: 'committee_registry.manage',
    ),
    NavItem(
      labelKey: _bnEn('তহবিল নিয়ন্ত্রণ', 'Fund controls'),
      route: '/fund-controls',
      icon: Icons.shield_outlined,
      requiredAny: const ['fund.manage', 'signatory.manage', 'audit_report.manage', 'welfare_fund.review'],
    ),
    NavItem(
      labelKey: _bnEn('সম্পদ রেজিস্টার', 'Asset register'),
      route: '/asset-register',
      icon: Icons.inventory_2_outlined,
      requiredPermission: 'asset_register.manage',
    ),
    NavItem(
      labelKey: _bnEn('কল্যাণ কার্যক্রম', 'Welfare activities'),
      route: '/welfare-activities',
      icon: Icons.groups_2_outlined,
      requiredPermission: 'welfare_activity.manage',
    ),
  ];

  /// The admin menu in four groups plus Advanced, permission-filtered like
  /// [visibleFor]; empty groups are dropped and members get none.
  static List<NavGroup> adminGroups({
    required LandingTier landingTier,
    required bool Function(String) can,
    bool adminConsole = false,
  }) {
    if (landingTier == LandingTier.member) return const [];
    final catalogue = [
      ...items.where((i) => i.area == null),
      ..._groupOnlyItems,
      if (adminConsole) ..._consoleItems,
      _cacheStatsItem,
    ];
    final routes = adminConsole ? _consoleGroupRoutes : _adminGroupRoutes;
    bool allowed(NavItem item) {
      if (item.tier == LandingTierFilter.superAdmin && landingTier != LandingTier.superAdmin) {
        return false;
      }
      return item.isAllowed(can);
    }

    return [
      for (var g = 0; g < routes.length; g++)
        if (_groupItems(catalogue, routes[g]).where(allowed).isNotEmpty)
          NavGroup(
            labelKey: _adminGroupLabels[g],
            items: _groupItems(catalogue, routes[g]).where(allowed).toList(),
            advanced: g == routes.length - 1,
          ),
    ];
  }

  static List<NavItem> _groupItems(List<NavItem> catalogue, List<String> routes) => [
        for (final route in routes)
          for (final item in catalogue)
            if (item.route == route) item,
      ];

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
    NavArea.payments: ['/payments', '/installments', '/cost-shares', '/picnic-payment', '/other-fees'],
    NavArea.land: ['/my-land', '/neighbours', '/plot-map', '/property-requests'],
    NavArea.organisation: [
      '/organisation', '/notices', '/events', '/fund-transparency', '/roadmap', '/resolution-book',
      '/elections', '/welfare-fund', '/complaints', '/service-standard', '/emergency-help',
      '/petitions', '/amendments',
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
          if (item.route == route && item.isAllowed(can)) item,
    ];
  }

  static const _hubRoutes = <NavArea, List<String>>{
    NavArea.land: ['/property-requests/new', '/neighbours', '/plot-map'],
    NavArea.organisation: [
      '/notices', '/events', '/resolution-book', '/fund-transparency', '/roadmap',
      '/elections', '/welfare-fund', '/complaints', '/complaints/land-protection',
      '/service-standard', '/emergency-help', '/petitions', '/amendments',
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
    // Governance pages: hub-only, never in the old flat menu.
    NavItem(
      labelKey: _t((l) => l.navElections),
      route: '/elections',
      icon: Icons.how_to_vote_outlined,
      requiredAny: const ['election.vote', 'election.candidate'],
      area: NavArea.organisation,
    ),
    NavItem(
      labelKey: _t((l) => l.navWelfareFund),
      route: '/welfare-fund',
      icon: Icons.volunteer_activism_outlined,
      requiredPermission: 'welfare_fund.apply',
      area: NavArea.organisation,
    ),
    NavItem(
      labelKey: _t((l) => l.navComplaints),
      route: '/complaints',
      icon: Icons.inbox_outlined,
      requiredPermission: 'profile.view_own',
      area: NavArea.organisation,
    ),
    NavItem(
      labelKey: _t((l) => l.navLandProtection),
      route: '/complaints/land-protection',
      icon: Icons.shield_outlined,
      requiredPermission: 'land_complaint.create',
      area: NavArea.organisation,
    ),
    NavItem(
      labelKey: _t((l) => l.navServiceStandard),
      route: '/service-standard',
      icon: Icons.task_alt_outlined,
      requiredPermission: 'service_standard.view',
      area: NavArea.organisation,
    ),
    NavItem(
      labelKey: _t((l) => l.navEmergencyHelp),
      route: '/emergency-help',
      icon: Icons.warning_amber_outlined,
      area: NavArea.organisation,
    ),
    NavItem(
      labelKey: _t((l) => l.navPetitions),
      route: '/petitions',
      icon: Icons.edit_document,
      requiredPermission: 'petition.create',
      area: NavArea.organisation,
    ),
    NavItem(
      labelKey: _t((l) => l.navAmendments),
      route: '/amendments',
      icon: Icons.gavel_outlined,
      requiredAny: const ['amendment.propose', 'service_standard.view'],
      area: NavArea.organisation,
    ),
  ];
}
