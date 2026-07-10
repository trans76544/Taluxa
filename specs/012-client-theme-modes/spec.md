# Feature Specification: Client Theme Modes

**Feature Branch**: `012-client-theme-modes`

**Created**: 2026-07-09

**Status**: Updated after implementation feedback

**Input**: User description: "帮我在设置界面加一个设置功能用于改变整个客户端的色调，包括暗黑模式、日常模式、护眼模式。使用html展示对应的效果。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Switch Client Theme From Settings (Priority: P1)

As a desktop client user, I want to choose the overall client color tone from the settings screen so that the app matches my viewing environment and comfort needs.

**Why this priority**: Theme selection is the core value of the feature; without it, users cannot change the client tone.

**Independent Test**: Can be fully tested by opening settings, selecting each available mode, and confirming the client appearance changes consistently.

**Acceptance Scenarios**:

1. **Given** the user is on the settings screen, **When** they select Dark Mode, **Then** the entire client uses a low-brightness dark tone suitable for dim environments.
2. **Given** the user is on the settings screen, **When** they select Daily Mode, **Then** the entire client uses the standard balanced tone for normal use.
3. **Given** the user is on the settings screen, **When** they select Eye Protection Mode, **Then** the entire client uses a softer, warmer tone intended to reduce visual strain.
4. **Given** the user changes the selected mode, **When** they navigate to other main client screens, **Then** the selected tone remains visually consistent across the client.
5. **Given** the user is using Daily Mode or Eye Protection Mode, **When** they open settings, add another server, or view the sign-in form, **Then** those surfaces use light or warm themed backgrounds instead of fixed dark panels.
6. **Given** the user is viewing a media detail page, **When** the active theme changes, **Then** the detail backdrop overlay, metadata body, media selectors, and related controls shift to the selected theme while keeping the artwork recognizable.
7. **Given** the user is viewing the account sidebar, **When** the active theme changes, **Then** the Taluxa brand mark, sidebar buttons, server list, and navigation text use the selected theme colors instead of fixed bitmap or hardcoded dark colors.

---

### User Story 2 - Preserve Theme Choice Across Sessions (Priority: P2)

As a returning user, I want the client to remember my selected color tone so that I do not need to reapply it every time I open the app.

**Why this priority**: Persistence makes the setting feel dependable and prevents repeated setup.

**Independent Test**: Can be tested by selecting a mode, closing and reopening the client, and confirming the same mode remains active.

**Acceptance Scenarios**:

1. **Given** a user has selected Eye Protection Mode, **When** the client is restarted, **Then** Eye Protection Mode is still selected and applied.
2. **Given** no mode has previously been selected, **When** the user opens the client, **Then** Daily Mode is used as the default tone.

---

### User Story 3 - Review Theme Effects Visually (Priority: P3)

As a maintainer or reviewer, I want a standalone visual demonstration of the three theme effects so that the intended differences can be reviewed before or during implementation.

**Why this priority**: A visual demo reduces ambiguity in color direction, but it does not block the core in-app setting.

**Independent Test**: Can be tested by opening the review artifact and comparing the Dark, Daily, and Eye Protection presentations.

**Acceptance Scenarios**:

1. **Given** the reviewer opens the visual demonstration, **When** they switch between the three modes, **Then** the page clearly shows the expected global tone change for each mode.
2. **Given** the reviewer compares the three modes, **When** they inspect common UI areas, **Then** text, surfaces, buttons, and selected states remain readable in every mode.

### Edge Cases

