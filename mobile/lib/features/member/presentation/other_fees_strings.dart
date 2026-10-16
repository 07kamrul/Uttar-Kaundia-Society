import 'package:flutter/widgets.dart';

/// Strings the Other Fees page needs that have no ARB key yet. Picks Bangla or
/// English from the active locale. Pending l10n: move these into app_*.arb as
/// `memberOtherFees*` keys and delete this file.
class OtherFeesStrings {
  const OtherFeesStrings._(this._bn);

  factory OtherFeesStrings.of(BuildContext context) =>
      OtherFeesStrings._(Localizations.localeOf(context).languageCode == 'bn');

  final bool _bn;

  String _t(String bn, String en) => _bn ? bn : en;

  String get title => _t('অন্যান্য ফি', 'Other fees');
  String get subtitle => _t('পিকনিক, রক্ষণাবেক্ষণসহ অন্যান্য ফি জমা দিন', 'Pay picnic, maintenance and other fees');
  String get feeTypeLabel => _t('ফির ধরন', 'Fee type');
  String get noFeeTypes => _t('এখন জমা দেওয়ার মতো কোনো ফি নেই।', 'No fee is payable right now.');
  String get amountLabel => _t('টাকার পরিমাণ', 'Amount');
  String get amountRequired => _t('সঠিক পরিমাণ লিখুন', 'Enter a valid amount');
  String get noteLabel => _t('নোট (ঐচ্ছিক)', 'Note (optional)');
  String get alreadyPaid => _t('এই ফি একবারই দিতে হয় এবং আপনি আগেই দিয়েছেন।', 'This one-time fee is already paid.');
  String saveSuccess(num total) => _t('৳ $total জমা হয়েছে।', 'Payment of ৳ $total saved.');
  String get historyTitle => _t('পেমেন্ট ইতিহাস', 'Payment history');
  String get historyEmpty => _t('কোনো পেমেন্ট পাওয়া যায়নি।', 'No payments found.');
  String get allTypes => _t('সব ধরন', 'All types');
  String get dateFrom => _t('শুরুর তারিখ', 'From');
  String get dateTo => _t('শেষ তারিখ', 'To');
  String get apply => _t('প্রয়োগ', 'Apply');
  String get reset => _t('রিসেট', 'Reset');
  String totalPaid(num total) => _t('মোট পরিশোধ: ৳ $total', 'Total paid: ৳ $total');
  String pageOf(int page, int total) => _t('পৃষ্ঠা $page / $total', 'Page $page of $total');
  String get previous => _t('আগের পৃষ্ঠা', 'Previous page');
  String get next => _t('পরের পৃষ্ঠা', 'Next page');
  String get detailsAdmission => _t('ভর্তি ফি', 'Admission fee');
  String detailsHeads(int n) => _t('অতিরিক্ত $n জন', '$n additional heads');
  String get statusPending => _t('যাচাই চলছে', 'Pending');
  String get statusApproved => _t('অনুমোদিত', 'Approved');
  String get statusRejected => _t('বাতিল', 'Rejected');

  String status(String raw) => switch (raw) {
        'pending' => statusPending,
        'rejected' => statusRejected,
        _ => statusApproved,
      };
}

/// "maintenance_fee" -> "Maintenance Fee" when the catalog has no label.
String humanizeFeeKey(String key) => key
    .split('_')
    .where((w) => w.isNotEmpty)
    .map((w) => '${w[0].toUpperCase()}${w.substring(1)}')
    .join(' ');
