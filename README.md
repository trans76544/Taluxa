# Taluxa

Taluxa is a Windows desktop Emby client built with Electron, React, TypeScript, Vite, and bundled mpv playback.

It focuses on a quiet desktop media experience: saved Emby accounts, a poster-first home screen, fast library browsing, global search, detailed item pages, and external mpv playback with resume/progress sync.

## Features

- Windows desktop app powered by Electron and Vite
- Bundled mpv runtime for external playback without a separate player install
- Custom frameless title bar with back navigation, global search, and window controls
- Automatic development dependency setup and port selection
- Multiple saved Emby accounts with sidebar switching
- Server display names and account-aware settings
- Home screen with continue watching, media libraries, and featured rows
- Library and search results with poster fallback handling
- Item details pages with backdrop hero art, metadata, cast, seasons, episodes, similar items, and media stream details
- Version and audio-track selectors for movies with multiple media sources or audio streams
- Playback handoff to mpv while keeping the item details page visible
- Resume lookup and progress reporting through the desktop bridge
- Proxy settings for Windows system proxy, direct connection, or a custom proxy URL

## Tech Stack

- Electron
- React
- TypeScript
- Vite
- Vitest
- mpv

## Getting Started

After cloning the repository, start development directly:

```bash
npm run dev
```

On the first run, the development script detects a missing local Vite installation and automatically runs `npm ci` using the committed lockfile. After installation it starts Vite on an available `127.0.0.1` port. Later runs skip dependency installation when Vite is already available.

To install dependencies explicitly before startup instead, run:

```bash
npm ci
npm run dev
```

If an existing dependency installation is incomplete or damaged, remove `node_modules`, run `npm ci`, and then retry the development command.

## Scripts

```bash
npm run dev
```

Installs locked dependencies when required, then starts Vite through the automatic port picker.

```bash
npm run test:dev-bootstrap
```

Checks automatic development dependency setup, skip behavior, and failure handling without changing the real installation.

```bash
npm test
```

Runs the Vitest suite.

```bash
npm run build
```

Runs TypeScript checking and builds the renderer, Electron main process, and preload script.

```bash
npm run dist
```

Builds the app and creates a Windows installer with electron-builder.

## Project Structure

```text
src/electron/          Electron main process, preload bridge, storage, proxy, and mpv integration
src/renderer/          React application, routes, pages, components, and styles
src/shared/            Emby API clients, shared models, persistence helpers, and utilities
scripts/               Development helper scripts
sources/               App icons and logo assets
vendor/mpv/windows-x64 Bundled Windows mpv runtime
```

## Manual Verification

1. Run `npm run dev`.
2. Sign into an Emby server.
3. Confirm the home screen loads continue watching, libraries, and featured rows.
4. Use the title-bar search to find a movie or series.
5. Open a library item and confirm the details page loads metadata and artwork.
6. For a movie with multiple versions or audio tracks, select a version and audio option before playback.
7. Click play and confirm mpv opens while the details page remains visible in Taluxa.
8. Close playback, restart the app, and confirm resume progress is preserved.
9. Open Settings and confirm account, server name, proxy, and sign-out controls work.
10. Restart the app and confirm saved accounts are restored.

## Notes

- The app is designed for Windows.
- Playback is delegated to bundled mpv.
- Emby requests and poster artwork respect the configured proxy mode.
