# Tasks: Client Theme Modes

**Input**: Design documents from `/specs/012-client-theme-modes/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/theme-ui-contracts.md, quickstart.md

**Tests**: Included because the implementation plan and quickstart require focused Vitest coverage for defaults, persistence migration, settings UI, route integration, AuthContext merging, CSS theme contracts, and visual-demo integrity.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches a different file or has no dependency on incomplete tasks
- **[Story]**: Maps to the user story from `specs/012-client-theme-modes/spec.md`
- Every task includes an exact file path

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the existing settings, persistence, theme demo, and style surfaces before changing behavior.

- [X] T001 Review the theme visual target and three palette definitions in `specs/012-client-theme-modes/demo.html`
- [X] T002 Review the settings page props, row structure, and existing settings controls in `src/renderer/features/settings/SettingsPage.tsx`
- [X] T003 [P] Review the route-layer settings save flow in `src/renderer/app/router.tsx`
- [X] T004 [P] Review the shared settings model and persistence merge flow in `src/shared/models/settings.ts` and `src/shared/store/persistence.ts`
- [X] T005 [P] Review global renderer color variables and shell/layout selectors in `src/renderer/styles.css`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the shared theme mode contract used by all user stories.

**CRITICAL**: No user story implementation should begin until this phase is complete.

### Tests for Foundational Contracts

- [X] T006 [P] Add tests for the default `themeMode` value and invalid theme fallback behavior in `src/shared/store/persistence.test.ts`
- [X] T007 [P] Add tests for creating a theme-mode settings patch in `src/renderer/features/settings/settingsActions.test.ts`
- [X] T008 [P] Add tests that AuthContext merges saved theme settings patches without dropping nested settings in `src/renderer/features/auth/AuthContext.test.tsx`

### Implementation for Foundational Contracts

- [X] T009 Add `ThemeMode`, valid theme constants, and default `themeMode: 'daily'` to `src/shared/models/settings.ts`
- [X] T010 Normalize missing or invalid persisted `themeMode` values to `daily` during settings merge in `src/shared/store/persistence.ts`
- [X] T011 Add `createThemeModeSettingsPatch` to `src/renderer/features/settings/settingsActions.ts`
- [X] T012 Update AuthContext settings merge logic so `themeMode` patches are preserved with existing nested settings in `src/renderer/features/auth/AuthContext.tsx`

**Checkpoint**: Foundation ready - theme mode exists, defaults safely, and can be patched through the existing settings flow.

---

## Phase 3: User Story 1 - Switch Client Theme From Settings (Priority: P1) MVP

**Goal**: Users can select Dark Mode, Daily Mode, or Eye Protection Mode from settings and see the client tone update without restarting.

**Independent Test**: Open settings, select each of the three modes, and verify the active option and app shell theme update immediately while staying on the same route.

### Tests for User Story 1

- [X] T013 [P] [US1] Add SettingsPage tests for rendering exactly three theme options with Daily Mode selected by default in `src/renderer/features/settings/SettingsPage.test.tsx`
- [X] T014 [P] [US1] Add SettingsPage tests that selecting Dark Mode and Eye Protection Mode calls the theme save handler with the selected mode in `src/renderer/features/settings/SettingsPage.test.tsx`
- [X] T015 [P] [US1] Add route integration tests that the settings page persists `settings.themeMode` and updates renderer state without navigation in `src/renderer/app/App.test.tsx`
- [X] T016 [P] [US1] Add CSS contract tests for `data-theme="dark"`, `data-theme="daily"`, and `data-theme="eye"` theme token rules in `src/renderer/features/settings/SettingsPage.test.tsx`

### Implementation for User Story 1

- [X] T017 [US1] Add `themeMode` and `onThemeModeSave` props plus a theme option control to the general settings section in `src/renderer/features/settings/SettingsPage.tsx`
- [X] T018 [US1] Add a theme settings icon id, registry entry, and glyph for the new settings row in `src/renderer/features/settings/settingsIcons.tsx`
- [X] T019 [US1] Add a route-level theme save handler and pass `settings.themeMode` into SettingsPage in `src/renderer/app/router.tsx`
- [X] T020 [US1] Apply the active theme mode as a global renderer attribute on the app shell in `src/renderer/components/Layout.tsx`
- [X] T021 [US1] Refactor global shell, sidebar, settings, button, input, card, alert, loading, and dialog colors into semantic theme variables in `src/renderer/styles.css`
- [X] T022 [US1] Add Dark Mode, Daily Mode, and Eye Protection Mode variable overrides matching `specs/012-client-theme-modes/demo.html` in `src/renderer/styles.css`
- [X] T023 [US1] Update settings icon registry tests for the new theme settings row in `src/renderer/features/settings/settingsIcons.test.tsx`

**Checkpoint**: User Story 1 should be independently testable as the MVP theme switcher.

---

## Phase 4: User Story 2 - Preserve Theme Choice Across Sessions (Priority: P2)

**Goal**: The client remembers the selected theme after restart and falls back to Daily Mode for missing or invalid saved values.

**Independent Test**: Persist Eye Protection Mode, reload the app with that persisted state, and verify Eye Protection Mode is selected and applied; then load missing/invalid values and verify Daily Mode.

### Tests for User Story 2

- [X] T024 [P] [US2] Add persistence tests for valid saved `themeMode`, missing `themeMode`, and invalid legacy `themeMode` values in `src/shared/store/persistence.test.ts`
- [X] T025 [P] [US2] Add App startup tests that a persisted Eye Protection Mode value appears as the active renderer theme in `src/renderer/app/App.test.tsx`
- [X] T026 [P] [US2] Add App startup tests that missing or invalid persisted theme values fall back to Daily Mode in `src/renderer/app/App.test.tsx`

### Implementation for User Story 2

- [X] T027 [US2] Extend persisted settings patch typing and migration compatibility for `themeMode` in `src/shared/store/persistence.ts`
- [X] T028 [US2] Ensure `createDefaultSettings` and settings merge helpers keep unrelated proxy, playback, subtitles, danmaku, cache, and server preference values while applying `themeMode` in `src/shared/models/settings.ts` and `src/shared/store/persistence.ts`
- [X] T029 [US2] Ensure AppProviders hydration passes persisted `settings.themeMode` into AuthProvider initial state in `src/renderer/app/providers.tsx`

**Checkpoint**: User Stories 1 and 2 should work independently, with theme selection surviving app restart.

---

## Phase 5: User Story 3 - Review Theme Effects Visually (Priority: P3)

**Goal**: Reviewers can open a standalone HTML artifact and compare the three requested theme effects without launching the full client.

**Independent Test**: Open `specs/012-client-theme-modes/demo.html`, switch between the three modes, and compare the production palette and representative UI surfaces against the implementation.

### Tests for User Story 3

- [X] T030 [P] [US3] Add a static demo integrity test that verifies `demo.html` contains three theme controls and three theme palettes in `src/renderer/features/settings/SettingsPage.test.tsx`
- [X] T031 [P] [US3] Add CSS contract tests that media images are not globally filtered or recolored by theme rules in `src/renderer/features/settings/SettingsPage.test.tsx`

### Implementation for User Story 3

- [X] T032 [US3] Update `specs/012-client-theme-modes/demo.html` if production palette token names or values change during implementation
- [X] T033 [US3] Document any final visual-review notes or palette deviations in `specs/012-client-theme-modes/quickstart.md`

**Checkpoint**: All user stories should now be independently functional and reviewable against the HTML demo.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification, cleanup, and visual review across all user stories.

- [X] T034 [P] Run focused tests with `npm test -- src/shared/store/persistence.test.ts src/renderer/features/auth/AuthContext.test.tsx src/renderer/features/settings/settingsActions.test.ts src/renderer/features/settings/SettingsPage.test.tsx src/renderer/app/App.test.tsx` from `G:\JSProject\Emby_Player`
- [X] T035 [P] Compare the implemented app themes against `specs/012-client-theme-modes/demo.html`
- [X] T036 Run the full test suite with `npm test` from `G:\JSProject\Emby_Player`
- [X] T037 Run the production build with `npm run build` from `G:\JSProject\Emby_Player`
- [X] T038 Perform the visual review checklist in `specs/012-client-theme-modes/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion - blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational completion and is the MVP.
- **User Story 2 (Phase 4)**: Depends on Foundational completion and should be verified with the US1 UI.
- **User Story 3 (Phase 5)**: Depends on the final palette direction from US1 and can be validated after US1/US2 behavior exists.
- **Polish (Phase 6)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: No dependency on other user stories; delivers the visible settings control and immediate theme application.
- **US2 (P2)**: Can start after Foundational, but final verification depends on the app shell theme attribute from US1.
- **US3 (P3)**: Depends on the final production palette and CSS scope from US1/US2 to keep the HTML demo aligned.

