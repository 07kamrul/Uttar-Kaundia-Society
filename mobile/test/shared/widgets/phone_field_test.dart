import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/shared/widgets/phone_field.dart';

import 'phone_test_harness.dart';

/// Hosts a PhoneField the way a form would: value flows back in via onChanged.
class _Host extends StatefulWidget {
  const _Host({required this.log, this.initial = '', this.errorText});
  final List<String> log;
  final String initial;
  final String? errorText;

  @override
  State<_Host> createState() => _HostState();
}

class _HostState extends State<_Host> {
  late String value = widget.initial;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          PhoneField(
            label: 'Mobile',
            value: value,
            errorText: widget.errorText,
            onChanged: (v) {
              widget.log.add(v);
              setState(() => value = v);
            },
          ),
          const TextField(key: Key('other')),
          TextButton(
            key: const Key('setExternal'),
            onPressed: () => setState(() => value = '+966501234567'),
            child: const Text('external'),
          ),
        ],
      );
}

final _countryButton = find.byKey(const Key('phoneFieldCountryButton'));
final _numberField = find.byKey(const Key('phoneFieldNumber'));

String _numberText(WidgetTester tester) => tester.widget<TextField>(_numberField).controller!.text;

Finder _inButton(String text) => find.descendant(of: _countryButton, matching: find.text(text));

