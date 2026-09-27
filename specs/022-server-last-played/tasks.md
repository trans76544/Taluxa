# Tasks: Server Last Played Time

**Input**: Design documents from `specs/022-server-last-played/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [server-last-played.md](./contracts/server-last-played.md)

**Tests**: The implementation plan requires focused tests before behavior changes. Write each story's listed tests and confirm they fail for the missing behavior before implementing it.

**Organization**: Tasks are grouped by the three prioritized user stories. Paths are relative to the repository root.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: May run in parallel with other marked tasks in the same group because they use different files and do not depend on unfinished work.
- **[Story]**: Maps to User Story 1, 2, or 3 in [spec.md](./spec.md).
- Every checklist task names the file or files it reads, tests, or changes.

## Phase 1: Setup

**Purpose**: Confirm the existing project and playback event baseline. No new package or project scaffold is required.

- [x] T001 Run the existing focused baseline tests for `src/shared/store/persistence.test.ts`, `src/renderer/features/player/playbackSync.test.ts`, `src/renderer/features/player/PlaybackSyncProvider.test.tsx`, and `src/renderer/components/AccountSidebar.test.tsx`; record any pre-existing failure before editing source.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the shared account timestamp shape and hydrate it before any story records or displays a time.

- [x] T002 Add failing tests in `src/shared/store/persistence.test.ts` for `lastPlayedAtByAccountId: {}` in a new state and in a legacy state without that field; keep existing account, settings, progress, and cache values intact.
- [x] T003 Add the timestamp map to persisted/patch/legacy state types, empty-state creation, and legacy migration in `src/shared/store/persistence.ts`; run `npx vitest run src/shared/store/persistence.test.ts` until T002 passes.
- [x] T004 Add a failing hydration test in `src/renderer/features/auth/AuthContext.test.tsx` that starts with a persisted account timestamp and observes the same value through `useAuth`.
- [x] T005 Include `lastPlayedAtByAccountId` in startup state in `src/renderer/app/providers.tsx` and the default/normalized auth state in `src/renderer/features/auth/AuthContext.tsx`; run `npx vitest run src/renderer/features/auth/AuthContext.test.tsx` until T004 passes.

**Checkpoint**: Timestamp state can be stored and read without a playback observation or sidebar change.

---

## Phase 3: User Story 1 - See the latest playback date (Priority: P1) 🎯 MVP

**Goal**: A confirmed first frame updates its saved account's timestamp and the visible sidebar date; login, preparation, and failed loading do not.

**Independent Test**: Start a movie or episode under one saved account, deliver its matching first frame, and verify the row changes within 2 seconds. Deliver only ready/loading/failed events and verify the row does not change.

### Tests for User Story 1

- [x] T006 [P] [US1] Add a failing single-key persistence patch test in `src/shared/store/persistence.test.ts` that records a valid ISO time for a saved account without changing its token, username, or `lastUsedAt`.
- [x] T007 [P] [US1] Add failing coordinator tests in `src/renderer/features/player/playbackSync.test.ts` that accept one matching `first-frame` event and reject a different session or item, `media-ready`, `failed`, and duplicate seek-triggered first frames.
- [x] T008 [P] [US1] Add a failing provider test in `src/renderer/features/player/PlaybackSyncProvider.test.tsx` that registers a playback context, delivers `first-frame`, and expects one timestamp update while remote playback reporting remains unchanged.
- [x] T009 [P] [US1] Add failing sidebar tests in `src/renderer/components/AccountSidebar.test.tsx` for the saved account's local date and “播放过” text even when `lastUsedAt` is later.
- [x] T010 [P] [US1] Add a failing renderer integration test in `src/renderer/app/App.test.tsx` that delivers a matching first frame and observes the correct sidebar row update without navigation or restart; a failed startup must leave it unchanged.

### Implementation for User Story 1

- [x] T011 [US1] Merge a valid `lastPlayedAtByAccountId` patch for an existing saved account in `src/shared/store/persistence.ts`, changing only that map entry and preserving all other persisted fields; satisfy T006.
- [x] T012 [US1] Expose `recordLastPlayedAt(accountId, observedAt)` from `src/renderer/features/auth/AuthContext.tsx`; update the visible map immediately and persist only `{ lastPlayedAtByAccountId: { [accountId]: observedAt } }` through the existing storage bridge.
- [x] T013 [US1] Add a first-frame observation method to `src/renderer/features/player/playbackSync.ts` that uses registered `PlaybackReportContext.accountId`, matches `playerSessionId` and `itemId`, captures observation time at event receipt, and submits it once per registration; satisfy T007.
- [x] T014 [US1] Subscribe to `player.onStartupEvent` in `src/renderer/features/player/PlaybackSyncProvider.tsx`, forward matching first frames to the coordinator and auth update, and unsubscribe on unmount without changing existing playback-event reporting; satisfy T008.
- [x] T015 [US1] Pass `lastPlayedAtByAccountId` from `src/renderer/components/Layout.tsx` to `src/renderer/components/AccountSidebar.tsx` and render a valid timestamp as `<用户名> (<本地日期> 播放过)` instead of the `lastUsedAt` label; satisfy T009 and T010.
- [x] T016 [US1] Run the focused tests in `src/shared/store/persistence.test.ts`, `src/renderer/features/player/playbackSync.test.ts`, `src/renderer/features/player/PlaybackSyncProvider.test.tsx`, `src/renderer/components/AccountSidebar.test.tsx`, and `src/renderer/app/App.test.tsx`; verify User Story 1 independently.

**Checkpoint**: One account's confirmed playback appears in the sidebar; mere login and unsuccessful launch do not create a playback date.

---

## Phase 4: User Story 2 - Keep each account's history separate (Priority: P2)

**Goal**: Keep concurrent and switched playback attributed to its originating account, reject older timestamps, and retain each account's date across restart and re-login.

**Independent Test**: Play through two saved accounts, including two users of the same server and a background player after active-account switching; restart and verify each row retains only its own latest date.

### Tests for User Story 2

- [x] T017 [P] [US2] Add failing tests in `src/shared/store/persistence.test.ts` for same-server different account IDs, older and duplicate timestamp patches, malformed incoming times, and a later login patch preserving recorded playback dates.
- [x] T018 [P] [US2] Add failing tests in `src/renderer/features/player/playbackSync.test.ts` for two simultaneous player sessions, an episode context replacement, first frame before context registration, repeated first frames after seeking, mismatched stale frames, and closed-session cleanup.
- [x] T019 [P] [US2] Add failing tests in `src/renderer/features/auth/AuthContext.test.tsx` for inactive-account updates, account switching, re-login/upsert, and immediate monotonic in-memory results while a write is pending.
- [x] T020 [P] [US2] Add a regression test in `src/electron/main/player/mpvController.test.ts` showing a switched episode's `playback-restart` emits `first-frame` with the replacement item ID; if it fails, repair that event identity before T023.
- [x] T021 [P] [US2] Add a failing provider integration test in `src/renderer/features/player/PlaybackSyncProvider.test.tsx` that switches the selected account while an older player window receives a first frame and verifies the timestamp is recorded for that window's registered account.

### Implementation for User Story 2

- [x] T022 [US2] Validate and normalize ISO timestamps in `src/shared/store/persistence.ts`, keep the later value for each account ID, and avoid changing other account keys when login or playback writes interleave; satisfy T017.
- [x] T023 [US2] Add bounded pending first-frame observations, registration-generation deduplication, episode replacement matching, and close cleanup to `src/renderer/features/player/playbackSync.ts`; preserve the event's receipt time when a context arrives later; satisfy T018.
- [x] T024 [US2] Make `recordLastPlayedAt` in `src/renderer/features/auth/AuthContext.tsx` reject unknown accounts and older observations, retain a newer in-memory value during pending writes, and preserve the map through account selection and upsert; satisfy T019.
- [x] T025 [US2] Forward `closed` startup events to the coordinator from `src/renderer/features/player/PlaybackSyncProvider.tsx` and retain context-based ownership after account selection changes; satisfy T021 without modifying the controller's playback commands.
- [x] T026 [US2] Run the focused tests in `src/shared/store/persistence.test.ts`, `src/renderer/features/player/playbackSync.test.ts`, `src/renderer/features/player/PlaybackSyncProvider.test.tsx`, `src/renderer/features/auth/AuthContext.test.tsx`, and `src/electron/main/player/mpvController.test.ts`; verify User Story 2 independently after User Story 1.

**Checkpoint**: Each saved account has a monotonic last-played date across multiple windows, account selection changes, re-login, and app restart.

---

## Phase 5: User Story 3 - Recognize accounts without playback (Priority: P3)

**Goal**: New and legacy accounts with no valid local playback time show “暂无播放记录”, never a relabeled login or added date.

**Independent Test**: Add a server account without playback and open an upgraded legacy account; both rows show the no-history label while retaining the username, then change only the played account after a first frame.

### Tests for User Story 3

- [x] T027 [P] [US3] Add failing migration tests in `src/shared/store/persistence.test.ts` that leave `lastPlayedAtByAccountId` empty for legacy login/progress data and ignore malformed persisted timestamps without backfilling from `lastUsedAt`.
- [x] T028 [P] [US3] Add failing display tests in `src/renderer/components/AccountSidebar.test.tsx` for missing and malformed playback times, username retention, two rows on one server, unchanged row order, selection, display name, and remark menu.
- [x] T029 [P] [US3] Add a failing app test in `src/renderer/app/App.test.tsx` that adds or re-logs an account without a playback timestamp and sees “暂无播放记录” until a confirmed first frame arrives.

### Implementation for User Story 3

- [x] T030 [US3] Normalize legacy and malformed `lastPlayedAtByAccountId` values to absence in `src/shared/store/persistence.ts` without deriving playback time from login or per-item progress; satisfy T027.
- [x] T031 [US3] Render `<用户名> (暂无播放记录)` for absent or invalid timestamps in `src/renderer/components/AccountSidebar.tsx`, retaining existing server name, order, selection, and remark actions; satisfy T028 and T029.
- [x] T032 [US3] Run the focused tests in `src/shared/store/persistence.test.ts`, `src/renderer/components/AccountSidebar.test.tsx`, and `src/renderer/app/App.test.tsx`; verify User Story 3 independently after User Story 1.

**Checkpoint**: The sidebar distinguishes confirmed playback history from accounts that have only been added or logged in.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify the whole feature and document observed behavior.

- [x] T033 Run all focused suites listed in `specs/022-server-last-played/quickstart.md`, then `npm test` and `npm run build`; fix feature-related regressions in the specific tested source files before claiming success.
- [ ] T034 Execute the Windows scenarios in `specs/022-server-last-played/quickstart.md` and record actual first-frame-to-sidebar timing, same-server account isolation, failed-load behavior, restart persistence, and episode-switch results there.
- [x] T035 Review FR-001–FR-010 and SC-001–SC-005 in `specs/022-server-last-played/spec.md` against test/manual results; confirm the timestamp patch in `src/shared/store/persistence.ts` contains no token or media URL and that `src/renderer/components/AccountSidebar.tsx` preserves list order.
- [x] T036 Run `git diff --check` for the source and `specs/022-server-last-played/quickstart.md` changes, then commit the verified implementation and tests on branch `022-server-last-played`.

---

## Dependencies & Execution Order

### Phase Dependencies

```text
Setup (T001)
  └─ Foundation (T002–T005)
       └─ US1 MVP (T006–T016)
            ├─ US2 account isolation (T017–T026)
            └─ US3 no-history state (T027–T032)
                 └─ Polish (T033–T036, after US2 and US3)
