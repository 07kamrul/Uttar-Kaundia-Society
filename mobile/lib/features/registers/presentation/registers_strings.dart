import 'package:flutter/widgets.dart';

/// Text for the asset register and welfare-activity register pages, copied from
/// the Angular `assetRegister.*` / `welfareActivities.*` / `common.*` keys.
/// Pending l10n: move these into app_*.arb and delete this file.
class RegistersStrings {
  const RegistersStrings(this.isBn);

  factory RegistersStrings.of(BuildContext context) =>
      RegistersStrings(Localizations.localeOf(context).languageCode == 'bn');

  final bool isBn;

  String t(String bn, String en) => isBn ? bn : en;

  String get lang => isBn ? 'bn' : 'en';

  // common.* ----------------------------------------------------------------
  String get retry => t('আবার চেষ্টা করুন', 'Try again');
  String get save => t('সংরক্ষণ', 'Save');
  String get cancel => t('বাতিল', 'Cancel');
  String get edit => t('সম্পাদনা', 'Edit');
  String get delete => t('মুছুন', 'Delete');
  String get confirm => t('নিশ্চিত করুন', 'Confirm');
  String get saveFailed => t('সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।', 'Could not save. Please try again.');
  String get loadFailed => t('তথ্য আনা যায়নি। আবার চেষ্টা করুন।', 'Could not load. Please try again.');
  String get required => t('এই ঘরটি পূরণ করুন', 'This field is required');
  String get saved => t('সংরক্ষিত হয়েছে', 'Saved');
  String get reasonLabel => t('কারণ', 'Reason');

  // assetRegister.* ---------------------------------------------------------
  String get assetTitle => t('সম্পদ রেজিস্টার', 'Asset register');
  String get assetSubtitle => t('সোসাইটির সকল স্থাবর/অস্থাবর সম্পদের হিসাব।', 'Every movable and immovable society asset.');
  String get assetPdf => t('রেজিস্টার (PDF)', 'Register (PDF)');
  String get assetAdd => t('নতুন সম্পদ', 'New asset');
  String get assetAddTitle => t('সম্পদ যোগ করুন', 'Add asset');
  String get assetEditTitle => t('সম্পদ সম্পাদনা', 'Edit asset');
  String get assetSearch => t('নাম/কোড/খাত দিয়ে খুঁজুন…', 'Search by name/code/category…');
  String get assetIncludeInactive => t('বাতিল সম্পদও দেখান', 'Show removed assets too');
  String get assetEmpty => t('সম্পদ রেজিস্টার খালি।', 'The asset register is empty.');
  String get assetCode => t('কোড', 'Code');
  String get assetName => t('সম্পদের নাম', 'Asset name');
  String get assetCategory => t('খাত', 'Category');
  String get assetAcquired => t('অর্জনের তারিখ', 'Acquired on');
  String get assetValue => t('মূল্য (টাকা)', 'Value (Tk)');
  String get assetCondition => t('অবস্থা', 'Condition');
  String get assetInactive => t('বাতিল', 'Removed');
  String get assetLocation => t('অবস্থান', 'Location');
  String get assetDescription => t('বিবরণ', 'Description');
  String get assetDeactivateReason => t('রেজিস্টার থেকে বাদ দেওয়ার কারণ:', 'Reason for removing from the register:');
  String get assetLoadError => t('সম্পদ লোড করা যায়নি।', 'Could not load assets.');
  String get assetFormSubtitle => t('সম্পদের সঠিক তথ্য পূরণ করুন।', 'Fill in the asset details.');
  String get assetValueInvalid => t('সঠিক মূল্য লিখুন', 'Enter a valid value');

  String condition(String c) => switch (c) {
        'good' => t('ভালো', 'Good'),
        'fair' => t('মোটামুটি', 'Fair'),
        'poor' => t('নষ্টপ্রায়', 'Poor'),
        'lost' => t('হারানো', 'Lost'),
        _ => '—',
      };

  // welfareActivities.* ----------------------------------------------------
  String get actTitle => t('কল্যাণমূলক কার্যক্রম', 'Welfare activities');
  String get actSubtitle =>
      t('প্রশিক্ষণ, কল্যাণ ও অন্যান্য কার্যক্রমের রেকর্ড।', 'Record of training, welfare and other activities.');
  String get actPdf => t('তালিকা (PDF)', 'List (PDF)');
  String get actAdd => t('নতুন কার্যক্রম', 'New activity');
  String get actAddTitle => t('কার্যক্রম যোগ করুন', 'Add activity');
  String get actEditTitle => t('কার্যক্রম সম্পাদনা', 'Edit activity');
  String get actFormHint =>
      t('কার্যক্রমের তথ্য কল্যাণমূলক রেকর্ডে দেখা যাবে।', 'The activity will appear in the welfare record.');
  String get actAllTypes => t('সব ধরন', 'All types');
  String get actType => t('ধরন', 'Type');
  String get actTitleLabel => t('কার্যক্রমের শিরোনাম', 'Activity title');
  String get actDate => t('তারিখ', 'Date');
  String get actParticipantsLabel => t('অংশগ্রহণকারীর সংখ্যা', 'Number of participants');
  String actParticipants(String count) => t('অংশগ্রহণকারী: $count জন', 'Participants: $count');
  String get actOrganizer => t('আয়োজক', 'Organiser');
  String get actOutcome => t('ফলাফল', 'Outcome');
  String get actEmpty => t('কোনো কার্যক্রম নিবন্ধিত হয়নি।', 'No activity recorded yet.');
  String get actLoadError => t('কার্যক্রম লোড করা যায়নি।', 'Could not load activities.');
  String get actDeleteConfirm => t('এই কার্যক্রমটি মুছে ফেলবেন?', 'Delete this activity?');
  String get actCountInvalid => t('০ বা তার বেশি সংখ্যা লিখুন', 'Enter 0 or more');

  String activityType(String type) => switch (type) {
        'training' => t('প্রশিক্ষণ', 'Training'),
        'welfare' => t('কল্যাণমূলক', 'Welfare'),
        'other' => t('অন্যান্য', 'Other'),
        _ => '—',
      };
}

/// Accepts Bangla or English digits and thousands commas; null when not a number.
num? parseLocalNumber(String text) {
  const bnDigits = '০১২৩৪৫৬৭৮৯';
  final ascii = text.trim().split('').map((ch) {
    final i = bnDigits.indexOf(ch);
    return i >= 0 ? '$i' : ch;
  }).join().replaceAll(',', '');
  return num.tryParse(ascii);
}

/// `yyyy-MM-dd` for [date] (the format every register endpoint takes).
String isoDay(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
