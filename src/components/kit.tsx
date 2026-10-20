import { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { images } from '../assets/registry';
import type { ChanceId, SkillId } from '../game/types';
import { useGame } from '../store/useGame';
import { colors, fonts, useScreenPadding } from '../theme/tokens';

export function haptic(kind: 'light' | 'medium' | 'success' | 'warning'): void {
  const enabled = useGame.getState().settings.hapticsEnabled;
  if (!enabled) return;
  const run =
    kind === 'success'
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : kind === 'warning'
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        : Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  void run.catch(() => undefined);
}

function usePressStyle(reduced: boolean) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  return {
    animated,
    in: () => {
      if (reduced) opacity.value = withTiming(0.72, { duration: 150 });
      else scale.value = withTiming(0.97, { duration: 90 });
    },
    out: () => {
      opacity.value = withTiming(1, { duration: 90 });
      scale.value = withTiming(1, { duration: 90 });
    },
  };
}

export function ScreenContainer({
  children,
  background,
  scroll = false,
  dim = false,
}: {
  children: React.ReactNode;
  background?: string;
  scroll?: boolean;
  dim?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const padding = useScreenPadding();
  const source = background ? images[background] : undefined;
  const pad = { paddingHorizontal: padding, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12, gap: 14 };
  const body = (
    <View style={[scroll ? styles.scrollBody : styles.screenPad, pad]}>
      {children}
    </View>
  );
  return (
    <View style={styles.screen}>
      {source ? <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      {source ? <View style={[StyleSheet.absoluteFill, { backgroundColor: dim ? colors.blackOverlay : 'rgba(2, 8, 24, 0.66)' }]} /> : null}
      {scroll ? <ScrollView contentContainerStyle={styles.scrollGrow}>{body}</ScrollView> : body}
    </View>
  );
}

export function GoldFrame({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.frame, style]}>{children}</View>;
}

export function ScreenTitle({ children }: { children: string }) {
  return <Text style={styles.screenTitle}>{children}</Text>;
}

export function Eyebrow({ children }: { children: string }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function StepCard({ index, text }: { index: number; text: string }) {
  return (
    <View style={styles.stepCard}>
      <View style={styles.stepIndex}>
        <Text style={styles.stepIndexText}>{index}</Text>
      </View>
      <Text style={[styles.body, styles.flexText]}>{text}</Text>
    </View>
  );
}

export function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.caption}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const reduced = useGame((state) => state.settings.reducedMotion);
  const press = usePressStyle(reduced);
  const [focused, setFocused] = useState(false);
  return (
    <Animated.View style={[press.animated, styles.stretch]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={() => {
          haptic('medium');
          onPress();
        }}
        onPressIn={press.in}
        onPressOut={press.out}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.primary, disabled && styles.primaryDisabled, focused && styles.focused]}
      >
        <Text style={styles.primaryLabel}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
  accessibilityLabel,
  selected,
  compact,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  selected?: boolean;
  compact?: boolean;
}) {
  const reduced = useGame((state) => state.settings.reducedMotion);
  const press = usePressStyle(reduced);
  const [focused, setFocused] = useState(false);
  return (
    <Animated.View style={[press.animated, compact ? styles.compact : styles.stretch]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: !!disabled, selected: !!selected }}
        disabled={disabled}
        onPress={() => {
          haptic('light');
          onPress();
        }}
        onPressIn={press.in}
        onPressOut={press.out}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.secondary, selected && styles.secondarySelected, disabled && styles.secondaryDisabled, focused && styles.focused]}
      >
        <Text numberOfLines={1} style={[styles.secondaryLabel, selected && styles.secondaryLabelSelected, disabled && styles.secondaryLabelDisabled]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function IconButton({
  label,
  onPress,
  disabled,
  glyph,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  glyph: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.iconButton, disabled && styles.secondaryDisabled, focused && styles.focused]}
    >
      <Text style={styles.iconGlyph}>{glyph}</Text>
    </Pressable>
  );
}

export function ChoiceButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return <SecondaryButton label={label} onPress={onPress} disabled={disabled} />;
}

