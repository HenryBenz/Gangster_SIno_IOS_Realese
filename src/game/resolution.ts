import { APPROACH_SKILL, CHANCE_LABEL } from './constants';
import type {
  ApproachId,
  ChanceId,
  CharacterDef,
  CharacterId,
  OperationDef,
  OutcomeId,
  RelationshipDef,
  Resolution,
  SkillId,
} from './types';

export function pairKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

export function relationshipBetween(
  a: string,
  b: string,
  relationships: RelationshipDef[],
): RelationshipDef | null {
  const key = pairKey(a, b);
  return relationships.find((row) => pairKey(row.a, row.b) === key) ?? null;
}

export function skillValue(character: CharacterDef, skill: SkillId): number {
  return character[skill];
}

export function predictOutcome(score: number, threshold: number): OutcomeId {
  if (score >= threshold + 3) return 'strongSuccess';
  if (score >= threshold) return 'success';
  return 'failure';
}

export function chanceForOutcome(outcome: OutcomeId): ChanceId {
  if (outcome === 'strongSuccess') return 'strong';
  if (outcome === 'success') return 'good';
  return 'risky';
}

export function chanceLabel(chance: ChanceId): string {
  return CHANCE_LABEL[chance];
}

export function revealsConsequenceHint(selectedCrewIds: string[]): boolean {
  return selectedCrewIds.includes('miles');
}

export function traitScoreBonus(input: {
  approach: ApproachId;
  assignedIds: string[];
  charmBonusUsedThisNight: boolean;
}): number {
  if (
    input.approach === 'talk' &&
    input.assignedIds.includes('vincent') &&
    !input.charmBonusUsedThisNight
  ) {
    return 1;
  }
  return 0;
}

export function evaluateOperation(input: {
  operation: OperationDef;
  assignedIds: string[];
  approach: ApproachId;
  preparation: boolean;
  characters: CharacterDef[];
  relationships: RelationshipDef[];
  charmBonusUsedThisNight: boolean;
}): Resolution {
  const skill = APPROACH_SKILL[input.approach];
  const byId = new Map(input.characters.map((character) => [character.id, character]));
  const skillSum = input.assignedIds.reduce((sum, id) => {
    const character = byId.get(id as CharacterId);
    return sum + (character ? skillValue(character, skill) : 0);
  }, 0);

  const traitBonus = traitScoreBonus({
    approach: input.approach,
    assignedIds: input.assignedIds,
    charmBonusUsedThisNight: input.charmBonusUsedThisNight,
  });

  let relationshipBonus = 0;
  let relationshipPhrase: string | null = null;
  if (input.assignedIds.length === 2) {
    const rel = relationshipBetween(input.assignedIds[0], input.assignedIds[1], input.relationships);
    if (rel && rel.bonus !== 0) {
      relationshipBonus = rel.bonus;
      relationshipPhrase = rel.phrase;
    }
  }

  const preparationBonus = input.preparation ? input.operation.preparation?.bonus ?? 0 : 0;
  const score = skillSum + traitBonus + relationshipBonus + preparationBonus;
  const outcome = predictOutcome(score, input.operation.threshold);
  const block =
    outcome === 'strongSuccess'
      ? input.operation.strongSuccess
      : outcome === 'success'
        ? input.operation.success
        : input.operation.failure;

  let cash = block.cash;
  let heat = block.heat;
  let loyalty = block.loyalty;
  const eliasAssigned = input.assignedIds.includes('elias');
  const roxieAssigned = input.assignedIds.includes('roxie');
  const brunoAssigned = input.assignedIds.includes('bruno');
  const juneAssigned = input.assignedIds.includes('june');
  const social = input.operation.tags.includes('club') || input.operation.tags.includes('society');
  const transport = input.operation.tags.includes('transport');

  if (eliasAssigned && cash > 0) {
    cash = Math.ceil(cash * 1.1);
  }
  if (juneAssigned && transport && cash < 0) {
    cash = 0;
  }
  if (roxieAssigned && social) {
    heat -= 2;
  }
  if (brunoAssigned && input.approach === 'standFirm' && outcome === 'failure' && loyalty < 0) {
    loyalty = 0;
  }

  const loyaltyByCharacter: Partial<Record<CharacterId, number>> = {};
  for (const id of input.assignedIds) {
    loyaltyByCharacter[id as CharacterId] = loyalty;
  }

  let ignoredCash = input.operation.ignored.cash;
  const ignoredLoyalty = input.operation.ignored.loyalty;
  const ignoredLoyaltyByCharacter: Partial<Record<CharacterId, number>> = {};
  if (ignoredLoyalty !== 0) {
    for (const id of input.assignedIds) {
      ignoredLoyaltyByCharacter[id as CharacterId] = ignoredLoyalty;
    }
  }

  return {
    score,
    outcome,
    chance: chanceForOutcome(outcome),
    traitBonus,
    relationshipBonus,
    relationshipPhrase,
    preparationBonus,
    text: block.text,
    cash,
    influence: block.influence,
    heat,
    loyaltyByCharacter,
    ignoredText: input.operation.ignored.text,
    ignoredCash,
    ignoredInfluence: input.operation.ignored.influence,
    ignoredHeat: input.operation.ignored.heat,
    ignoredLoyaltyByCharacter,
  };
}

