import type {
  CacheSettings,
  DanmakuServerSettings,
  DanmakuSettings,
  PlaybackSettings,
  SubtitleSettings,
  ThemeMode,
} from '@shared/models/settings';
import { isThemeMode } from '@shared/models/settings';
import type { ProxyMode } from '@shared/models/settings';
import { isValidCustomProxyUrl } from '@shared/network/proxy';

export function createProxySettingsPatch(next: {
  mode: ProxyMode;
  customProxyUrl: string;
}) {
  if (next.mode === 'custom' && !isValidCustomProxyUrl(next.customProxyUrl)) {
    throw new Error('invalid proxy');
  }

  return {
    proxy: {
      mode: next.mode,
      customProxyUrl: next.customProxyUrl,
    },
  };
}

export function createDanmakuServersSettingsPatch(next: DanmakuServerSettings[]) {
  for (const server of next) {
    if (!isValidCustomProxyUrl(server.url)) {
      throw new Error('invalid danmaku server');
    }
  }

  return {
    danmakuServers: next,
  };
}

export function createDanmakuSettingsPatch(next: DanmakuSettings) {
  return {
    danmaku: next,
  };
}

export function createPlaybackSettingsPatch(next: PlaybackSettings) {
  return {
    playback: next,
  };
}

export function createSubtitleSettingsPatch(next: SubtitleSettings) {
  return {
    subtitles: next,
  };
}

export function createCacheSettingsPatch(next: CacheSettings) {
  return {
    cache: next,
  };
}

export function createThemeModeSettingsPatch(next: ThemeMode) {
  if (!isThemeMode(next)) {
    throw new Error('invalid theme mode');
  }

  return {
    themeMode: next,
  };
}
