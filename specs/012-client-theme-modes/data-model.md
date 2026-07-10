# Data Model: Client Theme Modes

## Theme Mode

Represents the selected global client tone.

**Fields**

- `value`: One of `dark`, `daily`, or `eye`.
- `label`: User-facing label shown in settings.
- `description`: Short settings description for the use case.

**Validation Rules**

- Only the three known values are valid.
- Unknown, missing, null, or legacy values normalize to `daily`.
- The selected mode is mutually exclusive; exactly one mode is active.

**State Transitions**

```text
daily -> dark
daily -> eye
dark -> daily
dark -> eye
eye -> daily
eye -> dark
invalid/missing -> daily
```

## Theme Preference

Represents the persisted user preference in the shared settings object.

**Fields**

- `themeMode`: The selected Theme Mode.

**Relationships**

- Belongs to `Settings`.
- Is written through the existing renderer storage bridge.
- Is merged into renderer state through the existing AuthContext settings flow.

**Validation Rules**

- Defaults to `daily` in `createDefaultSettings`.
- Merges safely with existing settings patches.
- Invalid persisted values are ignored or normalized to `daily` during persistence migration/merge.

## Theme Palette

Represents semantic color tokens used by the renderer.

**Fields**

- `appBackground`
- `titlebarBackground`
- `sidebarBackground`
- `surfaceBackground`
- `secondarySurfaceBackground`
- `borderColor`
- `strongBorderColor`
- `primaryText`
- `secondaryText`
- `softText`
- `accent`
- `secondaryAccent`
- `accentText`
- `shadow`

**Validation Rules**

- Each mode must define all semantic tokens needed by shared UI.
- Primary text, controls, selected states, and status labels remain readable.
- Palettes follow the `demo.html` color direction.

## Theme Application State

Represents the active theme currently applied to the renderer.

**Fields**

- `activeThemeMode`: The normalized Theme Mode from settings.
- `rootThemeAttribute`: The value exposed to CSS, such as `data-theme`.

**Relationships**

- Derived from AuthContext settings.
- Consumed by `src/renderer/styles.css`.
- Applies to settings, app shell, library views, detail views, dialogs, loading states, and error states.

**Validation Rules**

- Updates immediately when settings change.
- Does not reset the current route, selected item, account, playback launch, or media browsing state.
- Does not apply filters to poster artwork, backdrop artwork, or video playback content.
