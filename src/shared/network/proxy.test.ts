import { describe, expect, it } from 'vitest';
import { isValidCustomProxyUrl } from './proxy';

describe('isValidCustomProxyUrl', () => {
  it('accepts full custom proxy URLs with supported protocols', () => {
    expect(isValidCustomProxyUrl('http://127.0.0.1:7890')).toBe(true);
    expect(isValidCustomProxyUrl('socks5://127.0.0.1:1080')).toBe(true);
  });

  it('rejects incomplete or empty custom proxy values', () => {
    expect(isValidCustomProxyUrl('127.0.0.1:7890')).toBe(false);
    expect(isValidCustomProxyUrl('localhost')).toBe(false);
    expect(isValidCustomProxyUrl('')).toBe(false);
  });
});
