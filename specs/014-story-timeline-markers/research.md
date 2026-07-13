# Research: Playback Story Timeline Markers

**Branch**: `014-story-timeline-markers`
**Date**: 2026-07-12
**Spec**: [spec.md](./spec.md)

## Decision 1: Use Emby's `ChapterInfo[]` as the Only Landmark Source

**Decision**: Fetch the current user's item with `Fields=Chapters,MediaSources`. Treat item-level `Chapters` and selected `MediaSource.Chapters` as the official sources for ordinary chapters and skip markers. Do not call a Jellyfin-style media-segments endpoint.

**Rationale**: Emby's current REST model exposes `ChapterInfo` with `StartPositionTicks`, `Name`, `MarkerType`, and `ChapterIndex`. The documented marker types are `Chapter`, `IntroStart`, `IntroEnd`, and `CreditsStart`. This single contract covers all approved landmark categories and works on the same authenticated user-item route already used by the client.

**Alternatives considered**:

- A separate media-segments endpoint was rejected because it is not part of the current official Emby REST reference and would add an avoidable compatibility surface.
- Reading only `PlaybackInfo.MediaSources[].Chapters` was rejected because the client's fast DirectPlay path does not always request PlaybackInfo.
- Inferring intro or credits from chapter names was rejected because names and languages are not reliable semantic identifiers.

**Official references**:

- [Emby user item endpoint](https://dev.emby.media/reference/RestAPI/UserLibraryService/getUsersByUseridItemsById.html)
- [Emby item information: Chapters](https://dev.emby.media/doc/restapi/Item-Information.html)
- [Emby PlaybackInfo and ChapterInfo](https://dev.emby.media/reference/RestAPI/MediaInfoService/getItemsByIdPlaybackinfo.html)
- [Emby MarkerType enum](https://dev.emby.media/reference/pluginapi/MediaBrowser.Model.Entities.MarkerType.html)

## Decision 2: Prefer Chapters for the Selected Media Version

**Decision**: When a selected `mediaSourceId` matches a media source containing chapters, use that chapter array. Otherwise use item-level chapters. Without a selected source, use item-level chapters first and use media-source chapters only when exactly one source supplies them.

**Rationale**: Chapter times can differ between multiple versions of the same item. Source-specific chapters are the most accurate when the source is known, while item-level chapters provide the broadest compatibility for fast DirectPlay.

**Alternatives considered**:

- Always using item-level chapters was rejected because it can attach the wrong timing to an alternate cut.
- Selecting the first media source was rejected because ordering does not prove it is the active source.
- Requiring a media source match was rejected because older servers and fast paths may only provide item-level chapters.

## Decision 3: Normalize to Point Markers and Ignore `IntroEnd`

**Decision**: Convert ticks to seconds using 10,000,000 ticks per second. Map missing marker type and `Chapter` to `chapter`, `IntroStart` to `intro`, and `CreditsStart` to `credits`. Ignore `IntroEnd` and unknown explicit marker types. Preserve non-empty server names; use `片头` and `片尾` only when intro or credits names are empty. Keep unnamed chapter points without a tooltip name.

**Rationale**: The approved scope is point markers, not shaded ranges or skip controls. `IntroEnd` is a range boundary and would create a second identically named intro point. Missing marker type must remain compatible with older chapter data.

**Alternatives considered**:

- Showing both intro start and end was rejected because it contradicts the point-marker design and produces ambiguous labels.
- Adding shaded intro and credits ranges was rejected as out of scope.
- Dropping unnamed intro or credits markers was rejected because their semantic marker type provides a reliable fallback label.

## Decision 4: Merge Landmarks in a Pure Shared Normalizer

**Decision**: Sort landmarks by start time, filter non-finite or negative times and times beyond a known duration, and merge a candidate when it is within one second of the current group's earliest time. A merged marker keeps the earliest time, unique names in source order, and unique categories.

**Rationale**: A pure deterministic function is easy to test and prevents rendering, API, and IPC layers from implementing different merge rules. Comparing with the group's earliest time avoids transitive chains that could merge points more than one second apart.

**Alternatives considered**:

- Merging by rendered pixel distance was rejected because resize would change landmark identity and tooltip contents.
- Comparing only with the previous point was rejected because a chain at 0.0, 0.9, and 1.8 seconds would incorrectly become one group.
- Performing merging in Lua was rejected because TypeScript unit tests provide better diagnostics for malformed server data.

## Decision 5: Load Asynchronously and Deliver Only After the Player Accepts the Item

**Decision**: Start landmark retrieval when a playback intent begins, but never await it in stream-source selection, preflight, initial launch, or episode switching. A renderer-side delivery coordinator combines two signals: landmark result ready and player item accepted. It sends an empty result on retrieval failure and ignores superseded request tokens.

**Rationale**: This preserves direct-play startup performance while handling results that arrive before mpv exists. Token ownership covers initial playback, rapid episode changes, account changes, and failed launches.

**Alternatives considered**:

- Awaiting landmarks before launch was rejected because it violates the non-blocking requirement.
- Passing a promise or markers through `PlayerPage` launch identity was rejected because a later marker result could change the launch key and restart mpv.
- Reusing playback-progress synchronization was rejected because landmarks are transient presentation data with no retry or persistence semantics.

## Decision 6: Add a Dynamic, Item-Scoped Player Command

**Decision**: Add `player.setStoryMarkers({ itemId, markers })` across preload and main IPC. The main process validates the payload. `MpvController` accepts updates only for the active item or the pending replacement and sends JSON as one `script-message` argument. Lua applies an update only when its item id matches `active_item_id`.

**Rationale**: Initial data may arrive before or after launch, and episode switching reuses the same Lua script. Item checks in both TypeScript and Lua provide defense against stale asynchronous results.

**Alternatives considered**:

- Supplying markers only at process launch was rejected because the script is not recreated during episode switches.
- A delimiter-based message format was rejected because chapter names may contain arbitrary punctuation or Unicode.
- Trusting only the renderer token was rejected because an IPC command or queued mpv message can outlive renderer state.

## Decision 7: Extend the Existing Custom mpv Overlay

**Decision**: Draw thin vertical markers using the existing ASS overlay geometry. Register a wider invisible marker hit area before the full seek-bar hit area. Bind mouse movement to redraw controls immediately, show merged names above the marker, and seek to the marker start on click. Recompute marker positions from duration and current bar width on every draw.

**Rationale**: The application disables mpv's native OSC and owns the full timeline in `createMpvUiScript`. Reusing that overlay preserves the approved visual design and existing resizing behavior.

**Alternatives considered**:

- Enabling the native OSC was rejected because it would replace the custom controls.
- Rendering markers in the hidden React `PlayerPage` was rejected because the visible playback window belongs to mpv.
- Polling hover state once per second was rejected because the specification requires a tooltip within 250 ms.

## Decision 8: Clear Markers Atomically During Item Switch

**Decision**: The Lua `taluxa-active-episode` handler sets the incoming `active_item_id` and clears `story_markers` before drawing incoming controls. Later `taluxa-story-markers` updates must match that id. Initial launch starts with an empty marker list.

**Rationale**: Clearing inside the player does not depend on network completion or React timing, so outgoing landmarks cannot remain selectable on an incoming item.

**Alternatives considered**:

- Clearing only after the new request resolves was rejected because failure would retain stale markers.
- Clearing only in the renderer was rejected because IPC ordering and a closing renderer can leave the mpv overlay stale.
