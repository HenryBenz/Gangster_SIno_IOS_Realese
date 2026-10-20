export type RootStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  MainMenu: { ngPlus?: boolean } | undefined;
  Story: { sceneId: string; readOnly?: boolean };
  NightIntro: undefined;
  Briefing: undefined;
  CrewSelection: undefined;
  CityMap: undefined;
  NightSummary: { archiveNight?: number } | undefined;
  CrewRoster: undefined;
  CharacterDetail: { characterId: string };
  Archive: undefined;
  BlackLabel: undefined;
  HowToPlay: undefined;
  Settings: undefined;
  Ending: { endingId?: string; replay?: boolean } | undefined;
  CampaignComplete: undefined;
};
