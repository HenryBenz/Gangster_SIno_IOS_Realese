export type SkillId = 'charm' | 'nerve' | 'cunning';
export type ApproachId = 'talk' | 'standFirm' | 'outsmart';
export type PhaseId = 'dusk' | 'midnight' | 'lastCall';
export type OutcomeId = 'strongSuccess' | 'success' | 'failure';
export type ChanceId = 'strong' | 'good' | 'risky';
export type ThreatId = 'controlled' | 'uncertain' | 'dangerous';
export type StepId =
  | 'nightIntro'
  | 'briefing'
  | 'crewSelection'
  | 'dusk'
  | 'midnight'
  | 'lastCall'
  | 'nightSummary'
  | 'ending';

export type CharacterId = 'vincent' | 'roxie' | 'bruno' | 'elias' | 'june' | 'miles';

export type BiographyEntry = {
  id: string;
  text: string;
  unlockNight: number;
};

export type CharacterDef = {
  id: CharacterId;
  name: string;
  nickname: string;
  role: string;
  personality: string;
  charm: number;
  nerve: number;
  cunning: number;
  trait: string;
  cue: string;
  portraits: { neutral: string; confident: string; tense: string };
  biography: BiographyEntry[];
};

export type RelationshipKind = 'partnership' | 'conflict' | 'neutral';

export type RelationshipDef = {
  a: CharacterId;
  b: CharacterId;
  kind: RelationshipKind;
  bonus: number;
  phrase: string | null;
};

export type OutcomeBlock = {
  cash: number;
  influence: number;
  heat: number;
  loyalty: number;
  text: string;
};

export type IgnoredBlock = {
  cash: number;
  influence: number;
  heat: number;
  loyalty: number;
  text: string;
};

export type OperationDef = {
  id: string;
  night: number;
  phase: PhaseId;
  title: string;
  locationName: string;
  background: string;
  icon: string;
  setup: string;
  description: string;
  suggestedSkill: SkillId;
  preferredApproach: ApproachId;
  neutralApproach: ApproachId;
  riskyApproach: ApproachId;
  threshold: number;
  threat: ThreatId;
  difficulty: string;
  tags: Array<'club' | 'society' | 'transport'>;
  rewardIcons: Array<'cash' | 'influence' | 'heat' | 'loyalty'>;
  minCharacters: 1 | 2;
  maxCharacters: 2;
  preparation: { cost: number; bonus: number; label: string } | null;
  hint: string;
  strongSuccess: OutcomeBlock;
  success: OutcomeBlock;
  failure: OutcomeBlock;
  ignored: IgnoredBlock;
};

export type ChoiceEffect = {
  cash?: number;
  influence?: number;
  heat?: number;
  loyalty?: Partial<Record<CharacterId, number>>;
  flags?: string[];
};

export type DialogueChoice = {
  id: string;
  text: string;
  cashCost?: number;
  effects?: ChoiceEffect;
  nextLineId: string;
};

export type DialogueLine = {
  id: string;
  speakerId: CharacterId | null;
  speakerName: string;
  expression: string | null;
  text: string;
  objective?: string;
  requiresFlag?: string;
  choices?: DialogueChoice[];
};

export type SceneNext =
  | { screen: 'nightIntro' }
  | { screen: 'phase'; phase: PhaseId }
  | { screen: 'nightSummary' }
  | { screen: 'endingCard' };

export type SceneEnterBranch = {
  flag: string;
  cash?: number;
  influence?: number;
  heat?: number;
};

export type DialogueScene = {
  id: string;
  background: string;
  next: SceneNext;
  onEnter?: {
    onceFlag: string;
    branches: SceneEnterBranch[];
  };
  lines: DialogueLine[];
};

export type NightDef = {
  number: number;
  title: string;
  purpose: string;
  mechanic: string;
  setup: string;
  objective: string;
  chips: string[];
  briefingObjective: string;
  risks: string;
  suggestedSkills: SkillId[];
  featuredCharacterId: CharacterId;
  summaryResult: string;
  previousConsequence?: Record<string, string>;
  interrupt?: { afterPhase: PhaseId; sceneId: string };
};