export function SkillBadge({ skill, label = false }: { skill: SkillId; label?: boolean }) {
  const names = { charm: 'Charm', nerve: 'Nerve', cunning: 'Cunning' };
  return (
    <View accessible accessibilityLabel={names[skill]} style={[styles.skillBadge, label && styles.skillBadgeLabeled]}>
      <View style={[styles.skillMark, skill === 'charm' && styles.skillCharm, skill === 'nerve' && styles.skillNerve, skill === 'cunning' && styles.skillCunning]} />
      {label ? <Text style={styles.caption}>{names[skill]}</Text> : null}
    </View>
  );
}

export function ResourceGlyph({ kind }: { kind: 'cash' | 'influence' | 'heat' | 'loyalty' }) {
  const label = kind === 'loyalty' ? 'Crew Loyalty' : kind[0].toUpperCase() + kind.slice(1);
  return (
    <View accessible accessibilityLabel={label} style={[styles.glyph, kind === 'heat' && { borderColor: colors.coral500 }, kind === 'loyalty' && { borderColor: colors.green500 }]}>
      <Text style={styles.glyphText}>{kind === 'cash' ? 'C' : kind === 'influence' ? 'I' : kind === 'heat' ? 'H' : 'L'}</Text>
    </View>
  );
}

export function ResourceChip({
  kind,
  value,
  onPress,
}: {
  kind: 'cash' | 'influence' | 'heat' | 'loyalty';
  value: number;
  onPress?: () => void;
}) {
  const names = { cash: 'Cash', influence: 'Influence', heat: 'Heat', loyalty: 'Crew Loyalty' };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${names[kind]} ${value}`} onPress={onPress} style={styles.chip}>
      <ResourceGlyph kind={kind} />
      <Text style={styles.chipValue}>{value}</Text>
    </Pressable>
  );
}

export function ResourceHud({
  cash,
  influence,
  heat,
  loyalty,
  onPress,
}: {
  cash: number;
  influence: number;
  heat: number;
  loyalty: number;
  onPress: (kind: 'cash' | 'influence' | 'heat' | 'loyalty') => void;
}) {
  return (
    <View style={styles.hud}>
      <ResourceChip kind="cash" value={cash} onPress={() => onPress('cash')} />
      <ResourceChip kind="influence" value={influence} onPress={() => onPress('influence')} />
      <ResourceChip kind="heat" value={heat} onPress={() => onPress('heat')} />
      <ResourceChip kind="loyalty" value={loyalty} onPress={() => onPress('loyalty')} />
    </View>
  );
}

export function EnergyPips({ energy }: { energy: number }) {
  return (
    <View accessibilityLabel={`Energy ${energy} of 2`} style={styles.pips}>
      {[0, 1].map((index) => (
        <View key={index} style={[styles.pip, index < energy ? styles.pipOn : styles.pipOff]} />
      ))}
    </View>
  );
}

export function LoyaltyBar({ value }: { value: number }) {
  return (
    <View accessibilityLabel={`Loyalty ${value}`} style={styles.loyaltyTrack}>
      <View style={[styles.loyaltyFill, { width: `${Math.max(0, Math.min(100, value))}%` }]} />
    </View>
  );
}

export function CharacterPortrait({
  name,
  size = 72,
  idle = false,
  enter = false,
  motionKey,
}: {
  name: string;
  size?: number;
  idle?: boolean;
  enter?: boolean;
  motionKey?: string;
}) {
  const reduced = useGame((state) => state.settings.reducedMotion);
  const opacity = useSharedValue(1);
  const rise = useSharedValue(0);
  const scale = useSharedValue(1);
  const breath = useSharedValue(0);
  useEffect(() => {
    if (enter && !reduced) {
      opacity.value = 0;
      rise.value = 16;
      opacity.value = withTiming(1, { duration: 280 });
      rise.value = withTiming(0, { duration: 280 });
    } else {
      opacity.value = 1;
      rise.value = 0;
    }
    if (idle && !reduced) {
      scale.value = withRepeat(withTiming(1.015, { duration: 1750 }), -1, true);
      breath.value = withRepeat(withTiming(-4, { duration: 1750 }), -1, true);
    } else {
      scale.value = 1;
      breath.value = 0;
    }
  }, [breath, enter, idle, motionKey, name, opacity, reduced, rise, scale]);
  const motion = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: rise.value + breath.value }, { scale: scale.value }],
  }));
  const source = images[name];
  return (
    <Animated.View style={[motion, { width: size, height: size * 1.25, overflow: 'hidden' }]}>
      <Image
        source={source ?? images.placeholder_character_silhouette}
        style={{ width: size, height: size * 1.25 }}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

export function ArtImage({ name, style }: { name: string; style?: StyleProp<ImageStyle> }) {
  const source = images[name] ?? images.placeholder_character_silhouette;
  return <Image source={source} style={style} resizeMode="contain" />;
}

export function CharacterCard({
  name,
  selected,
  dimmed,
  onPress,
  onInfo,
  children,
}: {
  name: string;
  selected: boolean;
  dimmed?: boolean;
  onPress: () => void;
  onInfo: () => void;
  children: React.ReactNode;
}) {
  const reduced = useGame((state) => state.settings.reducedMotion);
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withTiming(1, { duration: reduced ? 150 : 160 });
  }, [reduced, scale, selected]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[styles.cardWrap, animated, dimmed && styles.dimmed]}>
      <Pressable accessibilityRole="button" accessibilityLabel={name} accessibilityState={{ selected }} onPress={onPress} onLongPress={onInfo} style={[styles.card, styles.cardFill, selected && styles.cardSelected]}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

const threatColor = { controlled: colors.threatControlled, uncertain: colors.gold500, dangerous: colors.coral500 };

export function OperationCard({
  title,
  location,
  setup,
  skill,
  rewards,
  threat,
  icon,
  onPress,
}: {
  title: string;
  location: string;
  setup: string;
  skill: SkillId;
  rewards: Array<'cash' | 'influence' | 'heat' | 'loyalty'>;
  threat: 'controlled' | 'uncertain' | 'dangerous';
  icon: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${location}`} onPress={onPress} style={[styles.opCard, { borderColor: threatColor[threat] }]}>
      <ArtImage name={icon} style={styles.opIcon} />
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.caption}>{location}</Text>
      <Text numberOfLines={2} style={styles.body}>{setup}</Text>
      <View style={styles.row}>
        <SkillBadge skill={skill} />
        {rewards.map((reward) => (
          <ResourceGlyph key={reward} kind={reward} />
        ))}
      </View>
    </Pressable>
  );
}

