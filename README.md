# Emby Player

Windows desktop Emby player built with Electron, React, TypeScript, and Vite.

## Development

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
```

## Build

```bash
npm run build
npm run dist
```

## Manual Verification

1. Start the app with `npm run dev`.
2. Enter a real Emby server URL and valid credentials.
3. Confirm libraries render after login.
4. Open a media item and start playback.
5. Seek forward, close the app, reopen it, and verify resume behavior.
6. Open Settings and confirm sign-out returns to the login page.
