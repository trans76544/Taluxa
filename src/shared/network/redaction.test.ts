import { describe, expect, it } from 'vitest';
import { redactSensitiveValue } from './redaction';

describe('redactSensitiveValue', () => {
  it('redacts token-bearing query parameters from urls', () => {
    const value =
      'http://server.local/Videos/item/stream?api_key=secret-token&X-Emby-Token=other-secret&MediaSourceId=abc';

    expect(redactSensitiveValue(value)).toBe(
      'http://server.local/Videos/item/stream?api_key=[redacted]&X-Emby-Token=[redacted]&MediaSourceId=abc'
    );
  });

  it('redacts known token values in free-form text', () => {
    expect(redactSensitiveValue('launch failed for api_key=secret-token')).toBe(
      'launch failed for api_key=[redacted]'
    );
    expect(redactSensitiveValue('X-Emby-Token: secret-token')).toBe(
      'X-Emby-Token: [redacted]'
    );
  });
});