export function DialoguePanel({
  speaker,
  text,
  objective,
  showContinue,
  onAdvance,
  children,
}: {
  speaker: string;
  text: string;
  objective?: string;
  showContinue: boolean;
  onAdvance: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={showContinue ? 'Continue' : speaker} disabled={!showContinue} onPress={onAdvance} style={styles.dialogue}>
      {objective ? <Text style={styles.caption}>{objective}</Text> : null}
      <Text style={styles.cardTitle}>{speaker}</Text>
      <ScrollView style={styles.dialogueScroll}>
        <Text style={styles.body}>{text}</Text>
      </ScrollView>
      {children}
      {showContinue ? <Text style={styles.continueArrow}>Continue</Text> : null}
    </Pressable>
  );
}

export function ResultStamp({ label, reduced }: { label: string; reduced: boolean }) {
  const scale = useSharedValue(reduced ? 1 : 1.4);
  const rotate = useSharedValue(reduced ? 0 : -7);
  const opacity = useSharedValue(reduced ? 0 : 1);
  useEffect(() => {
    if (reduced) {
      opacity.value = withTiming(1, { duration: 150 });
      return;
    }
    scale.value = withTiming(0.96, { duration: 220 }, () => {
      scale.value = withTiming(1, { duration: 160 });
    });
    rotate.value = withTiming(0, { duration: 380 });
  }, [opacity, reduced, rotate, scale]);
  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));
  return (
    <Animated.Text accessibilityRole="header" style={[styles.stamp, animated]}>
      {label}
    </Animated.Text>
  );
}

