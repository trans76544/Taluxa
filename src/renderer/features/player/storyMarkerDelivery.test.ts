import { describe, expect, it, vi } from 'vitest';
import type { StoryTimelineMarker } from '@shared/models/storyLandmark';
import {
  StoryMarkerDeliveryCoordinator,
  type BeginStoryMarkerDeliveryInput,
} from './storyMarkerDelivery';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

const marker: StoryTimelineMarker = {
  startSeconds: 1,
  names: ['A'],
  kinds: ['chapter'],
};

function input(
  itemId: string,
  load: () => Promise<StoryTimelineMarker[]>
): BeginStoryMarkerDeliveryInput {
  return { accountId: 'a', serverUrl: 'https://emby.test', itemId, load };
}

describe('StoryMarkerDeliveryCoordinator', () => {
  it('holds an early result until accepted and sends exactly once', async () => {
    const send = vi.fn();
    const load = deferred<StoryTimelineMarker[]>();
    const coordinator = new StoryMarkerDeliveryCoordinator(send);
    const requestId = coordinator.begin(input('one', () => load.promise));

    load.resolve([marker]);
    await Promise.resolve();
    expect(send).not.toHaveBeenCalled();

    coordinator.accept(requestId);
    coordinator.accept(requestId);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledWith({ itemId: 'one', markers: [marker] });
  });

  it('delivers when acceptance precedes the result', async () => {
    const send = vi.fn();
    const load = deferred<StoryTimelineMarker[]>();
    const coordinator = new StoryMarkerDeliveryCoordinator(send);
    const requestId = coordinator.begin(input('one', () => load.promise));

    coordinator.accept(requestId);
    load.resolve([marker]);

    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
  });

  it('normalizes retrieval failures to an empty clear', async () => {
    const send = vi.fn();
    const coordinator = new StoryMarkerDeliveryCoordinator(send);
    const requestId = coordinator.begin(input('one', async () => {
      throw new Error('no');
    }));

    coordinator.accept(requestId);

    await vi.waitFor(() =>
      expect(send).toHaveBeenCalledWith({ itemId: 'one', markers: [] })
    );
  });

  it('discards superseded and cancelled requests', async () => {
    const send = vi.fn();
    const old = deferred<StoryTimelineMarker[]>();
    const coordinator = new StoryMarkerDeliveryCoordinator(send);
    const oldRequestId = coordinator.begin(input('old', () => old.promise));
    coordinator.accept(oldRequestId);

    const nextRequestId = coordinator.begin(input('next', async () => []));
    coordinator.accept(nextRequestId);
    coordinator.cancel(nextRequestId);
    old.resolve([marker]);
    await Promise.resolve();

    expect(send).not.toHaveBeenCalled();
  });

  it('contains synchronous and asynchronous send failures', async () => {
    const synchronous = new StoryMarkerDeliveryCoordinator(() => {
      throw new Error('sync');
    });
    const synchronousId = synchronous.begin(input('one', async () => []));
    expect(() => synchronous.accept(synchronousId)).not.toThrow();

    const asynchronous = new StoryMarkerDeliveryCoordinator(async () => {
      throw new Error('async');
    });
    const asynchronousId = asynchronous.begin(input('two', async () => []));
    asynchronous.accept(asynchronousId);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('rejects accept after cancellation and ignores a late empty result', async () => {
    const send = vi.fn();
    const load = deferred<StoryTimelineMarker[]>();
    const coordinator = new StoryMarkerDeliveryCoordinator(send);
    const requestId = coordinator.begin(input('cancelled', () => load.promise));

    coordinator.cancel(requestId);
    coordinator.accept(requestId);
    load.resolve([]);
    await Promise.resolve();

    expect(send).not.toHaveBeenCalled();
  });

  it('isolates rapid item and account replacement from late failure results', async () => {
    const send = vi.fn();
    const old = deferred<StoryTimelineMarker[]>();
    const next = deferred<StoryTimelineMarker[]>();
    const coordinator = new StoryMarkerDeliveryCoordinator(send);
    const oldId = coordinator.begin(input('episode-a', () => old.promise));
    coordinator.accept(oldId);
    const nextId = coordinator.begin({
      ...input('episode-b', () => next.promise),
      accountId: 'account-b',
      serverUrl: 'https://other.emby.test',
    });
    coordinator.accept(nextId);

    old.reject(new Error('late old-account failure'));
    next.resolve([marker]);

    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(send).toHaveBeenCalledWith({ itemId: 'episode-b', markers: [marker] });
  });
});
