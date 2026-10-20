import fs from 'fs';
import path from 'path';
import { characters, endings, nights, operations, relationships, scenes } from '../../content';
import {
  applyIgnoredAndAdvance,
  applyOperationResult,
  applySceneEnter,
  applyStoryChoice,
  beginNight,
  commitOperation,
  completeScene,
  confirmCrew,
  createCampaign,
  goToNextNight,
  resolveCampaignEnding,
  visibleLines,
} from '../campaign';
import { CHARACTER_IDS } from '../constants';
import { selectEnding } from '../endings';
import { canStaffRemainingPhases, evaluateOperation, preparationCashCost } from '../resolution';
import type { ApproachId, CharacterId, DialogueChoice, DialogueLine, DialogueScene, GameSave, OperationDef, PhaseId } from '../types';

const PHASES: PhaseId[] = ['dusk', 'midnight', 'lastCall'];
const APPROACHES: ApproachId[] = ['talk', 'standFirm', 'outsmart'];
const NOW = '2026-10-17T00:00:00.000Z';

function ops(night: number, phase: PhaseId): OperationDef[] {
  return operations.filter((operation) => operation.night === night && operation.phase === phase);
}

function energyOf(save: GameSave): Record<CharacterId, number> {
  const energy = {} as Record<CharacterId, number>;
  for (const id of CHARACTER_IDS) energy[id] = save.characterState[id].energy;
  return energy;
}

function subsets(ids: string[], min: number, max: number): string[][] {
  const out: string[][] = [];
  const walk = (start: number, picked: string[]) => {
    if (picked.length >= min && picked.length <= max) out.push([...picked]);
    if (picked.length === max) return;
    for (let index = start; index < ids.length; index += 1) {
      picked.push(ids[index]);
      walk(index + 1, picked);
      picked.pop();
    }
  };
  walk(0, []);
  return out;
}

function legalAssignments(save: GameSave, operation: OperationDef): string[][] {
  const alive = save.selectedCrewIds.filter((id) => (save.characterState[id as CharacterId]?.energy ?? 0) >= 1);
  return subsets(alive, operation.minCharacters, operation.maxCharacters);
}

function playScene(save: GameSave, scene: DialogueScene, preferPaid: boolean): GameSave {
  let current = applySceneEnter(save, scene, NOW);
  const flags = () => current.flags;
  let guard = 0;
  let lineId: string | null = null;
  while (guard < 30) {
    guard += 1;
    const lines = visibleLines(scene, flags());
    const index = Math.max(0, lines.findIndex((line) => line.id === (lineId ?? lines[0]?.id)));
    const line = lines[index];
    if (!line) throw new Error(`${scene.id} has no visible line`);
    if (line.choices && !current.choices[scene.id]) {
      const affordable = line.choices.filter((choice) => (choice.cashCost ?? 0) <= current.cash);
      if (affordable.length === 0) throw new Error(`${scene.id} choice stuck at cash ${current.cash}`);
      const choice = (preferPaid ? [...affordable].reverse() : affordable)[0];
      const applied = applyStoryChoice({
        save: current,
        sceneId: scene.id,
        prompt: line.text,
        choiceId: choice.id,
        choiceText: choice.text,
        effects: choice.effects ?? {},
        nextLineId: choice.nextLineId,
        now: NOW,
      });
      if (applied.save === current || applied.save.choices[scene.id] == null) {
        throw new Error(`${scene.id} choice ${choice.id} did not apply`);
      }
      current = applied.save;
      lineId = choice.nextLineId;
      const visible = visibleLines(scene, current.flags);
      if (!visible.some((row) => row.id === choice.nextLineId)) {
        throw new Error(`${scene.id} next line ${choice.nextLineId} is not visible after ${choice.id}`);
      }
      continue;
    }
    const next = lines[index + 1];
    if (!next) {
      current = completeScene(current, scene, NOW);
      return current;
    }
    lineId = next.id;
  }
  throw new Error(`${scene.id} dialogue did not finish`);
}

function futurePhases(phase: PhaseId): PhaseId[] {
  if (phase === 'dusk') return ['midnight', 'lastCall'];
  if (phase === 'midnight') return ['lastCall'];
  return [];
}

function safeAssignments(save: GameSave, operation: OperationDef): string[][] {
  return legalAssignments(save, operation).filter((assignedIds) => {
    const energy: Record<string, number> = {};
    for (const id of save.selectedCrewIds) {
      energy[id] = save.characterState[id as CharacterId].energy - (assignedIds.includes(id) ? 1 : 0);
    }
    return canStaffRemainingPhases(
      save.selectedCrewIds,
      energy,
      futurePhases(operation.phase).map((phase) => ops(operation.night, phase)),
    );
  });
}

