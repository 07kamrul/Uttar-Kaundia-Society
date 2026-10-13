import 'package:flutter/material.dart';

import '../../core/navigation/nav_items.dart';
import 'hub_page.dart';

/// "সংগঠন": notices, events, resolutions, fund accounts and the roadmap.
class OrganisationHubPage extends StatelessWidget {
  const OrganisationHubPage({super.key, this.can});

  final bool Function(String)? can;

  @override
  Widget build(BuildContext context) => AreaHubPage(
        area: NavArea.organisation,
        title: (l) => l.navAreaOrganisation,
        icon: Icons.account_balance_outlined,
        can: can,
      );
}
