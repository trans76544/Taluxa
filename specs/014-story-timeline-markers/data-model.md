# Data Model: Playback Story Timeline Markers

**Branch**: `014-story-timeline-markers`
**Date**: 2026-07-12
**Spec**: [spec.md](./spec.md)

## Story Landmark Category

```ts
export type StoryLandmarkKind = 'chapter' | 'intro' | 'credits';
```

| Value | Emby source | Default display name |
|---|---|---|
| `chapter` | Missing `MarkerType` or `Chapter` | None; preserve a non-empty server name |
| `intro` | `IntroStart` | `片头` when the server name is empty |
| `credits` | `CreditsStart` | `片尾` when the server name is empty |

`IntroEnd` and unknown explicit marker types are not represented in this feature.

## Raw Story Landmark

Internal normalized representation before merging.

```ts
export interface StoryLandmark {
  kind: StoryLandmarkKind;
  name: string | null;
  startSeconds: number;
}
```

| Field | Required | Validation |
|---|---:|---|
| `kind` | yes | One of the three supported categories. |
| `name` | yes | Trimmed non-empty server/fallback name or `null` for an unnamed chapter. |
| `startSeconds` | yes | Finite and greater than or equal to zero; no greater than a known positive duration. |

## Story Timeline Marker

Public display model after sorting, filtering, merging, and de-duplication.

```ts
export interface StoryTimelineMarker {
  kinds: StoryLandmarkKind[];
  names: string[];
  startSeconds: number;
}
```

| Field | Required | Validation |
|---|---:|---|
| `kinds` | yes | Non-empty unique supported categories in source order. |
| `names` | yes | Unique trimmed non-empty names in source order; may be empty for an unnamed chapter-only marker. |
| `startSeconds` | yes | Earliest landmark time in the merged group; finite and non-negative. |

### Merge invariant

- Input is sorted ascending by `startSeconds`.
- The first landmark starts a group.
- A later landmark joins the group only when `later.startSeconds - group.startSeconds <= 1`.
- The displayed start is the group's earliest time.
- Names and categories are de-duplicated without changing their first-seen order.

## Player Story Marker Update

Cross-process command carrying the full current marker snapshot for one item.

```ts
export interface PlayerStoryMarkerUpdate {
  itemId: string;
  markers: StoryTimelineMarker[];
}
```

| Field | Required | Validation |
|---|---:|---|
| `itemId` | yes | Trimmed non-empty string. |
| `markers` | yes | Array whose elements satisfy `StoryTimelineMarker`; empty means clear. |

The update is transient and MUST NOT be written to persisted application state. Account and server ownership remain in the request token used by the renderer; only the item-scoped display result crosses into the player process.

## Emby Chapter Payload

```ts
interface EmbyChapterInfo {
  ChapterIndex?: number | null;
  MarkerType?: 'Chapter' | 'IntroStart' | 'IntroEnd' | 'CreditsStart' | string | null;
  Name?: string | null;
  StartPositionTicks?: number | null;
}

interface EmbyStoryLandmarkItem {
  Chapters?: EmbyChapterInfo[] | null;
  MediaSources?: Array<{
    Id?: string | null;
    Chapters?: EmbyChapterInfo[] | null;
  }> | null;
}
```

### Media-source selection

1. If `mediaSourceId` matches a media source with a non-empty `Chapters`, use it.
2. Otherwise, use non-empty item-level `Chapters`.
3. Without a selected source, when item-level chapters are absent, use source chapters only if exactly one source supplies them.
4. Otherwise, return no landmarks rather than guessing a media version.

## Renderer Delivery Request

Transient coordination state; it is not exposed over IPC.

```ts
interface StoryMarkerDeliveryRequest {
  accepted: boolean;
  accountId: string;
  itemId: string;
  markers: StoryTimelineMarker[] | null;
  requestId: number;
  serverUrl: string;
}
```

### State transitions

```text
created -> result-ready -----> delivered
   |           ^                 ^
   +-> accepted+-----------------+
   |
   +-> superseded/cancelled -> discarded
```

- Retrieval starts at `created` and does not block playback preparation.
- `accepted` means mpv has accepted the matching launch or switch command.
- Delivery occurs once both `accepted` and `result-ready` are true.
- Retrieval failure produces an empty `markers` result and follows the same delivery rule.
- Only the current request id may transition; older results are discarded.

## Player State

Lua keeps two transient values:

```lua
local active_item_id = '<initial item id>'
local story_markers = {}
```

- Initial launch begins empty.
- `taluxa-active-episode` changes `active_item_id`, clears `story_markers`, then redraws.
- `taluxa-story-markers` parses JSON and replaces the list only when its item id equals `active_item_id`.
- Invalid JSON for the active item clears markers; invalid or stale messages never preserve another item's markers.
