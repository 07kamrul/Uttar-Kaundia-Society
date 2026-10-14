import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/network/api_exception.dart';
import 'package:kaundia_app/features/governance/data/governance_repository.dart';
import 'package:kaundia_app/features/governance/domain/governance_entities.dart';
import 'package:kaundia_app/features/governance/pages/amendments_page.dart';
import 'package:kaundia_app/features/governance/pages/complaints_page.dart';
import 'package:kaundia_app/features/governance/pages/elections_page.dart';
import 'package:kaundia_app/features/governance/pages/emergency_help_page.dart';
import 'package:kaundia_app/features/governance/pages/land_complaint_page.dart';
import 'package:kaundia_app/features/governance/pages/petitions_page.dart';
import 'package:kaundia_app/features/governance/pages/service_standard_page.dart';
import 'package:kaundia_app/features/governance/pages/welfare_fund_page.dart';
import 'package:kaundia_app/l10n/app_localizations_bn.dart';
import 'package:kaundia_app/shared/utils/external_link_launcher.dart';
import 'package:mocktail/mocktail.dart';

import '../../support/pump_app.dart';

class _MockRepo extends Mock implements GovernanceRepository {}

class _Launcher implements ExternalLinkLauncher {
  final opened = <Uri>[];
  @override
  Future<bool> open(Uri uri) async {
    opened.add(uri);
    return true;
  }
}

const _server = ApiException(type: ApiExceptionType.server, statusCode: 500, message: 'Traceback secret');
const _conflict = ApiException(type: ApiExceptionType.business, statusCode: 409);

const _constants = ComplaintConstants(
  antiRetaliationNotice: 'অভিযোগ করলে কোনো ক্ষতি হবে না।',
  landEvidenceChecklist: ['দাগ-খতিয়ানের কপি'],
  emergencyContacts: [EmergencyContact(key: 'police', number: '999', label: 'জাতীয় জরুরি সেবা')],
  categories: [
    ComplaintCategory(key: 'service', label: 'সেবা'),
    ComplaintCategory(key: 'conduct', label: 'আচরণ'),
  ],
);

const _complaint = Complaint(
  id: 7,
  complaintNo: 'C-2026-007',
  category: 'service',
  subject: 'সেবায় দেরি',
  details: 'তিন মাস হয়ে গেছে',
  isLandProtection: false,
  status: 'acknowledged',
  slaAck: SlaInfo(state: 'met', daysRemaining: 0),
  slaUpdate: SlaInfo(state: 'due_soon', daysRemaining: 2),
  resolutionNote: null,
  timeline: [TimelineEvent(event: 'complaint.submitted', at: '2026-10-01T10:00:00')],
);

Election _election(String status) => Election(
      id: 3,
      title: 'কমিটি নির্বাচন ২০২৬',
      nominationStart: '2026-10-01',
      nominationEnd: '2026-10-05',
      votingStart: '2026-10-10',
      votingEnd: '2026-10-20',
      status: status,
    );

MyElection _my({
  String status = 'voting',
  bool eligible = true,
  String today = '2026-10-14',
  List<String> voted = const [],
  List<PostCounts>? results,
}) =>
    MyElection(
      election: _election(status),
      today: today,
      eligible: eligible,
      fromSnapshot: false,
      myNominations: const [],
      votedPosts: voted,
      roster: const [
        PostRoster(postKey: 'president', candidates: [
          RosterCandidate(nominationId: 5, memberId: 9, name: 'রহিম উদ্দিন'),
        ]),
      ],
      results: results,
    );

const _posts = [CouncilPost(key: 'president', bn: 'সভাপতি', en: 'President')];

