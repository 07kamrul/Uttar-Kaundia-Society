import 'package:flutter/widgets.dart';

import '../domain/fund_controls_entities.dart';
import 'registers_strings.dart';

/// Fund controls text, copied from the Angular `fundControls.*`,
/// `auditReports.*` and `welfareFund.*` keys.
/// Pending l10n: move these into app_*.arb and delete this file.
class FundStrings extends RegistersStrings {
  const FundStrings(super.isBn);

  factory FundStrings.of(BuildContext context) =>
      FundStrings(Localizations.localeOf(context).languageCode == 'bn');

  String get title => t('তহবিল নিয়ন্ত্রণ ও অডিট', 'Fund controls & audit');
  String get subtitle => t('আয়ের উৎস, বড় ব্যয়ের দ্বৈত অনুমোদন, ব্যাংক স্বাক্ষরকারী ও বার্ষিক অডিট — সবকিছু এক জায়গায়।',
      'Income sources, two-person approval, bank signatories and the annual audit in one place.');

  String tab(FundSection s) => switch (s) {
        FundSection.incomePolicy => t('আয়ের নীতি', 'Income policy'),
        FundSection.threshold => t('দ্বৈত অনুমোদন সীমা', 'Two-person threshold'),
        FundSection.signatories => t('ব্যাংক স্বাক্ষরকারী', 'Bank signatories'),
        FundSection.audit => t('বার্ষিক অডিট', 'Annual audit'),
        FundSection.welfare => t('কল্যাণ তহবিলের আবেদন', 'Welfare requests'),
      };

  String reminderTitle(String fy) =>
      t('বার্ষিক অডিট রিপোর্ট প্রস্তুত করুন (অর্থবছর $fy)', 'Prepare the annual audit report (FY $fy)');
  String get reminderBody => t('অর্থবছর শেষ হয়েছে কিন্তু এই বছরের অডিট রিপোর্ট এখনো জমা পড়েনি। জুন মাস থেকে এই তাগাদ দেখানো হয়।',
      'The fiscal year has ended but this year\'s audit report is not in yet. This reminder shows from June.');

  // Income policy
  String get incomeTitle => t('আয়ের উৎস নীতি', 'Income source policy');
  String get incomeHint => t('গঠনতন্ত্র অনুযায়ী সোসাইটির আয় শুধু নিচের উৎসগুলো থেকে হতে পারে। \'অন্যান্য\' উৎসের জন্য লিখিত যুক্তি দিতে হয়।',
      'Under the constitution income may only come from these sources. \'Other\' needs a written justification.');
  String get needsJustification => t('যুক্তি আবশ্যক', 'Justification needed');
  String get foreignTitle => t('বিদেশি অর্থায়ন', 'Foreign funding');
  String get foreignBody => t('বিদেশি অর্থায়ন সরকার অনুমোদন ছাড়া গ্রহণযোগ্য নয় — সরকারি অনুমোদনের রেফারেন্স ছাড়া সিস্টেম এই ধরনের লেনদেন গ্রহণ করবে না।',
      'Foreign funding is not accepted without government approval; the system rejects it without an approval reference.');

  // Threshold
  String get thresholdTitle => t('বড় ব্যয়ে দ্বিতীয় অনুমোদনের সীমা', 'Second-approval threshold for large expenses');
  String get thresholdHint => t('এই পরিমাণের বেশি ব্যয় অনুমোদনে দুইজনের সই লাগবে — দ্বিতীয় সইদাতা হবেন fund.approve_secondary অনুমতির অন্য এক কর্তাপক্ষ।',
      'Expenses above this need two signatures; the second comes from another officer with fund.approve_secondary.');
  String get defaultTag => t('নীতি-নির্ধারিত ডিফল্ট', 'Policy default');
  String get newThreshold => t('নতুন সীমা (টাকা)', 'New threshold (Tk)');
  String get thresholdSave => t('সংরক্ষণ করুন', 'Save');
  String get amountInvalid => t('সঠিক পরিমাণ লিখুন', 'Enter a valid amount');

  // Signatories
  String get sgTitle => t('ব্যাংক স্বাক্ষরকারী ব্যক্তিবর্গ', 'Bank signatories');
  String get sgBankLetter => t('ব্যাংক চিঠি (PDF)', 'Bank letter (PDF)');
  String get sgAdd => t('নতুন স্বাক্ষরকারী', 'New signatory');
  String get sgEmpty => t('কোনো স্বাক্ষরকারী নিবন্ধিত নেই।', 'No signatory registered.');
  String get sgMember => t('সদস্য', 'Member');
  String get sgBank => t('ব্যাংক', 'Bank');
  String get sgBranch => t('শাখা', 'Branch');
  String get sgAccountName => t('হিসাবের নাম', 'Account name');
  String get sgValidity => t('মেয়াদ', 'Validity');
  String get sgInactive => t('নিষ্ক্রিয়', 'Inactive');
  String get sgAddTitle => t('স্বাক্ষরকারী যোগ করুন', 'Add signatory');
  String get sgEditTitle => t('স্বাক্ষরকারী সম্পাদনা', 'Edit signatory');
  String get sgLast4 => t('হিসাব নম্বরের শেষ ৪ ডিজিট', 'Last 4 digits of the account');
  String get sgLast4Hint => t('পুরো হিসাব নম্বর কখনো সংরক্ষণ করা হয় না — শুধু শেষ ৪ ডিজিট রাখা হয়।',
      'The full account number is never stored, only the last 4 digits.');
  String get sgLast4Invalid => t('ঠিক ৪টি ডিজিট লিখুন', 'Enter exactly 4 digits');
  String get sgScope => t('স্বাক্ষরের ক্ষমতা (যৌথ/একক ইত্যাদি)', 'Signing authority (joint/single etc.)');
  String get sgTermId => t('কমিটি মেয়াদের আইডি (ঐচ্ছিক)', 'Committee term id (optional)');
  String get sgValidFrom => t('মেয়াদ শুরু', 'Valid from');
  String get sgValidTo => t('মেয়াদ শেষ (ঐচ্ছিক)', 'Valid to (optional)');
  String get sgMemberRequired => t('একজন সদস্য নির্বাচন করুন।', 'Choose a member.');
  String get sgDeactivateReason => t('নিষ্ক্রিয় করার কারণ লিখুন:', 'Reason for deactivating:');