- If the stored theme value is missing, invalid, or from an older version, the client falls back to Daily Mode.
- If theme selection occurs while media details or settings content is visible, the view updates without losing the user's current page or selection.
- Long Chinese and English labels remain readable in all modes.
- Disabled, focused, selected, hover, and active states remain distinguishable in all modes.
- Media artwork and poster imagery keep their original colors; the theme changes the client chrome and UI surfaces rather than recoloring content artwork.
- Detail-page backdrop artwork keeps the original media image, but the readability overlay and surrounding hero controls are allowed to use theme-specific scrims and text colors.
- Static app chrome imagery, such as the Taluxa sidebar brand mark, must be implemented or presented in a way that can follow theme colors; it must not remain a fixed black-background bitmap in light themes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The settings screen MUST provide a theme setting with exactly three user-facing options: Dark Mode, Daily Mode, and Eye Protection Mode.
- **FR-002**: Users MUST be able to change the selected theme from the settings screen without restarting the client.
- **FR-003**: The selected theme MUST apply to the overall client interface, including app shell, title bar, account sidebar, navigation, settings, library views, detail views, lists, controls, dialogs, and common empty/loading/error states.
- **FR-004**: The selected theme MUST remain active when the user navigates between client screens.
- **FR-005**: The selected theme MUST be remembered across client restarts.
- **FR-006**: Daily Mode MUST be the default when the user has not selected a theme or when the saved value cannot be used.
- **FR-007**: Each mode MUST have a visually distinct tone: Dark Mode for low-light use, Daily Mode for balanced everyday use, and Eye Protection Mode for warmer, softer viewing.
- **FR-008**: All three modes MUST preserve readable contrast for primary text, secondary text, controls, status labels, and important actions.
- **FR-009**: Theme changes MUST NOT interrupt playback state, navigation state, selected server/account state, or currently viewed media item.
- **FR-010**: A standalone visual demonstration artifact MUST show the expected appearance of the three theme modes for review.
- **FR-011**: Settings rows, settings form controls, segmented controls, switches, selects, text inputs, textareas, and action buttons MUST use theme variables for backgrounds, borders, and text in all three modes.
- **FR-012**: The add-server flow and sign-in panel MUST use the active theme for dialog backdrops, panel backgrounds, form backgrounds, inputs, password toggle controls, and primary actions.
- **FR-013**: Server-management dialogs, including server display-name editing, MUST use the active theme for overlay, panel, input, button, helper text, and action styling.
- **FR-014**: Media detail pages MUST use the active theme for the page background, detail body text, carousel captions, metadata blocks, media source panels, and detail hero overlay/tint.
- **FR-015**: The account sidebar brand mark MUST be theme-aware. Its background, text, and icon accent MUST follow the active theme and MUST NOT display a fixed black rectangular bitmap background in Daily Mode or Eye Protection Mode.
- **FR-016**: Theme styles MUST NOT globally recolor poster art, library artwork, video playback, or server-provided media images. Only client chrome, overlays, text, controls, and theme-aware branding may change color.

### Key Entities

- **Theme Mode**: The user's selected global client tone. Valid values are Dark Mode, Daily Mode, and Eye Protection Mode.
- **Theme Preference**: The persisted user preference that records the selected Theme Mode and is used when the client starts.
- **Theme Preview**: A reviewable visual representation of the three modes across representative UI surfaces.
- **Theme-Aware Brand Mark**: The Taluxa sidebar brand presentation rendered with theme variables so that its background, text, and accent color follow the selected mode.
- **Themed Dialog Surface**: Any modal or overlay surface, including add-server and server-editing dialogs, whose backdrop, panel, input, and action styles consume the active theme variables.
- **Detail Hero Overlay**: The theme-specific readability layer used over detail-page backdrop artwork. It may tint the overlay and text but must not mutate the underlying media image.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can switch from any theme mode to another from settings in under 10 seconds.
- **SC-002**: 100% of the three required modes are available, selectable, and visually distinguishable.
- **SC-003**: After restart, the previously selected mode is restored in 100% of normal launches.
- **SC-004**: Common client screens remain usable with no unreadable primary controls or primary text in all three modes.
- **SC-005**: Theme switching completes without changing the user's current page, selected media item, or playback state in 100% of tested flows.
- **SC-006**: Reviewers can compare all three requested theme effects from the visual demonstration without launching the full client.
- **SC-007**: Settings, add-server/sign-in, server-editing, home/library, and detail-page surfaces show no fixed dark backgrounds in Daily Mode or Eye Protection Mode except where required by media artwork itself.
- **SC-008**: The sidebar Taluxa brand mark visibly adapts in all three modes, with the icon using the active accent color and the surrounding mark using the active surface/text colors.

## Assumptions

- Theme selection is a per-client preference for the current desktop app installation.
- Daily Mode is the current or closest-to-current default visual tone.
- Eye Protection Mode should use a warmer and softer palette, but it is not a medical accessibility feature.
- The requested HTML presentation is a visual review/demo artifact, not a requirement that the production client implement themes using standalone HTML.
- This feature changes global client UI tone only; it does not alter poster artwork, video playback color, subtitles, or server-provided media images.
- Theme-aware branding can replace a static bitmap logo when the bitmap prevents the selected theme from applying cleanly.
