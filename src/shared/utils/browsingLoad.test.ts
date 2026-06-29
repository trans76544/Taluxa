import { describe, expect, it } from 'vitest';
import {
  buildOptionalFailureMessage,
  classifyBrowsingFailure,
  createBrowsingLoadResult,
  createBrowsingSectionFailure,
  createRequestGenerationGuard,
} from './browsingLoad';

describe('createRequestGenerationGuard', () => {
  it('marks older generations as stale after a newer request starts', () => {
    const guard = createRequestGenerationGuard();

    const first = guard.next();
    const second = guard.next();

    expect(first).toBe(1);
    expect(second).toBe(2);
    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
    expect(guard.current).toBe(2);
  });
});

describe('optional browsing failures', () => {
  it('builds concise section failure messages without leaking error details', () => {
    const failures = [
      createBrowsingSectionFailure({
        section: 'similar',
        label: 'Similar items',
        error: new Error('Failed with token secret-token-value'),
      }),
      createBrowsingSectionFailure({
        section: 'episodes',
        label: 'Episodes',
        reason: 'timeout',
      }),
      createBrowsingSectionFailure({
        section: 'episodes-retry',
        label: 'Episodes',
        reason: 'network',
      }),
    ];

    const message = buildOptionalFailureMessage(failures);

    expect(message).toBe('Some secondary content could not be loaded: Similar items, Episodes.');
    expect(message).not.toContain('secret-token-value');
  });

  it('keeps primary data while attaching optional failures to a load result', () => {
    const result = createBrowsingLoadResult({
      surface: 'details',
      generation: 3,
      primaryStatus: 'loaded',
      primaryData: { id: 'item-1' },
      optionalFailures: [
        createBrowsingSectionFailure({
          section: 'seasons',
          label: 'Seasons',
          reason: 'unavailable',
        }),
      ],
    });

    expect(result.primaryData).toEqual({ id: 'item-1' });
    expect(result.optionalFailures).toHaveLength(1);
    expect(result.message).toBe('Some secondary content could not be loaded: Seasons.');
  });

  it('classifies common network, timeout, and authorization failures', () => {
    expect(classifyBrowsingFailure(new Error('Request timeout'))).toBe('timeout');
    expect(classifyBrowsingFailure(new Error('Failed to fetch'))).toBe('network');
    expect(classifyBrowsingFailure(new Error('Failed with 401'))).toBe('unauthorized');
    expect(classifyBrowsingFailure(new Error('Unexpected'))).toBe('unknown');
  });
});
