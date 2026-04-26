# Taluxa

Taluxa is a Windows desktop Emby client built with Electron, React, TypeScript, Vite, and bundled mpv playback.

It focuses on a quiet desktop media experience: saved Emby accounts, a poster-first home screen, fast library browsing, global search, detailed item pages, and external mpv playback with resume/progress sync.

## Features

- Windows desktop app powered by Electron and Vite
- Bundled mpv runtime for external playback without a separate player install
- Custom frameless title bar with back navigation, global search, and window controls
- Automatic development port selection to avoid Vite port conflicts
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

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

The dev script automatically chooses an available local port and starts Vite on `127.0.0.1`.

## Scripts

```bash
npm run dev
```

Starts Vite through the automatic port picker.

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