### Within Each User Story

- Write story tests before implementation tasks in that story.
- Theme model and patch tests should fail before changing shared settings code.
- Settings UI tests should fail before adding the new settings row.
- CSS contract tests should fail before adding theme token overrides.
- Run the story's independent test before moving to the next priority.

### Parallel Opportunities

- T003-T005 can run in parallel after T001/T002 begin.
- T006-T008 can be authored in parallel because they touch different test files.
- T013, T015, and T023 can be authored in parallel because they touch different files; T013/T014/T016 share `SettingsPage.test.tsx` and should be merged carefully.
- T024-T026 can be authored in parallel because persistence and app startup tests are separate concerns.
- T030-T031 share `SettingsPage.test.tsx` and should be merged carefully.
- T034 and T035 can run in parallel after implementation is complete.

---

## Parallel Example: User Story 1

```text
Task: "Add SettingsPage tests for rendering exactly three theme options with Daily Mode selected by default in `src/renderer/features/settings/SettingsPage.test.tsx`"
Task: "Add route integration tests that the settings page persists `settings.themeMode` and updates renderer state without navigation in `src/renderer/app/App.test.tsx`"
Task: "Update settings icon registry tests for the new theme settings row in `src/renderer/features/settings/settingsIcons.test.tsx`"
```

