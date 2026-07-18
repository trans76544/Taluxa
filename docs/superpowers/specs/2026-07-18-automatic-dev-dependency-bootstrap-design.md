# Automatic Development Dependency Bootstrap Design

## Goal

Allow a freshly cloned Taluxa repository to start with `npm run dev` even when
`node_modules` has not been installed yet. Existing installations must continue
to start without running npm again.

## Scope

This change applies only to the development startup command. Build, test, and
distribution commands keep their current dependency requirements. The bootstrap
does not update already-installed dependencies or repair arbitrary dependency
corruption.

## Startup Flow

`scripts/dev.mjs` checks whether the local Vite CLI exists at
`node_modules/vite/bin/vite.js` before selecting a development port.

- When the Vite CLI exists, startup follows the current path immediately.
- When the Vite CLI is absent and `package-lock.json` exists, the script runs
  `npm ci` in the repository root and inherits the terminal's standard streams.
- The child command is the current Node executable with the npm CLI path supplied by `npm run` through `npm_execpath`; this avoids invoking Windows `.cmd` shims without a shell.
- When installation exits successfully, the script verifies that the Vite CLI
  now exists and then continues with port selection and Vite startup.
- When installation cannot be started, exits unsuccessfully, or completes
  without installing Vite, startup stops with a concise actionable error.

The bootstrap invokes npm as a child process without a shell. This preserves
argument boundaries and avoids embedding machine-specific paths.

## Components

Dependency detection and installation orchestration live in a small module under
`scripts/`. The module accepts injected filesystem and process-launch functions
so its behavior can be tested without deleting dependencies or reaching the npm
registry. `scripts/dev.mjs` supplies the real implementations and remains
responsible for port selection and launching Vite.

## Error Handling

npm output is shown directly to the developer. A failed install returns a
non-zero development command exit code, and Vite is not launched. The script
does not fall back from `npm ci` to `npm install`, because silently changing the
lockfile would make fresh-clone behavior nondeterministic.

## Testing

A Node-based check script covers:

1. An existing Vite CLI skips installation.
2. A missing Vite CLI runs `npm ci` with the repository as its working directory.
3. A successful install continues only when the Vite CLI becomes available.
4. Spawn errors and non-zero npm exits reject startup.
5. Windows and non-Windows npm executable selection is deterministic.

The existing port-selection check remains unchanged. Final verification runs the
new focused check, the existing development-port check, and the TypeScript build.

## Documentation

README's Getting Started section states that `npm run dev` automatically installs
locked development dependencies on the first run. It also retains `npm ci` as an
explicit setup option for developers who prefer a separate installation step.
