# Server Last Played Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the login date in each saved server-account sidebar row with the date that account last played media in this application.

**Architecture:** Confirm playback at the player's first rendered frame and resolve its saved account through the existing playback context. Persist a monotonic timestamp per account ID in the existing desktop state, expose it through the hydrated auth context, and render either its local date or an explicit no-history label in the sidebar.

**Tech Stack:** TypeScript 5.6, Electron 32, React 18, electron-store, Vitest 2.1, mpv player events.

---

**Branch**: `022-server-last-played` | **Date**: 2026-09-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/022-server-last-played/spec.md`

## Summary

The current server row reads `SavedAccount.lastUsedAt` and labels it “登录过”. Add a separate per-account last-played timestamp, update it only after a matching `first-frame` startup event, persist it across restarts, and display “暂无播放记录” when no valid value exists. Preserve the account list's names, order, selection, and remark editing.

## Technical Context

**Language/Version**: TypeScript 5.6

**Primary Dependencies**: Electron 32, React 18, electron-store 10, mpv playback event bridge

**Storage**: Existing `desktop-storage` persisted state via `src/shared/store/persistence.ts` and serialized main-process writes

**Testing**: Vitest unit and React integration tests, TypeScript check, Vite/Electron production build, manual Windows playback checks

**Target Platform**: Taluxa Windows desktop application with native mpv player windows

**Project Type**: Electron desktop application with a React renderer

**Performance Goals**: A visible server row updates within 2 seconds of a matching first frame in representative playback runs

**Constraints**: Never use login or added time as playback history; preserve cross-account isolation; never persist media URLs or credentials in the timestamp index; do not alter playback startup, progress reporting, account selection, or list order

**Scale/Scope**: One timestamp per saved account, all existing playable media and concurrent player sessions; excludes remote-client history import, history backfill, sorting, and playback-history UI

## Constitution Check

*GATE: Passed before Phase 0 research and re-checked after Phase 1 design.*

`.specify/memory/constitution.md` is an unfilled template and states no enforceable project-specific gates. The plan follows established repository practices:

- **PASS — Existing event boundary**: Playback confirmation uses the player startup stream already exposed to the renderer; source resolution and player commands are untouched.
- **PASS — Account isolation**: The persisted key is the saved account ID from the registered playback context, independent of the currently selected account.
- **PASS — Safe state merge**: Only the account timestamp key is patched. The merge keeps the newest valid value and does not rewrite saved credentials.
- **PASS — No false history**: Login, browsing, source preparation, media loading, and ready fallback never update the date.
- **PASS — Tests before behavior changes**: Storage, event matching, live rendering, and controller regressions get focused tests before implementation.
- **PASS — Dependency restraint**: No new package, server call, cache, or background process is needed.

Post-design re-check: The map stores account IDs and ISO timestamps only. A first-frame observation must match a registered session and item before it reaches storage. No gate violation remains.

## Project Structure

### Documentation (this feature)

```text
specs/022-server-last-played/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── server-last-played.md
└── checklists/
    └── requirements.md
```

`tasks.md` is produced by `/speckit-tasks`, after this planning phase.

### Source Code (repository root)

```text
src/
├── shared/store/
│   ├── persistence.ts                 # Add and merge account timestamp map
│   └── persistence.test.ts
├── renderer/app/
│   ├── providers.tsx                   # Hydrate map into auth context
│   └── App.test.tsx                    # End-to-end renderer interaction
├── renderer/features/auth/
│   ├── AuthContext.tsx                 # Reactive timestamp update and persistence
│   └── AuthContext.test.tsx
├── renderer/features/player/
│   ├── playbackSync.ts                # Match and deduplicate first-frame observations
│   ├── playbackSync.test.ts
│   ├── PlaybackSyncProvider.tsx       # Subscribe to startup events and forward context
│   └── PlaybackSyncProvider.test.tsx
├── renderer/components/
│   ├── AccountSidebar.tsx             # Show playback date or no-history label
│   ├── AccountSidebar.test.tsx
│   └── Layout.tsx                     # Pass timestamp map to sidebar
└── electron/main/player/
    └── mpvController.test.ts          # Verify replacement first-frame event identity
