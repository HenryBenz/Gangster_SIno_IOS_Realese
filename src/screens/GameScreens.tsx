import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  archiveCompletion,
  biographyEntry,
  characterById,
  characters,
  endingById,
  endings,
  nightByNumber,
  operationById,
  operationsFor,
  phaseFromStep,
  previousConsequence,
  relationships,
  sceneById,
  scenes,
} from '../content';
import { audio } from '../audio/controller';
import {
  applyIgnoredAndAdvance,
  applyOperationResult,
  applySceneEnter,
  applyStoryChoice,
  beginNight,
  commitOperation,
  completeScene,
  confirmCrew,
  displayedLoyalty,
  finishNightUnlocks,
  goToNextNight,
  grantBiography,
  loyaltyValues,
  mostUsedCharacter,
  notableDecisionTexts,
  resolveCampaignEnding,
  visibleLines,
} from '../game/campaign';
import { averageLoyalty } from '../game/endings';
import { APPROACH_LABEL, FREE_NIGHT_LIMIT, OUTCOME_LABEL, PHASE_LABEL, PRODUCT_ID } from '../game/constants';
import { completeStorePurchase } from '../store/purchaseIntents';
import { canAffordPreparation, canStaffRemainingPhases, chanceLabel, combinedSkills, evaluateOperation, preparationCashCost, revealsConsequenceHint, strongestSkillLabel } from '../game/resolution';
import type { ApproachId, CharacterId, DialogueLine, OperationDef, OutcomeId, PendingOperation, PhaseId, SkillId } from '../game/types';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import type { RootStackParamList } from '../navigation/types';
import { useGame } from '../store/useGame';
import { colors, fonts } from '../theme/tokens';
import { useExitToMenu, useRouteMusic } from './FrontScreens';
import {
  ArtImage,
  CharacterCard,
  CharacterPortrait,
  ChoiceButton,
  ConfirmDialog,
  DialoguePanel,
  EnergyPips,
  Eyebrow,
  GoldFrame,
  IconButton,
  LoyaltyBar,
  ModalSheet,
  OperationCard,
  PrimaryButton,
  ResourceGlyph,
  ResourceHud,
  ResultStamp,
  ScreenContainer,
  ScreenTitle,
  SecondaryButton,
  SettingRow,
  StatPill,
  StepCard,
  SkillBadge,
  ToastMessage,
  VolumeSlider,
  haptic,
} from '../components/kit';
import { images } from '../assets/registry';
import { Image } from 'react-native';
import {
  fetchProducts,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases,
  type Product,
  type Purchase,
  type PurchaseError,
} from 'react-native-iap';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function PhaseCards({ phase, children }: { phase: string; children: ReactNode }) {
  const reduced = useGame((state) => state.settings.reducedMotion);
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduced) {
      opacity.value = 1;
      return;
    }
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: 350 });
  }, [opacity, phase, reduced]);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ flex: 1, justifyContent: 'center', gap: 12 }, fade]}>{children}</Animated.View>;
}

function HeatPulse() {
  const reduced = useGame((state) => state.settings.reducedMotion);
  const opacity = useSharedValue(reduced ? 0.55 : 0);
  useEffect(() => {
    if (reduced) return;
    opacity.value = withSequence(
      withTiming(0.85, { duration: 280 }),
      withTiming(0.15, { duration: 280 }),
      withTiming(0.85, { duration: 280 }),
      withTiming(0, { duration: 280 }),
    );
  }, [opacity, reduced]);
  const edge = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderWidth: 4, borderColor: colors.coral500 }, edge]} />;
}

function portraitFor(outcome: OutcomeId, characterId: string): string {
  const portraits = characterById(characterId).portraits;
  if (outcome === 'failure') return portraits.tense;
  if (outcome === 'strongSuccess') return portraits.confident;
  return portraits.neutral;
}

function ResultOverlay({
  pending,
  operation,
  charmUsed,
  reduced,
  continueEnabled,
  onContinue,
}: {
  pending: PendingOperation;
  operation: OperationDef;
  charmUsed: boolean;
  reduced: boolean;
  continueEnabled: boolean;
  onContinue: () => void;
}) {
  const shown = pending.resultApplied
    ? pending
    : evaluateOperation({
        operation,
        assignedIds: pending.assignedIds,
        approach: pending.approach,
        preparation: pending.preparation,
        characters,
        relationships,
        charmBonusUsedThisNight: charmUsed,
      });
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.blackOverlay, justifyContent: 'center', padding: 20, gap: 12 }}>
      <View style={{ alignItems: 'center' }}>
        <CharacterPortrait name={portraitFor(shown.outcome, pending.assignedIds[0])} size={140} enter motionKey={shown.outcome} />
      </View>
      <ResultStamp label={OUTCOME_LABEL[shown.outcome]} reduced={reduced} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <StatPill label="Cash" value={String(shown.cash)} />
        <StatPill label="Influence" value={String(shown.influence)} />
        <StatPill label="Heat" value={String(shown.heat)} />
      </View>
      <Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>{shown.text}</Text>
      <PrimaryButton label="Continue" disabled={!continueEnabled} onPress={onContinue} />
    </View>
  );
}

function PauseLayer() {
  const open = useGame((state) => state.pauseOpen);
  const setPause = useGame((state) => state.setPause);
  const navigation = useNavigation<Nav>();
  const exit = useExitToMenu();
  if (!open) return null;
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.blackOverlay, justifyContent: 'center', padding: 20, gap: 10 }}>
      <PrimaryButton label="Resume" onPress={() => setPause(false)} />
      <SecondaryButton label="How to Play" onPress={() => { setPause(false); navigation.navigate('HowToPlay'); }} />
      <SecondaryButton label="Settings" onPress={() => { setPause(false); navigation.navigate('Settings'); }} />
      <SecondaryButton label="Return to Main Menu" onPress={exit} />
    </View>
  );
}

