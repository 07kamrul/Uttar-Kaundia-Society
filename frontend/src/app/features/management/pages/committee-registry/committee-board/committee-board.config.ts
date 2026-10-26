/**
 * Layout of the committee board (org-chart poster). Each tier is one centred
 * row, top to bottom; post keys come from app.services.governance.COUNCIL_POSTS.
 * Posts missing from every tier fall into a trailing tier so nothing is hidden.
 */
export interface BoardTier {
  id: string;
  postKeys: readonly string[];
}

export const EXECUTIVE_TIERS: readonly BoardTier[] = [
  { id: 'president', postKeys: ['president'] },
  { id: 'vice', postKeys: ['vice_president'] },
  { id: 'general', postKeys: ['general_secretary'] },
  { id: 'joint', postKeys: ['joint_secretary'] },
  {
    id: 'secretaries',
    postKeys: [
      'organizing_secretary',
      'treasurer',
      'sports_culture_secretary',
      'religion_welfare_secretary',
      'publicity_secretary',
    ],
  },
  { id: 'members', postKeys: ['executive_member'] },
];

export const STANDING_COUNCIL = 'standing';

export type PillTone = 'navy' | 'teal' | 'purple' | 'blue' | 'green' | 'orange' | 'pink' | 'gold';

/** Role-pill colour per post; unlisted posts use the default tone. */
export const POST_TONES: Readonly<Record<string, PillTone>> = {
  president: 'navy',
  vice_president: 'teal',
  general_secretary: 'purple',
  joint_secretary: 'blue',
  organizing_secretary: 'navy',
  treasurer: 'green',
  sports_culture_secretary: 'orange',
  religion_welfare_secretary: 'teal',
  publicity_secretary: 'pink',
  executive_member: 'blue',
  standing_council_member: 'gold',
};

export const DEFAULT_TONE: PillTone = 'blue';
