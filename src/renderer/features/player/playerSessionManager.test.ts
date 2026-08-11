import { describe, expect, it, vi } from 'vitest';
import { PlayerSessionManager, type PlayerSessionEvent } from './playerSessionManager';

function event(playerSessionId: number, itemId = `item-${playerSessionId}`): PlayerSessionEvent {
  return {
    playerSessionId,
    itemId,
    playbackId: `${playerSessionId}:playback`,
    sequence: 1,
    phase: 'started',
    positionSeconds: 0,
    durationSeconds: 100,
  };
}

describe('PlayerSessionManager', () => {
  it('buffers an event until the matching session is registered', () => {
    const manager = new PlayerSessionManager();
    const onEvent = vi.fn();

    manager.dispatch(event(2));
    manager.register({ playerSessionId: 1, itemId: 'item-1' });
    expect(onEvent).not.toHaveBeenCalled();

    manager.register({ playerSessionId: 2, itemId: 'item-2', onEvent });

    expect(onEvent).toHaveBeenCalledWith(event(2));
  });

  it('retains independent records and routes later events to only the target', () => {
    const manager = new PlayerSessionManager();
    const first = vi.fn();
    const second = vi.fn();

    manager.register({ playerSessionId: 1, itemId: 'same-item', onEvent: first });
    manager.register({ playerSessionId: 2, itemId: 'same-item', onEvent: second });
    manager.dispatch(event(2, 'same-item'));

    expect(manager.getAll()).toHaveLength(2);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(event(2, 'same-item'));
  });

  it('removes only the requested terminal session', () => {
    const manager = new PlayerSessionManager();
    manager.register({ playerSessionId: 1, itemId: 'item-1' });
    manager.register({ playerSessionId: 2, itemId: 'item-2' });

    expect(manager.remove(1)).toBe(true);
    expect(manager.get(1)).toBeUndefined();
    expect(manager.get(2)).toEqual({ playerSessionId: 2, itemId: 'item-2' });
  });
});