export function StoryScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'Story'>>();
  const save = useGame((state) => state.save);
  const mutate = useGame((state) => state.mutate);
  const updateArchive = useGame((state) => state.updateArchive);
  const textSpeed = useGame((state) => state.settings.textSpeed);
  const scene = sceneById(route.params.sceneId);
  const [lineId, setLineId] = useState<string | null>(save?.activeSceneLineId ?? null);
  const [shown, setShown] = useState('');
  const seenAtStart = useRef(save?.viewedSceneIds.includes(scene.id) ?? false);
  useRouteMusic('Story');

  const enteredScene = useRef(false);
  useEffect(() => {
    if (enteredScene.current || route.params.readOnly) return;
    enteredScene.current = true;
    void mutate((current) => applySceneEnter(current, scene, new Date().toISOString()));
  }, [mutate, route.params.readOnly, scene]);

  const flags = save?.flags ?? [];
  const lines = useMemo(() => visibleLines(scene, flags), [flags, scene]);
  const index = Math.max(0, lines.findIndex((line) => line.id === (lineId ?? lines[0]?.id)));
  const line = lines[index];
  const full = line?.text ?? '';

  useEffect(() => {
    if (!line) return;
    if (textSpeed === 'instant') {
      setShown(full);
      return;
    }
    const step = textSpeed === 'slow' ? 28 : textSpeed === 'fast' ? 8 : 16;
    setShown('');
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      setShown(full.slice(0, count));
      if (count >= full.length) clearInterval(timer);
    }, step);
    return () => clearInterval(timer);
  }, [full, line, textSpeed]);

  if (!save || !line) return null;
  const choices = line.choices;
  const choiceMade = Boolean(save.choices[scene.id]);
  const showChoices = Boolean(choices) && !choiceMade;
  const finished = shown.length >= full.length;

  const advance = () => {
    if (!finished) {
      setShown(full);
      return;
    }
    if (showChoices) return;
    audio.playSfx('sfx_dialogue_advance');
    const next = lines[index + 1];
    if (!next) {
      void finish();
      return;
    }
    setLineId(next.id);
    if (!route.params.readOnly) void mutate((current) => ({ ...current, activeSceneLineId: next.id }));
  };

  const finish = async () => {
    if (route.params.readOnly) {
      navigation.goBack();
      return;
    }
    const next = await mutate((current) => completeScene(current, scene, new Date().toISOString()));
    if (!next) return;
    if (scene.next.screen === 'nightIntro') navigation.replace('NightIntro');
    else if (scene.next.screen === 'nightSummary') navigation.replace('NightSummary');
    else if (scene.next.screen === 'phase') {
      navigation.reset({ index: 1, routes: [{ name: 'MainMenu' }, { name: 'CityMap' }] });
    } else navigation.goBack();
  };

  const choose = async (choice: NonNullable<DialogueLine['choices']>[number]) => {
    audio.playSfx('sfx_ui_confirm');
    haptic('medium');
    const current = useGame.getState().save;
    if (!current) return;
    const applied = applyStoryChoice({
      save: current,
      sceneId: scene.id,
      prompt: line.text,
      choiceId: choice.id,
      choiceText: choice.text,
      effects: choice.effects ?? {},
      nextLineId: choice.nextLineId,
      now: new Date().toISOString(),
    });
    if (applied.save === current) {
      audio.playSfx('sfx_ui_error');
      return;
    }
    await mutate(() => applied.save);
    if (applied.decision) {
      await updateArchive((archive) => ({
        ...archive,
        decisions: { ...archive.decisions, [scene.id]: applied.decision! },
      }));
    }
    setLineId(choice.nextLineId);
  };

  const canSkip = (route.params.readOnly || seenAtStart.current) && (route.params.readOnly || choiceMade || !choices);
  const expression = line.expression ?? 'placeholder_character_silhouette';

  return (
    <ScreenContainer background={scene.background} dim>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        {canSkip ? <SecondaryButton label="Skip Scene" onPress={() => void finish()} /> : <View />}
      </View>
      <View style={{ flex: 1, minHeight: 120, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' }}>
        <CharacterPortrait name={expression} size={200} idle enter motionKey={line?.id} />
      </View>
      <DialoguePanel speaker={line.speakerName} text={shown} objective={line.objective} showContinue={!showChoices} onAdvance={advance}>
        {showChoices ? choices!.map((choice) => {
          const cost = choice.cashCost ?? 0;
          return (
            <ChoiceButton key={choice.id} label={choice.text} disabled={cost > save.cash} onPress={() => void choose(choice)} />
          );
        }) : null}
      </DialoguePanel>
      <PauseLayer />
    </ScreenContainer>
  );
}

export function NightIntroScreen() {
  const navigation = useNavigation<Nav>();
  const save = useGame((state) => state.save);
  const mutate = useGame((state) => state.mutate);
  const owned = useGame((state) => state.purchase.blackLabelCached);
  useRouteMusic('NightIntro');
  useEffect(() => {
    if (save && save.currentNight > FREE_NIGHT_LIMIT && !owned) navigation.replace('BlackLabel');
  }, [navigation, owned, save]);
  if (!save) return null;
  const night = nightByNumber(save.currentNight);
  return (
    <ScreenContainer background="bg_city_dawn" dim>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <ArtImage name="decor_city_clock" style={{ width: 64, height: 64 }} />
        <IconButton label="Pause" glyph="II" onPress={() => useGame.getState().setPause(true)} />
      </View>
      <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
        <Eyebrow>{`Night ${String(night.number).padStart(2, '0')}`}</Eyebrow>
        <Text style={{ color: colors.cream100, fontFamily: fonts.display, fontSize: 40, lineHeight: 46 }}>{night.title}</Text>
        <GoldFrame>
          <Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>{night.setup}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {night.chips.map((chip) => (
              <View key={chip} style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.gold700, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 15, lineHeight: 20 }}>{chip}</Text>
              </View>
            ))}
          </View>
        </GoldFrame>
      </View>
      <PrimaryButton label="Begin Briefing" onPress={() => {
        void mutate((current) => ({ ...current, currentStep: 'briefing' })).then(() => navigation.navigate('Briefing'));
      }} />
      <PauseLayer />
    </ScreenContainer>
  );
}

export function BriefingScreen() {
  const navigation = useNavigation<Nav>();
  const save = useGame((state) => state.save);
  const mutate = useGame((state) => state.mutate);
  useRouteMusic('Briefing');
  if (!save) return null;
  const night = nightByNumber(save.currentNight);
  const featured = characterById(night.featuredCharacterId);
  const prior = previousConsequence(night, save.flags);
  return (
    <ScreenContainer background="bg_headquarters_table">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, zIndex: 2 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Eyebrow>Briefing</Eyebrow>
          <Text numberOfLines={2} style={{ color: colors.cream100, fontFamily: fonts.display, fontSize: 28, lineHeight: 32 }}>{night.title}</Text>
        </View>
        <IconButton label="Pause" glyph="II" onPress={() => useGame.getState().setPause(true)} />
      </View>
      <View style={{ flex: 1, minHeight: 0, flexDirection: 'row', gap: 12, alignItems: 'stretch' }}>
        <GoldFrame style={{ flex: 1, minWidth: 0 }}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            <Eyebrow>Objective</Eyebrow>
            <Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>{night.briefingObjective}</Text>
            <Eyebrow>Known risks</Eyebrow>
            <Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>{night.risks}</Text>
            {prior ? <Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>{prior}</Text> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {night.suggestedSkills.map((skill) => <SkillBadge key={skill} skill={skill as SkillId} label />)}
            </View>
          </ScrollView>
        </GoldFrame>
        <View style={{ width: 112, justifyContent: 'flex-end', overflow: 'hidden' }}>
          <CharacterPortrait name={featured.portraits.neutral} size={108} />
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <PrimaryButton label="Review Crew" onPress={() => {
          void mutate((current) => ({ ...current, currentStep: 'crewSelection' })).then(() => navigation.navigate('CrewSelection'));
        }} />
        <SecondaryButton label="Crew Details" onPress={() => navigation.navigate('CrewRoster')} />
      </View>
      <PauseLayer />
    </ScreenContainer>
  );
}

export function CrewSelectionScreen() {
  const navigation = useNavigation<Nav>();
  const save = useGame((state) => state.save);
  const mutate = useGame((state) => state.mutate);
  const [selected, setSelected] = useState<string[]>(save?.selectedCrewIds ?? []);
  useRouteMusic('CrewSelection');
  if (!save) return null;
  const night = nightByNumber(save.currentNight);
  const totals = combinedSkills(characters, selected);
  const toggle = (id: string) => {
    if (selected.includes(id)) {
      audio.playSfx('sfx_ui_tap');
      setSelected(selected.filter((row) => row !== id));
      return;
    }
    if (selected.length >= 3) return;
    const character = characterById(id);
    audio.playCue(character.cue);
    setSelected([...selected, id]);
  };
  return (
    <ScreenContainer background="bg_headquarters_table" scroll>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <IconButton label="Back" glyph="<" onPress={() => {
          void mutate((current) => (current.currentStep === 'crewSelection' ? { ...current, currentStep: 'briefing' } : current)).then(() => navigation.goBack());
        }} />
        <IconButton label="Pause" glyph="II" onPress={() => useGame.getState().setPause(true)} />
      </View>
      {night.number === 1 && useGame.getState().settings.tutorialTipsEnabled ? <GoldFrame><Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>Choose three crew members.</Text></GoldFrame> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: 8 }}>
        {characters.map((character) => {
          const isOn = selected.includes(character.id);
          const state = save.characterState[character.id];
          return (
            <View key={character.id} style={{ width: '48%' }}>
              <CharacterCard name={character.name} selected={isOn} dimmed={!isOn && selected.length === 3} onPress={() => toggle(character.id)} onInfo={() => navigation.navigate('CharacterDetail', { characterId: character.id })}>
                <View style={{ height: 90, alignItems: 'center', justifyContent: 'flex-end' }}>
                  <CharacterPortrait name={character.portraits.neutral} size={72} />
                </View>
                <Text numberOfLines={2} style={{ height: 40, color: colors.cream100, fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 20 }}>{character.name}</Text>
                <Text numberOfLines={3} style={{ height: 60, color: colors.cream100, fontFamily: fonts.body, fontSize: 15, lineHeight: 20 }}>{`Charm ${character.charm}\nNerve ${character.nerve}\nCunning ${character.cunning}`}</Text>
                <LoyaltyBar value={state.loyalty} />
                <Pressable accessibilityLabel={character.trait} onPress={() => navigation.navigate('CharacterDetail', { characterId: character.id })}>
                  <Text style={{ color: colors.gold500, fontFamily: fonts.bodySemi, fontSize: 15 }}>Details</Text>
                </Pressable>
              </CharacterCard>
            </View>
          );
        })}
      </View>
      <Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16 }}>{`Selected ${selected.length}/3`}</Text>
      <GoldFrame>
        <Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>{strongestSkillLabel(totals)}</Text>
      </GoldFrame>
      <PrimaryButton label="Confirm Crew" disabled={selected.length !== 3} onPress={() => {
        audio.playSfx('sfx_ui_confirm');
        void mutate((current) => confirmCrew(current, selected, new Date().toISOString())).then(() => navigation.replace('CityMap'));
      }} />
      <PauseLayer />
    </ScreenContainer>
  );
}