export function preparationCashCost(input: {
  operation: OperationDef;
  assignedIds: string[];
  preparation: boolean;
}): number {
  if (!input.preparation || !input.operation.preparation) return 0;
  const transport = input.operation.tags.includes('transport');
  if (transport && input.assignedIds.includes('june')) return 0;
  return input.operation.preparation.cost;
}

export function canAffordPreparation(cash: number, cost: number): boolean {
  return cash >= cost;
}

function groupsWithEnergy(
  crewIds: string[],
  energy: Record<string, number>,
  minCharacters: number,
  maxCharacters: number,
): string[][] {
  const available = crewIds.filter((id) => (energy[id] ?? 0) >= 1);
  const groups: string[][] = [];
  const walk = (start: number, picked: string[]) => {
    if (picked.length >= minCharacters && picked.length <= maxCharacters) groups.push([...picked]);
    if (picked.length === maxCharacters) return;
    for (let index = start; index < available.length; index += 1) {
      picked.push(available[index]);
      walk(index + 1, picked);
      picked.pop();
    }
  };
  walk(0, []);
  return groups;
}

/** True when some choice of operation and crew can still finish every later phase. */
export function canStaffRemainingPhases(
  crewIds: string[],
  energy: Record<string, number>,
  phases: Array<Array<{ minCharacters: number; maxCharacters: number }>>,
): boolean {
  const walk = (current: Record<string, number>, index: number): boolean => {
    if (index >= phases.length) return true;
    for (const operation of phases[index]) {
      for (const assigned of groupsWithEnergy(crewIds, current, operation.minCharacters, operation.maxCharacters)) {
        const next = { ...current };
        for (const id of assigned) next[id] -= 1;
        if (walk(next, index + 1)) return true;
      }
    }
    return false;
  };
  return walk(energy, 0);
}

export function combinedSkills(
  characters: CharacterDef[],
  ids: string[],
): Record<SkillId, number> {
  const totals: Record<SkillId, number> = { charm: 0, nerve: 0, cunning: 0 };
  const byId = new Map(characters.map((character) => [character.id, character]));
  for (const id of ids) {
    const character = byId.get(id as CharacterId);
    if (!character) continue;
    totals.charm += character.charm;
    totals.nerve += character.nerve;
    totals.cunning += character.cunning;
  }
  return totals;
}

export function strongestSkillLabel(totals: Record<SkillId, number>): string {
  const entries = Object.entries(totals) as Array<[SkillId, number]>;
  const best = Math.max(...entries.map(([, value]) => value));
  const names = entries
    .filter(([, value]) => value === best)
    .map(([skill]) => skill.charAt(0).toUpperCase() + skill.slice(1));
  return `${names.join(' & ')} ${best}`;
}
