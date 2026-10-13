import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/features/registration/data/geo_repository.dart';
import 'package:kaundia_app/features/registration/data/registration_config_repository.dart';
import 'package:kaundia_app/features/registration/data/registration_draft_service.dart';
import 'package:kaundia_app/features/registration/domain/reg_flags.dart';
import 'package:kaundia_app/features/registration/domain/registration_form.dart';
import 'package:kaundia_app/features/registration/presentation/bloc/registration_bloc.dart';
import 'package:kaundia_app/features/registration/presentation/widgets/member_info_step.dart';
import 'package:kaundia_app/features/registration/presentation/widgets/payment_step.dart';
import 'package:kaundia_app/features/registration/presentation/widgets/property_step.dart';
import 'package:kaundia_app/features/registration/presentation/widgets/registration_simple_widgets.dart';
import 'package:kaundia_app/features/registration/presentation/widgets/review_step.dart';
import 'package:kaundia_app/l10n/app_localizations.dart';
import 'package:mocktail/mocktail.dart';

import 'registration_bloc_test.dart';

const _allOn = RegFlags(
  occupationOptional: true,
  hideNationality: true,
  roadOptional: true,
  dagUnknown: true,
  addPropertyButton: true,
  minOneProof: true,
  abroadAddress: true,
  simplifiedUi: true,
);

GeoData _geo() => GeoData(
      divisions: [GeoDivision(id: '1', name: 'Dhaka', bnName: 'ঢাকা')],
      districts: [GeoDistrict(id: '10', divisionId: '1', name: 'Dhaka', bnName: 'ঢাকা')],
      upazilas: [GeoUpazila(districtId: '10', name: 'Savar', bnName: 'সাভার')],
    );

const _accounts = [
  PaymentAccount(method: 'bkash', label: 'বিকাশ', number: '01711111111', accountName: 'Kaundia Society'),
  PaymentAccount(method: 'bank', label: 'ব্যাংক', number: '1071193760001', accountName: 'Society'),
];

Finder _dob(String prefix) => find.byWidgetPredicate(
    (w) => w.key is ValueKey && (w.key as ValueKey).value.toString().startsWith(prefix));