export function ModalSheet({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <View style={styles.sheetRoot}>
      <Pressable accessibilityLabel="Back" style={styles.sheetBackdrop} onPress={onClose} />
      <View style={styles.sheet}>{children}</View>
    </View>
  );
}

export function ConfirmDialog({
  title,
  body,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  destructive,
}: {
  title: string;
  body: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  destructive?: boolean;
}) {
  return (
    <View style={styles.dialogRoot}>
      <View style={styles.dialog}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        <SecondaryButton label={cancelLabel} onPress={onCancel} />
        <View style={styles.gap} />
        <PrimaryButton label={confirmLabel} onPress={onConfirm} accessibilityLabel={destructive ? confirmLabel : confirmLabel} />
      </View>
    </View>
  );
}

export function VolumeSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View accessibilityLabel={`${label} ${value} percent`}>
      <Text style={styles.body}>{label}</Text>
      <View style={styles.sliderRow}>
        <SecondaryButton label="−" onPress={() => onChange(Math.max(0, value - 5))} accessibilityLabel={`Lower ${label}`} />
        <Text style={styles.sliderValue}>{value}%</Text>
        <SecondaryButton label="+" onPress={() => onChange(Math.min(100, value + 5))} accessibilityLabel={`Raise ${label}`} />
      </View>
    </View>
  );
}

export function SettingRow({
  label,
  value,
  onValueChange,
  accessibilityLabel,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel?: string;
}) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.body}>{label}</Text>
      <Switch
        accessibilityLabel={accessibilityLabel ?? label}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: colors.gold700, false: colors.indigo700 }}
        thumbColor={colors.cream100}
      />
    </View>
  );
}

export function LoadingOverlay({ label }: { label: string }) {
  return (
    <View style={styles.dialogRoot}>
      <Text accessibilityLabel={label} style={styles.body}>{label}</Text>
    </View>
  );
}

