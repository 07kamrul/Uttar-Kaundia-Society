import '../../../core/feature_flags/feature_flag.dart';

/// Immutable snapshot of the registration feature flags. Every flag defaults to
/// off, which keeps today's behaviour. Domain functions take this value so they
/// stay pure and testable without the flags service.
class RegFlags {
  const RegFlags({
    this.occupationOptional = false,
    this.hideNationality = false,
    this.roadOptional = false,
    this.dagUnknown = false,
    this.addPropertyButton = false,
    this.minOneProof = false,
    this.abroadAddress = false,
    this.simplifiedUi = false,
  });

  /// All flags off.
  static const off = RegFlags();

  /// Builds a snapshot from any flag lookup (e.g. `FeatureFlagsService.isEnabled`).
  factory RegFlags.from(bool Function(FeatureFlag flag) isEnabled) => RegFlags(
        occupationOptional: isEnabled(FeatureFlag.regOccupationOptional),
        hideNationality: isEnabled(FeatureFlag.regHideNationality),
        roadOptional: isEnabled(FeatureFlag.regRoadOptional),
        dagUnknown: isEnabled(FeatureFlag.regDagUnknown),
        addPropertyButton: isEnabled(FeatureFlag.regAddPropertyButton),
        minOneProof: isEnabled(FeatureFlag.regMinOneProof),
        abroadAddress: isEnabled(FeatureFlag.regAbroadAddress),
        simplifiedUi: isEnabled(FeatureFlag.regSimplifiedUi),
      );

  final bool occupationOptional;
  final bool hideNationality;
  final bool roadOptional;
  final bool dagUnknown;
  final bool addPropertyButton;
  final bool minOneProof;
  final bool abroadAddress;
  final bool simplifiedUi;

  @override
  bool operator ==(Object other) =>
      other is RegFlags &&
      other.occupationOptional == occupationOptional &&
      other.hideNationality == hideNationality &&
      other.roadOptional == roadOptional &&
      other.dagUnknown == dagUnknown &&
      other.addPropertyButton == addPropertyButton &&
      other.minOneProof == minOneProof &&
      other.abroadAddress == abroadAddress &&
      other.simplifiedUi == simplifiedUi;

  @override
  int get hashCode => Object.hash(occupationOptional, hideNationality, roadOptional, dagUnknown,
      addPropertyButton, minOneProof, abroadAddress, simplifiedUi);
}
