import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/helpline/helpline_repository.dart';
import 'package:kaundia_app/core/network/api_client.dart';
import 'package:kaundia_app/features/settings/help_fab.dart';
import 'package:kaundia_app/l10n/app_localizations_bn.dart';
import 'package:kaundia_app/shared/utils/external_link_launcher.dart';
import 'package:mocktail/mocktail.dart';

import '../../support/pump_app.dart';

class _MockApi extends Mock implements ApiClient {}

class _Repo extends HelplineRepository {
  _Repo(this.value) : super(apiClient: _MockApi());
  final Helpline value;
  @override
  Future<Helpline> load() async => value;
}

class _Launcher implements ExternalLinkLauncher {
  final opened = <Uri>[];
  @override
  Future<bool> open(Uri uri) async {
    opened.add(uri);
    return true;
  }
}

void main() {
  final bn = AppLocalizationsBn();

  testWidgets('call and WhatsApp open the tel: and wa.me links', (tester) async {
    final launcher = _Launcher();
    await pumpBn(
      tester,
      Stack(children: [
        Positioned(
          right: 0,
          bottom: 0,
          child: HelpFab(
            repository: _Repo(const Helpline(phone: '+8801712345678', whatsapp: '+8801812345678', hoursText: '১০টা-৬টা', enabled: true)),
            launcher: launcher,
          ),
        ),
      ]),
    );

    await tester.tap(find.byKey(const Key('helpFab')));
    await tester.pumpAndSettle();
    expect(find.text(bn.helpHours('১০টা-৬টা')), findsOneWidget);

    await tester.tap(find.text(bn.helpCall));
    await tester.pumpAndSettle();
    expect(launcher.opened.single.toString(), 'tel:+8801712345678');

    await tester.tap(find.byKey(const Key('helpFab')));
    await tester.pumpAndSettle();
    await tester.tap(find.text(bn.helpWhatsapp));
    await tester.pumpAndSettle();
    expect(launcher.opened.last.toString(), 'https://wa.me/8801812345678');
  });

  testWidgets('renders nothing for an empty helpline', (tester) async {
    await pumpBn(tester, HelpFab(repository: _Repo(Helpline.empty), launcher: _Launcher()));
    expect(find.byKey(const Key('helpFab')), findsNothing);
  });
}
