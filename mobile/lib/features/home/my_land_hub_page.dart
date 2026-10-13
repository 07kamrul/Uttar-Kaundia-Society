import 'package:flutter/material.dart';

import '../../core/navigation/nav_items.dart';
import 'hub_page.dart';

/// "আমার জমি": property requests, neighbours and the plot map.
class MyLandHubPage extends StatelessWidget {
  const MyLandHubPage({super.key, this.can});

  final bool Function(String)? can;

  @override
  Widget build(BuildContext context) => AreaHubPage(
        area: NavArea.land,
        title: (l) => l.navAreaLand,
        icon: Icons.landscape_outlined,
        can: can,
      );
}
