/// Server-controlled UX switches served by GET /public/feature-flags.
/// [key] is the snake_case name used by the backend and the Angular app.
enum FeatureFlag {
  regOccupationOptional('reg_occupation_optional'),
  regHideNationality('reg_hide_nationality'),
  regRoadOptional('reg_road_optional'),
  regDagUnknown('reg_dag_unknown'),
  regAddPropertyButton('reg_add_property_button'),
  regMinOneProof('reg_min_one_proof'),
  regAbroadAddress('reg_abroad_address'),
  regSimplifiedUi('reg_simplified_ui'),
  passwordPolicyV2('password_policy_v2'),
  navMergedEntries('nav_merged_entries'),
  navAdvancedSection('nav_advanced_section'),
  payMergedPage('pay_merged_page'),
  navFiveAreas('nav_five_areas');

  const FeatureFlag(this.key);

  final String key;
}
