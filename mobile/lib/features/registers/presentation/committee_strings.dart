import 'package:flutter/widgets.dart';

import '../domain/committee_registry_entities.dart';
import 'registers_strings.dart';

/// Committee registry text, copied from the Angular `committeeRegistry.*` keys.
/// Pending l10n: move these into app_*.arb and delete this file.
class CommitteeStrings extends RegistersStrings {
  const CommitteeStrings(super.isBn);

  factory CommitteeStrings.of(BuildContext context) =>
      CommitteeStrings(Localizations.localeOf(context).languageCode == 'bn');

  String get title => t('কমিটি রেজিস্ট্রি', 'Committee registry');
  String get subtitle => t('১১ পদের পরিষদের দায়িত্বে থাকা সদস্য, মেয়াদ ও শূন্যপদের হিসাব।',
      'Office holders, terms and vacancies of the 11-post council.');
  String get expiredWarning =>
      t('মেয়াদোত্তীর্ণ পরিষদ শুধু নিয়মিত কাজ করতে পারে', 'An expired council may only do routine work');
  String get holder => t('দায়িত্বে', 'Holder');
  String get termStart => t('মেয়াদ শুরু', 'Term start');
  String get termEnd => t('মেয়াদ শেষ', 'Term end');
  String get termEndHint =>
      t('খালি রাখলে শুরুর তারিখ থেকে ৩ বছর ধরে হিসাব হবে।', 'Leave empty to count 3 years from the start.');
  String get history => t('ইতিহাস', 'History');
  String get ongoing => t('চলমান', 'Ongoing');
  String get emptyHistory => t('এই পদে এখনো কোনো মেয়াদের রেকর্ড নেই।', 'No term recorded for this post yet.');
  String get emptyVacancies => t('কোনো শূন্যপদ বা পদত্যাগের মামলা নেই।', 'No vacancy or resignation case.');
  String get emptyVacanciesHint => t(
      'উপরের রেজিস্ট্রি থেকে পদত্যাগ বা অপসারণ নথিভুক্ত হলে সেই মামলা ও জবাবের সময়সীমা এখানে দেখা যাবে।',
      'Resignations and removals recorded above appear here with their response deadline.');
  String get filterNoMatch => t('এই ফিল্টারে কোনো মামলা নেই।', 'No case matches this filter.');
  String get editTerm => t('মেয়াদ সম্পাদনা', 'Edit term');
  String get createTermTitle => t('নতুন মেয়াদ তৈরি', 'Create a new term');
  String get saveTerm => t('মেয়াদ সংরক্ষণ', 'Save term');
  String get member => t('সদস্য', 'Member');
  String get memberRequired => t('একজন সদস্য নির্বাচন করুন।', 'Choose a member.');
  String get caretaker => t('তত্ত্বাবধায়ক মেয়াদ (শুধু নিয়মিত কাজ)', 'Caretaker term (routine work only)');
  String get notes => t('নোট (ঐচ্ছিক)', 'Notes (optional)');
  String get vacanciesTitle => t('শূন্যপদ, পদত্যাগ ও অপসারণ', 'Vacancies, resignations and removals');
  String get vacanciesSubtitle => t('পদত্যাগ ও অপসারণের মামলা — জবাবের শেষ তারিখ, সদস্যের জবাব ও চূড়ান্ত সিদ্ধান্তসহ।',
      'Resignation and removal cases with the response deadline, reply and decision.');
  String get responseDeadline => t('জবাবের শেষ তারিখ', 'Response deadline');
  String get memberResponse => t('সদস্যের জবাব', 'Member response');
  String get acknowledge => t('পদত্যাগ স্বীকার করুন', 'Acknowledge resignation');
  String get removalNotice => t('অপসারণ নোটিশ', 'Removal notice');
  String get investigationNote => t('তদন্তের নোট', 'Investigation note');
  String get removalWindowHint => t('নোটিশ দিলে সদস্য ১৫ কার্যদিবসের মধ্যে লিখিত জবাব দিতে পারবেন।',
      'After the notice the member has 15 working days to reply in writing.');
  String get issueRemoval => t('অপসারণ প্রক্রিয়া শুরু করুন', 'Start removal');
  String get decisionNote => t('সিদ্ধান্তের নোট', 'Decision note');
  String get decideTitle => t('চূড়ান্ত সিদ্ধান্ত', 'Final decision');
  String get decideRemoved => t('পদ থেকে অপসারণ', 'Remove from post');
  String get decideRetained => t('দায়িত্বে বহাল', 'Retain in post');
  String decideRemovedConfirm(String m) => t('$m-কে পদ থেকে অপসারণ করা হবে এবং মেয়াদ শেষ করা হবে। নিশ্চিত?',
      '$m will be removed from the post and the term ended. Sure?');
  String decideRetainedConfirm(String m) => t('$m দায়িত্বে বহাল থাকবেন। নিশ্চিত?', '$m will stay in post. Sure?');
  String get recordResignation => t('পদত্যাগ রেকর্ড করুন', 'Record resignation');
  String resignConfirm(String post) => t('$post পদের দায়িত্বে থাকা সদস্যের পদত্যাগ রেকর্ড করা হবে (স্বীকৃতির অপেক্ষায় যাবে)।',
      'The resignation of the $post holder will be recorded (pending acknowledgement).');
  String get openVacancy => t('শূন্যপদ চলছে', 'Open vacancy');
  String get loadError => t('কমিটি রেজিস্ট্রি লোড করা যায়নি।', 'Could not load the committee registry.');
  String get actionError => t('কাজটি সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।', 'The action failed. Please try again.');
  String get vacant => t('শূন্যপদ', 'Vacant');
  String daysLeft(String n) => t('$n দিন বাকি', '$n days left');
  String daysOverdue(String n) => t('$n দিন অতিবাহিত', '$n days overdue');