void main() {
  final bn = AppLocalizationsBn();
  late _MockRepo repo;

  setUp(() {
    repo = _MockRepo();
  });

  group('EmergencyHelpPage', () {
    testWidgets('shows the numbers, the five steps and calls on tap', (tester) async {
      when(() => repo.complaintConstants()).thenAnswer((_) async => _constants);
      final launcher = _Launcher();
      await pumpBn(tester, EmergencyHelpPage(repository: repo, launcher: launcher));

      expect(find.text('৯৯৯'), findsOneWidget);
      expect(find.text('জাতীয় জরুরি সেবা'), findsOneWidget);
      expect(find.text(bn.govEmergencyStep1), findsOneWidget);
      expect(find.text(bn.govEmergencyStep5), findsOneWidget);
      expect(find.text(bn.govEmergencyFileLand), findsOneWidget);

      await tester.tap(find.byKey(const Key('emergencyCall_police')));
      expect(launcher.opened.single.toString(), 'tel:999');
    });

    testWidgets('keeps the safety steps when the numbers cannot be loaded', (tester) async {
      when(() => repo.complaintConstants()).thenThrow(_server);
      await pumpBn(tester, EmergencyHelpPage(repository: repo));
      expect(find.text(bn.govEmergencyStep1), findsOneWidget);
    });
  });

  group('ComplaintsPage', () {
    setUp(() {
      when(() => repo.complaintConstants()).thenAnswer((_) async => _constants);
      when(() => repo.myComplaints()).thenAnswer((_) async => [_complaint]);
    });

    testWidgets('lists complaints with Bangla status and expands the details', (tester) async {
      await pumpBn(tester, ComplaintsPage(repository: repo));
      expect(find.text(_constants.antiRetaliationNotice), findsOneWidget);
      expect(find.text('সেবায় দেরি'), findsOneWidget);
      expect(find.text(bn.govComplaintStatus_acknowledged), findsOneWidget);
      expect(find.text('তিন মাস হয়ে গেছে'), findsNothing);

      await tester.tap(find.text('সেবায় দেরি'));
      await tester.pumpAndSettle();
      expect(find.text('তিন মাস হয়ে গেছে'), findsOneWidget);
      expect(find.textContaining(bn.govComplaintEvent_submitted), findsOneWidget);
    });

    testWidgets('submits a complaint with the first category', (tester) async {
      when(() => repo.createComplaint(
            category: any(named: 'category'),
            subject: any(named: 'subject'),
            details: any(named: 'details'),
          )).thenAnswer((_) async => _complaint);
      await pumpBn(tester, ComplaintsPage(repository: repo));

      await tester.enterText(find.byKey(const Key('complaintSubject')), 'বিষয়');
      await tester.enterText(find.byKey(const Key('complaintDetails')), 'বিবরণ');
      await tester.ensureVisible(find.byKey(const Key('complaintSubmit')));
      await tester.tap(find.byKey(const Key('complaintSubmit')));
      await tester.pumpAndSettle();

      verify(() => repo.createComplaint(category: 'service', subject: 'বিষয়', details: 'বিবরণ')).called(1);
      expect(find.text(bn.govComplaintsSuccess), findsOneWidget);
    });

    testWidgets('does not submit an empty form', (tester) async {
      await pumpBn(tester, ComplaintsPage(repository: repo));
      await tester.ensureVisible(find.byKey(const Key('complaintSubmit')));
      await tester.tap(find.byKey(const Key('complaintSubmit')));
      await tester.pumpAndSettle();
      expect(find.text(bn.govFieldRequired), findsNWidgets(2));
      verifyNever(() => repo.createComplaint(
          category: any(named: 'category'), subject: any(named: 'subject'), details: any(named: 'details')));
    });

    testWidgets('a server error shows the plain message, never the server text', (tester) async {
      when(() => repo.createComplaint(
            category: any(named: 'category'),
            subject: any(named: 'subject'),
            details: any(named: 'details'),
          )).thenThrow(_server);
      await pumpBn(tester, ComplaintsPage(repository: repo));
      await tester.enterText(find.byKey(const Key('complaintSubject')), 'বিষয়');
      await tester.enterText(find.byKey(const Key('complaintDetails')), 'বিবরণ');
      await tester.ensureVisible(find.byKey(const Key('complaintSubmit')));
      await tester.tap(find.byKey(const Key('complaintSubmit')));
      await tester.pumpAndSettle();
      expect(find.text(bn.apiErrorServer), findsOneWidget);
      expect(find.textContaining('secret'), findsNothing);
    });

    testWidgets('shows a retry when the list cannot be loaded', (tester) async {
      when(() => repo.myComplaints()).thenThrow(const ApiException(type: ApiExceptionType.network));
      await pumpBn(tester, ComplaintsPage(repository: repo));
      expect(find.text(bn.apiErrorOffline), findsOneWidget);
      expect(find.text(bn.commonRetry), findsOneWidget);
    });
  });

  group('LandComplaintPage', () {
    testWidgets('needs both confirmations, then sends the Angular form_data keys', (tester) async {
      when(() => repo.complaintConstants()).thenAnswer((_) async => _constants);
      when(() => repo.submitLandComplaint(any(),
              evidencePath: any(named: 'evidencePath'), evidenceName: any(named: 'evidenceName')))
          .thenAnswer((_) async => _complaint);
      await pumpBn(tester, LandComplaintPage(repository: repo, onDone: () {}));

      Future<void> fill(String key, String text) async {
        await tester.ensureVisible(find.byKey(Key(key)));
        await tester.enterText(find.byKey(Key(key)), text);
      }

      await fill('landName', 'করিম');
      await fill('landLocation', 'কৌন্ডিয়া');
      await fill('landDag', '১২');
      await fill('landKhatian', '৩৪');
      await fill('landAccused', 'অমুক');
      await fill('landDescription', 'জোর করে দখল');
      await fill('landSignature', 'করিম');

      await tester.ensureVisible(find.byKey(const Key('landIncidentDate')));
      await tester.tap(find.byKey(const Key('landIncidentDate')));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(TextButton).last);
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.byKey(const Key('landSubmit')));
      await tester.tap(find.byKey(const Key('landSubmit')));
      await tester.pumpAndSettle();
      verifyNever(() => repo.submitLandComplaint(any(),
          evidencePath: any(named: 'evidencePath'), evidenceName: any(named: 'evidenceName')));

      await tester.tap(find.byKey(const Key('landDisclaimer')));
      await tester.tap(find.byKey(const Key('landConsent')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('landSubmit')));
      await tester.tap(find.byKey(const Key('landSubmit')));
      await tester.pumpAndSettle();

      final sent = verify(() => repo.submitLandComplaint(captureAny(),
          evidencePath: any(named: 'evidencePath'), evidenceName: any(named: 'evidenceName'))).captured.single
          as Map<String, dynamic>;
      expect(sent['complainant_name'], 'করিম');
      expect(sent['dag_no'], '১২');
      expect(sent['khatian_no'], '৩৪');
      expect(sent['accused_party'], 'অমুক');
      expect(sent['incident_description'], 'জোর করে দখল');
      expect(sent['disclaimer_acknowledged'], isTrue);
      expect(sent['consent'], isTrue);
      expect(sent['emergency_danger'], isFalse);
      expect(sent['evidence_checklist'], isEmpty);
      expect(sent['incident_date'], isNotEmpty);
    });
  });

  group('ServiceStandardPage', () {
    testWidgets('shows target and live figures', (tester) async {
      when(() => repo.serviceStandard()).thenAnswer((_) async => const ServiceStandardData(
            notice: 'n',
            standards: [
              ServiceStandard(
                  key: 'ack',
                  label: 'স্বীকৃতি',
                  target: '৩ কার্যদিবস',
                  live: LiveStandard(total: 10, met: 9, metPct: 90)),
              ServiceStandard(key: 'x', label: 'আপডেট', target: '১৫ কার্যদিবস', live: null),
            ],
          ));
      await pumpBn(tester, ServiceStandardPage(repository: repo));
      expect(find.text('স্বীকৃতি'), findsOneWidget);
      expect(find.text(bn.govStandardTarget('৩ কার্যদিবস')), findsOneWidget);
      expect(find.text('৯/১০'), findsOneWidget);
      expect(find.text(bn.govStandardNoLive), findsOneWidget);
    });
  });

  group('ElectionsPage', () {
    void stub(MyElection my) {
      when(() => repo.listElections()).thenAnswer((_) async => [my.election]);
      when(() => repo.governanceConstants())
          .thenAnswer((_) async => const GovernanceConstants(councilPosts: _posts, petitionResponseDays: 30));
      when(() => repo.myElection(3)).thenAnswer((_) async => my);
    }

    testWidgets('casts a vote after the plain confirmation', (tester) async {
      stub(_my());
      when(() => repo.castVote(3, 'president', 5)).thenAnswer((_) async {});
      await pumpBn(tester, ElectionsPage(repository: repo));

      expect(find.text(bn.govElectionsEligibleYes), findsOneWidget);
      await tester.tap(find.byKey(const Key('candidate_5')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('castVote_president')));
      await tester.pumpAndSettle();
      expect(find.text(bn.govElectionsVoteConfirm), findsOneWidget);
      await tester.tap(find.text(bn.plainConfirmYes(bn.govElectionsCastVote)));
      await tester.pumpAndSettle();

      verify(() => repo.castVote(3, 'president', 5)).called(1);
    });

    testWidgets('the vote button needs a picked candidate', (tester) async {
      stub(_my());
      await pumpBn(tester, ElectionsPage(repository: repo));
      final button = tester.widget<ButtonStyleButton>(find.descendant(
          of: find.byKey(const Key('castVote_president')), matching: find.byWidgetPredicate((w) => w is ButtonStyleButton)));
      expect(button.onPressed, isNull);
    });

    testWidgets('a conflict shows what went wrong and what to do', (tester) async {
      stub(_my());
      when(() => repo.castVote(3, 'president', 5)).thenThrow(_conflict);
      await pumpBn(tester, ElectionsPage(repository: repo));
      await tester.tap(find.byKey(const Key('candidate_5')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('castVote_president')));
      await tester.pumpAndSettle();
      await tester.tap(find.text(bn.plainConfirmYes(bn.govElectionsCastVote)));
      await tester.pumpAndSettle();
      expect(find.text(bn.govErrVoteConflict), findsOneWidget);
    });

    testWidgets('a post already voted shows no vote button', (tester) async {
      stub(_my(voted: ['president']));
      await pumpBn(tester, ElectionsPage(repository: repo));
      expect(find.text(bn.govElectionsAlreadyVoted), findsOneWidget);
      expect(find.byKey(const Key('castVote_president')), findsNothing);
    });

    testWidgets('an ineligible member sees the reason and no vote or nominate card', (tester) async {
      stub(_my(eligible: false));
      await pumpBn(tester, ElectionsPage(repository: repo));
      expect(find.text(bn.govElectionsEligibleNo), findsOneWidget);
      expect(find.byKey(const Key('candidate_5')), findsNothing);
    });

    testWidgets('nominates for a post during the nomination window', (tester) async {
      stub(_my(status: 'nominations_open', today: '2026-10-03'));
      when(() => repo.nominateSelf(3, 'president', 'আমি কাজ করব')).thenAnswer((_) async {});
      await pumpBn(tester, ElectionsPage(repository: repo));

      await tester.tap(find.byKey(const Key('nominatePost')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('সভাপতি').last);
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('nominateStatement')), 'আমি কাজ করব');
      await tester.ensureVisible(find.byKey(const Key('nominateSubmit')));
      await tester.tap(find.byKey(const Key('nominateSubmit')));
      await tester.pumpAndSettle();

      verify(() => repo.nominateSelf(3, 'president', 'আমি কাজ করব')).called(1);
    });

    testWidgets('shows the results with Bangla digits', (tester) async {
      stub(_my(status: 'confirmed', results: const [
        PostCounts(postKey: 'president', votesTotal: 12, candidates: [
          CountCandidate(nominationId: 5, memberId: 9, votes: 12, name: 'রহিম উদ্দিন'),
        ]),
      ]));
      await pumpBn(tester, ElectionsPage(repository: repo));
      expect(find.text(bn.govElectionsResults), findsOneWidget);
      expect(find.text(bn.govElectionsVotesTotal('১২')), findsOneWidget);
    });

    testWidgets('says so when there is no election', (tester) async {
      when(() => repo.listElections()).thenAnswer((_) async => []);
      when(() => repo.governanceConstants())
          .thenAnswer((_) async => const GovernanceConstants(councilPosts: [], petitionResponseDays: null));
      await pumpBn(tester, ElectionsPage(repository: repo));
      expect(find.text(bn.govElectionsEmpty), findsOneWidget);
    });
  });

  group('PetitionsPage', () {
    const petition = Petition(
      id: 4,
      petitionNo: 'P-4',
      title: 'বিশেষ সভা চাই',
      justification: 'কারণ',
      signatureCount: 3,
      requiredCount: 12,
      status: 'submitted',
      responseDue: '2026-11-01',
      sla: SlaInfo(state: 'on_track', daysRemaining: 10),
      committeeResponse: null,
    );

    setUp(() {
      when(() => repo.myPetitions()).thenAnswer((_) async => [petition]);
      when(() => repo.governanceConstants())
          .thenAnswer((_) async => const GovernanceConstants(councilPosts: [], petitionResponseDays: 30));
    });

    testWidgets('lists my petitions with signature progress', (tester) async {
      await pumpBn(tester, PetitionsPage(repository: repo));
      expect(find.text('বিশেষ সভা চাই'), findsOneWidget);
      expect(find.text(bn.govPetitionsSignatures('৩', '১২')), findsOneWidget);
      expect(find.text(bn.govPetitionsResponseDays('৩০')), findsOneWidget);
    });

    testWidgets('files a petition', (tester) async {
      when(() => repo.createPetition(title: any(named: 'title'), justification: any(named: 'justification')))
          .thenAnswer((_) async => petition);
      await pumpBn(tester, PetitionsPage(repository: repo));
      await tester.enterText(find.byKey(const Key('petitionTitle')), 'শিরোনাম');
      await tester.enterText(find.byKey(const Key('petitionJustification')), 'যুক্তি');
      await tester.ensureVisible(find.byKey(const Key('petitionCreate')));
      await tester.tap(find.byKey(const Key('petitionCreate')));
      await tester.pumpAndSettle();
      verify(() => repo.createPetition(title: 'শিরোনাম', justification: 'যুক্তি')).called(1);
      expect(find.text(bn.govPetitionsCreateDone), findsOneWidget);
    });

    testWidgets('signs by id and lists the signed petition', (tester) async {
      when(() => repo.signPetition(9)).thenAnswer((_) async => const Petition(
            id: 9,
            petitionNo: 'P-9',
            title: 'অন্যের পিটিশন',
            justification: '',
            signatureCount: 5,
            requiredCount: 10,
            status: 'submitted',
            responseDue: null,
            sla: null,
            committeeResponse: null,
          ));
      await pumpBn(tester, PetitionsPage(repository: repo));
      await tester.enterText(find.byKey(const Key('petitionId')), '9');
      await tester.ensureVisible(find.byKey(const Key('petitionSign')));
      await tester.tap(find.byKey(const Key('petitionSign')));
      await tester.pumpAndSettle();
      verify(() => repo.signPetition(9)).called(1);
      expect(find.text('অন্যের পিটিশন'), findsOneWidget);
    });

    testWidgets('an unknown id says what to do', (tester) async {
      when(() => repo.signPetition(99)).thenThrow(const ApiException(type: ApiExceptionType.business, statusCode: 404));
      await pumpBn(tester, PetitionsPage(repository: repo));
      await tester.enterText(find.byKey(const Key('petitionId')), '99');
      await tester.ensureVisible(find.byKey(const Key('petitionSign')));
      await tester.tap(find.byKey(const Key('petitionSign')));
      await tester.pumpAndSettle();
      expect(find.text(bn.govErrSignNotFound), findsOneWidget);
    });
  });

  group('WelfareFundPage', () {
    const request = WelfareRequest(
      id: 1,
      requestNo: 'W-1',
      requestType: 'medical',
      amountRequested: 5000,
      reason: 'চিকিৎসা',
      status: 'approved',
      approvedAmount: 4000,
      committeeReason: 'অনুমোদন',
    );

    setUp(() {
      when(() => repo.myWelfareRequests()).thenAnswer((_) async => [request]);
    });

    testWidgets('lists requests with taka in Bangla digits', (tester) async {
      await pumpBn(tester, WelfareFundPage(repository: repo));
      expect(find.text(bn.govWelfareRequested('৳ ৫,০০০')), findsOneWidget);
      expect(find.text(bn.govWelfareApproved('৳ ৪,০০০')), findsOneWidget);
      expect(find.text(bn.govWelfareStatus_approved), findsOneWidget);
    });

    testWidgets('applies with type, amount and reason', (tester) async {
      when(() => repo.applyWelfare(
            requestType: any(named: 'requestType'),
            amount: any(named: 'amount'),
            reason: any(named: 'reason'),
          )).thenAnswer((_) async => request);
      await pumpBn(tester, WelfareFundPage(repository: repo));
      await tester.enterText(find.byKey(const Key('welfareAmount')), '২৫০০');
      await tester.enterText(find.byKey(const Key('welfareReason')), 'অপারেশন');
      await tester.ensureVisible(find.byKey(const Key('welfareApply')));
      await tester.tap(find.byKey(const Key('welfareApply')));
      await tester.pumpAndSettle();
      verify(() => repo.applyWelfare(requestType: 'medical', amount: 2500, reason: 'অপারেশন')).called(1);
    });

    testWidgets('rejects a zero amount before calling the server', (tester) async {
      await pumpBn(tester, WelfareFundPage(repository: repo));
      await tester.enterText(find.byKey(const Key('welfareAmount')), '0');
      await tester.enterText(find.byKey(const Key('welfareReason')), 'কারণ');
      await tester.ensureVisible(find.byKey(const Key('welfareApply')));
      await tester.tap(find.byKey(const Key('welfareApply')));
      await tester.pumpAndSettle();
      expect(find.text(bn.govWelfareAmountInvalid), findsOneWidget);
      verifyNever(() => repo.applyWelfare(
          requestType: any(named: 'requestType'), amount: any(named: 'amount'), reason: any(named: 'reason')));
    });
  });

  group('AmendmentsPage', () {
    const proposal = AmendmentProposal(
      id: 8,
      proposalNo: 'A-8',
      title: 'ধারা ৫ সংশোধন',
      rationale: 'কারণ',
      proposedText: 'নতুন পাঠ',
      status: 'submitted',
      isDissolution: false,
      adoptedVersionNo: null,
      decisionNote: null,
    );
    const version = ConstitutionVersion(
        id: 1, versionNo: 2, fullText: 'গঠনতন্ত্রের পুরো পাঠ', changesSummary: null, isCurrent: true);

    setUp(() {
      when(() => repo.myProposals()).thenAnswer((_) async => [proposal]);
      when(() => repo.amendmentVersions()).thenAnswer((_) async => [version]);
    });

    testWidgets('shows proposals and expands a version text', (tester) async {
      await pumpBn(tester, AmendmentsPage(repository: repo));
      expect(find.text('ধারা ৫ সংশোধন'), findsOneWidget);
      expect(find.text(bn.govAmendStatus_submitted), findsWidgets);
      expect(find.text('গঠনতন্ত্রের পুরো পাঠ'), findsNothing);
      await tester.ensureVisible(find.text(bn.govAmendViewText));
      await tester.tap(find.text(bn.govAmendViewText));
      await tester.pumpAndSettle();
      expect(find.text('গঠনতন্ত্রের পুরো পাঠ'), findsOneWidget);
    });

    testWidgets('proposes an amendment', (tester) async {
      when(() => repo.createProposal(
            title: any(named: 'title'),
            rationale: any(named: 'rationale'),
            proposedText: any(named: 'proposedText'),
            isDissolution: any(named: 'isDissolution'),
          )).thenAnswer((_) async => proposal);
      await pumpBn(tester, AmendmentsPage(repository: repo));
      await tester.enterText(find.byKey(const Key('amendTitle')), 'শিরোনাম');
      await tester.enterText(find.byKey(const Key('amendRationale')), 'কারণ');
      await tester.enterText(find.byKey(const Key('amendText')), 'পাঠ');
      await tester.ensureVisible(find.byKey(const Key('amendSubmit')));
      await tester.tap(find.byKey(const Key('amendSubmit')));
      await tester.pumpAndSettle();
      verify(() => repo.createProposal(
          title: 'শিরোনাম', rationale: 'কারণ', proposedText: 'পাঠ', isDissolution: false)).called(1);
    });

    testWidgets('withdraws only after the confirmation', (tester) async {
      when(() => repo.withdrawProposal(8)).thenAnswer((_) async => proposal);
      await pumpBn(tester, AmendmentsPage(repository: repo));
      await tester.ensureVisible(find.byKey(const Key('amendWithdraw_8')));
      await tester.tap(find.byKey(const Key('amendWithdraw_8')));
      await tester.pumpAndSettle();
      verifyNever(() => repo.withdrawProposal(8));
      await tester.tap(find.text(bn.plainConfirmYes(bn.govAmendWithdraw)));
      await tester.pumpAndSettle();
      verify(() => repo.withdrawProposal(8)).called(1);
    });
  });
}
