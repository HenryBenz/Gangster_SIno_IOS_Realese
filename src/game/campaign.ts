import {
  CHARACTER_IDS,
  STARTING_CASH,
  STARTING_HEAT,
  STARTING_INFLUENCE,
  STARTING_LOYALTY,
  clampCash,
  clampUnit,
} from './constants';
import { averageLoyalty, selectEnding } from './endings';
import { evaluateOperation, preparationCashCost } from './resolution';
import type {
  ApproachId,
  CharacterDef,
  CharacterId,
  DialogueScene,
  GameSave,
  NightDef,
  OperationDef,
  PhaseId,
  RelationshipDef,
} from './types';

function emptyUses(): Record<CharacterId, number> {
  return { vincent: 0, roxie: 0, bruno: 0, elias: 0, june: 0, miles: 0 };
}

function loyaltyMap(save: GameSave): Record<CharacterId, number> {
  const loyalty = {} as Record<CharacterId, number>;
  for (const id of CHARACTER_IDS) loyalty[id] = save.characterState[id].loyalty;
  return loyalty;
}

export function loyaltyValues(save: GameSave): number[] {
  return CHARACTER_IDS.map((id) => save.characterState[id].loyalty);
}

export function displayedLoyalty(save: GameSave): number {
  return Math.round(averageLoyalty(loyaltyValues(save)));
}

function touch(save: GameSave, now: string): GameSave {
  return { ...save, lastSavedAt: now };
}

export function createCampaign(input: {
  id: string;
  now: string;
  newGamePlus: boolean;
  biographies: Partial<Record<CharacterId, string[]>>;
}): GameSave {
  const characterState = {} as GameSave['characterState'];
  const baselineLoyalty = {} as Record<CharacterId, number>;
  for (const id of CHARACTER_IDS) {
    const entries = [...(input.biographies[id] ?? [])];
    characterState[id] = {
      loyalty: STARTING_LOYALTY,
      energy: 2,
      biographyEntries: entries,
    };
    baselineLoyalty[id] = STARTING_LOYALTY;
  }
  return {
    schemaVersion: 1,
    campaignId: input.id,
    startedAt: input.now,
    lastSavedAt: input.now,
    currentNight: 1,
    currentStep: 'nightIntro',
    currentPhaseIndex: 0,
    cash: STARTING_CASH,
    influence: STARTING_INFLUENCE,
    heat: STARTING_HEAT,
    selectedCrewIds: [],
    characterState,
    completedOperationIds: [],
    ignoredOperationIds: [],
    choices: {},
    viewedSceneIds: [],
    unlockedEndingIds: [],
    newGamePlus: input.newGamePlus,
    activeSceneId: 'prologue',
    activeSceneLineId: null,
    pendingEndingId: null,
    pendingOperation: null,
    flags: [],
    charmBonusUsedThisNight: false,
    nightBaseline: {
      cash: STARTING_CASH,
      influence: STARTING_INFLUENCE,
      heat: STARTING_HEAT,
      loyalty: baselineLoyalty,
    },
    nightDecisions: [],
    stats: {
      strongSuccess: 0,
      success: 0,
      failure: 0,
      characterUses: emptyUses(),
    },
    heatEndingLatched: false,
  };
}

export function isValidSave(value: unknown): value is GameSave {
  if (!value || typeof value !== 'object') return false;
  const save = value as GameSave;
  if (save.schemaVersion !== 1) return false;
  if (typeof save.campaignId !== 'string' || save.campaignId.length === 0) return false;
  if (!Number.isInteger(save.currentNight) || save.currentNight < 1 || save.currentNight > 12) return false;
  const steps = ['nightIntro', 'briefing', 'crewSelection', 'dusk', 'midnight', 'lastCall', 'nightSummary', 'ending'];
  if (!steps.includes(save.currentStep)) return false;
  if (![0, 1, 2].includes(save.currentPhaseIndex)) return false;
  if (typeof save.cash !== 'number' || typeof save.influence !== 'number' || typeof save.heat !== 'number') return false;
  if (!save.characterState) return false;
  for (const id of CHARACTER_IDS) {
    const row = save.characterState[id];
    if (!row || typeof row.loyalty !== 'number' || typeof row.energy !== 'number' || !Array.isArray(row.biographyEntries)) {
      return false;
    }
  }
  if (!Array.isArray(save.selectedCrewIds)) return false;
  if (!Array.isArray(save.completedOperationIds) || !Array.isArray(save.ignoredOperationIds)) return false;
  if (!save.choices || !save.stats || !save.nightBaseline) return false;
  return true;
}

