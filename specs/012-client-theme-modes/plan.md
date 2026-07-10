# Implementation Plan: Client Theme Modes

**Branch**: `012-client-theme-modes` | **Date**: 2026-07-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/012-client-theme-modes/spec.md`

**Note**: This plan was produced by the `/speckit-plan` workflow for the client theme mode setting. The visual direction follows [demo.html](./demo.html).

## Summary

Add a settings-screen control that lets users switch the entire Taluxa client between Dark Mode, Daily Mode, and Eye Protection Mode. The technical approach is to extend the existing persisted settings model with a validated theme mode value, pass that value through the current AuthContext/settings route flow, apply it as a global theme attribute on the app shell, and refactor global renderer colors into theme variables that match the standalone HTML demo.

## Technical Context

**Language/Version**: TypeScript 5.6 with React 18 and Electron 32.

**Primary Dependencies**: Existing Vite, React Router, electron-store, Vitest, Testing Library, and jsdom. No new runtime dependency is required.

**Storage**: Existing local desktop persistence through electron-store via the `settings` object. Add a `themeMode` preference with migration/default handling.

**Testing**: Vitest unit/component tests and TypeScript build through `npm test` and `npm run build`, plus visual review of `specs/012-client-theme-modes/demo.html` and the running Electron renderer.

**Target Platform**: Windows desktop app.

**Project Type**: Electron desktop application with a React renderer, Electron main process, preload bridge, shared TypeScript modules, and external mpv playback process.

**Performance Goals**: Theme switching should update visible UI in the current renderer frame without route reload, app restart, media reload, or noticeable layout shift. The theme mechanism should be CSS-variable driven and should not trigger media artwork refetches.

**Constraints**: Preserve existing settings behavior, server/account selection, playback state, media browsing state, detail-page behavior from `011-full-page-detail`, cache settings, proxy settings, subtitle settings, danmaku settings, and image colors. Use the theme palettes from `demo.html` as the intended visual target. Avoid decorative explanatory text inside the production app beyond normal settings labels and descriptions. Keep controls stable on desktop and narrow widths.

**Scale/Scope**: One global client theme setting used by all authenticated and unauthenticated renderer surfaces. Expected source touchpoints are `src/shared/models/settings.ts`, `src/shared/store/persistence.ts`, `src/renderer/features/auth/AuthContext.tsx`, `src/renderer/app/router.tsx`, `src/renderer/features/settings/SettingsPage.tsx`, `src/renderer/features/settings/settingsActions.ts`, `src/renderer/features/settings/settingsIcons.tsx`, related tests, and `src/renderer/styles.css`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution currently contains placeholders only and defines no enforceable project-specific gates. This plan applies active repository guidance and existing constraints:

- Preserve user work in the current worktree.
- Keep changes scoped to theme selection, persistence, app-wide theme application, tests, and the visual demo.
- Prefer existing React/TypeScript renderer structure, AuthContext settings flow, electron-store persistence, and CSS over new dependencies.
- Preserve navigation, playback, account switching, media browsing, and existing settings behavior.
- Add focused tests for settings model defaults/migration, settings action patch creation, settings UI selection, route persistence, and CSS theme contracts.
- Verify with targeted tests, `npm test`, `npm run build`, and visual review before implementation completion.

Gate result before Phase 0: PASS. No constitution violations or unresolved clarifications.

## Project Structure

### Documentation (this feature)

```text
specs/012-client-theme-modes/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- demo.html
|-- contracts/
|   `-- theme-ui-contracts.md
|-- checklists/
|   `-- requirements.md
`-- spec.md
```

### Source Code (repository root)

```text
src/shared/models/
`-- settings.ts

src/shared/store/
|-- persistence.ts
`-- persistence.test.ts

src/renderer/app/
|-- App.test.tsx
`-- router.tsx

src/renderer/features/auth/
|-- AuthContext.tsx
`-- AuthContext.test.tsx

src/renderer/features/settings/
|-- SettingsPage.tsx
|-- SettingsPage.test.tsx
|-- settingsActions.ts
|-- settingsActions.test.ts
|-- settingsIcons.tsx
`-- settingsIcons.test.tsx

src/renderer/
`-- styles.css

AGENTS.md
```

**Structure Decision**: Keep the feature inside the existing settings and renderer styling areas. Store the theme mode with the existing `Settings` object, pass it through the existing route/auth settings update flow, and apply the selected mode through a global app attribute consumed by CSS variables. Do not introduce a separate theme framework, route, store, native OS integration, or media-image transformation.

## Complexity Tracking

No constitution violations were found. No complexity exception is required.

## Phase 0: Research Summary

Research output is captured in [research.md](./research.md). Decisions:

- Add `ThemeMode = 'dark' | 'daily' | 'eye'` to the shared settings model.
- Default and invalid persisted theme values resolve to `daily`.
- Persist the selected mode in the existing electron-store-backed `settings` object.
- Apply the theme with a renderer-level attribute such as `data-theme` on the app shell/root container.
- Move global colors to semantic CSS custom properties and override them per theme.
- Keep poster/media artwork unmodified.
- Use the demo palettes as the visual target:
  - Dark: `#0f1115`, `#171a20`, `#1d222a`, `#40c7a3`, `#86a8ff`
  - Daily: `#f3f5f7`, `#ffffff`, `#eef2f5`, `#1f8a70`, `#2f68c5`
  - Eye Protection: `#eef2e8`, `#f8f5eb`, `#fbf8ef`, `#4d7c3d`, `#8a6f31`

## Phase 1: Design Summary

Design artifacts:

- [data-model.md](./data-model.md) defines Theme Mode, Theme Preference, Theme Palette, and Theme Application State.
- [contracts/theme-ui-contracts.md](./contracts/theme-ui-contracts.md) documents settings selection, persistence, global application, visual palette, contrast/readability, media preservation, and no-interruption contracts.
- [quickstart.md](./quickstart.md) lists the implementation and verification path for maintainers.
- [demo.html](./demo.html) provides the standalone visual target requested by the user.

Post-design Constitution Check: PASS. The design stays scoped to global client theme presentation, uses existing settings/persistence contracts, preserves playback and navigation state, and leaves success criteria measurable through focused tests plus visual review.
