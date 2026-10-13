import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/shared/utils/external_link_launcher.dart';
import 'package:kaundia_app/shared/widgets/phone_display.dart';

import 'phone_test_harness.dart';

class _FakeLauncher implements ExternalLinkLauncher {
  _FakeLauncher({this.succeed = true});
  final bool succeed;
  final opened = <Uri>[];

  @override
  Future<bool> open(Uri uri) async {
    opened.add(uri);
    return succeed;
  }
}

final _call = find.byKey(const Key('phoneDisplayCall'));
final _whatsapp = find.byKey(const Key('phoneDisplayWhatsapp'));
final _copy = find.byKey(const Key('phoneDisplayCopy'));

List<String> _mockClipboard(WidgetTester tester) {
  final copied = <String>[];
  tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
    if (call.method == 'Clipboard.setData') {
      copied.add((call.arguments as Map)['text'] as String);
    }
    return null;
  });
  addTearDown(
    () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null),
  );
  return copied;
}

void main() {
  testWidgets('shows the formatted number with call, WhatsApp and copy actions', (tester) async {
    await tester.pumpWidget(phoneHarness(PhoneDisplay('+8801712345678', launcher: _FakeLauncher())));

    expect(find.text('+880 1712-345678'), findsOneWidget);
    expect(find.text('Call'), findsOneWidget);
    expect(find.text('WhatsApp'), findsOneWidget);
    expect(_call, findsOneWidget);
    expect(_whatsapp, findsOneWidget);
    expect(_copy, findsOneWidget);
  });

  testWidgets('Bangla locale shows Bangla digits and labels', (tester) async {
    await tester.pumpWidget(
      phoneHarness(PhoneDisplay('+8801712345678', launcher: _FakeLauncher()), lang: 'bn'),
    );
    expect(find.text('+৮৮০ ১৭১২-৩৪৫৬৭৮'), findsOneWidget);
    expect(find.text('হোয়াটসঅ্যাপ'), findsOneWidget);
  });

  testWidgets('call opens the tel: link', (tester) async {
    final launcher = _FakeLauncher();
    await tester.pumpWidget(phoneHarness(PhoneDisplay('01712345678', launcher: launcher)));
    await tester.tap(_call);
    await tester.pump();
    expect(launcher.opened.single.toString(), 'tel:+8801712345678');
  });

  testWidgets('WhatsApp opens the wa.me link', (tester) async {
    final launcher = _FakeLauncher();
    await tester.pumpWidget(phoneHarness(PhoneDisplay('+966501234567', launcher: launcher)));
    await tester.tap(_whatsapp);
    await tester.pump();
    expect(launcher.opened.single.toString(), 'https://wa.me/966501234567');
  });

  testWidgets('a launcher failure shows an error toast', (tester) async {
    await tester.pumpWidget(
      phoneHarness(PhoneDisplay('+8801712345678', launcher: _FakeLauncher(succeed: false))),
    );
    await tester.tap(_call);
    await tester.pump();
    expect(find.text('Could not open the dialer or WhatsApp.'), findsOneWidget);
  });

  testWidgets('copy puts the E.164 value on the clipboard and shows the Bangla toast', (tester) async {
    final copied = _mockClipboard(tester);
    await tester.pumpWidget(
      phoneHarness(PhoneDisplay('০১৭১২৩৪৫৬৭৮', launcher: _FakeLauncher()), lang: 'bn'),
    );

    await tester.tap(_copy);
    await tester.pump();

    expect(copied, ['+8801712345678']);
    expect(find.text('কপি হয়েছে'), findsOneWidget);
  });

  testWidgets('unparseable text is shown raw with no actions', (tester) async {
    await tester.pumpWidget(phoneHarness(PhoneDisplay('call after 5pm', launcher: _FakeLauncher())));
    expect(find.text('call after 5pm'), findsOneWidget);
    expect(_call, findsNothing);
    expect(_whatsapp, findsNothing);
    expect(_copy, findsNothing);
  });

  testWidgets('a possible-only number is formatted and copyable but not dialable', (tester) async {
    await tester.pumpWidget(phoneHarness(PhoneDisplay('+8801212345678', launcher: _FakeLauncher())));
    expect(find.text('+880 1212-345678'), findsOneWidget);
    expect(_copy, findsOneWidget);
    expect(_call, findsNothing);
    expect(_whatsapp, findsNothing);
  });

  testWidgets('null and blank render nothing', (tester) async {
    await tester.pumpWidget(phoneHarness(PhoneDisplay(null, launcher: _FakeLauncher())));
    expect(find.byType(Text), findsNothing);
    await tester.pumpWidget(phoneHarness(PhoneDisplay('  ', launcher: _FakeLauncher())));
    expect(find.byType(Text), findsNothing);
  });

  testWidgets('compact mode keeps icon actions with 48dp tap targets', (tester) async {
    await tester.pumpWidget(
      phoneHarness(PhoneDisplay('+8801712345678', compact: true, launcher: _FakeLauncher())),
    );
    expect(find.text('+880 1712-345678'), findsOneWidget);
    for (final f in [_call, _whatsapp, _copy]) {
      expect(tester.getSize(f).height, greaterThanOrEqualTo(48));
      expect(tester.getSize(f).width, greaterThanOrEqualTo(48));
    }
  });

  testWidgets('actions can be hidden (contact kept private)', (tester) async {
    await tester.pumpWidget(
      phoneHarness(
        PhoneDisplay('+8801712345678', actions: PhoneActions.none, launcher: _FakeLauncher()),
      ),
    );
    expect(find.text('+880 1712-345678'), findsOneWidget);
    expect(_call, findsNothing);
    expect(_copy, findsNothing);
  });

  testWidgets('copyOnly keeps the copy button and drops call and WhatsApp', (tester) async {
    final copied = _mockClipboard(tester);
    await tester.pumpWidget(
      phoneHarness(
        PhoneDisplay('+8801712345678', actions: PhoneActions.copyOnly, launcher: _FakeLauncher()),
      ),
    );
    expect(_call, findsNothing);
    expect(_whatsapp, findsNothing);
    await tester.tap(_copy);
    await tester.pump();
    expect(copied, ['+8801712345678']);
  });
}
