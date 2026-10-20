import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createCampaign, isValidSave } from '../game/campaign';
import type { AppSettings, ArchiveState, GameSave, NightArchiveRecord, PurchaseState } from '../game/types';

const KEYS = {
  settings: 'gangster-sino/settings',
  campaign: 'gangster-sino/campaign',
  archive: 'gangster-sino/archive',
  purchase: 'gangster-sino/purchase',
};

export const defaultSettings: AppSettings = {
  onboardingComplete: false,
  musicVolume: 80,
  sfxVolume: 80,
  hapticsEnabled: true,
  reducedMotion: false,
  textSpeed: 'normal',
  tutorialTipsEnabled: true,
};

export const emptyArchive = (): ArchiveState => ({
  schemaVersion: 1,
  nights: [],
  decisions: {},
  unlockedEndingIds: [],
  viewedSceneIds: [],
  biographyEntries: {},
  unlockedMusicIds: ['music_main_menu'],
  jukeboxTrackId: null,
});

const defaultPurchase: PurchaseState = { blackLabelCached: false };

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

function mergeArchive(archive: ArchiveState, save: GameSave | null): ArchiveState {
  if (!save) return archive;
  const biographyEntries = { ...archive.biographyEntries };
  for (const [id, state] of Object.entries(save.characterState)) {
    const current = new Set(biographyEntries[id as keyof typeof biographyEntries] ?? []);
    state.biographyEntries.forEach((entry) => current.add(entry));
    biographyEntries[id as keyof typeof biographyEntries] = [...current];
  }
  const unlockedEndingIds = [...new Set([...archive.unlockedEndingIds, ...save.unlockedEndingIds])];
  const viewedSceneIds = [...new Set([...archive.viewedSceneIds, ...save.viewedSceneIds])];
  return { ...archive, biographyEntries, unlockedEndingIds, viewedSceneIds };
}

type GameStore = {
  ready: boolean;
  settings: AppSettings;
  save: GameSave | null;
  archive: ArchiveState;
  purchase: PurchaseState;
  corruptMessage: string | null;
  toast: string | null;
  pauseOpen: boolean;
  purchasing: boolean;
  storeUnavailable: boolean;
  hydrate: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  setToast: (toast: string | null) => void;
  setPause: (pauseOpen: boolean) => void;
  setPurchasing: (purchasing: boolean) => void;
  setStoreUnavailable: (storeUnavailable: boolean) => void;
  setOwned: (owned: boolean) => Promise<void>;
  startNewGame: (newGamePlus: boolean) => Promise<void>;
  eraseCampaign: () => Promise<void>;
  mutate: (recipe: (save: GameSave) => GameSave) => Promise<GameSave | null>;
  updateArchive: (recipe: (archive: ArchiveState) => ArchiveState) => Promise<void>;
  recordNight: (record: NightArchiveRecord) => Promise<void>;
};

function now(): string {
  return new Date().toISOString();
}

export const useGame = create<GameStore>((set, get) => {
  let writeQueue = Promise.resolve();
  return {
  ready: false,
  settings: defaultSettings,
  save: null,
  archive: emptyArchive(),
  purchase: defaultPurchase,
  corruptMessage: null,
  toast: null,
  pauseOpen: false,
  purchasing: false,
  storeUnavailable: false,
  hydrate: async () => {
    let settings = defaultSettings;
    let archive = emptyArchive();
    let purchase = defaultPurchase;
    let save: GameSave | null = null;
    let corruptMessage: string | null = null;
    try {
      settings = { ...defaultSettings, ...(await readJson<AppSettings>(KEYS.settings)) };
    } catch {
      settings = defaultSettings;
    }
    try {
      archive = { ...emptyArchive(), ...(await readJson<ArchiveState>(KEYS.archive)) };
    } catch {
      archive = emptyArchive();
    }
    try {
      purchase = { ...defaultPurchase, ...(await readJson<PurchaseState>(KEYS.purchase)) };
    } catch {
      purchase = defaultPurchase;
    }
    try {
      const raw = await AsyncStorage.getItem(KEYS.campaign);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (isValidSave(parsed)) save = parsed;
        else {
          await AsyncStorage.removeItem(KEYS.campaign);
          corruptMessage = 'The previous campaign could not be restored. A new story can be started.';
        }
      }
    } catch {
      await AsyncStorage.removeItem(KEYS.campaign);
      corruptMessage = 'The previous campaign could not be restored. A new story can be started.';
    }
    set({ ready: true, settings, archive, purchase, save, corruptMessage });
  },
  updateSettings: async (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    await writeJson(KEYS.settings, settings);
  },
  setToast: (toast) => set({ toast }),
  setPause: (pauseOpen) => set({ pauseOpen }),
  setPurchasing: (purchasing) => set({ purchasing }),
  setStoreUnavailable: (storeUnavailable) => set({ storeUnavailable }),
  setOwned: async (owned) => {
    const purchase: PurchaseState = {
      blackLabelCached: owned,
      lastOwnershipCheckAt: now(),
    };
    set({ purchase });
    await writeJson(KEYS.purchase, purchase);
  },
  startNewGame: async (newGamePlus) => {
    const archive = get().archive;
    const save = createCampaign({
      id: `campaign-${Date.now()}`,
      now: now(),
      newGamePlus,
      biographies: archive.biographyEntries,
    });
    set({ save, pauseOpen: false });
    await writeJson(KEYS.campaign, save);
  },
  eraseCampaign: async () => {
    set({ save: null, pauseOpen: false });
    await AsyncStorage.removeItem(KEYS.campaign);
  },
  mutate: (recipe) => {
    const task = writeQueue.then(async () => {
      const current = get().save;
      if (!current) return null;
      let save = recipe(current);
      save = { ...save, lastSavedAt: now() };
      const archive = mergeArchive(get().archive, save);
      set({ save, archive });
      await writeJson(KEYS.campaign, save);
      await writeJson(KEYS.archive, archive);
      return save;
    });
    writeQueue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  },
  updateArchive: async (recipe) => {
    const archive = recipe(get().archive);
    set({ archive });
    await writeJson(KEYS.archive, archive);
  },
  recordNight: async (record) => {
    await get().updateArchive((archive) => ({
      ...archive,
      nights: [...archive.nights.filter((row) => row.night !== record.night), record],
    }));
  },
};
});
