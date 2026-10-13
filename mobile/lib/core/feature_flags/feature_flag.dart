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
  navFiveAreas('nav_five_areas'),
  // Batch 4: plot map wizard.
  mapWizard('map_wizard'),
  // Batch 5: admin console. feeWizard is Angular-only for now.
  adminConsole('admin_console'),
  adminBulkVerify('admin_bulk_verify'),
  feeWizard('fee_wizard'),
  // Batch 6: login by mobile / member email (password_policy_v2 is above).
  loginByPhone('login_by_phone'),
  // Batch 7: accessibility, data saver, network banner.
  uiA11yV2('ui_a11y_v2'),
  dataSaver('data_saver'),
  netStatusBanner('net_status_banner');

  const FeatureFlag(this.key);

  final String key;
}
