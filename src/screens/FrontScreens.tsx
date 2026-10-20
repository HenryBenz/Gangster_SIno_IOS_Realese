import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { audio, musicFor } from '../audio/controller';
import { ArtImage, ConfirmDialog, GoldFrame, IconButton, PrimaryButton, ScreenContainer, SecondaryButton, ToastMessage } from '../components/kit';
import type { RootStackParamList } from '../navigation/types';
import { useGame } from '../store/useGame';
import { colors, fonts } from '../theme/tokens';
import { resumeTarget } from '../game/campaign';
import { PRODUCT_ID } from '../game/constants';
import { getAvailablePurchases, initConnection } from 'react-native-iap';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TRACK_LABELS: Record<string, string> = {
  music_main_menu: 'House Band',
  music_briefing: 'Briefing',
  music_city_map: 'City Map',
  music_high_heat: 'High Heat',
  music_night_summary: 'Night Summary',
  music_ending_triumph: 'Triumph',
  music_ending_loyalty: 'Loyalty',
  music_ending_empty_city: 'Empty City',
};

function trackLabel(id: string): string {
  return TRACK_LABELS[id] ?? 'Jukebox';
}

export function useExitToMenu() {
  const navigation = useNavigation<Nav>();
  const setPause = useGame((state) => state.setPause);
  return () => {
    setPause(false);
    navigation.reset({ index: 0, routes: [{ name: 'MainMenu' }] });
  };
}

export function useRouteMusic(route: keyof RootStackParamList, heat = 0) {
  const settings = useGame((state) => state.settings);
  const owned = useGame((state) => state.purchase.blackLabelCached);
  const jukebox = useGame((state) => state.archive.jukeboxTrackId);
  const updateArchive = useGame((state) => state.updateArchive);
  const high = heat >= 70;
  useEffect(() => {
    void audio.prepare();
    audio.setVolumes(settings.musicVolume, settings.sfxVolume);
    const id = musicFor(route, high ? 70 : 0, jukebox, owned);
    audio.playMusic(id);
    void updateArchive((archive) =>
      archive.unlockedMusicIds.includes(id) ? archive : { ...archive, unlockedMusicIds: [...archive.unlockedMusicIds, id] },
    );
  }, [high, jukebox, owned, route, settings.musicVolume, settings.sfxVolume, updateArchive]);
}

export function SplashScreen() {
  const navigation = useNavigation<Nav>();
  const hydrate = useGame((state) => state.hydrate);
  const reduced = useGame((state) => state.settings.reducedMotion);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.94);
  const logo = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  useRouteMusic('Splash');

  useEffect(() => {
    opacity.value = withTiming(1, { duration: reduced ? 150 : 600 });
    scale.value = withTiming(1, { duration: reduced ? 150 : 600 });
    const started = Date.now();
    void hydrate().then(() => {
      void (async () => {
        try {
          const connected = await initConnection();
          if (!connected) {
            useGame.getState().setStoreUnavailable(true);
            return;
          }
          const purchases = await getAvailablePurchases();
          const owned = purchases.some((purchase) => purchase.productId === PRODUCT_ID);
          await useGame.getState().setOwned(owned);
        } catch {
          useGame.getState().setStoreUnavailable(true);
        }
      })();
      const wait = Math.max(0, 1400 - (Date.now() - started));
      setTimeout(() => {
        const settings = useGame.getState().settings;
        navigation.replace(settings.onboardingComplete ? 'MainMenu' : 'Onboarding');
      }, wait);
    });
  }, [hydrate, navigation, opacity, reduced, scale]);

  return (
    <ScreenContainer background="bg_splash">
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Particles reduced={reduced} />
        <Animated.View style={logo}>
          <ArtImage name="logo_gangster_sino" style={{ width: 280, height: 120 }} />
        </Animated.View>
        <Text style={{ color: colors.gold500, marginTop: 24, fontFamily: fonts.body }}> </Text>
      </View>
    </ScreenContainer>
  );
}

function Particles({ reduced }: { reduced: boolean }) {
  const dots = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  if (reduced) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 80, height: 220 }}>
      {dots.map((dot) => (
        <Particle key={dot} index={dot} />
      ))}
    </View>
  );
}

function Particle({ index }: { index: number }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(withTiming(-180, { duration: 2800 + index * 180 }), -1, false);
  }, [index, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[{ position: 'absolute', left: 24 + index * 32, bottom: 0, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gold500, opacity: 0.7 }, style]} />;
}

const SLIDES = [
  { title: 'Run the Night', text: 'The city moves after dark. Tonight, every decision is yours.' },
  { title: 'Choose Your Crew', text: 'Every specialist has strengths, loyalties, and unfinished business.' },
  { title: 'Live with the Consequences', text: 'Money opens doors. Influence keeps them open. Heat closes them forever.' },
];

export function OnboardingScreen() {
  const navigation = useNavigation<Nav>();
  const updateSettings = useGame((state) => state.updateSettings);
  const [page, setPage] = useState(0);
  useRouteMusic('Onboarding');
  const finish = () => {
    void updateSettings({ onboardingComplete: true }).then(() => navigation.replace('MainMenu'));
  };
  const slide = SLIDES[page];
  return (
    <ScreenContainer background="bg_city_dawn">
      <View style={{ alignItems: 'flex-end' }}>
        <SecondaryButton compact label="Skip" onPress={finish} />
      </View>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <GoldFrame>
          <Text style={{ color: colors.cream100, fontFamily: fonts.display, fontSize: 34, lineHeight: 40 }}>{slide.title}</Text>
          <Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>{slide.text}</Text>
        </GoldFrame>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
        {SLIDES.map((item, index) => (
          <View key={item.title} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: index === page ? colors.gold500 : colors.indigo700 }} />
        ))}
      </View>
      <PrimaryButton label={page === 2 ? 'Enter the City' : 'Next'} onPress={() => (page === 2 ? finish() : setPage(page + 1))} />
    </ScreenContainer>
  );
}

