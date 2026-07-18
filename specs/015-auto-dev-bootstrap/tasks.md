# Tasks: Automatic Development Bootstrap

**Input**: Design documents from `specs/015-auto-dev-bootstrap/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `quickstart.md`

**Tests**: Test-first delivery is required by the approved plan. Each behavior task begins by adding a focused assertion and confirming the expected failure before production changes.

**Organization**: Tasks are grouped by user story and ordered to keep each increment runnable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files and has no incomplete dependency.
- **[Story]**: Maps the task to a prioritized user story in `spec.md`.
- Every task names the exact file it changes or verifies.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Register the focused verification entry point without changing existing runtime behavior.

- [x] T001 Add the `test:dev-bootstrap` Node check command alongside `test:dev-port` in `package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the test harness boundary used by every story.

- [x] T002 Create the assertion helpers and injected fake filesystem/process harness in `scripts/devDependencyBootstrap.check.mjs`, then run it and confirm the missing production module causes the expected RED failure

**Checkpoint**: The focused check is executable and proven to fail for the unimplemented bootstrap.

---

## Phase 3: User Story 1 - Start a Fresh Clone Directly (Priority: P1) MVP

**Goal**: A missing local Vite installation triggers one locked install in the active checkout and normal startup continues afterward.

**Independent Test**: Simulate a missing Vite CLI and present lockfile, verify `npm ci` command/platform/cwd/stdio options, make Vite appear after success, and confirm the bootstrap resolves ready.

### Tests for User Story 1

- [x] T003 [US1] Add failing locked-install, Windows/non-Windows executable, repository-path-with-spaces, and post-install-success cases in `scripts/devDependencyBootstrap.check.mjs`

### Implementation for User Story 1

- [x] T004 [US1] Implement path derivation, current npm CLI selection, locked install spawning, and post-install validation in `scripts/devDependencyBootstrap.mjs`
- [x] T005 [US1] Await dependency readiness before existing port selection and Vite launch in `scripts/dev.mjs`
- [x] T006 [US1] Run `npm run test:dev-bootstrap` and `npm run test:dev-port`, then record the completed US1 tasks in `specs/015-auto-dev-bootstrap/tasks.md`

**Checkpoint**: The clean-checkout installation path is complete and independently verified.

---

## Phase 4: User Story 2 - Preserve Fast Repeat Startup (Priority: P2)

**Goal**: Existing local dependencies bypass npm entirely and proceed immediately to normal startup.

**Independent Test**: Simulate an existing Vite CLI, assert that the spawn boundary is never called, and measure that the injected bootstrap returns within the 100 ms success threshold.

### Tests for User Story 2

- [x] T007 [US2] Add failing installed-dependency skip, offline-safe no-spawn, and fast-path timing cases in `scripts/devDependencyBootstrap.check.mjs`

### Implementation for User Story 2

- [x] T008 [US2] Add the pre-install local-tool fast path in `scripts/devDependencyBootstrap.mjs`
- [x] T009 [US2] Run `npm run test:dev-bootstrap` and verify the US1 install path remains green before marking US2 complete in `specs/015-auto-dev-bootstrap/tasks.md`

**Checkpoint**: Repeat startup performs no package-manager or network-sensitive work.

---

## Phase 5: User Story 3 - Receive Actionable Installation Failure (Priority: P3)

**Goal**: All dependency setup failures remain visible, stop startup, and produce actionable errors.

**Independent Test**: Simulate missing lockfile, spawn error, non-zero exit, signal termination, and zero exit without Vite; verify every case rejects and no development-server continuation is possible.

### Tests for User Story 3

- [x] T010 [US3] Add failing missing-lockfile, spawn-error, non-zero-exit, signal, and missing-post-install-tool cases in `scripts/devDependencyBootstrap.check.mjs`

### Implementation for User Story 3

- [x] T011 [US3] Implement actionable validation and installer failure propagation in `scripts/devDependencyBootstrap.mjs`
- [x] T012 [US3] Add top-level bootstrap error reporting and unsuccessful exit behavior without changing child Vite signal forwarding in `scripts/dev.mjs`
- [x] T013 [US3] Run `npm run test:dev-bootstrap` and both prior story paths before marking US3 complete in `specs/015-auto-dev-bootstrap/tasks.md`

**Checkpoint**: Every specified setup failure prevents Vite startup with diagnosable output.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Document the workflow and verify repository-wide compatibility.

- [x] T014 [P] Document direct first-run startup and explicit `npm ci` setup alternatives in `README.md`
- [x] T015 Run all commands in `specs/015-auto-dev-bootstrap/quickstart.md` and update verification checkboxes in `specs/015-auto-dev-bootstrap/tasks.md`
- [x] T016 Inspect `git diff --check`, `git diff --name-only`, and startup-script changes for machine-specific absolute paths, then update `specs/015-auto-dev-bootstrap/tasks.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately.
- **Foundational (Phase 2)**: Depends on T001 and blocks story implementation.
- **US1 (Phase 3)**: Depends on the failing harness from T002 and establishes the installer orchestration.
- **US2 (Phase 4)**: Depends on US1 because it refines the same bootstrap function while preserving its install path.
- **US3 (Phase 5)**: Depends on US1 and US2 because it completes the same function's failure state machine.
- **Polish (Phase 6)**: T014 can run after behavior is stable; T015-T016 depend on all stories.

### User Story Dependencies

```text
Setup -> Foundation -> US1 (MVP) -> US2 -> US3 -> Final Verification
```

The stories are independently testable but intentionally implemented sequentially because they modify the same bootstrap module and check file.

### Within Each User Story

- Add the story assertions and verify RED before editing production code.
- Implement the minimum behavior required for GREEN.
- Re-run all earlier story checks to prevent regressions.
- Update task checkboxes only after fresh command evidence.

### Parallel Opportunities

- T014 can run in parallel with final code review once the documented messages and command names are stable.
- Repository-wide Vitest/build verification in T015 is sequential because both may use shared generated outputs.
- No production story tasks are marked parallel because they share `scripts/devDependencyBootstrap.mjs` and its focused check.

## Parallel Example: Polish

```text
Task A: Update README.md with automatic and manual first-run instructions.
Task B: Review scripts/dev.mjs and scripts/devDependencyBootstrap.mjs for absolute paths and shell use.
```

## Implementation Strategy

### MVP First

1. Complete T001-T002.
2. Complete US1 T003-T006 using RED-GREEN verification.
3. Stop and validate the fresh-clone orchestration independently.

### Incremental Delivery

1. US1 provides one-command clean-checkout installation.
2. US2 protects repeat-start performance and offline startup.
3. US3 completes diagnosable failure behavior.
4. Polish updates developer guidance and proves full repository compatibility.

## Notes

- Never delete or rename the real `node_modules` directory during automated checks.
- Preserve installer stdout/stderr through inherited standard streams.
- Do not fall back to a manifest-updating installation command.
- Do not add machine-specific executable paths.