## Parallel Example: User Story 2

```text
Task: "Add persistence tests for valid saved `themeMode`, missing `themeMode`, and invalid legacy `themeMode` values in `src/shared/store/persistence.test.ts`"
Task: "Add App startup tests that a persisted Eye Protection Mode value appears as the active renderer theme in `src/renderer/app/App.test.tsx`"
Task: "Add App startup tests that missing or invalid persisted theme values fall back to Daily Mode in `src/renderer/app/App.test.tsx`"
```

## Parallel Example: User Story 3

```text
Task: "Add a static demo integrity test that verifies `demo.html` contains three theme controls and three theme palettes in `src/renderer/features/settings/SettingsPage.test.tsx`"
Task: "Add CSS contract tests that media images are not globally filtered or recolored by theme rules in `src/renderer/features/settings/SettingsPage.test.tsx`"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 tasks T013-T023.
3. Run the focused SettingsPage/App/settingsActions/AuthContext/persistence test command from T034.
4. Open settings and verify Dark Mode, Daily Mode, and Eye Protection Mode switch the whole client tone without navigation.

### Incremental Delivery

1. Deliver US1 for immediate in-app theme switching.
2. Deliver US2 for restart-safe persistence and fallback behavior.
3. Deliver US3 to keep the standalone HTML demo aligned with the production palette.
4. Run Phase 6 verification before completing the feature.

### Single-Developer Strategy

1. Work sequentially in task ID order because several changes share `src/renderer/styles.css`, `src/renderer/app/App.test.tsx`, and `src/renderer/features/settings/SettingsPage.test.tsx`.
2. Keep the theme model small and explicit; do not add custom colors or OS theme detection.
3. Avoid global CSS filters so poster artwork, backdrops, and video content keep original colors.
4. Stop at each checkpoint to validate the relevant user story independently.

## Notes

- `[P]` tasks are safe to plan in parallel, but tasks sharing a test file should be merged carefully.
- This feature does not add runtime dependencies, routes, server calls, OS theme integration, or custom user palettes.
- The visual target is `specs/012-client-theme-modes/demo.html`.
- Commit after each task or logical group if using the optional Spec Kit git hooks.