export function beginNight(save: GameSave, now: string): GameSave {
  const characterState = { ...save.characterState };
  for (const id of CHARACTER_IDS) {
    characterState[id] = { ...characterState[id], energy: 2 };
  }
  return touch(
    {
      ...save,
      characterState,
      selectedCrewIds: [],
      currentStep: 'nightIntro',
      currentPhaseIndex: 0,
      pendingOperation: null,
      charmBonusUsedThisNight: false,
      nightDecisions: [],
      heatEndingLatched: false,
      nightBaseline: {
        cash: save.cash,
        influence: save.influence,
        heat: save.heat,
        loyalty: loyaltyMap({ ...save, characterState }),
      },
    },
    now,
  );
}

export function confirmCrew(save: GameSave, ids: string[], now: string): GameSave {
  if (ids.length !== 3) return save;
  const characterState = { ...save.characterState };
  for (const id of CHARACTER_IDS) {
    characterState[id] = {
      ...characterState[id],
      energy: ids.includes(id) ? 2 : 0,
    };
  }
  return touch(
    {
      ...save,
      selectedCrewIds: [...ids],
      characterState,
      currentStep: 'dusk',
      currentPhaseIndex: 0,
    },
    now,
  );
}

export function commitOperation(input: {
  save: GameSave;
  operation: OperationDef;
  ignoredOperation?: OperationDef;
  assignedIds: string[];
  approach: ApproachId;
  preparation: boolean;
  now: string;
}): GameSave {
  const { save, operation } = input;
  const ignored = input.ignoredOperation ?? operation;
  if (save.pendingOperation && !save.pendingOperation.ignoredApplied) return save;
  for (const id of input.assignedIds) {
    if ((save.characterState[id as CharacterId]?.energy ?? 0) < 1) return save;
  }
  const cost = preparationCashCost({
    operation,
    assignedIds: input.assignedIds,
    preparation: input.preparation,
  });
  if (save.cash < cost) return save;
  const characterState = { ...save.characterState };
  const characterUses = { ...save.stats.characterUses };
  for (const id of input.assignedIds) {
    const key = id as CharacterId;
    characterState[key] = { ...characterState[key], energy: characterState[key].energy - 1 };
    characterUses[key] = (characterUses[key] ?? 0) + 1;
  }
  const decisions = [...save.nightDecisions];
  const choiceCount = decisions.filter((row) => row.kind === 'choice').length;
  const operationCount = decisions.filter((row) => row.kind === 'operation').length;
  if (choiceCount + operationCount < 3 && !decisions.some((row) => row.text === operation.title)) {
    decisions.push({ text: operation.title, kind: 'operation' });
  }
  return touch(
    {
      ...save,
      cash: clampCash(save.cash - cost),
      characterState,
      nightDecisions: decisions,
      stats: { ...save.stats, characterUses },
      pendingOperation: {
        operationId: operation.id,
        approach: input.approach,
        assignedIds: [...input.assignedIds],
        preparation: input.preparation,
        costsApplied: true,
        resultApplied: false,
        ignoredApplied: false,
        score: 0,
        outcome: 'failure',
        text: '',
        cash: 0,
        influence: 0,
        heat: 0,
        loyaltyByCharacter: {},
        ignoredOperationId: ignored.id,
        ignoredText: ignored.ignored.text,
        ignoredCash: ignored.ignored.cash,
        ignoredInfluence: ignored.ignored.influence,
        ignoredHeat: ignored.ignored.heat,
        ignoredLoyaltyByCharacter: ignored.ignored.loyalty === 0
          ? {}
          : Object.fromEntries(input.assignedIds.map((id) => [id, ignored.ignored.loyalty])) as Partial<Record<CharacterId, number>>,
      },
    },
    input.now,
  );
}

function applyLoyalty(
  save: GameSave,
  deltas: Partial<Record<CharacterId, number>>,
): GameSave['characterState'] {
  const characterState = { ...save.characterState };
  for (const id of CHARACTER_IDS) {
    const delta = deltas[id] ?? 0;
    if (delta === 0) continue;
    characterState[id] = {
      ...characterState[id],
      loyalty: clampUnit(characterState[id].loyalty + delta),
    };
  }
  return characterState;
}

