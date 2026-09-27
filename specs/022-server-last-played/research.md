# Research: Server Last Played Time

## Decision 1: Confirm playback with the first rendered frame

**Decision**: Record the time when a `first-frame` player startup event matches a registered playback context. Capture the observation time as soon as the renderer receives the event; deduplicate later `first-frame` events for the same registration.

**Rationale**: `mpvController.ts` emits `first-frame` for mpv `playback-restart`, with the player session and item identity. A frame confirms media has begun displaying. By contrast, its existing `PlayerPlaybackEvent` `started` phase can be emitted by `markSessionReady` after a ready property or an IPC fallback timer, before `file-loaded`. Counting that phase would mark some failed loads as played. `media-ready` indicates loading succeeded but precedes the first frame. The existing `mpvController.test.ts` exercises `media-ready` and `first-frame` milestones.

**Alternatives considered**: Use the existing `started` event (can precede media load); use the first positive progress event (misses short media and delayed progress); query Emby history (includes other clients and contradicts this spec's scope).

## Decision 2: Reuse playback context for account ownership

**Decision**: Extend the existing `PlaybackSyncCoordinator` and `PlaybackSyncProvider` with a first-frame observation path. Match by `playerSessionId` and `itemId`, then use the registered context's `accountId`. Keep a bounded pending observation for a first frame delivered before its context registration. Reset deduplication when an accepted episode switch registers its new context.

**Rationale**: `ItemDetailsRoute` already registers a `PlaybackReportContext` after player session readiness and after episode switch. The context captures the originating account, even if the active UI account changes later. `PlaybackSyncProvider` already owns one persistent playback-event subscription. A separate account lookup based on the currently selected account could assign a background window's playback to the wrong row.

**Alternatives considered**: Use `activeAccountId` at event time (wrong during account switching); add account identifiers to the player IPC event (unnecessary bridge expansion); subscribe separately in each route (loses events after navigation).

## Decision 3: Persist a separate account-scoped timestamp map

**Decision**: Add `lastPlayedAtByAccountId` to persisted and hydrated application state. Store valid ISO timestamps keyed by the existing saved-account ID. Merge each incoming timestamp monotonically, keeping the later valid value; display nothing historical for an account with no entry.

**Rationale**: `SavedAccount.lastUsedAt` is login metadata and is replaced during login/upsert. A separate map allows a playback observation to write one key without rewriting an account's token or username, and avoids a stale account snapshot overwriting a newer login. The main-process storage writer already serializes state patches. The renderer auth context already feeds the sidebar and can update it immediately after an observation.

**Alternatives considered**: Add `lastPlayedAt` to `SavedAccount` (requires every login/account merge path to preserve and compare it, with stale token risk); derive the date from per-item resume progress (misses zero-position starts and completed items, and mixes legacy account scopes); store it only in memory (lost on restart).

## Decision 4: Preserve existing list behavior and history boundaries

**Decision**: The sidebar keeps its current order, names, and account interactions. It formats a valid recorded timestamp in the current local date format with “播放过”; otherwise it shows “暂无播放记录”. Existing accounts start without a value unless this app records a future first frame.

**Rationale**: `AccountSidebar.tsx` currently renders `lastUsedAt` as a local date and the screenshot identifies that line. The feature requests a different meaning for that line, with no sorting or remote history import. Not backfilling from login or library metadata prevents a false claim that the user played media.

**Alternatives considered**: Sort by recent playback (changes navigation order); backfill from Emby item history (may include other clients, requires broad queries); show last login as fallback (mislabels it as playback).

## Existing integration points and test strategy

- `src/renderer/components/AccountSidebar.tsx` renders the current `lastUsedAt` date and label.
- `src/renderer/app/providers.tsx` hydrates the auth context from persisted state.
- `src/renderer/features/player/PlaybackSyncProvider.tsx` persists across routes and owns playback context registration.
- `src/renderer/app/router.tsx` registers initial and switched episode contexts through `registerPlaybackContext`.
- `src/shared/store/persistence.ts` defines migration, state patches, and merge behavior; `src/electron/main/ipc/storage.ts` serializes writes.
- Focused tests should cover timestamp merge, first-frame matching/deduplication/buffering, reactive sidebar updates, and preservation across re-login/restart. A controller regression test should confirm episode replacement emits `first-frame` with the replacement item.
