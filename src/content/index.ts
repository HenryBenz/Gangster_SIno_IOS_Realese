import type {
  CharacterDef,
  CharacterId,
  DialogueScene,
  EndingDef,
  NightDef,
  OperationDef,
  PhaseId,
  RelationshipDef,
} from '../game/types';
import charactersJson from './characters.json';
import dialogueJson from './dialogue.json';
import endingsJson from './endings.json';
import nightsJson from './nights.json';
import operationsJson from './operations.json';
import relationshipsJson from './relationships.json';

export const characters = charactersJson as CharacterDef[];
export const relationships = relationshipsJson as RelationshipDef[];
export const nights = nightsJson as NightDef[];
export const operations = operationsJson as OperationDef[];
export const scenes = dialogueJson as DialogueScene[];
export const endings = endingsJson as EndingDef[];

export function characterById(id: string): CharacterDef {
  const found = characters.find((character) => character.id === id);
  if (!found) throw new Error(`Missing character ${id}`);
  return found;
}

export function nightByNumber(number: number): NightDef {
  const found = nights.find((night) => night.number === number);
  if (!found) throw new Error(`Missing night ${number}`);
  return found;
}

export function sceneById(id: string): DialogueScene {
  const found = scenes.find((scene) => scene.id === id);
  if (!found) throw new Error(`Missing scene ${id}`);
  return found;
}

export function endingById(id: string): EndingDef {
  const found = endings.find((ending) => ending.id === id);
  if (!found) throw new Error(`Missing ending ${id}`);
  return found;
}

export function operationsFor(night: number, phase: PhaseId): OperationDef[] {
  return operations.filter((operation) => operation.night === night && operation.phase === phase);
}

export function operationById(id: string): OperationDef {
  const found = operations.find((operation) => operation.id === id);
  if (!found) throw new Error(`Missing operation ${id}`);
  return found;
}

export function previousConsequence(night: NightDef, flags: string[]): string | null {
  if (!night.previousConsequence) return null;
  for (const [flag, text] of Object.entries(night.previousConsequence)) {
    if (flags.includes(flag)) return text;
  }
  return null;
}

export function biographyEntry(id: string) {
  for (const character of characters) {
    const entry = character.biography.find((row) => row.id === id);
    if (entry) return { character, entry };
  }
  return null;
}

export function archiveCompletion(input: {
  nightsCompleted: number;
  endingsUnlocked: number;
  biographiesUnlocked: number;
}): number {
  const biographyTotal = characters.reduce((sum, character) => sum + character.biography.length, 0);
  const total = 12 + endings.length + biographyTotal;
  const have =
    Math.min(12, input.nightsCompleted) +
    Math.min(endings.length, input.endingsUnlocked) +
    Math.min(biographyTotal, input.biographiesUnlocked);
  return Math.round((have / total) * 100);
}

export function phaseFromStep(step: string): PhaseId {
  if (step === 'midnight' || step === 'lastCall') return step;
  return 'dusk';
}

export const CHARACTER_ORDER: CharacterId[] = ['vincent', 'roxie', 'bruno', 'elias', 'june', 'miles'];