```

**Structure Decision**: Keep timestamp persistence in the existing shared storage model and its renderer auth state. Extend the persistent playback-sync boundary that already owns playback context registration, rather than adding route-specific subscriptions or changing player IPC commands. The sidebar remains a display-only projection.

## Phase 0 Research Summary

[research.md](./research.md) records the choices and rejected alternatives:

1. The existing playback `started` event can precede media loading because ready fallback emits it; a matching `first-frame` event is the confirmation point.
2. Reuse registered `PlaybackReportContext.accountId` to attribute background and switched playback to the correct saved account.
3. Persist an independent `lastPlayedAtByAccountId` map and merge timestamps monotonically, so login updates cannot erase playback history and timestamp writes cannot replace credentials.
4. Legacy accounts start with no history; the display never falls back to login time or server item history.

## Phase 1 Design Summary

- [data-model.md](./data-model.md) defines the persisted map, runtime observation state, validation, and sidebar projection.
- [contracts/server-last-played.md](./contracts/server-last-played.md) defines event matching, patch merge, and display behavior.
- [quickstart.md](./quickstart.md) defines focused automated tests and manual Windows playback scenarios.
- `AGENTS.md` points future work to this plan.

## Phase 2 Implementation Sequence

### Task 1: Add a monotonic account timestamp to persistence

**Files:** `src/shared/store/persistence.ts`, `src/shared/store/persistence.test.ts`.

- [ ] Write tests for an empty map on new and legacy states, two distinct account IDs, a newer timestamp winning over an older patch, malformed timestamps, and a timestamp patch preserving login credentials, active selection, progress, settings, and cache.
- [ ] Run `npx vitest run src/shared/store/persistence.test.ts` and confirm the new tests fail for the missing field/merge.
- [ ] Add the map to state and patch types, default state, and migration. Normalize valid timestamps and merge each key by later instant. Reject unknown account IDs for new observations while allowing legacy states without the field.
- [ ] Re-run the focused persistence suite and confirm the new tests pass.

### Task 2: Hydrate and update the live account timestamp index

**Files:** `src/renderer/app/providers.tsx`, `src/renderer/features/auth/AuthContext.tsx`, `src/renderer/features/auth/AuthContext.test.tsx`.

- [ ] Write tests showing a hydrated timestamp survives provider initialization and account switching; recording for one existing account updates only that account, remains monotonic, and writes only the timestamp map. Test that login/upsert does not clear it.
- [ ] Run `npx vitest run src/renderer/features/auth/AuthContext.test.tsx` and confirm the new assertions fail.
- [ ] Include the map in auth state and startup hydration. Expose a narrow `recordLastPlayedAt(accountId, observedAt)` operation that validates the account, updates renderer state immediately, and persists a single-key patch. Keep failure handling local to this operation so playback is unaffected.
- [ ] Re-run the focused auth suite and verify the sidebar can consume the updated context without a page reload.

### Task 3: Confirm and attribute first-frame events

**Files:** `src/renderer/features/player/playbackSync.ts`, `src/renderer/features/player/playbackSync.test.ts`, `src/renderer/features/player/PlaybackSyncProvider.tsx`, `src/renderer/features/player/PlaybackSyncProvider.test.tsx`, `src/electron/main/player/mpvController.test.ts`.

- [ ] Write coordinator tests for matching first-frame/session/item, mismatched or failed startup, first frame before registration, duplicate first frames after seeking, a newly registered episode, concurrent sessions, and an account switch while an older window plays.
- [ ] Write provider tests that capture `onStartupEvent`, forward only first-frame observations, update the originating account within the current render, and unsubscribe on unmount. Extend the controller test to show replacement media emits `first-frame` with its new item ID.
- [ ] Run these three focused suites and confirm the new behavior tests fail before implementation.
- [ ] Add a first-frame observation method and bounded pending buffer to the coordinator. Accept only a session/item match from a registered context, deduplicate per registration, and release stale observations on replacement or close. Capture time at event receipt and invoke the auth timestamp operation independently of remote Emby reporting.
- [ ] Subscribe once to player startup events in `PlaybackSyncProvider`, route the observation to the coordinator, and reuse existing context registration. Preserve the current playback-progress subscription and remote reporting behavior.
- [ ] Re-run the focused suites and verify loading/ready/failed events cannot create a timestamp.

### Task 4: Render the account-specific status in the sidebar

**Files:** `src/renderer/components/AccountSidebar.tsx`, `src/renderer/components/AccountSidebar.test.tsx`, `src/renderer/components/Layout.tsx`, `src/renderer/app/App.test.tsx`.

- [ ] Write component tests for a valid local date labeled “播放过”, a missing or malformed time labeled “暂无播放记录”, two accounts on one server with different values, and unchanged account selection, display name, remark menu, and order.
- [ ] Add an app-level test that observes a first frame, sees the corresponding sidebar row change without restart, and leaves the other row unchanged.
- [ ] Run the focused sidebar and app tests and confirm the new assertions fail before implementation.
- [ ] Pass the timestamp map from auth context through `Layout` to `AccountSidebar`. Replace only the `lastUsedAt` status projection; keep `lastUsedAt` for login behavior elsewhere.
- [ ] Re-run the focused suites and verify the row does not show a login date when no playback exists.

### Task 5: Full verification and requirement review

**Files:** Modify only implementation/tests found above if regression checks expose a feature-related issue.

- [ ] Run the focused suites from [quickstart.md](./quickstart.md), then `npm test` and `npm run build`; resolve failures introduced by this feature.
- [ ] Run the manual Windows scenarios from [quickstart.md](./quickstart.md), including failed load, episode switch, multiple windows, same-server accounts, restart, and a measured sidebar update within 2 seconds of first frame.
- [ ] Review every requirement and success criterion against test/manual evidence; confirm no timestamp patch contains a token or source URL and no list reordering occurs.
- [ ] Commit the implementation and tests after verification; keep this plan and its design artifacts available for review.

## Requirement Coverage Review

| Specification requirement | Planned coverage |
|---|---|
| FR-001, FR-007, FR-008; SC-005 | Tasks 1, 2, 4: persisted map, hydration, sidebar date/empty-state tests |
| FR-002, FR-003; SC-001, SC-002 | Task 3: first-frame confirmation for initial, switched, and failed playback; Task 5 manual media checks |
| FR-004, FR-005; SC-003 | Tasks 1 and 3: account context matching, concurrent sessions, monotonic storage merge |
| FR-006; SC-004 | Tasks 1 and 2: persistence migration/hydration and restart check |
| FR-009 | Tasks 2–4: reactive context update and app-level sidebar test |
| FR-010 | Task 4: regression assertions for order, selection, display name, and remark controls |

The coverage review found no uncovered functional requirement or measurable outcome.

## Complexity Tracking

No constitution violations or complexity exceptions require justification.