export function MainMenuScreen() {
  const navigation = useNavigation<Nav>();
  const save = useGame((state) => state.save);
  const owned = useGame((state) => state.purchase.blackLabelCached);
  const archive = useGame((state) => state.archive);
  const updateArchive = useGame((state) => state.updateArchive);
  const startNewGame = useGame((state) => state.startNewGame);
  const corruptMessage = useGame((state) => state.corruptMessage);
  const storeUnavailable = useGame((state) => state.storeUnavailable);
  const toast = useGame((state) => state.toast);
  const setToast = useGame((state) => state.setToast);
  const route = useRoute<RouteProp<RootStackParamList, 'MainMenu'>>();
  const [confirm, setConfirm] = useState(false);
  const [ngPlus, setNgPlus] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  const crewHeight = Math.max(168, Math.min(260, Math.round(windowHeight * 0.26)));
  useEffect(() => {
    if (route.params?.ngPlus) {
      setNgPlus(true);
      setConfirm(true);
    }
  }, [route.params?.ngPlus]);
  useRouteMusic('MainMenu');

  useEffect(() => {
    if (corruptMessage) setToast(corruptMessage);
  }, [corruptMessage, setToast]);

  const begin = (plus: boolean) => {
    void startNewGame(plus).then(() => navigation.navigate('Story', { sceneId: 'prologue' }));
  };

  return (
    <ScreenContainer background="bg_club_exterior">
      <View style={{ flex: 1, minHeight: 0, gap: 8 }}>
        <ArtImage name="logo_gangster_sino" style={{ width: 200, height: 88, alignSelf: 'center' }} />
        <View style={{ height: crewHeight, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
          <ArtImage name={owned ? 'group_black_label' : 'group_main_menu'} style={{ width: '100%', height: '100%' }} />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 10, paddingTop: 4 }} showsVerticalScrollIndicator={false}>
          {save ? <PrimaryButton label="Continue" onPress={() => {
            const target = resumeTarget(save);
            if (target.name === 'Story') navigation.navigate('Story', { sceneId: target.sceneId });
            else navigation.navigate(target.name);
          }} /> : null}
          <PrimaryButton label="New Game" onPress={() => (save ? (setNgPlus(false), setConfirm(true)) : begin(false))} />
          <SecondaryButton label="Crew" onPress={() => navigation.navigate('CrewRoster')} />
          <SecondaryButton label="Archive" onPress={() => navigation.navigate('Archive')} />
          <SecondaryButton label={owned ? 'Black Label · Owned' : 'Black Label'} onPress={() => navigation.navigate('BlackLabel')} />
          <SecondaryButton label="How to Play" onPress={() => navigation.navigate('HowToPlay')} />
          {owned ? (
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.gold500, fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 20 }}>Jukebox</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {archive.unlockedMusicIds.map((id) => {
                    const selected = id === archive.jukeboxTrackId;
                    return (
                      <View key={id} style={{ borderWidth: selected ? 2 : 0, borderColor: colors.gold500, borderRadius: 12 }}>
                        <SecondaryButton label={trackLabel(id)} accessibilityLabel={selected ? `Jukebox ${trackLabel(id)}, selected` : `Jukebox ${trackLabel(id)}`} onPress={() => void updateArchive((current) => ({ ...current, jukeboxTrackId: id }))} />
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>
            <IconButton label="Settings" glyph="⚙" onPress={() => navigation.navigate('Settings')} />
          </View>
          <Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 15, lineHeight: 20, textAlign: 'center', backgroundColor: 'rgba(7, 28, 73, 0.94)', borderRadius: 8, overflow: 'hidden', paddingVertical: 6 }}>{Constants.expoConfig?.version ?? '1.0.0'}</Text>
          {storeUnavailable ? <Text style={{ color: colors.cream100, fontFamily: fonts.body, fontSize: 15, lineHeight: 20, textAlign: 'center', backgroundColor: 'rgba(7, 28, 73, 0.94)', borderRadius: 8, overflow: 'hidden', padding: 8 }}>Purchase data is unavailable.</Text> : null}
        </ScrollView>
      </View>
      {confirm ? (
        <ConfirmDialog
          title="New Game"
          body={ngPlus
            ? 'Starting a new story will replace the current campaign. Unlocked biographies, endings, settings, and Black Label ownership will remain. New Game Plus keeps biographies and cosmetic unlocks but resets story resources.'
            : 'Starting a new story will replace the current campaign. Unlocked biographies, endings, settings, and Black Label ownership will remain.'}
          cancelLabel="Cancel"
          confirmLabel="Start New Story"
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            begin(ngPlus);
          }}
        />
      ) : null}
      <ToastMessage message={toast} />
    </ScreenContainer>
  );
}

export function openNewGamePlus(setConfirm: (value: boolean) => void, setNgPlus: (value: boolean) => void) {
  setNgPlus(true);
  setConfirm(true);
}