void main() {
  testWidgets('defaults to Bangladesh +880 and emits E.164 for a national number', (tester) async {
    final log = <String>[];
    await tester.pumpWidget(phoneHarness(_Host(log: log)));

    expect(_inButton('+880'), findsOneWidget);
    expect(_inButton('\u{1F1E7}\u{1F1E9}'), findsOneWidget);

    await tester.enterText(_numberField, '01712345678');
    expect(log.last, '+8801712345678');
  });

  testWidgets('accepts Bangla digits and separators', (tester) async {
    final log = <String>[];
    await tester.pumpWidget(phoneHarness(_Host(log: log)));

    await tester.enterText(_numberField, '০১৭১২-৩৪৫ ৬৭৮');
    expect(log.last, '+8801712345678');
  });

  testWidgets('uses the phone keyboard and filters out letters', (tester) async {
    await tester.pumpWidget(phoneHarness(_Host(log: <String>[])));

    expect(tester.widget<TextField>(_numberField).keyboardType, TextInputType.phone);
    await tester.enterText(_numberField, '0171abc2345678');
    expect(_numberText(tester), '01712345678');
  });

  testWidgets('pasting a +966 number switches the country to Saudi Arabia', (tester) async {
    final log = <String>[];
    await tester.pumpWidget(phoneHarness(_Host(log: log)));

    await tester.enterText(_numberField, '+966 50 123 4567');
    await tester.pump();

    expect(log.last, '+966501234567');
    expect(_inButton('+966'), findsOneWidget);
    expect(_inButton('+880'), findsNothing);
  });

  testWidgets('pasting a +44 mobile selects the United Kingdom, not Guernsey', (tester) async {
    final log = <String>[];
    await tester.pumpWidget(phoneHarness(_Host(log: log)));

    await tester.enterText(_numberField, '+44 7911 123456');
    await tester.pump();

    expect(log.last, '+447911123456');
    expect(_inButton('+44'), findsOneWidget);
    expect(_inButton('\u{1F1EC}\u{1F1E7}'), findsOneWidget);
  });

  testWidgets('00-prefixed paste also switches country', (tester) async {
    final log = <String>[];
    await tester.pumpWidget(phoneHarness(_Host(log: log)));

    await tester.enterText(_numberField, '0044 7911 123456');
    await tester.pump();
    expect(log.last, '+447911123456');
    expect(_inButton('+44'), findsOneWidget);
  });

  testWidgets('country sheet lists pinned countries in order; picking one recomputes the value',
      (tester) async {
    final log = <String>[];
    await tester.pumpWidget(phoneHarness(_Host(log: log)));
    await tester.enterText(_numberField, '0501234567');

    await tester.tap(_countryButton);
    await tester.pumpAndSettle();

    final names = [
      'Bangladesh',
      'Saudi Arabia',
      'United Arab Emirates',
      'Qatar',
      'Kuwait',
      'Oman',
      'Bahrain',
    ];
    final ys = [for (final n in names) tester.getTopLeft(find.text(n)).dy];
    expect(ys, [...ys]..sort());
    expect(ys.toSet().length, ys.length);

    await tester.tap(find.byKey(const Key('phoneCountry-SA')));
    await tester.pumpAndSettle();

    expect(_inButton('+966'), findsOneWidget);
    expect(log.last, '+966501234567');
  });

  testWidgets('sheet search filters the full list and shows an empty state', (tester) async {
    await tester.pumpWidget(phoneHarness(_Host(log: <String>[])));
    await tester.tap(_countryButton);
    await tester.pumpAndSettle();

    final search = find.byKey(const Key('phoneCountrySearch'));
    await tester.enterText(search, 'saudi');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('phoneCountry-SA')), findsOneWidget);
    expect(find.byKey(const Key('phoneCountry-BD')), findsNothing);

    await tester.enterText(search, 'zzzzzz');
    await tester.pumpAndSettle();
    expect(find.text('No country found'), findsOneWidget);

    await tester.enterText(search, '+39');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('phoneCountry-IT')), findsOneWidget);
  });

  testWidgets('sheet shows Bangla country names in the bn locale', (tester) async {
    await tester.pumpWidget(phoneHarness(_Host(log: <String>[]), lang: 'bn'));
    await tester.tap(_countryButton);
    await tester.pumpAndSettle();

    expect(find.text('বাংলাদেশ'), findsOneWidget);
    expect(find.text('সৌদি আরব'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('যুক্তরাজ্য'),
      100,
      scrollable: find.descendant(of: find.byType(ListView), matching: find.byType(Scrollable)).first,
    );
    expect(find.text('যুক্তরাজ্য'), findsOneWidget);
  });

  testWidgets('seeds country and number from a stored E.164 value', (tester) async {
    await tester.pumpWidget(phoneHarness(_Host(log: <String>[], initial: '+966501234567')));
    expect(_inButton('+966'), findsOneWidget);
    expect(_numberText(tester), '0501234567');
  });

  testWidgets('seeds a legacy national value as a Bangladeshi number', (tester) async {
    await tester.pumpWidget(phoneHarness(_Host(log: <String>[], initial: '01712345678')));
    expect(_inButton('+880'), findsOneWidget);
    expect(_numberText(tester), '01712345678');
  });

  testWidgets('re-syncs when the parent changes the value externally', (tester) async {
    await tester.pumpWidget(phoneHarness(_Host(log: <String>[], initial: '+8801712345678')));
    await tester.tap(find.byKey(const Key('setExternal')));
    await tester.pump();
    expect(_inButton('+966'), findsOneWidget);
    expect(_numberText(tester), '0501234567');
  });

  testWidgets('does not rewrite what the user is typing', (tester) async {
    await tester.pumpWidget(phoneHarness(_Host(log: <String>[])));
    await tester.enterText(_numberField, '017 1234');
    await tester.pump();
    expect(_numberText(tester), '017 1234');
  });

  testWidgets('an invalid number shows a localized error after the field loses focus', (tester) async {
    await tester.pumpWidget(phoneHarness(_Host(log: <String>[])));
    await tester.tap(_numberField);
    await tester.enterText(_numberField, '12345');
    await tester.pump();
    expect(find.textContaining('not valid'), findsNothing, reason: 'no nagging while typing');

    await tester.tap(find.byKey(const Key('other')));
    await tester.pump();
    expect(find.textContaining('not valid'), findsOneWidget);
  });

  testWidgets('a possible-but-unknown number only warns', (tester) async {
    final log = <String>[];
    await tester.pumpWidget(phoneHarness(_Host(log: log)));
    await tester.tap(_numberField);
    await tester.enterText(_numberField, '01212345678');
    await tester.tap(find.byKey(const Key('other')));
    await tester.pump();

    expect(log.last, '+8801212345678');
    expect(find.textContaining('does not match a known number range'), findsOneWidget);
    expect(find.textContaining('not valid'), findsNothing);
  });

  testWidgets('a valid number shows neither error nor warning', (tester) async {
    await tester.pumpWidget(phoneHarness(_Host(log: <String>[])));
    await tester.tap(_numberField);
    await tester.enterText(_numberField, '01712345678');
    await tester.tap(find.byKey(const Key('other')));
    await tester.pump();
    expect(find.textContaining('not valid'), findsNothing);
    expect(find.textContaining('known number range'), findsNothing);
  });

  testWidgets('an external errorText wins over the built-in message', (tester) async {
    await tester.pumpWidget(phoneHarness(_Host(log: <String>[], errorText: 'Mobile is required')));
    expect(find.text('Mobile is required'), findsOneWidget);
  });

  testWidgets('country button and number field meet 48dp tap targets', (tester) async {
    await tester.pumpWidget(phoneHarness(_Host(log: <String>[])));
    final button = tester.getSize(_countryButton);
    expect(button.height, greaterThanOrEqualTo(48));
    expect(button.width, greaterThanOrEqualTo(48));
    expect(tester.getSize(_numberField).height, greaterThanOrEqualTo(48));
  });

  testWidgets('shows a national example as the hint for the selected country', (tester) async {
    await tester.pumpWidget(phoneHarness(_Host(log: <String>[])));
    final hint = tester.widget<TextField>(_numberField).decoration!.hintText;
    expect(hint, isNotNull);
    expect(hint, startsWith('01'));
  });

  testWidgets('clearing the text emits an empty string', (tester) async {
    final log = <String>[];
    await tester.pumpWidget(phoneHarness(_Host(log: log, initial: '+8801712345678')));
    await tester.enterText(_numberField, '');
    expect(log.last, '');
  });
}