export function ToastMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View pointerEvents="none" style={styles.toast}>
      <Text style={styles.body}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stretch: { alignSelf: 'stretch' },
  screen: { flex: 1, backgroundColor: colors.navy900 },
  screenPad: { flex: 1 },
  scrollBody: {},
  scrollGrow: { flexGrow: 1 },
  frame: { borderWidth: 1, borderColor: colors.gold700, borderRadius: 16, padding: 16, gap: 10, backgroundColor: 'rgba(7, 28, 73, 0.92)' },
  screenTitle: { color: colors.cream100, fontFamily: fonts.display, fontSize: 34, lineHeight: 40, textShadowColor: 'rgba(0, 0, 0, 0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  eyebrow: { alignSelf: 'flex-start', color: colors.gold500, fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 20, letterSpacing: 0.6, textTransform: 'uppercase', backgroundColor: 'rgba(6, 22, 56, 0.94)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
  flexText: { flex: 1 },
  stepCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.gold700, borderRadius: 16, padding: 14, backgroundColor: 'rgba(7, 28, 73, 0.92)' },
  stepIndex: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.gold500, alignItems: 'center', justifyContent: 'center' },
  stepIndexText: { color: colors.navy900, fontFamily: fonts.bodyBold, fontSize: 16 },
  statPill: { minWidth: 88, flexGrow: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.gold700, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: 'rgba(7, 28, 73, 0.92)' },
  statValue: { color: colors.cream100, fontFamily: fonts.bodyBold, fontSize: 18, marginTop: 2 },
  primary: { minHeight: 56, borderRadius: 12, backgroundColor: colors.gold500, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryLabel: { color: colors.navy900, fontFamily: fonts.bodySemi, fontSize: 17 },
  compact: { alignSelf: 'flex-end' },
  secondary: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.gold700, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, backgroundColor: colors.navy800 },
  secondarySelected: { borderWidth: 2, borderColor: colors.gold500, backgroundColor: colors.gold500 },
  secondaryLabel: { color: colors.cream100, fontFamily: fonts.bodySemi, fontSize: 17 },
  secondaryLabelSelected: { color: colors.navy900 },
  primaryDisabled: { backgroundColor: '#A88416' },
  secondaryDisabled: { backgroundColor: '#10244A', borderColor: '#C4A15A' },
  secondaryLabelDisabled: { color: colors.cream100 },
  focused: { borderWidth: 2, borderColor: colors.gold500 },
  iconButton: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navy800 },
  iconGlyph: { color: colors.gold500, fontSize: 20, fontFamily: fonts.bodyBold },
  skillBadge: { minWidth: 28, minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  skillBadgeLabeled: { flexDirection: 'row', gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: colors.gold700 },
  skillMark: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.gold500 },
  skillCharm: { borderRadius: 9 },
  skillNerve: { borderRadius: 2, height: 20 },
  skillCunning: { transform: [{ rotate: '45deg' }], width: 14, height: 14 },
  glyph: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: colors.gold500, alignItems: 'center', justifyContent: 'center' },
  glyphText: { color: colors.gold500, fontSize: 11, fontFamily: fonts.bodyBold },
  chip: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, borderRadius: 12, backgroundColor: 'rgba(7, 28, 73, 0.94)' },
  chipValue: { color: colors.cream100, fontFamily: fonts.bodyBold, fontSize: 16, fontVariant: ['tabular-nums'] },
  hud: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  pips: { flexDirection: 'row', gap: 4 },
  pip: { width: 10, height: 10, borderRadius: 5 },
  pipOn: { backgroundColor: colors.gold500 },
  pipOff: { backgroundColor: colors.indigo700 },
  loyaltyTrack: { height: 8, borderRadius: 4, backgroundColor: colors.indigo700, overflow: 'hidden' },
  loyaltyFill: { height: 8, backgroundColor: colors.green500 },
  cardWrap: { flex: 1, alignSelf: 'stretch' },
  dimmed: { opacity: 0.82 },
  card: { borderRadius: 20, padding: 12, gap: 8, backgroundColor: 'rgba(7, 28, 73, 0.92)', borderWidth: 1, borderColor: colors.indigo700, minHeight: 48 },
  cardFill: { flex: 1 },
  cardSelected: { borderColor: colors.gold500 },
  opCard: { borderRadius: 20, borderWidth: 2, padding: 12, backgroundColor: 'rgba(6, 22, 56, 0.92)', gap: 4 },
  opIcon: { width: 42, height: 42 },
  cardTitle: { color: colors.cream100, fontFamily: fonts.bodyBold, fontSize: 20, lineHeight: 26 },
  body: { color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 },
  caption: { color: colors.gold500, fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dialogue: { backgroundColor: 'rgba(6, 22, 56, 0.94)', borderRadius: 16, borderWidth: 1, borderColor: colors.gold700, padding: 16, maxHeight: 300, gap: 8 },
  dialogueScroll: { maxHeight: 140 },
  continueArrow: { color: colors.gold500, fontFamily: fonts.bodySemi, fontSize: 17, textAlign: 'right', marginTop: 8 },
  stamp: { color: colors.gold500, fontFamily: fonts.display, fontSize: 36, textAlign: 'center' },
  sheetRoot: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
  sheetBackdrop: { flex: 1, backgroundColor: colors.blackOverlay },
  sheet: { height: '82%', backgroundColor: colors.navy800, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  dialogRoot: { ...StyleSheet.absoluteFill, backgroundColor: colors.blackOverlay, alignItems: 'center', justifyContent: 'center', padding: 20 },
  dialog: { width: '100%', borderRadius: 16, backgroundColor: colors.navy800, padding: 16, gap: 12 },
  gap: { height: 8 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sliderValue: { color: colors.cream100, fontFamily: fonts.bodyBold, fontSize: 16, fontVariant: ['tabular-nums'] },
  settingRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  toast: { position: 'absolute', left: 20, right: 20, bottom: 32, backgroundColor: colors.navy800, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.gold700 },
});