  // Audit
  String get auUploadTitle => t('অডিট রিপোর্ট আপলোড', 'Upload audit report');
  String get auFiscalYear => t('অর্থবছর (যেমন 2025-26)', 'Fiscal year (e.g. 2025-26)');
  String get auReportDate => t('রিপোর্টের তারিখ', 'Report date');
  String get auFile => t('ফাইল (PDF/ছবি)', 'File (PDF/image)');
  String get auPickFile => t('ফাইল বাছুন', 'Choose file');
  String get auSummary => t('সারসংক্ষেপ', 'Summary');
  String get auUpload => t('আপলোড করুন', 'Upload');
  String get auListTitle => t('অডিট রিপোর্টসমূহ', 'Audit reports');
  String get auEmpty => t('কোনো অডিট রিপোর্ট জমা পড়েনি।', 'No audit report submitted.');
  String auFyLabel(String fy) => t('অর্থবছর $fy', 'FY $fy');
  String get auPublished => t('প্রকাশিত', 'Published');
  String get auUnpublished => t('প্রকাশিত হয়নি', 'Not published');
  String get auNoSummary => t('সারসংক্ষেপ লেখা হয়নি।', 'No summary yet.');
  String get auEditSummary => t('সারসংক্ষেপ সম্পাদনা', 'Edit summary');
  String get auDownload => t('ফাইল ডাউনলোড', 'Download file');
  String get auPublish => t('সদস্যদের জন্য প্রকাশ করুন', 'Publish to members');

  // Welfare queue
  String get wfAdminTitle => t('কল্যাণ তহবিলের আবেদন পর্যালোচনা', 'Welfare fund requests');
  String get wfNoAutoApproval => t('মনে রাখুন: কোনো আবেদন স্বয়ংক্রিয়ভাবে অনুমোদিত হয় না; কমিটির লিখিত সিদ্ধান্তই চূড়ান্ত।',
      'No request is approved automatically; the committee\'s written decision is final.');
  String get wfStatusLabel => t('অবস্থা', 'Status');
  String get wfAllStatuses => t('সব অবস্থা', 'All statuses');
  String get wfEmpty => t('কোনো আবেদন নেই।', 'No requests.');
  String get wfStartReview => t('পর্যালোচনা শুরু', 'Start review');
  String get wfDecide => t('সিদ্ধান্ত নিন', 'Decide');
  String get wfDisburse => t('পরিশোধিত করুন', 'Mark disbursed');
  String wfDecideTitle(String no) => t('সিদ্ধান্ত: $no', 'Decision: $no');
  String wfRequested(String amount) => t('আবেদনকৃত পরিমাণ: $amount', 'Requested: $amount');
  String wfApproved(String amount) => t('অনুমোদিত: $amount', 'Approved: $amount');
  String get wfApprovedAmount => t('অনুমোদিত পরিমাণ (টাকা)', 'Approved amount (Tk)');
  String get wfCommitteeReason => t('কমিটির কারণ (আবশ্যক — অনুমোদন ও প্রত্যাখ্যান দুই ক্ষেত্রেই)',
      'Committee reason (required for approval and rejection)');
  String get wfReasonRequired => t('সিদ্ধান্তের কারণ লেখা আবশ্যক।', 'A reason is required.');
  String get wfAmountRequired => t('অনুমোদিত পরিমাণ লিখুন।', 'Enter the approved amount.');
  String get wfRequestedReason => t('আবেদনের কারণ', 'Reason given');

  String wfStatus(String s) => switch (s) {
        'submitted' => t('জমা হয়েছে', 'Submitted'),
        'under_review' => t('পর্যালোচনাধীন', 'Under review'),
        'approved' => t('অনুমোদিত', 'Approved'),
        'rejected' => t('প্রত্যাখ্যাত', 'Rejected'),
        'disbursed' => t('পরিশোধিত', 'Disbursed'),
        _ => '—',
      };

  String wfType(String s) => switch (s) {
        'medical' => t('চিকিৎসা', 'Medical'),
        'emergency' => t('জরুরি', 'Emergency'),
        'education' => t('শিক্ষা', 'Education'),
        'other' => t('অন্যান্য', 'Other'),
        _ => '—',
      };
}
