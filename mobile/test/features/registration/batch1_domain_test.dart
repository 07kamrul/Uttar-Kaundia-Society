import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/enums/enums.dart';
import 'package:kaundia_app/features/registration/domain/reg_flags.dart';
import 'package:kaundia_app/features/registration/domain/registration_form.dart';
import 'package:kaundia_app/features/registration/domain/registration_payload_mapper.dart';
import 'package:kaundia_app/features/registration/domain/registration_validators.dart';

const _addr = AddressDetail(
    house: '1', road: '2', postOffice: 'p', upazila: 'u', district: 'd', division: 'v');

const _doc = ApplicableDoc(type: 'খতিয়ান/পর্চা', fileName: 'd.pdf', path: '/tmp/d.pdf');

PropertyItem _prop({
  String cs = 'C1',
  String rs = 'R1',
  bool dagUnknown = false,
  List<ApplicableDoc> docs = const [_doc],
}) =>
    PropertyItem(
      propertyType: const ['জমি'],
      khatianNo: 'K1',
      dagNoCs: cs,
      dagNoRs: rs,
      dagUnknown: dagUnknown,
      landQuantity: '10',
      myShareQuantity: '5',
      ownership: OwnershipType.single,
      applicableDocs: docs,
    );

RegistrationForm _form({
  String email = 'a@b.com',
  String nid = '1234567890',
  FileRef? photo = const FileRef(fileName: 'p.jpg', path: '/tmp/p.jpg'),
  AddressDetail current = _addr,
  List<PropertyItem>? properties,
}) =>
    RegistrationForm(
      fullName: 'Md Kamrul',
      fatherOrHusband: 'Abdul',
      mother: 'Rahima',
      dob: '1990-01-01',
      nid: nid,
      mobile: '+8801712345678',
      gender: Gender.male,
      email: email,
      memberPhoto: photo,
      currentAddress: current,
      permanentAddress: _addr,
      propertyCount: 1,
      properties: properties ?? [_prop()],
      paymentMethod: PaymentMethod.cash,
    );

Iterable<RegErrorKind> _kinds(List<RegError> e) => e.map((x) => x.kind);

