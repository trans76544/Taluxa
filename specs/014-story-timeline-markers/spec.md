# Feature Specification: Playback Story Timeline Markers

**Feature Branch**: `014-story-timeline-markers`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "给现有客户端中的播放器增加进度条上的剧情节点功能，从 Emby 服务器获取对应时间点，并展示到播放器的进度条上。章节与片头/片尾使用相同样式；悬停显示名称，点击节点跳转；时间相近或重合的节点合并。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See Story Landmarks While Playing (Priority: P1)

As a user watching a movie or episode, I want its chapters, intro, and credits landmarks shown on the playback timeline so that I can understand the structure of the media and locate important points at a glance.

**Why this priority**: Visible, correctly positioned landmarks are the core value of the feature; without them, the remaining interactions have no usable foundation.

**Independent Test**: Play media for which the connected Emby server exposes chapters and intro or credits segments, open the playback controls, and verify that every valid landmark appears at the corresponding relative position as the same thin vertical marker style.

**Acceptance Scenarios**:

1. **Given** the current movie has valid chapter and media-segment data, **When** its playback controls become visible, **Then** all valid chapter, intro, and credits landmarks are shown at their corresponding timeline positions using the same thin vertical marker style.
2. **Given** the current episode exposes chapter data but no intro or credits segments, **When** its playback controls become visible, **Then** its chapter landmarks are shown without placeholder segment markers.
3. **Given** two or more landmarks occur within one second of one another, **When** the timeline is displayed, **Then** they are represented by one merged marker.
4. **Given** the server returns no usable landmarks for the current media, **When** playback begins, **Then** the timeline remains usable and shows no story markers.

---

### User Story 2 - Identify and Jump to a Landmark (Priority: P2)

As a user, I want to reveal a marker's meaning by hovering over it and jump to it by clicking so that I can navigate directly to a chapter, intro, or credits point.

**Why this priority**: Markers become actionable navigation aids only when users can identify and select them without guessing.

**Independent Test**: Hover over individual and merged markers, verify their labels above the timeline, click each marker, and compare the resulting playback position with the landmark time.

**Acceptance Scenarios**:

1. **Given** the pointer is over a story marker, **When** the marker is hovered, **Then** a label appears above that marker with its server-provided name.
2. **Given** an intro or credits landmark has no usable server-provided name, **When** it is hovered, **Then** the label uses the applicable localized fallback name such as "Intro" or "Credits".
3. **Given** a marker represents merged landmarks, **When** it is hovered, **Then** every distinct landmark name is visible in one label without duplicate names.
4. **Given** a story marker is visible, **When** the user clicks it, **Then** playback seeks directly to the marker's time.

---

### User Story 3 - Keep Markers Correct Across Playback Changes (Priority: P3)

As a user who changes episodes or media during playback, I want the timeline markers to always belong to the active item so that I never navigate using stale landmarks.

**Why this priority**: Correct item ownership prevents confusing or harmful seeks while preserving uninterrupted playback during missing-data and server-failure cases.

**Independent Test**: Switch between items with different landmark sets, including an item with no landmarks and one whose landmark request fails, and verify that only the active item's markers can be seen or selected while playback continues.

**Acceptance Scenarios**:

1. **Given** one episode is playing, **When** the user switches to another episode, **Then** markers from the outgoing episode are removed before markers for the incoming episode can be used.
2. **Given** the incoming item has valid landmarks, **When** its landmark data becomes available, **Then** only those incoming-item markers are displayed.
3. **Given** landmark retrieval times out, fails, or is unsupported by the connected server, **When** playback starts or continues, **Then** playback and all existing non-marker controls remain usable and no stale markers are displayed.

### Edge Cases

