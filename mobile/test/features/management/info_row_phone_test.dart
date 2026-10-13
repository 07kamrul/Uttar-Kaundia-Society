import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/features/management/presentation/widgets/management_widgets.dart';

import '../../shared/widgets/phone_test_harness.dart';

void main() {
  testWidgets('InfoRow.phone shows the formatted number with actions', (tester) async {
    await tester.pumpWidget(phoneHarness(InfoRow.phone(label: 'Mobile', phone: '01712345678')));

    expect(find.text('Mobile'), findsOneWidget);
    expect(find.text('+880 1712-345678'), findsOneWidget);
    expect(find.byKey(const Key('phoneDisplayCall')), findsOneWidget);
    expect(find.byKey(const Key('phoneDisplayWhatsapp')), findsOneWidget);
    expect(find.byKey(const Key('phoneDisplayCopy')), findsOneWidget);
  });

  testWidgets('InfoRow.phone compact is icon-only', (tester) async {
    await tester.pumpWidget(
      phoneHarness(InfoRow.phone(label: 'Mobile', phone: '+966501234567', compact: true)),
    );
    expect(find.text('+966 50 123 4567'), findsOneWidget);
    expect(find.text('Call'), findsNothing);
    expect(find.byKey(const Key('phoneDisplayCall')), findsOneWidget);
  });

  testWidgets('InfoRow.phone shows a dash for blank numbers', (tester) async {
    await tester.pumpWidget(phoneHarness(InfoRow.phone(label: 'Mobile', phone: null)));
    expect(find.text('—'), findsOneWidget);
    expect(find.byKey(const Key('phoneDisplayCopy')), findsNothing);
  });

  testWidgets('InfoRow.phone shows unparseable text raw without actions', (tester) async {
    await tester.pumpWidget(phoneHarness(InfoRow.phone(label: 'Mobile', phone: 'n/a')));
    expect(find.text('n/a'), findsOneWidget);
    expect(find.byKey(const Key('phoneDisplayCopy')), findsNothing);
  });
}