export function CityMapScreen() {
  const navigation = useNavigation<Nav>();
  const save = useGame((state) => state.save);
  const mutate = useGame((state) => state.mutate);
  const [sheet, setSheet] = useState<OperationDef | null>(null);
  const [assigned, setAssigned] = useState<string[]>([]);
  const [approach, setApproach] = useState<ApproachId | null>(null);
  const [prep, setPrep] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [ignoredOpen, setIgnoredOpen] = useState(false);
  const [continueEnabled, setContinueEnabled] = useState(false);
  const [tip, setTip] = useState<string | null>(null);
  const [dockId, setDockId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const reduced = useGame((state) => state.settings.reducedMotion);
  const resultDismissed = useRef(false);
  useRouteMusic('CityMap', save?.heat ?? 0);

  useEffect(() => {
    resultDismissed.current = false;
  }, [save?.pendingOperation?.operationId]);

  useEffect(() => {
    const pending = save?.pendingOperation;
    if (!pending || pending.ignoredApplied || resultDismissed.current) return;
    setResultOpen(true);
    setContinueEnabled(pending.resultApplied);
  }, [save?.pendingOperation]);

  const settleResult = useCallback(() => {
    const current = useGame.getState().save;
    const pending = current?.pendingOperation;
    if (!pending || pending.resultApplied) {
      setContinueEnabled(true);
      return;
    }
    const operation = operationById(pending.operationId);
    const resolution = evaluateOperation({
      operation,
      assignedIds: pending.assignedIds,
      approach: pending.approach,
      preparation: pending.preparation,
      characters,
      relationships,
      charmBonusUsedThisNight: current.charmBonusUsedThisNight,
    });
    audio.playSfx(resolution.outcome === 'strongSuccess' ? 'sfx_result_strong_success' : resolution.outcome === 'success' ? 'sfx_result_success' : 'sfx_result_failure');
    audio.playSfx('sfx_result_stamp');
    if (resolution.cash > 0) audio.playSfx('sfx_resource_cash_gain');
    if (resolution.cash < 0) audio.playSfx('sfx_resource_cash_loss');
    if (resolution.influence !== 0) audio.playSfx('sfx_resource_influence_gain');
    if (resolution.heat !== 0) audio.playSfx('sfx_resource_heat_gain');
    if (Object.values(resolution.loyaltyByCharacter).some((value) => value)) audio.playSfx('sfx_resource_loyalty_gain');
    void mutate((latest) => applyOperationResult({
      save: latest,
      operation,
      characters,
      relationships,
      now: new Date().toISOString(),
    })).then(() => setContinueEnabled(true));
  }, [mutate]);

  useEffect(() => {
    if (!resultOpen || continueEnabled) return;
    const timer = setTimeout(settleResult, reduced ? 150 : 1100);
    return () => clearTimeout(timer);
  }, [continueEnabled, reduced, resultOpen, settleResult]);

  if (!save || (save.currentStep !== 'dusk' && save.currentStep !== 'midnight' && save.currentStep !== 'lastCall')) return null;
  const phase = phaseFromStep(save.currentStep);
  const night = nightByNumber(save.currentNight);
  const pair = operationsFor(save.currentNight, phase);
  const pending = save.pendingOperation;
  const pendingOp = pending ? operationById(pending.operationId) : null;

  const openOp = (operation: OperationDef) => {
    audio.playSfx('sfx_card_select');
    audio.playSfx('sfx_modal_open');
    setSheet(operation);
    setAssigned([]);
    setApproach(null);
    setPrep(false);
    setConfirming(false);
  };

  const prediction = sheet && approach ? evaluateOperation({
    operation: sheet,
    assignedIds: assigned,
    approach,
    preparation: prep,
    characters,
    relationships,
    charmBonusUsedThisNight: save.charmBonusUsedThisNight,
  }) : null;
  const futurePhases: PhaseId[] = save.currentStep === 'dusk' ? ['midnight', 'lastCall'] : save.currentStep === 'midnight' ? ['lastCall'] : [];
  const energyAfter: Record<string, number> = {};
  for (const id of save.selectedCrewIds) {
    energyAfter[id] = save.characterState[id as CharacterId].energy - (assigned.includes(id) ? 1 : 0);
  }
  const leavesNightPlayable = canStaffRemainingPhases(
    save.selectedCrewIds,
    energyAfter,
    futurePhases.map((phaseId) => operationsFor(save.currentNight, phaseId)),
  );

  const run = () => {
    if (!sheet || !approach || !leavesNightPlayable) return;
    audio.playSfx('sfx_ui_confirm');
    const ignoredOperation = pair.find((row) => row.id !== sheet.id) ?? sheet;
    void mutate((current) => commitOperation({
      save: current,
      operation: sheet,
      ignoredOperation,
      assignedIds: assigned,
      approach,
      preparation: prep,
      now: new Date().toISOString(),
    })).then(() => {
      setSheet(null);
      setConfirming(false);
      setContinueEnabled(false);
      setResultOpen(true);
    });
  };

  const onContinue = () => {
    resultDismissed.current = true;
    setResultOpen(false);
    setIgnoredOpen(true);
  };

  const onUnderstood = async () => {
    if (!pendingOp) return;
    audio.playSfx('sfx_phase_transition');
    const next = await mutate((current) => applyIgnoredAndAdvance({
      save: current,
      operation: pendingOp,
      night,
      now: new Date().toISOString(),
    }));
    setIgnoredOpen(false);
    if (!next) return;
    if (next.activeSceneId) navigation.navigate('Story', { sceneId: next.activeSceneId });
    else if (next.currentStep === 'ending') navigation.navigate('Ending');
    else if (next.currentStep === 'nightSummary') navigation.navigate('NightSummary');
  };

  const cost = sheet ? preparationCashCost({ operation: sheet, assignedIds: assigned, preparation: true }) : 0;
  const chance = prediction ? chanceLabel(prediction.chance) : null;

  return (
    <ScreenContainer background="bg_city_map">
      <ResourceHud cash={save.cash} influence={save.influence} heat={save.heat} loyalty={displayedLoyalty(save)} onPress={(kind) => {
        const tips = {
          cash: 'Used for paid approaches and story choices.',
          influence: 'Public power and favors.',
          heat: 'Higher is worse. At 100, the player receives the high-Heat ending unless a story override applies.',
          loyalty: 'Average of all six character loyalty values.',
        };
        setTip(tips[kind]);
      }} />
      {tip ? (
        <GoldFrame>
          <Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 15, lineHeight: 21 }}>{tip}</Text>
        </GoldFrame>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, backgroundColor: 'rgba(7, 28, 73, 0.94)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ color: colors.cream100, fontFamily: fonts.bodyBold, fontSize: 20, lineHeight: 26 }}>{night.title}</Text>
          <Text style={{ color: colors.gold500, fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 22 }}>{PHASE_LABEL[phase]}</Text>
        </View>
        <IconButton label="Pause" glyph="II" onPress={() => useGame.getState().setPause(true)} />
      </View>
      {save.currentNight === 1 && useGame.getState().settings.tutorialTipsEnabled ? <GoldFrame><Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>Pick one of two operations in each phase.</Text></GoldFrame> : null}
      {save.heat >= 70 ? <HeatPulse /> : null}
      <PhaseCards phase={phase}>
        {pair.map((operation) => (
          <OperationCard key={operation.id} title={operation.title} location={operation.locationName} setup={operation.setup} skill={operation.suggestedSkill} rewards={operation.rewardIcons} threat={operation.threat} icon={operation.icon} onPress={() => openOp(operation)} />
        ))}
      </PhaseCards>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        {save.selectedCrewIds.map((id) => {
          const character = characterById(id);
          return (
            <Pressable key={id} accessibilityLabel={character.name} onPress={() => setDockId(id)}>
              <CharacterPortrait name={character.portraits.neutral} size={64} />
              <EnergyPips energy={save.characterState[id as CharacterId].energy} />
            </Pressable>
          );
        })}
        <IconButton label="Crew" glyph="C" onPress={() => setDrawer(true)} />
      </View>
      {dockId ? (
        <GoldFrame>
          <Text style={{ color: colors.cream100, fontFamily: fonts.bodyBold }}>{characterById(dockId).name}</Text>
          <Text style={{ color: colors.cream100, fontFamily: fonts.body }}>{characterById(dockId).trait}</Text>
          <SecondaryButton label="Back" onPress={() => setDockId(null)} />
        </GoldFrame>
      ) : null}
      {drawer ? (
        <GoldFrame>
          {save.selectedCrewIds.map((id) => <Text key={id} style={{ color: colors.cream100, fontFamily: fonts.body }}>{characterById(id).name}</Text>)}
          <SecondaryButton label="Back" onPress={() => setDrawer(false)} />
        </GoldFrame>
      ) : null}
      {sheet ? (
        <ModalSheet onClose={() => { if (!confirming) setSheet(null); }}>
          <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
            <Text style={{ color: colors.cream100, fontFamily: fonts.bodyBold, fontSize: 20 }}>{sheet.title}</Text>
            <Text style={{ color: colors.gold500, fontFamily: fonts.body }}>{sheet.locationName}</Text>
            <Text style={{ color: colors.cream100, fontFamily: fonts.body }}>{sheet.difficulty}</Text>
            <Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16 }}>{sheet.description}</Text>
            <Text style={{ color: colors.green500, fontFamily: fonts.body }}>{sheet.strongSuccess.text}</Text>
            <Text style={{ color: colors.coral500, fontFamily: fonts.body }}>{sheet.failure.text}</Text>
            {save.currentNight === 1 && useGame.getState().settings.tutorialTipsEnabled ? <Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>Match crew skills to Talk, Stand Firm, or Outsmart.</Text> : null}
            <View style={{ flexDirection: 'row', gap: 8, marginVertical: 8 }}>
              {save.selectedCrewIds.map((id) => {
                const energy = save.characterState[id as CharacterId].energy;
                const on = assigned.includes(id);
                return (
                  <Pressable key={id} accessibilityLabel={characterById(id).name} disabled={energy <= 0} onPress={() => {
                    if (on) setAssigned(assigned.filter((row) => row !== id));
                    else if (assigned.length < sheet.maxCharacters) setAssigned([...assigned, id]);
                  }} style={{ opacity: energy <= 0 ? 0.4 : 1, borderWidth: on ? 2 : 0, borderColor: colors.gold500, borderRadius: 12 }}>
                    <CharacterPortrait name={characterById(id).portraits.neutral} size={64} />
                  </Pressable>
                );
              })}
            </View>
            {prediction?.relationshipPhrase ? <Text style={{ color: colors.gold500 }}>{prediction.relationshipPhrase}</Text> : null}
            <View style={{ gap: 8 }}>
              {(['talk', 'standFirm', 'outsmart'] as ApproachId[]).map((id) => (
                <SecondaryButton key={id} label={APPROACH_LABEL[id]} onPress={() => setApproach(id)} accessibilityLabel={APPROACH_LABEL[id]} />
              ))}
            </View>
            {sheet.preparation ? (
              <SecondaryButton label={sheet.preparation.label} disabled={!canAffordPreparation(save.cash, cost)} onPress={() => setPrep(!prep)} />
            ) : null}
            {revealsConsequenceHint(save.selectedCrewIds) ? <Text accessibilityLabel={sheet.hint} style={{ color: colors.gold500, fontFamily: fonts.body }}>{sheet.hint}</Text> : null}
            {chance ? <Text accessibilityLabel={chance} style={{ color: colors.cream100, fontFamily: fonts.bodyBold, fontSize: 20 }}>{chance}</Text> : null}
            {confirming ? (
              <View style={{ gap: 8 }}>
                <SecondaryButton label="Not Yet" onPress={() => setConfirming(false)} />
                <PrimaryButton label="Run Operation" disabled={!leavesNightPlayable} onPress={run} />
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                <SecondaryButton label="Back" onPress={() => setSheet(null)} />
                <PrimaryButton label="Commit" disabled={!approach || !leavesNightPlayable || assigned.length < sheet.minCharacters || assigned.length > sheet.maxCharacters} onPress={() => setConfirming(true)} />
              </View>
            )}
          </ScrollView>
        </ModalSheet>
      ) : null}
      {resultOpen && pending && pendingOp ? (
        <ResultOverlay pending={pending} operation={pendingOp} charmUsed={save.charmBonusUsedThisNight} reduced={reduced} continueEnabled={continueEnabled} onContinue={onContinue} />
      ) : null}
      {ignoredOpen && pending ? (
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: 24 }}>
          <GoldFrame>
            <Text style={{ color: colors.gold500, fontFamily: fonts.bodyBold }}>While you were busy…</Text>
            <Text style={{ color: colors.cream100, fontFamily: fonts.bodyBold }}>{operationsFor(save.currentNight, phase).find((row) => row.id !== pending.operationId)?.title}</Text>
            <Text style={{ color: colors.cream100, fontFamily: fonts.body }}>{pending.ignoredText}</Text>
            <Text style={{ color: colors.cream100, fontFamily: fonts.body }}>{`Cash ${pending.ignoredCash}  Influence ${pending.ignoredInfluence}  Heat ${pending.ignoredHeat}`}</Text>
            <PrimaryButton label="Understood" onPress={() => void onUnderstood()} />
          </GoldFrame>
        </View>
      ) : null}
      <PauseLayer />
    </ScreenContainer>
  );
}