void main() {
  group('always-on rules (flags off)', () {
    test('email, NID and photo are required', () {
      final errs = validateMemberStep(_form(email: '', nid: '', photo: null));
      expect(_kinds(errs), containsAll([
        RegErrorKind.emailRequired,
        RegErrorKind.nidRequired,
        RegErrorKind.photoRequired,
      ]));
    });

    test('a photo with metadata only (after draft restore) is still missing', () {
      final errs = validateMemberStep(_form(photo: const FileRef(fileName: 'p.jpg')));
      expect(_kinds(errs), contains(RegErrorKind.photoRequired));
    });

    test('valid form has no member-step errors', () {
      expect(validateMemberStep(_form()), isEmpty);
    });

    test('flags off: legacy 10-17 digit NID pattern', () {
      expect(_kinds(validateMemberStep(_form(nid: '12345678901'))),
          isNot(contains(RegErrorKind.nidInvalid)));
      expect(_kinds(validateMemberStep(_form(nid: '123'))), contains(RegErrorKind.nidInvalid));
    });

    test('flags off: road and dag stay required, dag_unknown ignored', () {
      final form = _form(
        current: _addr.copyWith(road: ''),
        properties: [_prop(cs: '', rs: '', dagUnknown: true, docs: const [])],
      );
      expect(_kinds(validateMemberStep(form)), contains(RegErrorKind.addressFieldRequired));
      final p = _kinds(validatePropertyStep(form));
      expect(p, containsAll([RegErrorKind.dagCsRequired, RegErrorKind.dagRsRequired]));
      expect(p, contains(RegErrorKind.applicableDocsRequired));
    });
  });

  group('regSimplifiedUi', () {
    const flags = RegFlags(simplifiedUi: true);

    test('NID must be exactly 10, 13 or 17 digits; Bangla digits accepted', () {
      expect(_kinds(validateMemberStep(_form(nid: '12345678901'), flags: flags)),
          contains(RegErrorKind.nidInvalid));
      expect(validateMemberStep(_form(nid: '১২৩৪৫৬৭৮৯০'), flags: flags), isEmpty);
      expect(validateMemberStep(_form(nid: '1234567890123'), flags: flags), isEmpty);
      expect(validateMemberStep(_form(nid: '12345678901234567'), flags: flags), isEmpty);
    });
  });

  group('regRoadOptional', () {
    test('road may be empty in both address blocks', () {
      final form = _form(current: _addr.copyWith(road: ''));
      expect(validateMemberStep(form, flags: const RegFlags(roadOptional: true)), isEmpty);
    });
  });

  group('regDagUnknown', () {
    test('dag may be empty when the member ticked dag_unknown', () {
      final form = _form(properties: [_prop(cs: '', rs: '', dagUnknown: true)]);
      expect(validatePropertyStep(form, flags: const RegFlags(dagUnknown: true)), isEmpty);
    });

    test('dag still required when not ticked', () {
      final form = _form(properties: [_prop(cs: '', rs: '')]);
      expect(_kinds(validatePropertyStep(form, flags: const RegFlags(dagUnknown: true))),
          containsAll([RegErrorKind.dagCsRequired, RegErrorKind.dagRsRequired]));
    });
  });

  group('regMinOneProof', () {
    const flags = RegFlags(minOneProof: true);

    test('one attached proof is enough; no ticked-doc rule', () {
      final form = _form(properties: [
        _prop(docs: const [_doc, ApplicableDoc(type: 'নামজারি/মিউটেশন')]),
      ]);
      expect(validatePropertyStep(form, flags: flags), isEmpty);
    });

    test('no attached file fails with proofRequired', () {
      final form = _form(properties: [
        _prop(docs: const [ApplicableDoc(type: 'খতিয়ান/পর্চা')]),
        _prop(docs: const []),
      ]);
      final errs = validatePropertyStep(form, flags: flags);
      expect(_kinds(errs), everyElement(RegErrorKind.proofRequired));
      expect(errs.map((e) => e.propertyIndex), [0, 1]);
    });
  });

  group('regAbroadAddress', () {
    const flags = RegFlags(abroadAddress: true);
    RegistrationForm abroad({String country = 'SA', String city = 'Riyadh', String text = 'Olaya St'}) =>
        _form(current: const AddressDetail()).copyWith(
          currentAddressAbroad: true,
          currentCountry: country,
          currentCity: city,
          currentAddressText: text,
        );

    test('abroad skips the BD current address but requires country, city, text', () {
      expect(validateMemberStep(abroad(), flags: flags), isEmpty);
      final errs = validateMemberStep(abroad(country: '', city: '', text: ''), flags: flags);
      expect(_kinds(errs), containsAll([
        RegErrorKind.abroadCountryRequired,
        RegErrorKind.abroadCityRequired,
        RegErrorKind.abroadAddressRequired,
      ]));
    });

    test('country BD is rejected', () {
      expect(_kinds(validateMemberStep(abroad(country: 'BD'), flags: flags)),
          contains(RegErrorKind.abroadCountryRequired));
    });

    test('permanent address stays required', () {
      final form = abroad().copyWith(permanentAddress: const AddressDetail());
      expect(_kinds(validateMemberStep(form, flags: flags)),
          contains(RegErrorKind.addressFieldRequired));
    });

    test('flag off ignores the abroad toggle', () {
      final errs = validateMemberStep(abroad());
      expect(_kinds(errs), contains(RegErrorKind.addressFieldRequired));
    });
  });

  group('payload mapping', () {
    Map<String, dynamic> build(RegistrationForm f, {RegFlags flags = RegFlags.off, String? consent}) =>
        buildRegistrationPayload(f,
            admissionFee: '500', subscription: '120', flags: flags, consentVersion: consent);

    test('flags off: none of the Batch 1 keys are emitted', () {
      final p = build(_form().copyWith(hasWhatsapp: true, currentAddressAbroad: true, currentCountry: 'SA'),
          consent: '2026-10');
      for (final k in [
        'has_whatsapp',
        'current_address_abroad',
        'current_country',
        'current_city',
        'current_address_text',
        'consent_version',
      ]) {
        expect(p.containsKey(k), isFalse, reason: k);
      }
      expect((p['properties'] as List).single.containsKey('dag_unknown'), isFalse);
      expect(p['current_address'], isA<Map>());
    });

    test('abroad address: snake_case fields and null BD current_address', () {
      final f = _form(current: const AddressDetail()).copyWith(
        currentAddressAbroad: true,
        currentCountry: 'SA',
        currentCity: 'Riyadh',
        currentAddressText: 'Olaya St 5',
      );
      final p = build(f, flags: const RegFlags(abroadAddress: true));
      expect(p['current_address_abroad'], true);
      expect(p['current_country'], 'SA');
      expect(p['current_city'], 'Riyadh');
      expect(p['current_address_text'], 'Olaya St 5');
      expect(p['current_address'], isNull);
      expect((p['permanent_address'] as Map)['house'], '1');
    });

    test('abroad toggle off keeps the BD current address and omits abroad keys', () {
      final p = build(_form(), flags: const RegFlags(abroadAddress: true));
      expect(p.containsKey('current_address_abroad'), isFalse);
      expect((p['current_address'] as Map)['division'], 'v');
    });

    test('dag_unknown is sent only when ticked and the flag is on', () {
      final f = _form(properties: [_prop(cs: '', rs: '', dagUnknown: true)]);
      final on = build(f, flags: const RegFlags(dagUnknown: true));
      final prop = (on['properties'] as List).single as Map;
      expect(prop['dag_unknown'], true);
      expect(prop['dag_no_cs'], '');
      expect(prop['dag_no_rs'], '');
      final off = build(f);
      expect((off['properties'] as List).single.containsKey('dag_unknown'), isFalse);
    });

    test('simplified UI: has_whatsapp, consent_version, canonical payment keys', () {
      const flags = RegFlags(simplifiedUi: true);
      final p = build(_form().copyWith(hasWhatsapp: true, paymentMethod: PaymentMethod.bkash),
          flags: flags, consent: '2026-10');
      expect(p['has_whatsapp'], true);
      expect(p['consent_version'], '2026-10');
      expect(p['payment_method'], 'bkash');
      for (final (m, key) in [
        (PaymentMethod.cash, 'cash'),
        (PaymentMethod.nagad, 'nagad'),
        (PaymentMethod.rocket, 'rocket'),
        (PaymentMethod.bank, 'bank'),
        (PaymentMethod.other, 'other'),
      ]) {
        expect(build(_form().copyWith(paymentMethod: m), flags: flags)['payment_method'], key);
      }
    });

    test('has_whatsapp null is omitted', () {
      expect(build(_form(), flags: const RegFlags(simplifiedUi: true)).containsKey('has_whatsapp'),
          isFalse);
    });

    test('flags off keeps the legacy Bangla payment_method', () {
      expect(build(_form().copyWith(paymentMethod: PaymentMethod.cash))['payment_method'], 'ক্যাশ');
    });

    test('hide-nationality defaults a blank nationality to বাংলাদেশী', () {
      final p = build(_form().copyWith(nationality: ' '), flags: const RegFlags(hideNationality: true));
      expect(p['nationality'], 'বাংলাদেশী');
    });

    test('min-one-proof sends only attached documents', () {
      final f = _form(properties: [
        _prop(docs: const [_doc, ApplicableDoc(type: 'নামজারি/মিউটেশন')]),
      ]);
      final docs = ((build(f, flags: const RegFlags(minOneProof: true))['properties'] as List).single
          as Map)['applicable_docs'] as List;
      expect(docs, [
        {'doc_type': 'খতিয়ান/পর্চা'}
      ]);
    });
  });

  group('payment reference label kind', () {
    test('TrxID for mobile banking, receipt number otherwise', () {
      expect(PaymentMethod.bkash.usesTransactionId, isTrue);
      expect(PaymentMethod.nagad.usesTransactionId, isTrue);
      expect(PaymentMethod.rocket.usesTransactionId, isTrue);
      expect(PaymentMethod.cash.usesTransactionId, isFalse);
      expect(PaymentMethod.bank.usesTransactionId, isFalse);
      expect(PaymentMethod.other.usesTransactionId, isFalse);
    });
  });
}
