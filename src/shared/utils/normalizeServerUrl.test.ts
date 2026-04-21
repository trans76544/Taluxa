import { describe, expect, it } from 'vitest';
import { normalizeServerUrl } from './normalizeServerUrl';

describe('normalizeServerUrl', () => {
  it('adds https when the server url has no protocol', () => {
    expect(normalizeServerUrl('demo.emby.local')).toBe('https://demo.emby.local');
  });

  it('removes trailing slashes from an http server url', () => {
    expect(normalizeServerUrl('http://demo.emby.local/')).toBe('http://demo.emby.local');
  });
});
