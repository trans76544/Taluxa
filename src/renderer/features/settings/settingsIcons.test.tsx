import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  SettingsIcon,
  settingsIconRegistry,
  settingsRowIconIds,
  subtitleIconIds,
  type SettingsIconId,
} from './settingsIcons';

const legacyIconContent = new Set(['CC', 'T', 'O', 'S', 'B', 'API', 'DM', '2', '%', '±']);

describe('settings icon system', () => {
  it('defines one approved icon assignment for every settings row', () => {
    const ids = Object.values(settingsRowIconIds);

    expect(ids).toHaveLength(36);
    expect(new Set(ids).size).toBe(ids.length);

    for (const id of ids) {
      const icon = settingsIconRegistry[id];

      expect(icon).toBeDefined();
      expect(icon.id).toBe(id);
      expect(icon.meaning).not.toHaveLength(0);
      expect(icon.family).toMatch(/^(general|playback|subtitle|media|danmaku|network|account)$/u);
      expect(legacyIconContent.has(icon.meaning)).toBe(false);
    }
  });

  it('renders decorative svg icons with stable row ids', () => {
    render(<SettingsIcon id={'currentAccount' as SettingsIconId} />);

    const wrapper = screen.getByTestId('settings-icon-currentAccount');
    const svg = wrapper.querySelector('svg');

    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
    expect(wrapper).toHaveAttribute('data-settings-icon-family', 'general');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect(svg).toHaveAttribute('focusable', 'false');
  });

  it('keeps subtitle icons related but distinct', () => {
    const subtitleIds = subtitleIconIds.map((id) => settingsIconRegistry[id]);

    expect(subtitleIds).toHaveLength(9);
    expect(new Set(subtitleIds.map((icon) => icon.id)).size).toBe(9);
    expect(new Set(subtitleIds.map((icon) => icon.family))).toEqual(new Set(['subtitle']));
    expect(new Set(subtitleIds.map((icon) => icon.meaning)).size).toBe(9);
  });

  it('keeps media, danmaku, proxy, and logout icons meaningful without placeholders', () => {
    const importantIds: SettingsIconId[] = [
      'dataCache',
      'imageCache',
      'danmakuEnabled',
      'danmakuApi',
      'proxy',
      'logout',
    ];

    for (const id of importantIds) {
      const icon = settingsIconRegistry[id];

      expect(icon.meaning).not.toMatch(/placeholder|generic|symbol|letter/i);
      expect(icon.family).not.toBe('general');
    }

    expect(settingsIconRegistry.logout.accent).toBe('danger');
    expect(settingsIconRegistry.themeMode.family).toBe('general');
    expect(settingsIconRegistry.themeMode.meaning).toBe('client color tone');
  });
});