export function NightSummaryScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'NightSummary'>>();
  const save = useGame((state) => state.save);
  const archive = useGame((state) => state.archive);
  const owned = useGame((state) => state.purchase.blackLabelCached);
  const mutate = useGame((state) => state.mutate);
  const recordNight = useGame((state) => state.recordNight);
  const recorded = useRef(false);
  useRouteMusic('NightSummary');
  const archiveNight = route.params?.archiveNight;
  const record = archiveNight ? archive.nights.find((row) => row.night === archiveNight) : null;

  useEffect(() => {
    if (!save || archiveNight || recorded.current || save.currentStep !== 'nightSummary') return;
    recorded.current = true;
    const unlocked = finishNightUnlocks(save, characters);
    void mutate((current) => grantBiography(current, characters, new Date().toISOString())).then((next) => {
      if (!next) return;
      const loyalty = Math.round(averageLoyalty(loyaltyValues(next)) - averageLoyalty(Object.values(next.nightBaseline.loyalty)));
      void recordNight({
        night: next.currentNight,
        title: nightByNumber(next.currentNight).title,
        summaryResult: nightByNumber(next.currentNight).summaryResult,
        cash: next.cash - next.nightBaseline.cash,
        influence: next.influence - next.nightBaseline.influence,
        heat: next.heat - next.nightBaseline.heat,
        loyalty,
        decisions: notableDecisionTexts(next),
        loyaltyChanges: Object.fromEntries(Object.entries(next.characterState).map(([id, state]) => [id, state.loyalty - next.nightBaseline.loyalty[id as CharacterId]])) as NightSummaryLoyalty,
        unlockedBiography: unlocked,
      });
      if (unlocked.length) audio.playSfx('sfx_unlock_archive');
    });
  }, [archiveNight, mutate, recordNight, save]);

  if (record) {
    return (
      <ScreenContainer background="bg_city_dawn" scroll>
        <IconButton label="Back" glyph="<" onPress={() => navigation.goBack()} />
        <ScreenTitle>{record.title}</ScreenTitle>
        <GoldFrame>
          <Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>{record.summaryResult}</Text>
        </GoldFrame>
        {record.decisions.map((decision) => (
          <GoldFrame key={decision}>
            <Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>{decision}</Text>
          </GoldFrame>
        ))}
        <SecondaryButton label="Back" onPress={() => navigation.goBack()} />
      </ScreenContainer>
    );
  }
  if (!save) return null;
  const night = nightByNumber(save.currentNight);
  const loyaltyDelta = Math.round(averageLoyalty(loyaltyValues(save)) - averageLoyalty(Object.values(save.nightBaseline.loyalty)));
  const freeLocked = save.currentNight >= FREE_NIGHT_LIMIT && !owned;
  return (
    <ScreenContainer background="bg_city_dawn" scroll>
      <ArtImage name="group_night_summary" style={{ width: 320, height: 160, alignSelf: 'center' }} />
      <Eyebrow>Night completed</Eyebrow>
      <ScreenTitle>{night.title}</ScreenTitle>
      <GoldFrame>
        <Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>{night.summaryResult}</Text>
      </GoldFrame>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <StatPill label="Cash" value={String(save.cash - save.nightBaseline.cash)} />
        <StatPill label="Influence" value={String(save.influence - save.nightBaseline.influence)} />
        <StatPill label="Heat" value={String(save.heat - save.nightBaseline.heat)} />
        <StatPill label="Loyalty" value={String(loyaltyDelta)} />
      </View>
      {notableDecisionTexts(save).map((decision) => (
        <GoldFrame key={decision}>
          <Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>{decision}</Text>
        </GoldFrame>
      ))}
      {Object.entries(save.characterState).map(([id, state]) => {
        const delta = state.loyalty - save.nightBaseline.loyalty[id as CharacterId];
        if (!delta) return null;
        return (
          <GoldFrame key={id}>
            <Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>{`${characterById(id).name} ${delta > 0 ? '+' : ''}${delta}`}</Text>
          </GoldFrame>
        );
      })}
      {freeLocked ? <PrimaryButton label="Unlock the Full Story" onPress={() => navigation.navigate('BlackLabel')} /> : save.currentNight === 12 ? <PrimaryButton label="Continue" onPress={() => {
        void mutate((current) => resolveCampaignEnding(current, new Date().toISOString())).then(() => navigation.navigate('Ending'));
      }} /> : <PrimaryButton label="Next Night" onPress={() => {
        void mutate((current) => goToNextNight(current, new Date().toISOString())).then(() => navigation.reset({ index: 1, routes: [{ name: 'MainMenu' }, { name: 'NightIntro' }] }));
      }} />}
      <SecondaryButton label="Return to Main Menu" onPress={() => navigation.reset({ index: 0, routes: [{ name: 'MainMenu' }] })} />
      <SecondaryButton label="View Crew" onPress={() => navigation.navigate('CrewRoster')} />
      <PauseLayer />
    </ScreenContainer>
  );
}

