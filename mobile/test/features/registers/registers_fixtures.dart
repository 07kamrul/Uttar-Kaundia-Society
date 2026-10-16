import 'package:dio/dio.dart' show MultipartFile;
import 'package:kaundia_app/core/network/api_exception.dart';
import 'package:kaundia_app/features/registers/data/committee_registry_repository.dart';
import 'package:kaundia_app/features/registers/data/fund_controls_repository.dart';
import 'package:kaundia_app/features/registers/data/registers_repository.dart';
import 'package:kaundia_app/features/registers/domain/committee_registry_entities.dart';
import 'package:kaundia_app/features/registers/domain/fund_controls_entities.dart';
import 'package:kaundia_app/features/registers/domain/registers_entities.dart';
import 'package:mocktail/mocktail.dart';

class MockCommitteeRepo extends Mock implements CommitteeRegistryRepository {}

class MockFundRepo extends Mock implements FundControlsRepository {}

class MockRegistersRepo extends Mock implements RegistersRepository {}

const serverError = ApiException(type: ApiExceptionType.server, statusCode: 500, message: 'Traceback secret');

void registerRegisterFallbacks() {
  registerFallbackValue(MultipartFile.fromBytes(const [0], filename: 'f'));
  registerFallbackValue(const AssetFilter());
  registerFallbackValue(const AssetInput(name: '', category: '', acquisitionDate: '', value: 0, condition: 'good'));
  registerFallbackValue(const ActivityInput(activityDate: '', title: '', activityType: 'other', participantsCount: 0));
  registerFallbackValue(const TermInput(termStart: ''));
  registerFallbackValue(const SignatoryInput(bankName: '', branch: '', accountName: '', validFrom: ''));
}

const holder = MemberBrief(id: 9, fullName: 'রহিম উদ্দিন', memberId: 'M-9');

const president = RegistryPost(
  key: 'president',
  bn: 'সভাপতি',
  en: 'President',
  council: 'executive',
  status: 'active',
  routineWorkOnly: false,
  openVacancy: false,
  holder: holder,
  term: TermInfo(id: 4, postKey: 'president', memberId: 9, termStart: '2025-01-01', isCaretaker: false, status: 'active'),
);

const secretary = RegistryPost(
  key: 'secretary',
  bn: 'সম্পাদক',
  en: 'Secretary',
  council: 'executive',
  status: 'expired',
  routineWorkOnly: true,
  openVacancy: true,
  holder: MemberBrief(id: 10, fullName: 'করিম'),
);

const pendingCase = PostVacancy(
  id: 21,
  postKey: 'secretary',
  vacancyType: 'resignation',
  status: 'pending_acknowledgement',
  member: MemberBrief(id: 10, fullName: 'করিম'),
);

const investigationCase = PostVacancy(
  id: 22,
  postKey: 'treasurer',
  vacancyType: 'removal',
  status: 'investigation',
  member: holder,
  investigationNote: 'অভিযোগ যাচাই',
);

const overview = RegistryOverview(posts: [president, secretary], openVacancies: [pendingCase], today: '2026-10-16');

const members = [MemberOption(id: 9, fullName: 'রহিম উদ্দিন', memberId: 'M-9'), MemberOption(id: 10, fullName: 'করিম')];

void stubCommittee(MockCommitteeRepo repo) {
  when(repo.overview).thenAnswer((_) async => overview);
  when(repo.vacancies).thenAnswer((_) async => const [pendingCase, investigationCase]);
  when(repo.approvedMembers).thenAnswer((_) async => members);
}

const settings = FundSettings(
  expenseTwoPersonThreshold: 50000,
  thresholdIsDefault: true,
  incomeSources: [IncomeSource(key: 'fees', bn: 'সদস্য ফি', en: 'Member fees', requiresJustification: false)],
);

const signatory = BankSignatory(
  id: 3,
  memberId: 9,
  memberName: 'রহিম উদ্দিন',
  bankName: 'সোনালী ব্যাংক',
  branch: 'কাউন্দিয়া',
  accountName: 'সোসাইটি',
  accountNumberMasked: '****1234',
  validFrom: '2026-01-01',
  isActive: true,
);

const report = AuditReport(id: 5, fiscalYear: '2025-26', reportDate: '2026-07-10', hasFile: true);

const welfareRequest = WelfareFundRequest(
  id: 8,
  requestNo: 'WF-008',
  memberId: 9,
  memberName: 'রহিম উদ্দিন',
  requestType: 'medical',
  amountRequested: 5000,
  reason: 'চিকিৎসা খরচ',
  status: 'submitted',
);

const reminder = AuditReminder(fiscalYear: '2025-26', currentFyReportExists: false, reminderWindowActive: true);

void stubFund(MockFundRepo repo) {
  when(repo.settings).thenAnswer((_) async => settings);
  when(repo.auditReminder).thenAnswer((_) async => reminder);
  when(repo.signatories).thenAnswer((_) async => const [signatory]);
  when(repo.auditReports).thenAnswer((_) async => const [report]);
  when(() => repo.welfareRequests(status: any(named: 'status'))).thenAnswer((_) async => const [welfareRequest]);
  when(repo.approvedMembers).thenAnswer((_) async => members);
}

const allFundPermissions = {'fund.manage', 'signatory.manage', 'audit_report.manage', 'welfare_fund.review'};

const asset = SocietyAsset(
  id: 1,
  assetCode: 'AS-001',
  name: 'প্রজেক্টর',
  category: 'ইলেকট্রনিক্স',
  acquisitionDate: '2026-02-01',
  value: 25000,
  condition: 'good',
  isActive: true,
  location: 'কমিউনিটি সেন্টার',
);

const activity = WelfareActivity(
  id: 2,
  activityDate: '2026-09-01',
  title: 'সেলাই প্রশিক্ষণ',
  activityType: 'training',
  participantsCount: 12,
  organizer: 'মহিলা কমিটি',
);
