import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/features/registration/presentation/widgets/registration_inputs.dart';

import '../../shared/widgets/phone_test_harness.dart';

void main() {
  testWidgets('RegPhoneField shows its label and emits E.164 for pasted international numbers',
      (tester) async {
    final log = <String>[];
    await tester.pumpWidget(
      phoneHarness(
        RegPhoneField(label: 'Mobile (WhatsApp)', required: true, value: '', onChanged: log.add),
      ),
    );

    expect(find.textContaining('Mobile (WhatsApp)'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('phoneFieldNumber')), '+966 50 123 4567');
    expect(log.last, '+966501234567');
  });

  testWidgets('RegPhoneField shows the bloc-driven error message', (tester) async {
    await tester.pumpWidget(
      phoneHarness(
        RegPhoneField(label: 'Mobile', value: '', error: 'Enter your mobile number', onChanged: (_) {}),
      ),
    );
    expect(find.text('Enter your mobile number'), findsOneWidget);
  });

  testWidgets('RegPhoneField ignores an empty error string', (tester) async {
    await tester.pumpWidget(
      phoneHarness(RegPhoneField(label: 'Mobile', value: '', error: '', onChanged: (_) {})),
    );
    expect(find.byType(TextField), findsOneWidget);
    expect(tester.widget<TextField>(find.byType(TextField)).decoration!.errorText, isNull);
  });
}