void main() {
  late MockAppPreferences prefs;

  setUp(() {
    prefs = MockAppPreferences();
    when(() => prefs.registrationDraft).thenReturn(null);
    when(() => prefs.setRegistrationDraft(any())).thenAnswer((_) async {});
    when(() => prefs.clearRegistrationDraft()).thenAnswer((_) async {});
  });

  Future<RegistrationBloc> pump(
    WidgetTester tester,
    Widget child,
    RegistrationState state,
  ) async {
    tester.view.physicalSize = const Size(900, 6000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final bloc = RegistrationBloc(
      registrationRepository: MockRegistrationRepository(),
      feeRepository: MockFeeRepository(),
      geoRepository: MockGeoRepository(),
      configListRepository: MockConfigListRepository(),
      draftService: RegistrationDraftService(preferences: prefs),
    );
    addTearDown(bloc.close);
    bloc.emit(state);
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('bn'),
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(
        body: BlocProvider.value(
          value: bloc,
          child: SingleChildScrollView(child: child),
        ),
      ),
    ));
    await tester.pump();
    return bloc;
  }

  Future<void> settle(WidgetTester tester) async {
    await tester.pump(const Duration(seconds: 1));
    await tester.pump();
  }

  RegistrationState readyState({
    RegFlags flags = RegFlags.off,
    RegistrationForm form = const RegistrationForm(),
    int step = 1,
  }) =>
      RegistrationState(
        status: RegistrationStatus.ready,
        flags: flags,
        form: form,
        currentStep: step,
        geoData: _geo(),
        feeStatus: FeeStatus.loaded,
        admissionFee: 500,
        paymentAccounts: _accounts,
        configLoaded: true,
      );

  group('member step: flags off is today\'s form', () {
    testWidgets('date text, nationality field, no WhatsApp or abroad switch', (tester) async {
      await pump(tester, const MemberInfoStep(), readyState());
      expect(find.text('YYYY-MM-DD'), findsOneWidget);
      expect(_dob('dobDay'), findsNothing);
      expect(find.byKey(const Key('whatsappSwitch')), findsNothing);
      expect(find.byKey(const Key('abroadSwitch')), findsNothing);
      expect(find.byKey(const Key('nationalityOtherCheckbox')), findsNothing);
      expect(find.text('বাংলাদেশী'), findsOneWidget); // nationality field value
    });
  });

  group('member step: flags on', () {
    testWidgets('DOB uses দিন/মাস/বছর dropdowns', (tester) async {
      await pump(tester, const MemberInfoStep(), readyState(flags: _allOn));
      expect(_dob('dobDay'), findsOneWidget);
      expect(_dob('dobMonth'), findsOneWidget);
      expect(_dob('dobYear'), findsOneWidget);
      expect(find.text('YYYY-MM-DD'), findsNothing);
    });

    testWidgets('choosing all three DOB parts stores an ISO date', (tester) async {
      final bloc = await pump(tester, const MemberInfoStep(), readyState(flags: _allOn));
      Future<void> choose(String key, String text) async {
        await tester.tap(_dob(key));
        await tester.pumpAndSettle();
        if (key == 'dobYear') {
          await tester.scrollUntilVisible(find.text(text), 100,
              scrollable: find.byType(Scrollable).last);
        }
        await tester.tap(find.text(text).last);
        await tester.pumpAndSettle();
      }

      await choose('dobDay', '৫');
      await choose('dobMonth', 'মার্চ');
      await choose('dobYear', '১৯৯০');
      expect(bloc.state.form.dob, '1990-03-05');
      await settle(tester);
    });

    testWidgets('WhatsApp switch stores has_whatsapp', (tester) async {
      final bloc = await pump(tester, const MemberInfoStep(), readyState(flags: _allOn));
      expect(find.byKey(const Key('whatsappSwitch')), findsOneWidget);
      await tester.tap(find.byKey(const Key('whatsappSwitch')));
      await tester.pump();
      expect(bloc.state.form.hasWhatsapp, isTrue);
      await settle(tester);
    });

    testWidgets('nationality is hidden behind "অন্য দেশের নাগরিক"', (tester) async {
      await pump(tester, const MemberInfoStep(), readyState(flags: _allOn));
      expect(find.byKey(const Key('nationalityOtherCheckbox')), findsOneWidget);
      expect(find.byKey(const Key('nationalityField')), findsNothing);
      await tester.tap(find.byKey(const Key('nationalityOtherCheckbox')));
      await tester.pump();
      expect(find.byKey(const Key('nationalityField')), findsOneWidget);
      await settle(tester);
    });

    testWidgets('NID field is numeric and converts Bangla digits as typed', (tester) async {
      final bloc = await pump(tester, const MemberInfoStep(), readyState(flags: _allOn));
      final nid = find.byKey(const Key('nidField'));
      expect(tester.widget<TextField>(find.descendant(of: nid, matching: find.byType(TextField))).keyboardType,
          TextInputType.number);
      await tester.enterText(find.descendant(of: nid, matching: find.byType(TextField)), '১২৩৪৫৬৭৮৯০');
      await tester.pump();
      expect(bloc.state.form.nid, '1234567890');
      await settle(tester);
    });
  });

  group('abroad address toggle', () {
    testWidgets('on: country, city and free-text replace the BD fields; permanent stays BD',
        (tester) async {
      final bloc = await pump(tester, const MemberInfoStep(), readyState(flags: _allOn));
      expect(find.byKey(const Key('abroadCountryButton')), findsNothing);

      await tester.tap(find.byKey(const Key('abroadSwitch')));
      await tester.pump();

      expect(bloc.state.form.currentAddressAbroad, isTrue);
      expect(find.byKey(const Key('abroadCountryButton')), findsOneWidget);
      expect(find.byKey(const Key('abroadCityField')), findsOneWidget);
      expect(find.byKey(const Key('abroadTextField')), findsOneWidget);
      expect(find.text('স্থায়ী ঠিকানা বাংলাদেশের হতে হবে।'), findsOneWidget);
      // Only the permanent block still has the BD division dropdown.
      expect(find.textContaining('বিভাগ'), findsOneWidget);

      await tester.enterText(
          find.descendant(of: find.byKey(const Key('abroadCityField')), matching: find.byType(TextField)),
          'Riyadh');
      await tester.pump();
      expect(bloc.state.form.currentCity, 'Riyadh');
      await settle(tester);
    });

    testWidgets('off: BD current address as before', (tester) async {
      final bloc = await pump(tester, const MemberInfoStep(),
          readyState(flags: _allOn, form: const RegistrationForm(currentAddressAbroad: true)));
      await tester.tap(find.byKey(const Key('abroadSwitch')));
      await tester.pump();
      expect(bloc.state.form.currentAddressAbroad, isFalse);
      expect(find.byKey(const Key('abroadCountryButton')), findsNothing);
      await settle(tester);
    });

    testWidgets('flag off: no switch even if the form says abroad', (tester) async {
      await pump(tester, const MemberInfoStep(),
          readyState(form: const RegistrationForm(currentAddressAbroad: true)));
      expect(find.byKey(const Key('abroadSwitch')), findsNothing);
      expect(find.byKey(const Key('abroadCountryButton')), findsNothing);
    });
  });

  group('property step', () {
    final oneProperty = RegistrationForm(propertyCount: 1, properties: const [PropertyItem()]);

    testWidgets('flags off: count dropdown, no add button, no dag-unknown, checkbox docs',
        (tester) async {
      await pump(tester, const PropertyStep(), readyState(form: oneProperty));
      expect(find.byKey(const Key('addPropertyButton')), findsNothing);
      expect(find.byKey(const Key('dagUnknownCheckbox_0')), findsNothing);
      expect(find.byKey(const Key('proofSection_0')), findsNothing);
      expect(find.textContaining('সম্পত্তির সংখ্যা'), findsOneWidget);
    });

    testWidgets('khatian and dag use a text keyboard (so "/" is typeable) and normalise digits',
        (tester) async {
      final bloc = await pump(
          tester,
          const PropertyStep(),
          readyState(
              flags: const RegFlags(simplifiedUi: true),
              form: RegistrationForm(propertyCount: 1, properties: const [PropertyItem()])));
      final fields = find.byType(TextField);
      final text = tester.widgetList<TextField>(fields).where((f) => f.keyboardType == TextInputType.text);
      expect(text.length, greaterThanOrEqualTo(3)); // khatian, CS, RS
      await tester.enterText(fields.at(0), '১২/৩');
      await tester.pump();
      expect(bloc.state.form.properties.single.khatianNo, '12/3');
      await settle(tester);
    });

    testWidgets('add-property button adds and removes cards', (tester) async {
      final bloc = await pump(tester, const PropertyStep(),
          readyState(flags: const RegFlags(addPropertyButton: true), form: oneProperty));
      expect(find.textContaining('সম্পত্তির সংখ্যা'), findsNothing);
      expect(find.byKey(const Key('removeProperty_0')), findsNothing); // never below one

      await tester.tap(find.byKey(const Key('addPropertyButton')));
      await tester.pump();
      expect(bloc.state.form.properties, hasLength(2));

      await tester.tap(find.byKey(const Key('removeProperty_1')));
      await tester.pump();
      expect(bloc.state.form.properties, hasLength(1));
      await settle(tester);
    });

    testWidgets('dag-unknown checkbox toggles and dims the dag requirement', (tester) async {
      final bloc = await pump(tester, const PropertyStep(),
          readyState(flags: const RegFlags(dagUnknown: true), form: oneProperty));
      await tester.tap(find.byKey(const Key('dagUnknownCheckbox_0')));
      await tester.pump();
      expect(bloc.state.form.properties.single.dagUnknown, isTrue);
      await tester.tap(find.byKey(const Key('dagUnknownCheckbox_0')));
      await tester.pump();
      expect(bloc.state.form.properties.single.dagUnknown, isFalse);
      await settle(tester);
    });

    testWidgets('help link opens a sheet with the schematic illustration', (tester) async {
      await pump(tester, const PropertyStep(),
          readyState(flags: const RegFlags(dagUnknown: true), form: oneProperty));
      expect(find.byKey(const Key('dagHelpIllustration')), findsNothing);
      await tester.tap(find.byKey(const Key('dagHelpLink_0')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('dagHelpIllustration')), findsOneWidget);
      expect(find.text('আমার দাগ কোথায় পাব?'), findsWidgets);
      await tester.tap(find.text('বুঝেছি'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('dagHelpIllustration')), findsNothing);
    });

    testWidgets('min-one-proof shows a single proof section instead of per-doc checkboxes',
        (tester) async {
      await pump(tester, const PropertyStep(),
          readyState(flags: const RegFlags(minOneProof: true), form: oneProperty));
      expect(find.byKey(const Key('proofSection_0')), findsOneWidget);
      expect(find.textContaining('জমির প্রমাণ (কমপক্ষে একটি)'), findsOneWidget);
    });
  });

  group('payment step (simplified)', () {
    testWidgets('fee is read-only text in taka with Bangla digits', (tester) async {
      await pump(tester, const PaymentStep(), readyState(flags: _allOn));
      expect(find.byKey(const Key('admissionFeeText')), findsOneWidget);
      expect(find.text('৳ ৫০০'), findsOneWidget);
    });

    testWidgets('six method cards with Bangla labels', (tester) async {
      await pump(tester, const PaymentStep(), readyState(flags: _allOn));
      for (final label in ['নগদ টাকা', 'বিকাশ', 'নগদ (MFS)', 'রকেট', 'ব্যাংক', 'অন্যান্য']) {
        expect(find.descendant(of: find.byKey(const Key('paymentMethodCards')), matching: find.text(label)),
            findsOneWidget,
            reason: label);
      }
    });

    testWidgets('reference label switches with the method', (tester) async {
      final bloc = await pump(tester, const PaymentStep(), readyState(flags: _allOn));
      expect(find.text('ট্রানজেকশন আইডি (TrxID)'), findsNothing);
      expect(find.text('রসিদ নম্বর'), findsOneWidget); // none chosen yet -> receipt number

      await tester.tap(find.byKey(const Key('payMethod_bkash')));
      await tester.pump();
      expect(bloc.state.form.paymentMethod, PaymentMethod.bkash);
      expect(find.text('ট্রানজেকশন আইডি (TrxID)'), findsOneWidget);
      expect(find.text('রসিদ নম্বর'), findsNothing);

      for (final key in ['nagad', 'rocket']) {
        await tester.tap(find.byKey(Key('payMethod_$key')));
        await tester.pump();
        expect(find.text('ট্রানজেকশন আইডি (TrxID)'), findsOneWidget, reason: key);
      }
      for (final key in ['cash', 'bank', 'other']) {
        await tester.tap(find.byKey(Key('payMethod_$key')));
        await tester.pump();
        expect(find.text('রসিদ নম্বর'), findsOneWidget, reason: key);
        expect(find.text('ট্রানজেকশন আইডি (TrxID)'), findsNothing, reason: key);
      }
      await settle(tester);
    });

    testWidgets('account details come from the config and can be copied', (tester) async {
      final copied = <String>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'Clipboard.setData') {
          copied.add((call.arguments as Map)['text'] as String);
        }
        return null;
      });
      addTearDown(() =>
          tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));

      await pump(tester, const PaymentStep(),
          readyState(flags: _allOn, form: const RegistrationForm(paymentMethod: PaymentMethod.bkash)));
      expect(find.text('01711111111'), findsOneWidget);
      expect(find.text('Kaundia Society'), findsOneWidget);
      expect(find.text('1071193760001'), findsNothing); // bank account is not shown for bKash

      await tester.tap(find.byKey(const Key('copy_01711111111')));
      await tester.pump();
      expect(copied, ['01711111111']);
      expect(find.text('কপি হয়েছে'), findsOneWidget);
      await tester.pump(const Duration(seconds: 5));
    });

    testWidgets('cash shows no account box', (tester) async {
      await pump(tester, const PaymentStep(),
          readyState(flags: _allOn, form: const RegistrationForm(paymentMethod: PaymentMethod.cash)));
      expect(find.text('01711111111'), findsNothing);
      expect(find.byKey(const Key('paymentAccounts')), findsNothing);
    });

    testWidgets('abroad note appears only for members living abroad', (tester) async {
      await pump(tester, const PaymentStep(), readyState(flags: _allOn));
      expect(find.byKey(const Key('abroadPaymentNote')), findsNothing);
    });

    testWidgets('abroad note text', (tester) async {
      await pump(tester, const PaymentStep(),
          readyState(flags: _allOn, form: const RegistrationForm(currentAddressAbroad: true)));
      expect(find.byKey(const Key('abroadPaymentNote')), findsOneWidget);
      expect(
          find.text(
              'বিদেশে থাকলে বাংলাদেশে থাকা কোনো আত্মীয় আপনার হয়ে টাকা দিতে পারেন। ট্রানজেকশন আইডি বা রসিদ নম্বর আর স্ক্রিনশট দিন।'),
          findsOneWidget);
    });

    testWidgets('screenshot upload label', (tester) async {
      await pump(tester, const PaymentStep(), readyState(flags: _allOn));
      expect(find.text('পেমেন্টের স্ক্রিনশট দিন'), findsWidgets);
    });
  });

  group('payment step flags off', () {
    testWidgets('legacy checkbox methods and mixed-language reference label', (tester) async {
      await pump(tester, const PaymentStep(), readyState());
      expect(find.byKey(const Key('paymentMethodCards')), findsNothing);
      expect(find.text('রসিদ নং/Transaction ID'), findsOneWidget);
      expect(find.byKey(const Key('admissionFeeField')), findsOneWidget);
    });
  });

  group('step header, draft line, review, success', () {
    testWidgets('header reads "ধাপ ২ / ৬ — সম্পত্তি"', (tester) async {
      await pump(tester, const RegStepHeader(step: 2), readyState(flags: _allOn, step: 2));
      expect(find.text('ধাপ ২ / ৬ — সম্পত্তি'), findsOneWidget);
    });

    testWidgets('draft line uses the contract copy', (tester) async {
      await pump(tester, const RegDraftSavedLine(), readyState(flags: _allOn));
      expect(find.text('আপনার তথ্য সংরক্ষিত আছে, পরে আবার এসে শেষ করতে পারেন।'), findsOneWidget);
    });

    testWidgets('review has a "পরিবর্তন করুন" link per section that jumps to its step',
        (tester) async {
      final bloc = await pump(tester, const ReviewStep(), readyState(flags: _allOn, step: 6));
      expect(find.text('পরিবর্তন করুন'), findsNWidgets(7));
      await tester.tap(find.text('পরিবর্তন করুন').at(3));
      await tester.pump();
      expect(bloc.state.currentStep, 2);
      await settle(tester);
    });

    testWidgets('review flags off keeps the old edit label', (tester) async {
      await pump(tester, const ReviewStep(), readyState(step: 6));
      expect(find.text('পরিবর্তন করুন'), findsNothing);
      expect(find.text('সম্পাদনা করুন'), findsWidgets);
    });

    testWidgets('success screen: three plain lines and a copyable reference', (tester) async {
      final copied = <String>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'Clipboard.setData') copied.add((call.arguments as Map)['text'] as String);
        return null;
      });
      addTearDown(() =>
          tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));

      await pump(tester, RegistrationSuccessView(reference: 'REF-2026-0042', onHome: () {}),
          readyState(flags: _allOn));
      expect(find.text('আবেদন জমা হয়েছে'), findsOneWidget);
      expect(find.text('অফিস আপনার তথ্য যাচাই করবে'), findsOneWidget);
      expect(find.text('আনুমানিক ২০ কর্মদিবসের মধ্যে জানানো হবে'), findsOneWidget);
      expect(find.text('REF-2026-0042'), findsOneWidget);

      await tester.tap(find.byKey(const Key('successCopyReference')));
      await tester.pump();
      expect(copied, ['REF-2026-0042']);
      await tester.pump(const Duration(seconds: 5));
    });
  });
}
