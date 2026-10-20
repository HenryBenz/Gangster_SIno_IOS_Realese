import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Oswald_600SemiBold, Oswald_700Bold } from '@expo-google-fonts/oswald';
import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold } from '@expo-google-fonts/nunito';
import { RootNavigator } from './src/navigation/RootNavigator';
import { audio } from './src/audio/controller';
import { startPurchaseIntents } from './src/store/purchaseIntents';
import { useGame } from './src/store/useGame';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function App() {
  const [loaded] = useFonts({
    Oswald_600SemiBold,
    Oswald_700Bold,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });
  const music = useGame((state) => state.settings.musicVolume);
  const sfx = useGame((state) => state.settings.sfxVolume);

  useEffect(() => {
    if (loaded) void SplashScreen.hideAsync();
  }, [loaded]);

  useEffect(() => {
    void audio.prepare();
    audio.setVolumes(music, sfx);
  }, [music, sfx]);

  useEffect(() => {
    startPurchaseIntents();
  }, []);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
