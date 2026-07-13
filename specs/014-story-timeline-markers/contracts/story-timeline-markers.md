# Contracts: Playback Story Timeline Markers

**Branch**: `014-story-timeline-markers`
**Date**: 2026-07-12

## 1. Emby Landmark Retrieval

### Request

```http
GET /Users/{userId}/Items/{itemId}?Fields=Chapters%2CMediaSources
X-Emby-Token: <active account token>
```

The existing request wrapper supplies standard Emby authorization metadata and timeout behavior. The operation uses the current account's server URL, user id, and token.

### Relevant response

```json
{
  "Chapters": [
    {
      "ChapterIndex": 0,
      "MarkerType": "Chapter",
      "Name": "第一章",
      "StartPositionTicks": 0
    },
    {
      "ChapterIndex": 1,
      "MarkerType": "IntroStart",
      "Name": null,
      "StartPositionTicks": 120000000
    },
    {
      "ChapterIndex": 8,
      "MarkerType": "CreditsStart",
      "Name": "片尾",
      "StartPositionTicks": 31200000000
    }
  ],
  "MediaSources": [
    {
      "Id": "source-1",
      "Chapters": []
    }
  ]
}
```

### Result

```ts
fetchStoryTimelineMarkers(input: {
  accessToken: string;
  durationSeconds?: number | null;
  itemId: string;
  mediaSourceId?: string | null;
  serverUrl: string;
  userId: string;
}): Promise<StoryTimelineMarker[]>;
```

Behavior:

- A successful response is source-selected, normalized, filtered, sorted, and merged.
- A successful empty or structurally invalid chapter payload resolves to `[]`.
- An HTTP, timeout, authentication, or parse failure rejects with a redacted error; the delivery coordinator converts it to an empty player update without interrupting playback.
- The token is never included in a marker result, IPC payload, stored state, or rendered error.

## 2. Renderer Delivery Coordinator

```ts
export class StoryMarkerDeliveryCoordinator {
  constructor(send: (update: PlayerStoryMarkerUpdate) => Promise<void> | void);

  begin(input: {
    accountId: string;
    itemId: string;
    load: () => Promise<StoryTimelineMarker[]>;
    serverUrl: string;
  }): number;

  accept(requestId: number): void;
  cancel(requestId?: number): void;
}
```

Contract:

- `begin` supersedes the previous request and starts `load` immediately.
- `load` rejection is normalized to `[]`.
- `accept` marks that the matching item has been accepted by mpv.
- The coordinator calls `send` exactly once when the current request is both accepted and resolved.
- Calls for superseded or cancelled ids do nothing.
- A rejected `send` is contained and does not create an unhandled promise rejection.

## 3. Preload Bridge

```ts
window.embyDesktop.player.setStoryMarkers(
  update: PlayerStoryMarkerUpdate
): Promise<void>;
```

IPC channel:

```text
player:set-story-markers
```

Validation:

- Preload exposes only the typed command.
- Main treats the received value as `unknown` and calls `isPlayerStoryMarkerUpdate`.
- Invalid payloads are rejected without forwarding a command to mpv.
- Valid payloads contain no credentials or server URLs.

## 4. Main-to-mpv Controller

```ts
MpvController.setStoryMarkers(update: PlayerStoryMarkerUpdate): void;
```

Acceptance rule:

```text
accept when update.itemId == activeSession.itemId
OR update.itemId == activeSession.pendingReplacement.input.itemId
otherwise ignore
```

Accepted updates enqueue:

```json
{
  "command": [
    "script-message",
    "taluxa-story-markers",
    "episode-1",
    "[{\"startSeconds\":12,\"names\":[\"片头\"],\"kinds\":[\"intro\"]}]"
  ]
}
```

JSON is one script-message argument. No custom name delimiter is allowed.

## 5. mpv Lua Script Messages

### `taluxa-active-episode`

Existing command extended by behavior:

```text
taluxa-active-episode <itemId> <title> <displayTitle> <displaySubtitle>
```

Processing order:

1. Set `active_item_id`.
2. Set current episode/title state.
3. Clear `story_markers`.
4. Reset position and duration.
5. Redraw controls.

### `taluxa-story-markers`

```text
taluxa-story-markers <itemId> <markersJson>
```

Rules:

- Ignore when `<itemId>` differs from `active_item_id`.
- Parse with `mp.utils.parse_json`.
- A valid array replaces the full marker snapshot.
- Invalid JSON or a non-array value clears markers for the matching active item.
- Redraw immediately after an accepted message.

## 6. Timeline Rendering and Interaction

For every draw when duration is positive:

```text
markerX = barLeft + floor(barWidth * clamp(startSeconds / duration, 0, 1))
```

- Draw a uniform thin vertical line centered at `markerX` and extending above/below the track.
- Register an invisible horizontal hit target of approximately 12-16 UI pixels centered on `markerX` and restricted to the seek-bar vertical area.
- Register marker targets before the full `seek` target so marker clicks take precedence.
- On hover, render all marker names above `markerX`; clamp the label anchor within the player width.
- On click, execute `set time-pos <startSeconds>`.
- When no marker target is hit, preserve the existing proportional seek behavior.
- A `MOUSE_MOVE` binding redraws immediately so hover feedback does not depend on the one-second periodic timer.

## 7. Failure and Race Contract

| Event | Required result |
|---|---|
| Landmark request fails | Deliver `[]` only after the matching item is accepted; playback remains active. |
| Initial result arrives before mpv is ready | Hold it until `handlePlaybackLaunchReady` accepts the request. |
| Episode result arrives before switch completes | Hold it until `switchEpisode` resolves. |
| Older result arrives after a new request begins | Discard it in the renderer coordinator. |
| Stale update reaches main | Ignore unless it matches active or pending item. |
| Stale update reaches Lua | Ignore unless it matches `active_item_id`. |
| Episode switch begins | `taluxa-active-episode` clears outgoing markers before incoming markers are displayed. |
| Account changes | Cancel the active delivery request; no previous-account result is sent. |
