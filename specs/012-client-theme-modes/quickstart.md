# Quickstart: Client Theme Modes

## Implementation Path

1. Add `ThemeMode` to `src/shared/models/settings.ts` with valid values `dark`, `daily`, and `eye`.
2. Add `themeMode: 'daily'` to `createDefaultSettings`.
3. Update settings merge/migration code so missing or invalid theme values resolve to `daily`.
4. Add a settings action helper for creating a theme mode settings patch.
5. Pass the active theme and save handler from `SettingsRoute` into `SettingsPage`.
6. Add a settings row/control for Dark Mode, Daily Mode, and Eye Protection Mode.
7. Add a theme settings icon entry if the settings row icon contract still expects one icon per visible row.
8. Apply the current theme to the renderer shell/root through a stable global attribute.
9. Refactor `src/renderer/styles.css` colors into semantic variables and add per-theme overrides matching `demo.html`.
10. Keep media artwork and video content unfiltered.

## Focused Tests

Run targeted tests while implementing:

```powershell
npm test -- src/shared/store/persistence.test.ts src/renderer/features/auth/AuthContext.test.tsx src/renderer/features/settings/settingsActions.test.ts src/renderer/features/settings/SettingsPage.test.tsx src/renderer/app/App.test.tsx
```

Expected coverage:

- Defaults include Daily Mode.
- Missing and invalid persisted theme values normalize to Daily Mode.
- Theme settings patch preserves unrelated settings.
- Settings page renders exactly three theme options and saves the selected value.
- Route layer persists the selected theme and updates AuthContext.
- App shell exposes the selected theme for CSS.
- CSS defines Dark, Daily, and Eye Protection token overrides.

## Full Verification

```powershell
npm test
npm run build
```

## Visual Review

Open:

```text
specs/012-client-theme-modes/demo.html
```

Then compare the running app against the demo:

- Dark Mode should be low-brightness with teal/blue accents.
- Daily Mode should be balanced light with teal/blue accents.
- Eye Protection Mode should be warm and soft with green/gold accents.
- Settings, sidebar, titlebar, library views, detail views, dialogs, and common controls should all change tone together.
- Poster artwork and playback content should keep original colors.

## Final Visual Notes

- Production theme token values match `demo.html` for Dark, Daily, and Eye Protection modes.
- No palette deviations were introduced during implementation.
- Theme rules do not add global filters to poster artwork, backdrops, images, or video.

## Out of Scope

- OS theme auto-detection.
- User-defined custom colors.
- Per-server or per-account themes.
- Recoloring artwork, video, or subtitles.