function commitBest(save: GameSave, operation: OperationDef, mode: 'best' | 'worst' | 'lowinf'): GameSave {
  const assignments = safeAssignments(save, operation);
  if (assignments.length === 0) {
    throw new Error(`night ${operation.night} ${operation.phase} ${operation.id} no safe assignment energy=${JSON.stringify(energyOf(save))} crew=${save.selectedCrewIds.join(',')}`);
  }
  let best = assignments[0];
  let bestScore = mode === 'best' ? -999 : 999;
  let bestApproach: ApproachId = 'talk';
  for (const assignedIds of assignments) {
    for (const approach of APPROACHES) {
      const preview = evaluateOperation({
        operation,
        assignedIds,
        approach,
        preparation: false,
        characters,
        relationships,
        charmBonusUsedThisNight: save.charmBonusUsedThisNight,
      });
      const loyalty = Object.values(preview.loyaltyByCharacter).reduce((sum, value) => sum + (value ?? 0), 0);
      const outcomeRank = preview.outcome === 'strongSuccess' ? 2 : preview.outcome === 'success' ? 1 : 0;
      const rank = mode === 'best'
        ? preview.score
        : mode === 'lowinf'
          ? outcomeRank * 1000 - preview.influence * 10 - preview.heat * 3 + loyalty
          : -preview.score;
      if (rank > bestScore) {
        bestScore = rank;
        best = assignedIds;
        bestApproach = approach;
      }
    }
  }
  const prepCost = preparationCashCost({ operation, assignedIds: best, preparation: true });
  const usePrep = mode === 'best' && operation.preparation != null && save.cash >= prepCost + 200;
  const ignoredOperation = ops(operation.night, operation.phase).find((row) => row.id !== operation.id) ?? operation;
  const committed = commitOperation({
    save,
    operation,
    ignoredOperation,
    assignedIds: best,
    approach: bestApproach,
    preparation: usePrep,
    now: NOW,
  });
  if (!committed.pendingOperation || committed.pendingOperation.operationId !== operation.id) {
    throw new Error(`commit failed ${operation.id}`);
  }
  return committed;
}

function resolvePending(save: GameSave, nightNumber: number, preferPaid: boolean): GameSave {
  const pending = save.pendingOperation;
  if (!pending) throw new Error('missing pending');
  const operation = operations.find((row) => row.id === pending.operationId)!;
  const night = nights.find((row) => row.number === nightNumber)!;
  let next = applyOperationResult({ save, operation, characters, relationships, now: NOW });
  next = applyIgnoredAndAdvance({ save: next, operation, night, now: NOW });
  if (next.activeSceneId) {
    const scene = scenes.find((row) => row.id === next.activeSceneId)!;
    next = playScene(next, scene, preferPaid);
  }
  return next;
}

function runCampaign(mode: 'best' | 'worst' | 'lowinf', crew: CharacterId[]): { save: GameSave; log: string[] } {
  const log: string[] = [];
  let save = createCampaign({ id: 'play', now: NOW, newGamePlus: false, biographies: {} });
  const prologue = scenes.find((scene) => scene.id === 'prologue')!;
  save = playScene(save, prologue, false);
  if (save.currentStep !== 'nightIntro') throw new Error(`prologue landed on ${save.currentStep}`);
  for (let night = 1; night <= 12; night += 1) {
    if (save.currentStep === 'ending') break;
    save = beginNight({ ...save, currentNight: night }, NOW);
    save = confirmCrew(save, crew, NOW);
    for (const phase of PHASES) {
      if (save.currentStep === 'ending') break;
      if (save.currentStep !== phase) throw new Error(`night ${night} expected ${phase} got ${save.currentStep}`);
      const pair = ops(night, phase);
      const playable = pair.filter((operation) => safeAssignments(save, operation).length > 0);
      if (playable.length === 0) {
        throw new Error(`night ${night} ${phase} no playable operation`);
      }
      const operation = mode === 'worst' ? playable[playable.length - 1] : playable[0];
      save = commitBest(save, operation, mode);
      const before = save.currentStep;
      save = resolvePending(save, night, mode === 'worst');
      log.push(`n${night} ${before} ${operation.id} -> ${save.currentStep} cash=${save.cash} inf=${save.influence} heat=${save.heat}`);
    }
    if (save.currentStep === 'ending') break;
    if (save.currentStep !== 'nightSummary') throw new Error(`night ${night} ended on ${save.currentStep}`);
    if (night < 12) save = goToNextNight(save, NOW);
  }
  if (save.currentStep !== 'ending') save = resolveCampaignEnding(save, NOW);
  return { save, log };
}

