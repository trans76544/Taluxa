# UI Contracts: Client Theme Modes

## Settings Selection Contract

- The settings page exposes one "client tone" setting in the general settings area.
- The setting presents exactly three mutually exclusive options: Dark Mode, Daily Mode, and Eye Protection Mode.
- The active option is visually selected and programmatically identifiable.
- Selecting another option calls the settings save flow with only the theme preference changed.
- The selected option updates immediately after the setting is saved in memory.

## Persistence Contract

- The selected theme is written to the existing persisted settings object.
- New installs default to Daily Mode.
- Missing, invalid, or legacy theme values resolve to Daily Mode.
- Restarting the client restores the previously saved valid theme.
- Theme persistence does not alter unrelated settings such as proxy, playback, subtitles, danmaku, cache, account selection, or server display names.

## Global Application Contract

- The active theme is represented by a renderer-level theme attribute or equivalent global state.
- All main renderer surfaces consume theme variables from that global state:
  - app shell
  - title bar
  - account sidebar
  - theme-aware Taluxa sidebar brand mark
  - settings page
  - library grids and rows
  - detail pages
  - detail-page hero overlays and media selectors
  - sign-in and add-server surfaces
  - server-management dialogs
  - dialogs
  - buttons, inputs, selects, switches, ranges, and alerts
  - loading, empty, and error states
- Switching themes does not navigate away from the current route.
- Switching themes does not restart playback, clear prepared playback state, reload media details, or refetch poster artwork.

## Visual Palette Contract

The production theme palettes follow the standalone demo's direction.

### Dark Mode

- Low-brightness base: `#0f1115`
- Titlebar/sidebar/surface family: `#171a20`, `#15191f`, `#1d222a`, `#242a33`
- Accent family: `#40c7a3`, `#86a8ff`
- Text family: `#f4f7fb`, `#bac4ce`, `#8d99a6`

### Daily Mode

- Balanced light base: `#f3f5f7`
- Titlebar/sidebar/surface family: `#ffffff`, `#eef2f5`, `#f7f9fb`
- Accent family: `#1f8a70`, `#2f68c5`
- Text family: `#17202a`, `#5d6b78`, `#7a8793`

### Eye Protection Mode

- Warm soft base: `#eef2e8`
- Titlebar/sidebar/surface family: `#f8f5eb`, `#e7eddf`, `#fbf8ef`, `#f1eddc`
- Accent family: `#4d7c3d`, `#8a6f31`
- Text family: `#28321f`, `#667157`, `#818973`

## Readability Contract

- Primary text, selected options, primary actions, destructive actions, disabled states, focus states, and inline errors are readable in all three themes.
- Long Chinese and English labels keep existing overflow behavior and do not overlap controls.
- Buttons and settings rows keep stable dimensions when switching themes.
- Focus indicators remain visible in every theme.
- Login/sign-in forms, add-server dialogs, and server-editing dialogs must not retain fixed dark panel or input backgrounds in Daily Mode or Eye Protection Mode.
- The detail-page hero may use theme-specific overlays to keep title, metadata, overview, and media selector text readable.
- The account sidebar brand mark must be rendered with theme-controlled surface, text, and accent colors rather than a fixed black-background bitmap.

## Media Fidelity Contract

- Theme styles do not globally filter, tint, or recolor poster images, backdrop images, or video playback.
- Theme colors may affect chrome around media content, metadata panels, selectors, and controls.
- Theme colors may affect the readability overlay above detail-page backdrop images, but the original backdrop image content remains unmodified.
- Static client branding may be replaced by theme-aware vector or styled markup when a fixed bitmap would conflict with the active theme.

## Demo Contract

- `specs/012-client-theme-modes/demo.html` remains the visual reference for the three requested effects.
- The demo must remain directly openable in a browser.
- The demo must include controls for Dark Mode, Daily Mode, and Eye Protection Mode.
