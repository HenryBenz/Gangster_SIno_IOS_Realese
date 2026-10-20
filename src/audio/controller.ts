import { AppState, type AppStateStatus } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { audioAssets } from '../assets/registry';

const LOOPING = new Set([
  'music_main_menu',
  'music_briefing',
  'music_city_map',
  'music_high_heat',
  'music_night_summary',
]);

class AudioController {
  private music: AudioPlayer | null = null;
  private outgoing: AudioPlayer | null = null;
  private cue: AudioPlayer | null = null;
  private currentId: string | null = null;
  private musicVolume = 0.8;
  private sfxVolume = 0.8;
  private resumeAt = 0;
  private wasPlaying = false;
  private started = false;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;

  async prepare(): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'mixWithOthers',
        shouldPlayInBackground: false,
        allowsRecording: false,
      });
    } catch {
      // Audio load failure must not block the game.
    }
    AppState.addEventListener('change', this.onAppState);
  }

  setVolumes(musicPercent: number, sfxPercent: number): void {
    this.musicVolume = Math.max(0, Math.min(100, musicPercent)) / 100;
    this.sfxVolume = Math.max(0, Math.min(100, sfxPercent)) / 100;
    if (this.music) this.music.volume = this.musicVolume;
  }

  playMusic(id: string): void {
    if (!audioAssets[id]) return;
    if (this.currentId === id && this.music) return;
    try {
      const next = createAudioPlayer(audioAssets[id]);
      next.loop = LOOPING.has(id);
      next.volume = 0;
      next.play();
      const previous = this.music;
      this.music = next;
      this.currentId = id;
      this.crossfade(previous, next);
    } catch {
      // Continue without blocking gameplay.
    }
  }

  playSfx(id: string): void {
    if (!audioAssets[id] || this.sfxVolume <= 0) return;
    try {
      const player = createAudioPlayer(audioAssets[id]);
      player.volume = this.sfxVolume;
      player.play();
      setTimeout(() => {
        try {
          player.remove();
        } catch {
          // Already released.
        }
      }, 4000);
    } catch {
      // Continue without blocking gameplay.
    }
  }

  playCue(id: string): void {
    if (!audioAssets[id]) return;
    try {
      this.cue?.pause();
      this.cue?.remove();
    } catch {
      // A failed cue must not block the next one.
    }
    this.cue = null;
    if (this.sfxVolume <= 0) return;
    try {
      const player = createAudioPlayer(audioAssets[id]);
      player.volume = this.sfxVolume;
      player.play();
      this.cue = player;
    } catch {
      this.cue = null;
    }
  }

  private crossfade(previous: AudioPlayer | null, next: AudioPlayer): void {
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    if (this.outgoing) {
      try {
        this.outgoing.remove();
      } catch {
        // Ignore a player that is already gone.
      }
    }
    this.outgoing = previous;
    const steps = 12;
    let step = 0;
    this.fadeTimer = setInterval(() => {
      step += 1;
      const t = step / steps;
      try {
        next.volume = this.musicVolume * t;
        if (previous) previous.volume = this.musicVolume * (1 - t);
      } catch {
        // Playback can fail if the asset did not load.
      }
      if (step >= steps) {
        if (this.fadeTimer) clearInterval(this.fadeTimer);
        this.fadeTimer = null;
        try {
          previous?.pause();
          previous?.remove();
        } catch {
          // Ignore.
        }
        if (this.outgoing === previous) this.outgoing = null;
      }
    }, 50);
  }

  private onAppState = (state: AppStateStatus) => {
    if (state === 'background' || state === 'inactive') {
      if (!this.music) return;
      this.wasPlaying = this.music.playing;
      this.resumeAt = this.music.currentTime ?? 0;
      try {
        this.music.pause();
      } catch {
        // Ignore.
      }
      return;
    }
    if (state === 'active' && this.music && this.wasPlaying) {
      void this.music.seekTo(this.resumeAt).then(() => this.music?.play()).catch(() => undefined);
    }
  };
}

export const audio = new AudioController();

export function musicFor(route: string, heat: number, jukebox: string | null, owned: boolean): string {
  if (route === 'MainMenu' && owned && jukebox) return jukebox;
  if (route === 'CityMap') return heat >= 70 ? 'music_high_heat' : 'music_city_map';
  if (route === 'NightSummary' || route === 'CampaignComplete') return 'music_night_summary';
  if (route === 'Briefing' || route === 'CrewSelection' || route === 'NightIntro' || route === 'Story') return 'music_briefing';
  return 'music_main_menu';
}
