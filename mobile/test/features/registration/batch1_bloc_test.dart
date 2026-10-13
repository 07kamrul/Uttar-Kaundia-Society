import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/features/registration/data/geo_repository.dart';
import 'package:kaundia_app/features/registration/data/registration_config_repository.dart';
import 'package:kaundia_app/features/registration/data/registration_draft_service.dart';
import 'package:kaundia_app/features/registration/domain/reg_flags.dart';
import 'package:kaundia_app/features/registration/domain/registration_form.dart';
import 'package:kaundia_app/features/registration/presentation/bloc/registration_bloc.dart';
import 'package:kaundia_app/features/registration/domain/registration_validators.dart';
import 'package:mocktail/mocktail.dart';

import 'registration_bloc_test.dart';

class _MockConfigRepo extends Mock implements RegistrationConfigRepository {}

void main() {
  late MockRegistrationRepository submitRepo;
  late MockFeeRepository feeRepo;
  late MockGeoRepository geoRepo;
  late MockConfigListRepository listRepo;
  late MockAppPreferences prefs;
  late _MockConfigRepo configRepo;

  setUpAll(() {
    registerFallbackValue(RegistrationForm());
  });

  setUp(() {
    submitRepo = MockRegistrationRepository();
    feeRepo = MockFeeRepository();
    geoRepo = MockGeoRepository();
    listRepo = MockConfigListRepository();
    prefs = MockAppPreferences();
    configRepo = _MockConfigRepo();
    when(() => feeRepo.getAdmissionFee()).thenAnswer((_) async => 500.0);
    when(() => geoRepo.load()).thenAnswer((_) async =>
        GeoData(divisions: const [], districts: const [], upazilas: const []));
    when(() => listRepo.getValues(any(), any()))
        .thenAnswer((i) async => i.positionalArguments[1] as List<String>);
    when(() => prefs.registrationDraft).thenReturn(null);
    when(() => prefs.setRegistrationDraft(any())).thenAnswer((_) async {});
    when(() => prefs.clearRegistrationDraft()).thenAnswer((_) async {});
    when(() => configRepo.load()).thenAnswer((_) async => const RegistrationConfig(
          consentVersion: '2026-10',
          paymentAccounts: [
            PaymentAccount(method: 'bkash', label: 'bKash', number: '01700000000', accountName: 'Society'),
          ],
        ));
  });

  RegistrationBloc build(RegFlags flags) => RegistrationBloc(
        registrationRepository: submitRepo,
        feeRepository: feeRepo,
        geoRepository: geoRepo,
        configListRepository: listRepo,
        draftService: RegistrationDraftService(preferences: prefs),
        flags: flags,
        registrationConfigRepository: configRepo,
        shrinkImage: (path) async => path,
      );

  Future<RegistrationBloc> started(RegFlags flags) async {
    final bloc = build(flags);
    addTearDown(bloc.close);
    bloc.add(const RegistrationStarted());
    await bloc.stream.firstWhere((s) => s.geoData != null && s.configLoaded == flags.simplifiedUi);
    return bloc;
  }

  Future<void> settle() => Future<void>.delayed(const Duration(milliseconds: 20));

  group('flags off keeps today\'s behaviour', () {
    test('no defaults, no config request, no preset property', () async {
      final bloc = build(RegFlags.off);
      addTearDown(bloc.close);
      bloc.add(const RegistrationStarted());
      await bloc.stream.firstWhere((s) => s.geoData != null);
      await settle();
      final f = bloc.state.form;
      expect(f.currentAddress.isEmpty, isTrue);
      expect(f.permanentAddress.isEmpty, isTrue);
      expect(f.sameAsCurrentAddress, isFalse);
      expect(f.hasWhatsapp, isNull);
      expect(f.properties, isEmpty);
      expect(bloc.state.paymentAccounts, isEmpty);
      verifyNever(() => configRepo.load());
    });

    test('Bangla digits are kept as typed and current edits do not touch permanent', () async {
      final bloc = await started(RegFlags.off);
      bloc.add(const MemberFieldChanged(MemberField.nid, '১২৩'));
      bloc.add(const AddressFieldChanged(isCurrent: true, field: AddressField.house, value: '5'));
      await settle();
      expect(bloc.state.form.nid, '১২৩');
      expect(bloc.state.form.permanentAddress.house, '');
    });
  });

  group('regSimplifiedUi', () {
    const flags = RegFlags(simplifiedUi: true);

    test('defaults to ঢাকা → সাভার, same-as-current on, WhatsApp answered', () async {
      final bloc = await started(flags);
      final f = bloc.state.form;
      expect(f.currentAddress.division, 'ঢাকা');
      expect(f.currentAddress.district, 'ঢাকা');
      expect(f.currentAddress.upazila, 'সাভার');
      expect(f.permanentAddress, f.currentAddress);
      expect(f.sameAsCurrentAddress, isTrue);
      expect(f.hasWhatsapp, isFalse);
    });

    test('loads the registration config (consent version + payment accounts)', () async {
      final bloc = await started(flags);
      expect(bloc.state.consentVersion, '2026-10');
      expect(bloc.state.paymentAccounts.single.number, '01700000000');
    });

    test('a restored draft is not overwritten by the defaults', () async {
      when(() => prefs.registrationDraft).thenReturn(
          '{"schemaVersion":1,"currentStep":2,"lastSaved":"x","formValue":{"fullName":"A","currentAddress":{"division":"রাজশাহী"}}}');
      final bloc = await started(flags);
      expect(bloc.state.form.currentAddress.division, 'রাজশাহী');
      expect(bloc.state.form.sameAsCurrentAddress, isFalse);
    });

    test('current address edits mirror into permanent while same-as-current is on', () async {
      final bloc = await started(flags);
      bloc.add(const AddressFieldChanged(isCurrent: true, field: AddressField.house, value: '7'));
      await settle();
      expect(bloc.state.form.permanentAddress.house, '7');

      bloc.add(const SameAsCurrentToggled(false));
      bloc.add(const AddressFieldChanged(isCurrent: true, field: AddressField.house, value: '8'));
      await settle();
      expect(bloc.state.form.permanentAddress.house, '7');
    });

    test('NID, khatian, dag and land digits are normalised to ASCII', () async {
      final bloc = await started(flags);
      bloc.add(const MemberFieldChanged(MemberField.nid, '১২৩৪৫৬৭৮৯০'));
      bloc.add(const PropertyCountChanged(1));
      bloc.add(const PropertyFieldChanged(0, PropertyField.khatianNo, '২২১৪'));
      bloc.add(const PropertyFieldChanged(0, PropertyField.dagNoCs, '৩৪৫'));
      bloc.add(const PropertyFieldChanged(0, PropertyField.dagNoRs, '৪৫৬'));
      bloc.add(const PropertyFieldChanged(0, PropertyField.landQuantity, '১২.৫'));
      bloc.add(const PropertyFieldChanged(0, PropertyField.myShareQuantity, '৬'));
      await settle();
      final p = bloc.state.form.properties.single;
      expect(bloc.state.form.nid, '1234567890');
      expect([p.khatianNo, p.dagNoCs, p.dagNoRs, p.landQuantity, p.myShareQuantity],
          ['2214', '345', '456', '12.5', '6']);
    });

    test('WhatsApp switch is stored', () async {
      final bloc = await started(flags);
      bloc.add(const MemberWhatsappChanged(true));
      await settle();
      expect(bloc.state.form.hasWhatsapp, isTrue);
    });

    test('consent version is stamped on the form when consent is given', () async {
      final bloc = await started(flags);
      bloc.add(const DeclarationToggled(true));
      await settle();
      expect(bloc.state.form.declarationAccepted, isTrue);
      expect(bloc.state.form.consentVersion, '2026-10');
    });
  });

  group('regAbroadAddress', () {
    const flags = RegFlags(abroadAddress: true);

    test('toggle on stores the flag and switches same-as-current off', () async {
      final bloc = await started(flags);
      bloc.add(const SameAsCurrentToggled(true));
      bloc.add(const AbroadToggled(true));
      bloc.add(const AbroadFieldChanged(AbroadField.country, 'SA'));
      bloc.add(const AbroadFieldChanged(AbroadField.city, 'Riyadh'));
      bloc.add(const AbroadFieldChanged(AbroadField.text, 'Olaya'));
      await settle();
      final f = bloc.state.form;
      expect(f.currentAddressAbroad, isTrue);
      expect(f.sameAsCurrentAddress, isFalse);
      expect([f.currentCountry, f.currentCity, f.currentAddressText], ['SA', 'Riyadh', 'Olaya']);
    });

    test('toggle off clears the abroad fields', () async {
      final bloc = await started(flags);
      bloc.add(const AbroadToggled(true));
      bloc.add(const AbroadFieldChanged(AbroadField.city, 'Riyadh'));
      bloc.add(const AbroadToggled(false));
      await settle();
      expect(bloc.state.form.currentAddressAbroad, isFalse);
      expect(bloc.state.form.currentCity, '');
    });
  });

  group('regAddPropertyButton', () {
    const flags = RegFlags(addPropertyButton: true);

    test('starts with one property and the count follows the list', () async {
      final bloc = await started(flags);
      expect(bloc.state.form.properties, hasLength(1));
      expect(bloc.state.form.propertyCount, 1);
      bloc.add(const PropertyAdded());
      await settle();
      expect(bloc.state.form.properties, hasLength(2));
      expect(bloc.state.form.propertyCount, 2);
    });

    test('removing keeps at least one and adding stops at nine', () async {
      final bloc = await started(flags);
      for (var i = 0; i < 12; i++) {
        bloc.add(const PropertyAdded());
      }
      await settle();
      expect(bloc.state.form.properties, hasLength(9));

      for (var i = 0; i < 12; i++) {
        bloc.add(const PropertyRemoved(0));
      }
      await settle();
      expect(bloc.state.form.properties, hasLength(1));
      expect(bloc.state.form.propertyCount, 1);
    });
  });

  group('regDagUnknown', () {
    test('toggle sets dagUnknown on the right property', () async {
      final bloc = await started(const RegFlags(dagUnknown: true));
      bloc.add(const PropertyCountChanged(2));
      bloc.add(const DagUnknownToggled(1, true));
      await settle();
      expect(bloc.state.form.properties.map((p) => p.dagUnknown), [false, true]);
    });
  });

  group('regMinOneProof', () {
    test('attaching a file adds the document type automatically', () async {
      final bloc = await started(const RegFlags(minOneProof: true));
      bloc.add(const PropertyCountChanged(1));
      final dir = Directory.systemTemp.createTempSync('proof');
      addTearDown(() => dir.deleteSync(recursive: true));
      final file = File('${dir.path}/k.pdf')..writeAsBytesSync([1, 2, 3]);

      bloc.add(DocFileAttached(0, 'খতিয়ান/পর্চা', file.path, 'k.pdf'));
      await settle();

      final docs = bloc.state.form.properties.single.applicableDocs;
      expect(docs.single.type, 'খতিয়ান/পর্চা');
      expect(docs.single.hasFile, isTrue);
    });
  });

  group('validation honours the flags held by the bloc', () {
    test('road-optional lets step 1 skip the road', () async {
      final bloc = await started(const RegFlags(roadOptional: true));
      bloc.add(const StepNextRequested());
      await settle();
      expect(
        bloc.state.stepErrors.where((e) =>
            e.kind == RegErrorKind.addressFieldRequired && e.addressField == AddressField.road),
        isEmpty,
      );
    });
  });
}
