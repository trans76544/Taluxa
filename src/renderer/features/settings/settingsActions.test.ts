import { describe, expect, it } from 'vitest';
import { createDefaultSettings } from '@shared/models/settings';
import {
  createCacheSettingsPatch,
  createDanmakuServersSettingsPatch,
  createPlaybackSettingsPatch,
  createProxySettingsPatch,
} from './settingsActions';

describe('settingsActions', () => {
  it('creates proxy settings patches and rejects invalid custom proxy urls', () => {
    expect(
      createProxySettingsPatch({
        mode: 'custom',
        customProxyUrl: 'http://127.0.0.1:7890',
      })
    ).toEqual({
      proxy: {
        mode: 'custom',
        customProxyUrl: 'http://127.0.0.1:7890',
      },
    });

    expect(() =>
      createProxySettingsPatch({
        mode: 'custom',
        customProxyUrl: '127.0.0.1:7890',
      })
    ).toThrow('invalid proxy');
  });

  it('creates danmaku server patches and validates every server url', () => {
    expect(
      createDanmakuServersSettingsPatch([
        {
          id: 'server-1',
          name: 'Local',
          url: 'http://127.0.0.1:1207',
          enabled: true,
        },
      ])
    ).toEqual({
      danmakuServers: [
        {
          id: 'server-1',
          name: 'Local',
          url: 'http://127.0.0.1:1207',
          enabled: true,
        },
      ],
    });

    expect(() =>
      createDanmakuServersSettingsPatch([
        {
          id: 'server-1',
          name: 'Local',
          url: '127.0.0.1:1207',
          enabled: true,
        },
      ])
    ).toThrow('invalid danmaku server');
  });

  it('creates playback and cache patches without side effects', () => {
    const settings = createDefaultSettings();

    expect(createPlaybackSettingsPatch(settings.playback)).toEqual({
      playback: settings.playback,
    });
    expect(createCacheSettingsPatch(settings.cache)).toEqual({
      cache: settings.cache,
    });
  });
});