export function applyOperationResult(input: {
  save: GameSave;
  operation: OperationDef;
  characters: CharacterDef[];
  relationships: RelationshipDef[];
  now: string;
}): GameSave {
  const pending = input.save.pendingOperation;
  if (!pending || pending.operationId !== input.operation.id) return input.save;
  if (pending.resultApplied) return input.save;
  const resolution = evaluateOperation({
    operation: input.operation,
    assignedIds: pending.assignedIds,
    approach: pending.approach,
    preparation: pending.preparation,
    characters: input.characters,
    relationships: input.relationships,
    charmBonusUsedThisNight: input.save.charmBonusUsedThisNight,
  });
  const stats = { ...input.save.stats };
  stats[resolution.outcome] += 1;
  const charmUsed =
    input.save.charmBonusUsedThisNight ||
    (pending.approach === 'talk' && pending.assignedIds.includes('vincent'));
  return touch(
    {
      ...input.save,
      cash: clampCash(input.save.cash + resolution.cash),
      influence: clampUnit(input.save.influence + resolution.influence),
      heat: clampUnit(input.save.heat + resolution.heat),
      characterState: applyLoyalty(input.save, resolution.loyaltyByCharacter),
      completedOperationIds: [...input.save.completedOperationIds, input.operation.id],
      charmBonusUsedThisNight: charmUsed,
      stats,
      pendingOperation: {
        ...pending,
        resultApplied: true,
        score: resolution.score,
        outcome: resolution.outcome,
        text: resolution.text,
        cash: resolution.cash,
        influence: resolution.influence,
        heat: resolution.heat,
        loyaltyByCharacter: resolution.loyaltyByCharacter,
      },
    },
    input.now,
  );
}

export function heatOverrideActive(save: GameSave): boolean {
  return save.flags.includes('heatEndingOverride');
}

export function latchHeatEnding(save: GameSave, now: string): GameSave {
  if (save.heat < 100 || heatOverrideActive(save) || save.heatEndingLatched) return save;
  if (save.currentNight >= 12 && save.currentStep === 'nightSummary') return save;
  const unlocked = save.unlockedEndingIds.includes('city_without_boss')
    ? save.unlockedEndingIds
    : [...save.unlockedEndingIds, 'city_without_boss'];
  return touch(
    {
      ...save,
      heatEndingLatched: true,
      pendingEndingId: 'city_without_boss',
      unlockedEndingIds: unlocked,
      currentStep: 'ending',
      activeSceneId: null,
      pendingOperation: null,
    },
    now,
  );
}

export function applyIgnoredAndAdvance(input: {
  save: GameSave;
  operation: OperationDef;
  night: NightDef;
  now: string;
}): GameSave {
  const pending = input.save.pendingOperation;
  if (!pending || pending.operationId !== input.operation.id || !pending.resultApplied) return input.save;
  let save = input.save;
  if (!pending.ignoredApplied) {
    save = {
      ...save,
      cash: clampCash(save.cash + pending.ignoredCash),
      influence: clampUnit(save.influence + pending.ignoredInfluence),
      heat: clampUnit(save.heat + pending.ignoredHeat),
      characterState: applyLoyalty(save, pending.ignoredLoyaltyByCharacter),
      ignoredOperationIds: save.ignoredOperationIds.includes(pending.ignoredOperationId)
        ? save.ignoredOperationIds
        : [...save.ignoredOperationIds, pending.ignoredOperationId],
      pendingOperation: { ...pending, ignoredApplied: true },
    };
  }
  if (save.heat >= 100 && !heatOverrideActive(save)) {
    return latchHeatEnding({ ...save, pendingOperation: null }, input.now);
  }
  const phase = input.operation.phase;
  if (input.night.interrupt?.afterPhase === phase && !save.viewedSceneIds.includes(input.night.interrupt.sceneId) && save.activeSceneId !== input.night.interrupt.sceneId) {
    const alreadyQueued = save.flags.includes(`seen-interrupt:${input.night.interrupt.sceneId}`);
    if (!alreadyQueued) {
      return touch(
        {
          ...save,
          pendingOperation: null,
          activeSceneId: input.night.interrupt.sceneId,
          activeSceneLineId: null,
          flags: [...save.flags, `seen-interrupt:${input.night.interrupt.sceneId}`],
        },
        input.now,
      );
    }
  }
  return touch(advancePhase(save), input.now);
}