type NightSummaryLoyalty = Record<CharacterId, number>;

export function CrewRosterScreen() {
  const navigation = useNavigation<Nav>();
  const owned = useGame((state) => state.purchase.blackLabelCached);
  const save = useGame((state) => state.save);
  const archive = useGame((state) => state.archive);
  useRouteMusic('CrewRoster');
  return (
    <ScreenContainer background="bg_archive_room" scroll>
      <IconButton label="Back" glyph="<" onPress={() => navigation.goBack()} />
      {owned ? <ArtImage name="group_black_label" style={{ width: 280, height: 160, alignSelf: 'center' }} /> : null}
      {characters.map((character) => {
        const entries = save?.characterState[character.id].biographyEntries ?? archive.biographyEntries[character.id] ?? [];
        const loyalty = save?.characterState[character.id].loyalty ?? 60;
        return (
          <Pressable key={character.id} accessibilityRole="button" accessibilityLabel={character.name} onPress={() => navigation.navigate('CharacterDetail', { characterId: character.id })}>
            <GoldFrame>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <CharacterPortrait name={character.portraits.neutral} size={72} />
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Text style={{ color: colors.cream100, fontFamily: fonts.bodyBold, fontSize: 20, lineHeight: 24 }}>{character.name}</Text>
                  <Text style={{ color: colors.gold500, fontFamily: fonts.body }}>{character.nickname}</Text>
                  <Text style={{ color: colors.cream100, fontFamily: fonts.body, lineHeight: 20 }}>{character.role}</Text>
                  <LoyaltyBar value={loyalty} />
                  <Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 15, lineHeight: 20 }}>{`Story ${Math.round((entries.length / character.biography.length) * 100)}%`}</Text>
                </View>
              </View>
            </GoldFrame>
          </Pressable>
        );
      })}
    </ScreenContainer>
  );
}