describe('campaign content', () => {
  it('references real assets and a finishable dialogue graph', () => {
    const imageDir = path.join(__dirname, '../../../assets/images');
    const audioDir = path.join(__dirname, '../../../assets/audio');
    const imageKeys = new Set(
      fs.readdirSync(imageDir)
        .filter((name) => name.endsWith('.png') || name.endsWith('.webp'))
        .map((name) => name.replace(/\.(png|webp)$/, '')),
    );
    const audioKeys = new Set(fs.readdirSync(audioDir).filter((name) => name.endsWith('.ogg')).map((name) => name.replace(/\.ogg$/, '')));
    const problems: string[] = [];
    for (const character of characters) {
      for (const portrait of Object.values(character.portraits)) {
        if (!imageKeys.has(portrait)) problems.push(`missing portrait ${portrait}`);
      }
      if (!audioKeys.has(character.cue)) problems.push(`missing cue ${character.cue}`);
    }
    for (const operation of operations) {
      if (!imageKeys.has(operation.background)) problems.push(`missing bg ${operation.background}`);
      if (!imageKeys.has(operation.icon)) problems.push(`missing icon ${operation.icon}`);
      if (operation.preparation && operation.preparation.label !== 'Pay 100 Cash for preparation: +2') {
        problems.push(`prep label ${operation.id}`);
      }
      if (operation.minCharacters > operation.maxCharacters) problems.push(`range ${operation.id}`);
    }
    for (const night of nights) {
      for (const phase of PHASES) {
        const pair = ops(night.number, phase);
        if (pair.length !== 2) problems.push(`night ${night.number} ${phase} has ${pair.length}`);
      }
    }
    for (const ending of endings) {
      if (!imageKeys.has(ending.image)) problems.push(`missing ending image ${ending.image}`);
      if (!imageKeys.has(ending.badge)) problems.push(`missing badge ${ending.badge}`);
      if (!audioKeys.has(ending.music)) problems.push(`missing ending music ${ending.music}`);
      if (!scenes.some((scene) => scene.id === ending.sceneId)) problems.push(`missing ending scene ${ending.sceneId}`);
    }
    for (const scene of scenes) {
      if (!imageKeys.has(scene.background)) problems.push(`missing scene bg ${scene.background}`);
      const ids = new Set(scene.lines.map((line) => line.id));
      for (const line of scene.lines) {
        if (line.expression && !imageKeys.has(line.expression)) problems.push(`missing expression ${line.expression}`);
        for (const choice of line.choices ?? []) {
          if (!ids.has(choice.nextLineId)) problems.push(`${scene.id} missing next ${choice.nextLineId}`);
        }
      }
      const choiceLines = scene.lines.filter((line) => line.choices?.length);
      if (choiceLines.length > 1) problems.push(`${scene.id} has ${choiceLines.length} choice lines; UI only records one choice per scene`);
    }
    expect(problems).toEqual([]);
  });

  it('plays all twelve nights on a careful route and on a sloppy route', () => {
    const careful = runCampaign('best', ['vincent', 'roxie', 'miles']);
    expect(careful.save.currentStep).toBe('ending');
    expect(careful.save.pendingEndingId).toBeTruthy();
    const sloppy = runCampaign('worst', ['bruno', 'june', 'elias']);
    expect(sloppy.save.currentStep).toBe('ending');
    expect(sloppy.save.completedOperationIds.length + (sloppy.save.currentStep === 'ending' ? 0 : 0)).toBeGreaterThan(0);
  });

  it('keeps night 7 playable when the strongest pair would strand Last Call', () => {
    let save = createCampaign({ id: 'n7', now: NOW, newGamePlus: false, biographies: {} });
    save = confirmCrew(beginNight({ ...save, currentNight: 7 }, NOW), ['vincent', 'roxie', 'bruno'], NOW);
    for (const phase of PHASES) {
      const operation = ops(7, phase)[0];
      const reused = safeAssignments(save, operation).find((ids) => ids.includes('vincent') && ids.includes('roxie'));
      const assigned = reused ?? safeAssignments(save, operation)[0];
      expect(assigned).toBeTruthy();
      save = commitOperation({ save, operation, assignedIds: assigned, approach: 'talk', preparation: false, now: NOW });
      save = applyOperationResult({ save, operation, characters, relationships, now: NOW });
      save = applyIgnoredAndAdvance({ save, operation, night: nights.find((night) => night.number === 7)!, now: NOW });
    }
    expect(save.currentStep).toBe('nightSummary');
  });

  it('can finish twelve nights without Heat ending and can reach each written ending', () => {
    const finished = runCampaign('best', ['vincent', 'roxie', 'elias']);
    const sloppy = runCampaign('worst', ['bruno', 'june', 'elias']);
    const loyal = runCampaign('lowinf', ['bruno', 'june', 'miles']);
    expect(finished.save.currentNight).toBe(12);
    expect(finished.save.heat).toBeLessThan(100);
    expect(finished.save.pendingEndingId).toBe('king_of_last_call');
    expect(loyal.save.currentNight).toBe(12);
    expect(loyal.save.pendingEndingId).toBe('family_holds');
    expect(sloppy.save.pendingEndingId).toBe('city_without_boss');
    expect(selectEnding({ influence: 80, heat: 40, averageLoyalty: 70, heatEndingOverride: false })).toBe('king_of_last_call');
    expect(selectEnding({ influence: 40, heat: 80, averageLoyalty: 80, heatEndingOverride: false })).toBe('family_holds');
    expect(selectEnding({ influence: 40, heat: 100, averageLoyalty: 80, heatEndingOverride: false })).toBe('city_without_boss');
    expect(finished.log.length).toBeGreaterThan(0);
  });
});

void selectEnding;
