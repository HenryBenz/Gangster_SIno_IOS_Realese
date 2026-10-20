import type { EndingDef } from './types';

export type EndingId = EndingDef['id'];

export function selectEnding(input: {
  influence: number;
  heat: number;
  averageLoyalty: number;
  heatEndingOverride: boolean;
}): EndingId {
  if (input.heat >= 100 && !input.heatEndingOverride) {
    return 'city_without_boss';
  }
  if (input.influence >= 70 && input.heat < 70 && input.averageLoyalty >= 65) {
    return 'king_of_last_call';
  }
  if (input.averageLoyalty >= 75) {
    return 'family_holds';
  }
  return 'city_without_boss';
}

export function averageLoyalty(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