export function CharacterDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'CharacterDetail'>>();
  const save = useGame((state) => state.save);
  const archive = useGame((state) => state.archive);
  const [tab, setTab] = useState<'Profile' | 'History' | 'Relations'>('Profile');
  const [id, setId] = useState(route.params.characterId);
  useRouteMusic('CharacterDetail');
  const index = characters.findIndex((character) => character.id === id);
  const character = characters[index];
  if (!character) return null;
  const unlocked = new Set(save?.characterState[character.id].biographyEntries ?? archive.biographyEntries[character.id] ?? []);
  const shift = (dir: number) => setId(characters[(index + dir + characters.length) % characters.length].id);
  return (
    <ScreenContainer background="bg_safehouse" scroll>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <IconButton label="Previous character" glyph="<" onPress={() => shift(-1)} />
        <IconButton label="Back" glyph="x" onPress={() => navigation.goBack()} />
        <IconButton label="Next character" glyph=">" onPress={() => shift(1)} />
      </View>
      <View style={{ alignItems: 'center', overflow: 'hidden' }}>
        <CharacterPortrait name={character.portraits.neutral} size={180} idle enter motionKey={character.id} />
      </View>
      <ScreenTitle>{character.name}</ScreenTitle>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['Profile', 'History', 'Relations'] as const).map((name) => (
          <View key={name} style={{ flex: 1, minWidth: 0 }}>
            <SecondaryButton label={name} selected={tab === name} onPress={() => setTab(name)} />
          </View>
        ))}
      </View>
      {tab === 'Profile' ? (
        <GoldFrame>
          <Text style={{ color: colors.gold500, fontFamily: fonts.bodySemi }}>{character.role}</Text>
          <Text style={{ color: colors.cream100, fontFamily: fonts.body, lineHeight: 22 }}>{character.personality}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <StatPill label="Charm" value={String(character.charm)} />
            <StatPill label="Nerve" value={String(character.nerve)} />
            <StatPill label="Cunning" value={String(character.cunning)} />
          </View>
          <Text style={{ color: colors.gold500, fontFamily: fonts.body }}>{character.trait}</Text>
        </GoldFrame>
      ) : null}
      {tab === 'History' ? character.biography.map((entry) => (
        <GoldFrame key={entry.id}>
          <Text style={{ color: unlocked.has(entry.id) ? colors.cream100 : colors.gold500, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>
            {unlocked.has(entry.id) ? entry.text : 'Still locked'}
          </Text>
        </GoldFrame>
      )) : null}
      {tab === 'Relations' ? characters.filter((other) => other.id !== character.id).map((other) => {
        const rel = relationships.find((row) => [row.a, row.b].sort().join() === [character.id, other.id].sort().join());
        return (
          <GoldFrame key={other.id}>
            <Text style={{ color: colors.cream100, fontFamily: fonts.bodyBold }}>{other.name}</Text>
            <Text style={{ color: colors.cream100, fontFamily: fonts.body, lineHeight: 22 }}>{rel?.phrase ?? 'No recorded tie'}</Text>
          </GoldFrame>
        );
      }) : null}
    </ScreenContainer>
  );
}

export function ArchiveScreen() {
  const navigation = useNavigation<Nav>();
  const archive = useGame((state) => state.archive);
  const owned = useGame((state) => state.purchase.blackLabelCached);
  useRouteMusic('Archive');
  const art = ['group_main_menu', 'group_night_summary', 'group_black_label', 'ending_king_of_last_call', 'ending_family_holds', 'ending_city_without_boss'];
  return (
    <ScreenContainer background="bg_archive_room" scroll>
      <IconButton label="Back" glyph="<" onPress={() => navigation.goBack()} />
      <ScreenTitle>Archive</ScreenTitle>
      <Eyebrow>Nights</Eyebrow>
      {Array.from({ length: 12 }, (_, index) => index + 1).map((number) => {
        const found = archive.nights.find((row) => row.night === number);
        const locked = !found && number > FREE_NIGHT_LIMIT && !owned;
        return (
          <SecondaryButton key={number} label={found ? nightByNumber(number).title : `Night ${number}`} disabled={!found && !locked} onPress={() => {
            if (found) navigation.navigate('NightSummary', { archiveNight: number });
            else if (locked) navigation.navigate('BlackLabel');
          }} />
        );
      })}
      <Eyebrow>Decisions</Eyebrow>
      {Object.entries(archive.decisions).map(([id, decision]) => (
        <GoldFrame key={id}>
          <Text style={{ color: colors.cream100, fontFamily: fonts.body }}>{decision.prompt}</Text>
          <Text style={{ color: colors.gold500, fontFamily: fonts.body }}>{decision.choiceText}</Text>
        </GoldFrame>
      ))}
      <Eyebrow>Endings</Eyebrow>
      {endings.map((ending) => {
        const unlocked = archive.unlockedEndingIds.includes(ending.id);
        return <SecondaryButton key={ending.id} label={ending.title} disabled={!unlocked} onPress={() => unlocked ? navigation.navigate('Ending', { endingId: ending.id, replay: true }) : undefined} />;
      })}
      <Eyebrow>Artwork</Eyebrow>
      {owned ? art.map((name) => <ArtImage key={name} name={name} style={{ width: '100%', height: 180, alignSelf: 'center' }} />) : (
        <GoldFrame>
          <Text style={{ color: colors.cream100, fontFamily: fonts.body, lineHeight: 22 }}>The gallery opens with Black Label.</Text>
          <SecondaryButton label="Black Label" onPress={() => navigation.navigate('BlackLabel')} />
        </GoldFrame>
      )}
    </ScreenContainer>
  );
}

type PurchaseUi = 'idle' | 'loading' | 'purchasing' | 'pending' | 'success' | 'cancelled' | 'error' | 'owned';
type RestoreNotice =
  | { kind: 'working' }
  | { kind: 'success' }
  | { kind: 'empty' }
  | { kind: 'error'; message: string };

function restoreFailureMessage(error: unknown): string {
  const record = error && typeof error === 'object' ? error as { message?: unknown; code?: unknown } : null;
  const code = typeof record?.code === 'string' ? record.code : '';
  const raw = typeof record?.message === 'string'
    ? record.message.trim()
    : error instanceof Error
      ? error.message.trim()
      : '';
  if (code === 'user-cancelled') return 'Restore cancelled.';
  if (raw && code && code !== 'unknown') return `${raw} (${code})`;
  if (raw) return raw;
  return 'Restore failed. The App Store did not respond.';
}

