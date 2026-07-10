# Research: Client Theme Modes

## Decision: Store a single shared theme mode value

Use a shared `ThemeMode` value with three valid modes: `dark`, `daily`, and `eye`.

**Rationale**: The feature is a global client preference, not a per-page preference. A single value keeps settings persistence, UI selection, and CSS application easy to test and reason about.

**Alternatives considered**:

- Separate booleans such as `darkModeEnabled` and `eyeProtectionEnabled`: rejected because mutually exclusive states become ambiguous.
- Free-form custom color values: rejected because the request only asks for three curated modes and custom palettes would expand scope.

## Decision: Default to Daily Mode

Daily Mode is the default for new installs and invalid/legacy persisted values.

**Rationale**: The specification identifies Daily Mode as the default and closest-to-current normal client tone. This also gives safe migration behavior for older settings files.

**Alternatives considered**:

- Default to Dark Mode: rejected because it changes the existing visual baseline too aggressively.
- Infer from OS theme: rejected for this feature because the user asked for an explicit in-app setting, and OS integration is not required.

## Decision: Persist in the existing settings object

Add the selected mode to the existing electron-store-backed `settings` object and merge it through the existing persistence pipeline.

**Rationale**: The app already persists settings through `window.embyDesktop.storage.write({ settings: ... })`, normalizes defaults in shared persistence helpers, and synchronizes settings through AuthContext. Reusing this path avoids a second store and keeps restart behavior consistent.

**Alternatives considered**:

- A separate `theme` storage key: rejected because it duplicates persistence mechanisms.
- Browser localStorage: rejected because the desktop app already has a typed persistence bridge.

## Decision: Apply theme through a global renderer attribute

Apply the selected mode as a global attribute such as `data-theme="daily"` on the app shell or root renderer container.

**Rationale**: A root attribute lets all CSS variables update immediately without remounting routes or reloading data. It also keeps the setting independent of individual feature components.

**Alternatives considered**:

- Per-component class names: rejected because it spreads theme logic across many components.
- Inline styles from React: rejected because the app already centralizes visual styling in `src/renderer/styles.css`.

## Decision: Use semantic CSS variables matching the HTML demo

Refactor global color usage toward semantic variables such as background, titlebar, sidebar, surface, text, muted text, accent, borders, and shadows. Define per-theme overrides using the colors from `demo.html`.

**Rationale**: The demo already captures the requested tone. Semantic variables let existing screens inherit the theme without rewriting every selector.

**Alternatives considered**:

- Hard-code separate CSS rules for every screen: rejected as brittle and hard to keep consistent.
- Keep the current dark-only palette and only theme the settings page: rejected because the requirement is whole-client tone.

## Decision: Do not recolor media artwork or playback video

Theme changes affect client chrome and UI surfaces only.

**Rationale**: Posters, backdrops, video playback, subtitles, and server-provided images are content. Recoloring them would alter media fidelity and could confuse users.

**Alternatives considered**:

- Apply global filters to all images: rejected because it would visibly distort media artwork.

## Decision: Validate with model, UI, route, CSS, and visual checks

Use focused Vitest coverage for defaults/migration, settings patch creation, settings UI selection, route persistence, AuthContext merging, and CSS theme contracts. Use `demo.html` plus running renderer review for visual judgment.

**Rationale**: jsdom cannot fully prove color appearance, but it can prove state and contract wiring. Visual artifacts cover the aesthetic comparison.

**Alternatives considered**:

- Only visual review: rejected because persistence and state synchronization need automated protection.
- Only unit tests: rejected because the feature is mainly visual and needs human review against the demo.
