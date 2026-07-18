# Research: Automatic Development Bootstrap

## Decision 1: Use locked clean installation

**Decision**: Run `npm ci` only when the repository-local Vite CLI is absent.

**Rationale**: npm documents `npm ci` as a clean, frozen installation that requires a lockfile, fails when the manifest and lock disagree, and does not rewrite either file. This matches a reproducible fresh-clone bootstrap while the existence check avoids its destructive clean-install behavior during normal repeat startup. Source: [npm ci documentation](https://docs.npmjs.com/cli/commands/npm-ci/).

**Alternatives considered**: `npm install` may update the lock; unconditional `predev` adds work to every startup; guidance alone does not meet the approved one-command outcome.

## Decision 2: Spawn the package manager without a shell

**Decision**: Use the current Node executable with the npm CLI path supplied by `npm run` through `npm_execpath`, plus an explicit repository working directory, inherited standard streams, and no shell.

**Rationale**: Node documents separate command/argument fields, explicit `cwd`, `shell: false`, launch-error events, and completion events. These boundaries support paths with spaces and preserve npm output without shell interpolation. Source: [Node.js child process documentation](https://nodejs.org/api/child_process.html).

**Alternatives considered**: Command-string execution and shell mode add platform-dependent parsing; an absolute npm path recreates the machine-specific path problem.

## Decision 3: Test orchestration through dependency injection

**Decision**: Pass filesystem existence and process-launch functions into the bootstrap entry point, with production defaults supplied by Node built-ins.

**Rationale**: Tests can prove command selection, working directory, skipped installs, exit handling, and post-install validation without renaming `node_modules`, invoking the registry, or relying on workstation state.

**Alternatives considered**: Destructive end-to-end dependency removal is slow and unsafe; source-text assertions do not prove runtime behavior; narrow injection is clearer than global module mocking.
