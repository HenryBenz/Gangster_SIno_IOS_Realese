import { readFileSync } from 'fs';
import { join } from 'path';
import { confirmCrew, createCampaign, applyOperationResult, commitOperation, isValidSave } from '../campaign';
import { FREE_NIGHT_LIMIT, STARTING_CASH } from '../constants';
import { averageLoyalty, selectEnding } from '../endings';
import { chanceLabel, evaluateOperation, preparationCashCost, revealsConsequenceHint } from '../resolution';
import type { CharacterDef, OperationDef, OutcomeBlock, RelationshipDef } from '../types';

const now = '2026-10-17T00:00:00.000Z';

function character(id: CharacterDef['id'], charm: number, nerve: number, cunning: number): CharacterDef {
  return {
    id,
    name: id,
    nickname: id,
    role: id,
    personality: id,
    charm,
    nerve,
    cunning,
    trait: id,
    cue: id,
    portraits: { neutral: '', confident: '', tense: '' },
    biography: [],
  };
}

const cast = [
  character('vincent', 5, 3, 4),
  character('roxie', 5, 4, 4),
  character('bruno', 2, 5, 3),
  character('elias', 2, 2, 5),
  character('june', 3, 5, 3),
  character('miles', 4, 3, 5),
];

const relationships: RelationshipDef[] = [
  { a: 'vincent', b: 'roxie', kind: 'partnership', bonus: 1, phrase: 'Old partners: +1' },
  { a: 'bruno', b: 'elias', kind: 'conflict', bonus: -1, phrase: 'Tension: −1' },
  { a: 'vincent', b: 'elias', kind: 'neutral', bonus: 0, phrase: null },
];

function outcome(cash: number, influence: number, heat: number, loyalty: number, text: string): OutcomeBlock {
  return { cash, influence, heat, loyalty, text };
}

function operation(patch: Partial<OperationDef>): OperationDef {
  return {
    id: 'op',
    night: 1,
    phase: 'dusk',
    title: 'Op',
    locationName: 'Headquarters',
    background: 'bg_headquarters_table',
    icon: 'decor_blue_folder',
    setup: 'Setup',
    description: 'Description',
    suggestedSkill: 'charm',
    preferredApproach: 'talk',
    neutralApproach: 'outsmart',
    riskyApproach: 'standFirm',
    threshold: 6,
    threat: 'controlled',
    difficulty: 'Steady',
    tags: [],
    rewardIcons: ['influence'],
    minCharacters: 1,
    maxCharacters: 2,
    preparation: null,
    hint: 'A hint.',
    strongSuccess: outcome(100, 4, 0, 2, 'strong'),
    success: outcome(40, 2, 0, 1, 'ok'),
    failure: outcome(-20, -1, 4, -3, 'fail'),
    ignored: { cash: -5, influence: -1, heat: 1, loyalty: 0, text: 'While you were busy…' },
    ...patch,
  };
}

describe('resolution formula', () => {
  it('sums the approach skill, Vincent’s first Charm bonus, partnership, and preparation', () => {
    const result = evaluateOperation({
      operation: operation({ threshold: 6, preparation: { cost: 100, bonus: 2, label: 'Pay 100 Cash for preparation: +2' }, tags: ['club'] }),
      assignedIds: ['vincent', 'roxie'],
      approach: 'talk',
      preparation: true,
      characters: cast,
      relationships,
      charmBonusUsedThisNight: false,
    });
    expect(result.score).toBe(5 + 5 + 1 + 1 + 2);
    expect(result.outcome).toBe('strongSuccess');
    expect(chanceLabel(result.chance)).toBe('Strong chance');
    expect(result.relationshipPhrase).toBe('Old partners: +1');
    expect(result.heat).toBe(-2);
    expect(result.cash).toBe(100);
  });

  it('does not repeat Vincent’s Charm bonus after the first Talk', () => {
    const again = evaluateOperation({
      operation: operation({}),
      assignedIds: ['vincent'],
      approach: 'talk',
      preparation: false,
      characters: cast,
      relationships,
      charmBonusUsedThisNight: true,
    });
    expect(again.traitBonus).toBe(0);
    expect(again.score).toBe(5);
    expect(again.outcome).toBe('failure');
    expect(chanceLabel(again.chance)).toBe('Risky');
  });

  it('applies tension and a normal success label', () => {
    const result = evaluateOperation({
      operation: operation({ threshold: 6, preferredApproach: 'standFirm', suggestedSkill: 'nerve' }),
      assignedIds: ['bruno', 'elias'],
      approach: 'standFirm',
      preparation: false,
      characters: cast,
      relationships,
      charmBonusUsedThisNight: false,
    });
    expect(result.score).toBe(5 + 2 - 1);
    expect(result.outcome).toBe('success');
    expect(chanceLabel(result.chance)).toBe('Good chance');
    expect(result.relationshipPhrase).toBe('Tension: −1');
  });

  it('waives negative loyalty when Bruno fails a Nerve approach', () => {
    const result = evaluateOperation({
      operation: operation({ threshold: 20 }),
      assignedIds: ['bruno'],
      approach: 'standFirm',
      preparation: false,
      characters: cast,
      relationships,
      charmBonusUsedThisNight: false,
    });
    expect(result.outcome).toBe('failure');
    expect(result.loyaltyByCharacter.bruno).toBe(0);
  });

  it('lets June ignore Cash costs on transport and Elias ignore nothing negative', () => {
    const transport = operation({ tags: ['transport'], preparation: { cost: 100, bonus: 2, label: 'Pay 100 Cash for preparation: +2' }, threshold: 20 });
    expect(preparationCashCost({ operation: transport, assignedIds: ['june'], preparation: true })).toBe(0);
    expect(preparationCashCost({ operation: transport, assignedIds: ['elias'], preparation: true })).toBe(100);
    const failed = evaluateOperation({
      operation: transport,
      assignedIds: ['june'],
      approach: 'talk',
      preparation: false,
      characters: cast,
      relationships,
      charmBonusUsedThisNight: false,
    });
    expect(failed.cash).toBe(0);
  });

  it('reveals Miles’s hint only when he is in the selected crew', () => {
    expect(revealsConsequenceHint(['vincent', 'miles', 'june'])).toBe(true);
    expect(revealsConsequenceHint(['vincent', 'roxie', 'june'])).toBe(false);
  });
});

