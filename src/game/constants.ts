import type { ApproachId, CharacterId, SkillId } from './types';

export const SCHEMA_VERSION = 1;

/** Specified start. */
export const STARTING_CASH = 500;

/**
 * Influence, Heat, and Loyalty are specified as 0–100 ranges.
 * Only Cash has a written start value. These initials keep every
 * ending threshold in section 4.7 reachable across twelve Nights.
 */
export const STARTING_INFLUENCE = 20;
export const STARTING_HEAT = 10;
export const STARTING_LOYALTY = 60;

export const FREE_NIGHT_LIMIT = 3;
export const PRODUCT_ID = 'gangster_sino_black_label';

/** Heat line from the King of the Last Call condition. */
export const HIGH_HEAT_MUSIC = 70;

export const CHARACTER_IDS: CharacterId[] = ['vincent', 'roxie', 'bruno', 'elias', 'june', 'miles'];

export const APPROACH_SKILL: Record<ApproachId, SkillId> = {
  talk: 'charm',
  standFirm: 'nerve',
  outsmart: 'cunning',
};

export const APPROACH_LABEL: Record<ApproachId, string> = {
  talk: 'Talk',
  standFirm: 'Stand Firm',
  outsmart: 'Outsmart',
};

export const PHASE_LABEL = {
  dusk: 'Dusk',
  midnight: 'Midnight',
  lastCall: 'Last Call',
} as const;

export const CHANCE_LABEL = {
  strong: 'Strong chance',
  good: 'Good chance',
  risky: 'Risky',
} as const;

export const OUTCOME_LABEL = {
  strongSuccess: 'Strong Success',
  success: 'Success',
  failure: 'Failure',
} as const;

export function clampUnit(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function clampCash(value: number): number {
  return Math.max(0, Math.round(value));
}