export type EndingDef = {
  id: 'king_of_last_call' | 'family_holds' | 'city_without_boss';
  title: string;
  music: string;
  image: string;
  badge: string;
  paragraphs: [string, string];
  sceneId: string;
};

export type CharacterState = {
  loyalty: number;
  energy: number;
  biographyEntries: string[];
};

export type PendingOperation = {
  operationId: string;
  approach: ApproachId;
  assignedIds: string[];
  preparation: boolean;
  costsApplied: boolean;
  resultApplied: boolean;
  ignoredApplied: boolean;
  score: number;
  outcome: OutcomeId;
  text: string;
  cash: number;
  influence: number;
  heat: number;
  loyaltyByCharacter: Partial<Record<CharacterId, number>>;
  ignoredOperationId: string;
  ignoredText: string;
  ignoredCash: number;
  ignoredInfluence: number;
  ignoredHeat: number;
  ignoredLoyaltyByCharacter: Partial<Record<CharacterId, number>>;
};

export type NightDecision = { text: string; kind: 'choice' | 'operation' };

export type GameSave = {
  schemaVersion: number;
  campaignId: string;
  startedAt: string;
  lastSavedAt: string;
  currentNight: number;
  currentStep: StepId;
  currentPhaseIndex: 0 | 1 | 2;
  cash: number;
  influence: number;
  heat: number;
  selectedCrewIds: string[];
  characterState: Record<CharacterId, CharacterState>;
  completedOperationIds: string[];
  ignoredOperationIds: string[];
  choices: Record<string, string>;
  viewedSceneIds: string[];
  unlockedEndingIds: string[];
  newGamePlus: boolean;
  activeSceneId: string | null;
  activeSceneLineId: string | null;
  pendingEndingId: EndingDef['id'] | null;
  pendingOperation: PendingOperation | null;
  flags: string[];
  charmBonusUsedThisNight: boolean;
  nightBaseline: {
    cash: number;
    influence: number;
    heat: number;
    loyalty: Record<CharacterId, number>;
  };
  nightDecisions: NightDecision[];
  stats: {
    strongSuccess: number;
    success: number;
    failure: number;
    characterUses: Record<CharacterId, number>;
  };
  heatEndingLatched: boolean;
};

export type TextSpeed = 'slow' | 'normal' | 'fast' | 'instant';

export type AppSettings = {
  onboardingComplete: boolean;
  musicVolume: number;
  sfxVolume: number;
  hapticsEnabled: boolean;
  reducedMotion: boolean;
  textSpeed: TextSpeed;
  tutorialTipsEnabled: boolean;
};

export type PurchaseState = {
  blackLabelCached: boolean;
  lastOwnershipCheckAt?: string;
};

export type NightArchiveRecord = {
  night: number;
  title: string;
  summaryResult: string;
  cash: number;
  influence: number;
  heat: number;
  loyalty: number;
  decisions: string[];
  loyaltyChanges: Partial<Record<CharacterId, number>>;
  unlockedBiography: string[];
};

export type ArchiveState = {
  schemaVersion: number;
  nights: NightArchiveRecord[];
  decisions: Record<string, { prompt: string; choiceText: string }>;
  unlockedEndingIds: string[];
  viewedSceneIds: string[];
  biographyEntries: Partial<Record<CharacterId, string[]>>;
  unlockedMusicIds: string[];
  jukeboxTrackId: string | null;
};

export type Resolution = {
  score: number;
  outcome: OutcomeId;
  chance: ChanceId;
  traitBonus: number;
  relationshipBonus: number;
  relationshipPhrase: string | null;
  preparationBonus: number;
  text: string;
  cash: number;
  influence: number;
  heat: number;
  loyaltyByCharacter: Partial<Record<CharacterId, number>>;
  ignoredText: string;
  ignoredCash: number;
  ignoredInfluence: number;
  ignoredHeat: number;
  ignoredLoyaltyByCharacter: Partial<Record<CharacterId, number>>;
};