function advancePhase(save: GameSave): GameSave {
  const next: GameSave = { ...save, pendingOperation: null };
  if (save.currentStep === 'dusk') {
    next.currentStep = 'midnight';
    next.currentPhaseIndex = 1;
    return next;
  }
  if (save.currentStep === 'midnight') {
    next.currentStep = 'lastCall';
    next.currentPhaseIndex = 2;
    return next;
  }
  next.currentStep = 'nightSummary';
  return next;
}

export function openScene(save: GameSave, sceneId: string, now: string): GameSave {
  return touch({ ...save, activeSceneId: sceneId, activeSceneLineId: null }, now);
}

export function visibleLines(scene: DialogueScene, flags: string[]) {
  return scene.lines.filter((line) => !line.requiresFlag || flags.includes(line.requiresFlag));
}

export function applySceneEnter(save: GameSave, scene: DialogueScene, now: string): GameSave {
  if (!scene.onEnter) return save;
  if (save.flags.includes(scene.onEnter.onceFlag)) return save;
  let cash = save.cash;
  let influence = save.influence;
  let heat = save.heat;
  for (const branch of scene.onEnter.branches) {
    if (!save.flags.includes(branch.flag)) continue;
    cash += branch.cash ?? 0;
    influence += branch.influence ?? 0;
    heat += branch.heat ?? 0;
  }
  return touch(
    {
      ...save,
      cash: clampCash(cash),
      influence: clampUnit(influence),
      heat: clampUnit(heat),
      flags: [...save.flags, scene.onEnter.onceFlag],
    },
    now,
  );
}

export function applyStoryChoice(input: {
  save: GameSave;
  sceneId: string;
  prompt: string;
  choiceId: string;
  choiceText: string;
  effects: {
    cash?: number;
    influence?: number;
    heat?: number;
    loyalty?: Partial<Record<CharacterId, number>>;
    flags?: string[];
  };
  nextLineId: string;
  now: string;
}): { save: GameSave; decision: { prompt: string; choiceText: string } | null } {
  const key = `${input.sceneId}:${input.choiceId.split(':')[0]}`;
  const choiceKey = input.sceneId;
  const cashDelta = input.effects?.cash ?? 0;
  if (cashDelta < 0 && input.save.cash + cashDelta < 0) {
    return { save: input.save, decision: null };
  }
  if (input.save.choices[choiceKey]) {
    return {
      save: touch({ ...input.save, activeSceneLineId: input.nextLineId }, input.now),
      decision: null,
    };
  }
  const effects = input.effects ?? {};
  const flags = [...input.save.flags, ...(effects.flags ?? [])];
  const decisions = [...input.save.nightDecisions];
  if (!decisions.some((row) => row.text === input.choiceText)) {
    decisions.unshift({ text: input.choiceText, kind: 'choice' });
  }
  const trimmed: GameSave['nightDecisions'] = [];
  for (const row of decisions.filter((row) => row.kind === 'choice')) {
    if (trimmed.length < 3) trimmed.push(row);
  }
  for (const row of decisions.filter((row) => row.kind === 'operation')) {
    if (trimmed.length < 3) trimmed.push(row);
  }
  return {
    decision: { prompt: input.prompt, choiceText: input.choiceText },
    save: touch(
      {
        ...input.save,
        cash: clampCash(input.save.cash + (effects.cash ?? 0)),
        influence: clampUnit(input.save.influence + (effects.influence ?? 0)),
        heat: clampUnit(input.save.heat + (effects.heat ?? 0)),
        characterState: applyLoyalty(input.save, effects.loyalty ?? {}),
        flags,
        choices: { ...input.save.choices, [choiceKey]: input.choiceId, [key]: input.choiceId },
        nightDecisions: trimmed,
        activeSceneLineId: input.nextLineId,
      },
      input.now,
    ),
  };
}

export function completeScene(save: GameSave, scene: DialogueScene, now: string): GameSave {
  const viewed = save.viewedSceneIds.includes(scene.id)
    ? save.viewedSceneIds
    : [...save.viewedSceneIds, scene.id];
  const base: GameSave = {
    ...save,
    viewedSceneIds: viewed,
    activeSceneId: null,
    activeSceneLineId: null,
  };
  if (scene.next.screen === 'nightIntro') {
    return touch({ ...base, currentStep: 'nightIntro' }, now);
  }
  if (scene.next.screen === 'nightSummary') {
    return touch({ ...base, currentStep: 'nightSummary' }, now);
  }
  if (scene.next.screen === 'endingCard') {
    return touch(base, now);
  }
  const phase = scene.next.phase;
  const index = phase === 'dusk' ? 0 : phase === 'midnight' ? 1 : 2;
  return touch(
    {
      ...base,
      currentStep: phase,
      currentPhaseIndex: index as 0 | 1 | 2,
    },
    now,
  );
}