- A landmark time is negative, not numeric, or beyond the known media duration.
- Media duration is temporarily unknown or changes after playback starts.
- Several chapter and segment landmarks occur at exactly the same time or within one second of each other.
- Merged landmarks have identical names, blank names, or a mixture of named and unnamed entries.
- A chapter occurs at the very beginning or near the natural end of the media.
- The item contains enough landmarks for markers to appear visually dense on a short timeline.
- The user moves rapidly across several adjacent markers or clicks while the hover label is visible.
- The user switches items while landmark retrieval for the outgoing item is still in progress.
- The signed-in account changes or the connected server becomes unavailable during landmark retrieval.
- The player window or timeline changes size while markers are visible.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST retrieve available chapter, intro, and credits landmark information for the active playable item from the connected Emby server under the active account.
- **FR-002**: Landmark retrieval MUST NOT delay or prevent playback from starting.
- **FR-003**: The system MUST represent every valid landmark with its media item, start time, display name, and landmark category.
- **FR-004**: The system MUST reject a landmark whose start time is invalid, negative, or beyond the known media duration.
- **FR-005**: The system MUST display valid chapter, intro, and credits landmarks on the active playback timeline using the same thin vertical marker style.
- **FR-006**: Each marker MUST be positioned according to its landmark start time relative to the current media duration and MUST remain correctly positioned when the timeline size changes.
- **FR-007**: Landmarks whose start times differ by no more than one second MUST be merged into a single displayed marker.
- **FR-008**: A merged marker MUST retain every distinct name associated with its constituent landmarks and MUST remove duplicate names.
- **FR-009**: The system MUST preserve a server-provided landmark name when it contains usable text.
- **FR-010**: The system MUST provide a localized fallback name for an unnamed intro or credits landmark and MAY omit an unnamed chapter from the hover label.
- **FR-011**: Hovering a marker MUST display its distinct landmark names in one label positioned above that marker.
- **FR-012**: Clicking a marker MUST seek playback to that marker's start time.
- **FR-013**: The marker interaction area MUST permit reliable hovering and clicking without preventing ordinary timeline seeking outside a marker.
- **FR-014**: The system MUST associate displayed markers with the active media item and MUST remove outgoing-item markers before an item switch can expose incoming playback controls.
- **FR-015**: A landmark result received for an item that is no longer active MUST NOT replace or alter the active item's markers.
- **FR-016**: Missing landmark data, unsupported server behavior, invalid responses, timeouts, and other retrieval failures MUST leave playback and all existing non-marker controls usable.
- **FR-017**: When landmark retrieval fails or yields no valid data, the system MUST display no story markers and MUST NOT reuse markers from another item.
- **FR-018**: Landmark retrieval and display MUST remain isolated to the currently active account, server, and media item.
- **FR-019**: The feature MUST support every movie and episode already playable by the client without changing existing playback-progress synchronization behavior.

### Key Entities

- **Story Landmark**: A server-originated point in a media timeline, identified by media item, start time, category, and optional display name.
- **Landmark Category**: The semantic kind of a landmark: chapter, intro, or credits. Categories share one visual marker style in this feature.
- **Merged Marker**: One displayed timeline marker representing all landmarks whose start times fall within the one-second merge window, with a collection of distinct display names.
- **Active Media Context**: The current account, server, playable item, and known duration that determine which landmarks may be displayed and selected.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of acceptance tests with valid server landmark data, every chapter, intro, and credits landmark is either displayed at its own timeline position or included in the correct merged marker.
- **SC-002**: Under normal connected playback conditions, valid markers become visible within 2 seconds after both the playback controls and the corresponding landmark data are available.
- **SC-003**: In 100% of marker-click tests, playback lands within one second of the selected marker's start time.
- **SC-004**: In 100% of marker-hover tests, the applicable distinct landmark names appear above the corresponding marker within 250 milliseconds.
- **SC-005**: In 100% of tested media-switch flows, no marker from the outgoing item remains visible or selectable after the incoming item becomes active.
- **SC-006**: Invalid, empty, unsupported, timed-out, and failed landmark responses cause zero playback-start failures and zero loss of existing non-marker controls across the defined acceptance tests.
- **SC-007**: At least 95% of usability-test participants can identify a named landmark and jump to it successfully on their first attempt without instructions.
- **SC-008**: Existing playback progress reporting, episode switching, pause, volume, audio, subtitle, and ordinary timeline seeking scenarios retain their pre-feature pass rate.

## Assumptions

- The first release covers the existing Windows desktop player and the movie and episode types it already supports.
- The connected Emby server and installed server features determine whether chapter, intro, and credits landmark data exists; this client does not create or edit landmark metadata.
- Intro and credits are represented as point markers at their start times; shaded ranges, automatic skipping, and skip buttons are outside this feature's scope.
- Chapters, intro, and credits intentionally use the same thin vertical marker style; category-specific colors, icons, and shapes are outside this feature's scope.
- One second is the default merge window for landmarks that are effectively colocated on the timeline.
- Server-provided names are displayed as supplied after surrounding whitespace and duplicates are removed; renaming or translating server-provided chapter names is outside scope.
- Existing authentication, account selection, media selection, playback controls, and progress synchronization remain dependencies and are not redesigned by this feature.