```

- Foundation provides the shared state shape and hydration. It blocks all user stories.
- US1 creates the recording and rendering path. US2 and US3 extend that path with independently testable scenarios and can begin after US1.
- US2 and US3 tests may be prepared in parallel. Their implementation both touches `src/shared/store/persistence.ts`, so coordinate or serialize those edits.
- Final verification begins after all selected stories pass their independent checks.

### Within Each Story

- Write the listed tests, run them to observe the missing behavior, then change production code.
- Complete persistence and auth updates before provider wiring; complete provider wiring before the sidebar integration checkpoint.
- Re-run each story's focused suites at its checkpoint. Mark a task complete only after its named behavior is verified.

## Parallel Execution Examples

### User Story 1

After T005, T006 (`src/shared/store/persistence.test.ts`), T007 (`src/renderer/features/player/playbackSync.test.ts`), T008 (`src/renderer/features/player/PlaybackSyncProvider.test.tsx`), T009 (`src/renderer/components/AccountSidebar.test.tsx`), and T010 (`src/renderer/app/App.test.tsx`) can be written in parallel because they edit separate test files.

### User Story 2

After T016, T017–T021 can be written in parallel in their separate test files. T022–T025 are then applied in dependency order because persistence, coordinator, auth, and provider behavior must agree on the same account and timestamp contract.

### User Story 3

After T016, T027–T029 can be written in parallel in their separate test files. T030 precedes T031 so the sidebar receives normalized state; run T032 after both changes.

## Implementation Strategy

1. Complete setup and foundation, then US1 as the smallest usable slice: one confirmed playback updates its own sidebar date.
2. Verify US1 independently. Add US2 for multi-account correctness, monotonic writes, and restart retention.
3. Add US3 for new/legacy no-history states, then run the full automated and manual checks.
4. Stop after any story checkpoint if its independent test fails; resolve that story before proceeding.
