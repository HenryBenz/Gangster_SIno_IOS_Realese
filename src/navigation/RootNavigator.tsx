import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/tokens';
import type { RootStackParamList } from './types';
import { MainMenuScreen, OnboardingScreen, SplashScreen } from '../screens/FrontScreens';
import {
  ArchiveScreen,
  BlackLabelScreen,
  BriefingScreen,
  CampaignCompleteScreen,
  CharacterDetailScreen,
  CityMapScreen,
  CrewRosterScreen,
  CrewSelectionScreen,
  EndingScreen,
  HowToPlayScreen,
  NightIntroScreen,
  NightSummaryScreen,
  SettingsScreen,
  StoryScreen,
} from '../screens/GameScreens';

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.navy900,
    card: colors.navy800,
    primary: colors.gold500,
    text: colors.cream100,
    border: colors.gold700,
  },
};

export function RootNavigator() {
  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator initialRouteName="Splash" screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="MainMenu" component={MainMenuScreen} />
        <Stack.Screen name="Story" component={StoryScreen} />
        <Stack.Screen name="NightIntro" component={NightIntroScreen} />
        <Stack.Screen name="Briefing" component={BriefingScreen} />
        <Stack.Screen name="CrewSelection" component={CrewSelectionScreen} />
        <Stack.Screen name="CityMap" component={CityMapScreen} />
        <Stack.Screen name="NightSummary" component={NightSummaryScreen} />
        <Stack.Screen name="CrewRoster" component={CrewRosterScreen} />
        <Stack.Screen name="CharacterDetail" component={CharacterDetailScreen} />
        <Stack.Screen name="Archive" component={ArchiveScreen} />
        <Stack.Screen name="BlackLabel" component={BlackLabelScreen} />
        <Stack.Screen name="HowToPlay" component={HowToPlayScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Ending" component={EndingScreen} />
        <Stack.Screen name="CampaignComplete" component={CampaignCompleteScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
