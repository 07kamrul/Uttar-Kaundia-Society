import type { FeatureFlagKey } from '../../core/services/feature-flag.service';

/** The registration-related feature flags, resolved once and handed to the step components. */
export interface RegistrationUiFlags {
  simplified: boolean;
  abroadAddress: boolean;
  hideNationality: boolean;
  occupationOptional: boolean;
  roadOptional: boolean;
  addPropertyButton: boolean;
  dagUnknown: boolean;
  minOneProof: boolean;
}

/** Every flag off: the behaviour the form had before the UX simplification. */
export const NO_UI_FLAGS: RegistrationUiFlags = Object.freeze({
  simplified: false,
  abroadAddress: false,
  hideNationality: false,
  occupationOptional: false,
  roadOptional: false,
  addPropertyButton: false,
  dagUnknown: false,
  minOneProof: false,
});

export function readUiFlags(isEnabled: (key: FeatureFlagKey) => boolean): RegistrationUiFlags {
  return {
    simplified: isEnabled('reg_simplified_ui'),
    abroadAddress: isEnabled('reg_abroad_address'),
    hideNationality: isEnabled('reg_hide_nationality'),
    occupationOptional: isEnabled('reg_occupation_optional'),
    roadOptional: isEnabled('reg_road_optional'),
    addPropertyButton: isEnabled('reg_add_property_button'),
    dagUnknown: isEnabled('reg_dag_unknown'),
    minOneProof: isEnabled('reg_min_one_proof'),
  };
}