describe('endings', () => {
  it('reaches all three endings from fixtures, including Heat 100', () => {
    expect(selectEnding({ influence: 70, heat: 69, averageLoyalty: 65, heatEndingOverride: false })).toBe('king_of_last_call');
    expect(selectEnding({ influence: 10, heat: 80, averageLoyalty: 75, heatEndingOverride: false })).toBe('family_holds');
    expect(selectEnding({ influence: 90, heat: 10, averageLoyalty: 64, heatEndingOverride: false })).toBe('city_without_boss');
    expect(selectEnding({ influence: 90, heat: 100, averageLoyalty: 90, heatEndingOverride: false })).toBe('city_without_boss');
    expect(selectEnding({ influence: 20, heat: 100, averageLoyalty: 80, heatEndingOverride: true })).toBe('family_holds');
  });

  it('averages all six loyalty values', () => {
    expect(averageLoyalty([60, 60, 60, 60, 60, 90])).toBe(65);
  });
});

describe('campaign persistence rules', () => {
  it('starts Cash at 500 and does not pay an operation result twice', () => {
    const created = createCampaign({ id: 'c', now, newGamePlus: false, biographies: { vincent: ['vincent_1'] } });
    expect(created.cash).toBe(STARTING_CASH);
    expect(created.characterState.vincent.biographyEntries).toEqual(['vincent_1']);
    const crewed = confirmCrew(created, ['vincent', 'roxie', 'elias'], now);
    const committed = commitOperation({
      save: crewed,
      operation: operation({ id: 'once' }),
      assignedIds: ['elias'],
      approach: 'outsmart',
      preparation: false,
      now,
    });
    expect(committed.characterState.elias.energy).toBe(1);
    const first = applyOperationResult({ save: committed, operation: operation({ id: 'once', threshold: 4 }), characters: cast, relationships, now });
    const second = applyOperationResult({ save: first, operation: operation({ id: 'once', threshold: 4 }), characters: cast, relationships, now });
    expect(second.cash).toBe(first.cash);
    expect(second.completedOperationIds).toEqual(['once']);
    expect(first.pendingOperation?.resultApplied).toBe(true);
  });

  it('rejects a corrupt save shape', () => {
    expect(isValidSave(null)).toBe(false);
    expect(isValidSave({ schemaVersion: 1 })).toBe(false);
    expect(isValidSave(createCampaign({ id: 'ok', now, newGamePlus: true, biographies: {} }))).toBe(true);
  });
});

describe('content files', () => {
  const dir = join(__dirname, '../../content');

  it('stores 12 nights, 72 operations, 6 characters, and 3 endings', () => {
    const nights = JSON.parse(readFileSync(join(dir, 'nights.json'), 'utf8'));
    const operations = JSON.parse(readFileSync(join(dir, 'operations.json'), 'utf8'));
    const characters = JSON.parse(readFileSync(join(dir, 'characters.json'), 'utf8'));
    const endings = JSON.parse(readFileSync(join(dir, 'endings.json'), 'utf8'));
    const relationships = JSON.parse(readFileSync(join(dir, 'relationships.json'), 'utf8'));
    expect(nights).toHaveLength(12);
    expect(operations).toHaveLength(72);
    expect(characters).toHaveLength(6);
    expect(endings).toHaveLength(3);
    expect(relationships).toHaveLength(15);
    expect(FREE_NIGHT_LIMIT).toBe(3);
    const night7 = operations.filter((row: OperationDef) => row.night === 7);
    expect(night7.every((row: OperationDef) => row.minCharacters === 2)).toBe(true);
  });
});