export function BlackLabelScreen() {
  const navigation = useNavigation<Nav>();
  const owned = useGame((state) => state.purchase.blackLabelCached);
  const setOwned = useGame((state) => state.setOwned);
  const setStoreUnavailable = useGame((state) => state.setStoreUnavailable);
  const purchasing = useGame((state) => state.purchasing);
  const setPurchasing = useGame((state) => state.setPurchasing);
  const setToast = useGame((state) => state.setToast);
  const toast = useGame((state) => state.toast);
  const [status, setStatus] = useState<PurchaseUi>(owned ? 'owned' : 'loading');
  const [price, setPrice] = useState<string | null>(null);
  const [notice, setNotice] = useState<RestoreNotice | null>(null);
  const [restoring, setRestoring] = useState(false);
  useRouteMusic('BlackLabel');

  const load = useCallback(async () => {
    const alreadyOwned = useGame.getState().purchase.blackLabelCached;
    setStatus(alreadyOwned ? 'owned' : 'loading');
    try {
      const connected = await initConnection();
      if (!connected) {
        setStoreUnavailable(true);
        setStatus(alreadyOwned ? 'owned' : 'error');
        return;
      }
      const products = await fetchProducts({ skus: [PRODUCT_ID], type: 'in-app' });
      const product = (products ?? []).find((item) => item.id === PRODUCT_ID) as Product | undefined;
      setPrice(product?.displayPrice ?? null);
      const purchases = await getAvailablePurchases();
      const has = purchases.some((purchase) => purchase.productId === PRODUCT_ID);
      await setOwned(has);
      setStoreUnavailable(false);
      setStatus(has ? 'owned' : product ? 'idle' : 'error');
    } catch (error) {
      setStoreUnavailable(true);
      setStatus(alreadyOwned ? 'owned' : 'error');
      setNotice({ kind: 'error', message: restoreFailureMessage(error) });
    }
  }, [setOwned, setStoreUnavailable]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const success = purchaseUpdatedListener(async (purchase: Purchase) => {
      if (purchase.productId !== PRODUCT_ID) return;
      if (purchase.purchaseState === 'pending') {
        setStatus('pending');
        setPurchasing(false);
        return;
      }
      const granted = await completeStorePurchase(purchase);
      if (!granted) return;
      audio.playSfx('sfx_black_label_unlock');
      setStatus('success');
      setPurchasing(false);
    });
    const failure = purchaseErrorListener((error: PurchaseError) => {
      setPurchasing(false);
      if (error.code === 'user-cancelled') {
        setStatus(useGame.getState().purchase.blackLabelCached ? 'owned' : 'idle');
        setToast('Purchase cancelled.');
        return;
      }
      setStatus('error');
      setNotice({ kind: 'error', message: restoreFailureMessage(error) });
    });
    return () => {
      success.remove();
      failure.remove();
    };
  }, [setPurchasing, setToast]);

  const buy = async () => {
    setPurchasing(true);
    setStatus('purchasing');
    setNotice(null);
    try {
      await requestPurchase({
        request: { apple: { sku: PRODUCT_ID } },
        type: 'in-app',
      });
    } catch (error) {
      setPurchasing(false);
      setStatus('error');
      setNotice({ kind: 'error', message: restoreFailureMessage(error) });
    }
  };

  const restore = async () => {
    if (purchasing || restoring) return;
    setRestoring(true);
    setNotice({ kind: 'working' });
    try {
      const connected = await initConnection();
      if (!connected) {
        setStoreUnavailable(true);
        setNotice({ kind: 'error', message: 'The App Store is unavailable. Try again when connected.' });
        if (!useGame.getState().purchase.blackLabelCached) setStatus('error');
        return;
      }
      await restorePurchases();
      const purchases = await getAvailablePurchases();
      const has = purchases.some((purchase) => purchase.productId === PRODUCT_ID);
      await setOwned(has);
      setStoreUnavailable(false);
      if (has) {
        setStatus('owned');
        setNotice({ kind: 'success' });
        return;
      }
      setStatus(price ? 'idle' : 'error');
      setNotice({ kind: 'empty' });
    } catch (error) {
      setNotice({ kind: 'error', message: restoreFailureMessage(error) });
      if (!useGame.getState().purchase.blackLabelCached) setStatus('error');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <ScreenContainer background="bg_black_label" scroll>
      <IconButton label="Back" glyph="<" onPress={() => { if (!purchasing) navigation.goBack(); }} />
      <ArtImage name="logo_gangster_sino_black_label" style={{ width: 260, height: 110, alignSelf: 'center' }} />
      <ArtImage name="group_black_label" style={{ width: '100%', height: 180, alignSelf: 'center' }} />
      <GoldFrame>
        <Eyebrow>Included</Eyebrow>
        {['Nights 4 through 12', 'All three endings', 'Artwork gallery', 'Alternate crew outfits', 'Jukebox on the main menu'].map((line) => (
          <Text key={line} style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>{line}</Text>
        ))}
      </GoldFrame>
      {status === 'error' && notice?.kind !== 'error' ? <GoldFrame><Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>The App Store is unavailable. Try again when connected.</Text></GoldFrame> : null}
      {status === 'pending' ? <GoldFrame><Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>Purchase pending. Access will unlock after the App Store confirms payment.</Text></GoldFrame> : null}
      {status === 'success' ? <GoldFrame><Text style={{ color: colors.gold500, fontFamily: fonts.display, fontSize: 32, lineHeight: 38 }}>Black Label Unlocked</Text></GoldFrame> : null}
      {status === 'owned' && notice?.kind !== 'success' ? <GoldFrame><Text style={{ color: colors.gold500, fontFamily: fonts.bodyBold, fontSize: 18 }}>Owned</Text></GoldFrame> : null}
      {notice?.kind === 'working' ? <GoldFrame><Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>Checking the App Store for a previous purchase…</Text></GoldFrame> : null}
      {notice?.kind === 'success' ? <GoldFrame><Text style={{ color: colors.gold500, fontFamily: fonts.bodyBold, fontSize: 18 }}>Black Label restored.</Text></GoldFrame> : null}
      {notice?.kind === 'empty' ? <GoldFrame><Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>No previous purchase was found for this Apple ID.</Text></GoldFrame> : null}
      {notice?.kind === 'error' ? <GoldFrame><Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>{notice.message}</Text></GoldFrame> : null}
      {status === 'success' ? <PrimaryButton label="Continue" onPress={() => navigation.goBack()} /> : null}
      {status === 'idle' && price ? <PrimaryButton label={`Unlock Black Label — ${price}`} onPress={() => void buy()} /> : null}
      <SecondaryButton label={restoring ? 'Restoring…' : 'Restore Purchase'} disabled={restoring || purchasing} onPress={() => void restore()} />
      {status === 'error' ? <SecondaryButton label="Try Again" onPress={() => void load()} /> : null}
      <ToastMessage message={toast} />
    </ScreenContainer>
  );
}

export function HowToPlayScreen() {
  const navigation = useNavigation<Nav>();
  const enabled = useGame((state) => state.settings.tutorialTipsEnabled);
  const updateSettings = useGame((state) => state.updateSettings);
  useRouteMusic('HowToPlay');
  const pages = [
    'Choose three crew members.',
    'Pick one of two operations in each phase.',
    'Match crew skills to Talk, Stand Firm, or Outsmart.',
    'Balance Cash, Influence, Heat, and Loyalty.',
  ];
  return (
    <ScreenContainer scroll>
      <IconButton label="Back" glyph="<" onPress={() => navigation.goBack()} />
      <ScreenTitle>How to Play</ScreenTitle>
      <Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>Four beats carry every night. The city remembers the ones you skip.</Text>
      {pages.map((page, index) => <StepCard key={page} index={index + 1} text={page} />)}
      <GoldFrame>
        <SettingRow label="Replay Tutorial Tips" value={enabled} onValueChange={(value) => void updateSettings({ tutorialTipsEnabled: value })} />
      </GoldFrame>
    </ScreenContainer>
  );
}