export function finishNightUnlocks(save: GameSave, characters: CharacterDef[]): string[] {
  const unlocked: string[] = [];
  for (const character of characters) {
    for (const entry of character.biography) {
      if (entry.unlockNight !== save.currentNight) continue;
      if (save.characterState[character.id].biographyEntries.includes(entry.id)) continue;
      unlocked.push(entry.id);
    }
  }
  return unlocked;
}

export function grantBiography(save: GameSave, characters: CharacterDef[], now: string): GameSave {
  const ids = finishNightUnlocks(save, characters);
  if (ids.length === 0) return save;
  const characterState = { ...save.characterState };
  for (const character of characters) {
    const add = character.biography.filter((entry) => ids.includes(entry.id)).map((entry) => entry.id);
    if (add.length === 0) continue;
    characterState[character.id] = {
      ...characterState[character.id],
      biographyEntries: [...characterState[character.id].biographyEntries, ...add],
    };
  }
  return touch({ ...save, characterState }, now);
}

export function goToNextNight(save: GameSave, now: string): GameSave {
  if (save.currentNight >= 12 || save.currentStep !== 'nightSummary') return save;
  return beginNight({ ...save, currentNight: save.currentNight + 1 }, now);
}

export function resolveCampaignEnding(save: GameSave, now: string): GameSave {
  const endingId = selectEnding({
    influence: save.influence,
    heat: save.heat,
    averageLoyalty: averageLoyalty(loyaltyValues(save)),
    heatEndingOverride: heatOverrideActive(save),
  });
  const unlocked = save.unlockedEndingIds.includes(endingId)
    ? save.unlockedEndingIds
    : [...save.unlockedEndingIds, endingId];
  return touch(
    {
      ...save,
      pendingEndingId: endingId,
      unlockedEndingIds: unlocked,
      currentStep: 'ending',
      activeSceneId: null,
    },
    now,
  );
}

export function operationsForPhase(operations: OperationDef[], night: number, phase: PhaseId): OperationDef[] {
  return operations.filter((operation) => operation.night === night && operation.phase === phase);
}

export function otherOperation(operations: OperationDef[], chosen: OperationDef): OperationDef | undefined {
  return operations.find(
    (operation) =>
      operation.night === chosen.night && operation.phase === chosen.phase && operation.id !== chosen.id,
  );
}

export function notableDecisionTexts(save: GameSave): string[] {
  const choices = save.nightDecisions.filter((row) => row.kind === 'choice').map((row) => row.text);
  const ops = save.nightDecisions.filter((row) => row.kind === 'operation').map((row) => row.text);
  return [...choices, ...ops].slice(0, 3);
}

export function mostUsedCharacter(save: GameSave): CharacterId {
  let best: CharacterId = 'vincent';
  let score = -1;
  for (const id of CHARACTER_IDS) {
    const uses = save.stats.characterUses[id] ?? 0;
    if (uses > score) {
      score = uses;
      best = id;
    }
  }
  return best;
}

export function resumeTarget(save: GameSave):
  | { name: 'Story'; sceneId: string }
  | { name: 'NightIntro' }
  | { name: 'Briefing' }
  | { name: 'CrewSelection' }
  | { name: 'CityMap' }
  | { name: 'NightSummary' }
  | { name: 'Ending' } {
  if (save.activeSceneId) return { name: 'Story', sceneId: save.activeSceneId };
  switch (save.currentStep) {
    case 'nightIntro':
      return { name: 'NightIntro' };
    case 'briefing':
      return { name: 'Briefing' };
    case 'crewSelection':
      return { name: 'CrewSelection' };
    case 'dusk':
    case 'midnight':
    case 'lastCall':
      return { name: 'CityMap' };
    case 'nightSummary':
      return { name: 'NightSummary' };
    case 'ending':
      return { name: 'Ending' };
    default:
      return { name: 'NightIntro' };
  }
}