  String filter(CaseFilter f) => switch (f) {
        CaseFilter.all => t('সব', 'All'),
        CaseFilter.pending => t('স্বীকৃতির অপেক্ষায়', 'Pending'),
        CaseFilter.progress => t('চলমান', 'In progress'),
        CaseFilter.decided => t('সিদ্ধান্ত হয়েছে', 'Decided'),
      };

  String termStatus(String s) => switch (s) {
        'active' => t('চলমান', 'Active'),
        'expired' => t('সময়সীমা উত্তীর্ণ', 'Expired'),
        'caretaker' => t('তত্ত্বাবধায়ক', 'Caretaker'),
        'vacant' => t('শূন্যপদ', 'Vacant'),
        _ => '—',
      };

  String vacancyType(String s) => switch (s) {
        'resignation' => t('পদত্যাগ', 'Resignation'),
        'removal' => t('অপসারণ প্রক্রিয়া', 'Removal'),
        _ => '—',
      };

  String vacancyStatus(String s) => switch (s) {
        'pending_acknowledgement' => t('স্বীকৃতির অপেক্ষায়', 'Pending acknowledgement'),
        'investigation' => t('তদন্ত চলছে', 'Under investigation'),
        'acknowledged' => t('স্বীকৃত', 'Acknowledged'),
        'decided' => t('সিদ্ধান্ত হয়েছে', 'Decided'),
        _ => '—',
      };

  String sla(String s) => switch (s) {
        'on_track' => t('সময়ে আছে', 'On track'),
        'due_soon' => t('শিগগির শেষ', 'Due soon'),
        'overdue' => t('সময় পেরিয়েছে', 'Overdue'),
        'met' => t('সম্পন্ন', 'Met'),
        _ => '—',
      };

  String decision(String s) => switch (s) {
        'removed' => decideRemoved,
        'retained' => decideRetained,
        _ => '—',
      };
}