export function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const settings = useGame((state) => state.settings);
  const updateSettings = useGame((state) => state.updateSettings);
  const eraseCampaign = useGame((state) => state.eraseCampaign);
  const [eraseOpen, setEraseOpen] = useState(false);
  useRouteMusic('Settings');
  const speeds = ['slow', 'normal', 'fast', 'instant'] as const;
  return (
    <ScreenContainer scroll>
      <IconButton label="Back" glyph="<" onPress={() => navigation.goBack()} />
      <ScreenTitle>Settings</ScreenTitle>
      <GoldFrame>
        <Eyebrow>Audio</Eyebrow>
        <VolumeSlider label="Music" value={settings.musicVolume} onChange={(value) => void updateSettings({ musicVolume: value })} />
        <VolumeSlider label="Sound effects" value={settings.sfxVolume} onChange={(value) => void updateSettings({ sfxVolume: value })} />
        <SettingRow label="Haptics" value={settings.hapticsEnabled} onValueChange={(value) => void updateSettings({ hapticsEnabled: value })} />
      </GoldFrame>
      <GoldFrame>
        <Eyebrow>Comfort</Eyebrow>
        <SettingRow label="Reduced Motion" value={settings.reducedMotion} onValueChange={(value) => void updateSettings({ reducedMotion: value })} />
        <Text style={{ color: colors.cream100, fontFamily: fonts.bodySemi, fontSize: 16 }}>Dialogue text speed</Text>
        {speeds.map((speed) => {
          const selected = settings.textSpeed === speed;
          const label = speed[0].toUpperCase() + speed.slice(1);
          return (
            <SecondaryButton
              key={speed}
              label={label}
              selected={selected}
              accessibilityLabel={selected ? `${label}, selected` : label}
              onPress={() => void updateSettings({ textSpeed: speed })}
            />
          );
        })}
      </GoldFrame>
      <GoldFrame>
        <Eyebrow>Campaign</Eyebrow>
        <SecondaryButton label="Reset Tutorial Tips" onPress={() => void updateSettings({ tutorialTipsEnabled: true })} />
        <SecondaryButton label="Restore Purchase" onPress={() => navigation.navigate('BlackLabel')} />
        <SecondaryButton label="Erase Campaign Save" onPress={() => setEraseOpen(true)} />
        <Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 15, lineHeight: 21 }}>Progress stays on this device. The game does not ask for photos, camera, or microphone.</Text>
      </GoldFrame>
      {eraseOpen ? (
        <ConfirmDialog
          title="Erase Campaign Save"
          body="It resets campaign progress but does not reset settings, archive unlocks, or purchase entitlement."
          cancelLabel="Cancel"
          confirmLabel="Erase Campaign Save"
          destructive
          onCancel={() => setEraseOpen(false)}
          onConfirm={() => {
            void eraseCampaign().then(() => {
              setEraseOpen(false);
              navigation.reset({ index: 0, routes: [{ name: 'MainMenu' }] });
            });
          }}
        />
      ) : null}
    </ScreenContainer>
  );
}

export function EndingScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'Ending'>>();
  const save = useGame((state) => state.save);
  const [card, setCard] = useState(false);
  const replay = route.params?.replay === true;
  const endingId = route.params?.endingId ?? save?.pendingEndingId ?? 'city_without_boss';
  const ending = endingById(endingId);
  const seen = useGame.getState().archive.unlockedEndingIds.includes(ending.id);
  useEffect(() => { audio.playMusic(ending.music); }, [ending.music]);
  if (!save && !replay) return null;
  if (!card) {
    return <StoryEnding sceneId={ending.sceneId} seen={seen || replay} onDone={() => setCard(true)} />;
  }
  return (
    <ScreenContainer>
      <Image source={images[ending.image]} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} resizeMode="cover" />
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <GoldFrame>
        <ArtImage name={ending.badge} style={{ width: 72, height: 72 }} />
        <Text style={{ color: colors.gold500, fontFamily: fonts.display, fontSize: 34, lineHeight: 40 }}>{ending.title}</Text>
        <Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>{ending.paragraphs[0]}</Text>
        <Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>{ending.paragraphs[1]}</Text>
        {save && !replay ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <StatPill label="Cash" value={String(save.cash)} />
            <StatPill label="Influence" value={String(save.influence)} />
            <StatPill label="Heat" value={String(save.heat)} />
            <StatPill label="Loyalty" value={String(displayedLoyalty(save))} />
          </View>
        ) : null}
        {replay ? (
          <PrimaryButton label="Back" onPress={() => navigation.goBack()} />
        ) : (
          <PrimaryButton label="View Final Report" onPress={() => navigation.replace('CampaignComplete')} />
        )}
        </GoldFrame>
      </View>
    </ScreenContainer>
  );
}

function StoryEnding({ sceneId, seen, onDone }: { sceneId: string; seen: boolean; onDone: () => void }) {
  const scene = sceneById(sceneId);
  const [index, setIndex] = useState(0);
  const line = scene.lines[index];
  return (
    <ScreenContainer background={scene.background} dim>
      {seen ? <SecondaryButton label="Skip" onPress={onDone} /> : null}
      <View style={{ flex: 1 }} />
      <DialoguePanel speaker={line.speakerName} text={line.text} showContinue onAdvance={() => {
        audio.playSfx('sfx_dialogue_advance');
        if (index + 1 >= scene.lines.length) onDone();
        else setIndex(index + 1);
      }} />
    </ScreenContainer>
  );
}

export function CampaignCompleteScreen() {
  const navigation = useNavigation<Nav>();
  const save = useGame((state) => state.save);
  const archive = useGame((state) => state.archive);
  useRouteMusic('CampaignComplete');
  if (!save) return null;
  const ending = endingById(save.pendingEndingId ?? 'city_without_boss');
  const bios = Object.values(archive.biographyEntries).reduce((sum, list) => sum + (list?.length ?? 0), 0);
  const completion = archiveCompletion({
    nightsCompleted: new Set(archive.nights.map((row) => row.night)).size,
    endingsUnlocked: archive.unlockedEndingIds.length,
    biographiesUnlocked: bios,
  });
  const used = characterById(mostUsedCharacter(save));
  return (
    <ScreenContainer background="bg_city_dawn" scroll>
      <ArtImage name={ending.badge} style={{ width: 96, height: 96 }} />
      <ScreenTitle>{ending.title}</ScreenTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <StatPill label="Cash" value={String(save.cash)} />
        <StatPill label="Influence" value={String(save.influence)} />
        <StatPill label="Heat" value={String(save.heat)} />
        <StatPill label="Loyalty" value={String(displayedLoyalty(save))} />
      </View>
      <GoldFrame>
        <Eyebrow>Most used</Eyebrow>
        <Text style={{ color: colors.cream100, fontFamily: fonts.bodyBold, fontSize: 18 }}>{used.name}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <StatPill label="Strong" value={String(save.stats.strongSuccess)} />
          <StatPill label="Success" value={String(save.stats.success)} />
          <StatPill label="Failure" value={String(save.stats.failure)} />
          <StatPill label="Archive" value={`${completion}%`} />
        </View>
      </GoldFrame>
      <PrimaryButton label="New Game Plus" onPress={() => navigation.navigate('MainMenu', { ngPlus: true })} />
      <SecondaryButton label="View Archive" onPress={() => navigation.navigate('Archive')} />
      <SecondaryButton label="Main Menu" onPress={() => navigation.reset({ index: 0, routes: [{ name: 'MainMenu' }] })} />
    </ScreenContainer>
  );
}

void scenes;
void biographyEntry;
void beginNight;
void ResourceGlyph;
