# Contributing to Kizlo

Thanks for your interest in contributing! This guide covers how to set up the
project, the day-to-day workflow, and what we expect in a pull request.

## Code of Conduct

This project is governed by the Kizlo
[Code of Conduct](https://github.com/kizlo-io/.github/blob/main/CODE_OF_CONDUCT.md).
By participating, you are expected to uphold it.

## Prerequisites

- **Node** — `.nvmrc` pins Node 24 (`nvm use`); the minimum is 22.14
- **pnpm** — `corepack enable` provides the pinned version; the minimum is 9.6
- **Docker** — required to run the WordPress test stack

## Getting started

```bash
git clone https://github.com/kizlo-io/kizlo.git
cd kizlo
corepack enable             # provides the pinned pnpm version
pnpm install
cp .env.example .env        # fill in your values
```

## Repository layout

```
packages/   Published libraries (kizlo, @kizlo/*)
tooling/    Internal config: TypeScript bases, GitHub Actions, WordPress dev stack
```

This is a [Turborepo](https://turbo.build/) + pnpm workspace. Most commands run
from the repo root and fan out across packages.

## Common commands

```bash
pnpm build        # build all packages
pnpm dev          # watch + rebuild packages while developing
pnpm typecheck    # type-check the workspace
pnpm check        # lint + format check (Biome)
pnpm check:fix    # auto-fix lint + format issues
pnpm lint:ws      # check the workspace for dependency mismatches (Sherif)
pnpm test         # run the test suite (needs the WP stack, see below)
pnpm test:only    # run tests for one package, e.g. pnpm test:only @kizlo/woocommerce
pnpm test:watch   # run Vitest in watch mode
```

`pnpm test` needs the WP test stack seeded first (`pnpm kizlo test up`). Seeding
is an explicit lifecycle now, not part of the test run — `pnpm test` only reads
the credentials artifact (~1s). `pnpm lint:ws` also runs automatically on
`postinstall`.

## Local WordPress stacks

Both stacks ship inside the `kizlo` CLI and run on Docker — no Local/Valet setup
needed. They are independent: `kizlo dev` (port 8080) is a long-lived working
environment, and `kizlo test` (port 8889) is the seeded fixture stack the suites
run against.

### Dev stack — `kizlo dev`

`kizlo dev` keeps the whole WordPress install in `dev.path` (`wordpress/` here,
git-ignored) — bind-mounted into the container so you can browse and edit every
file live. Its `dev.plugins` `{ path }` entries also bind-mount this repo's plugins
into `wp-content/plugins`, and the bare slugs install the wp.org dependencies.
Build the plugin assets first, then bring it up:

```bash
pnpm install
pnpm build            # build the workspace incl. the CLI + plugin assets
pnpm kizlo dev up     # boot + provision (idempotent, never wipes); prints .env lines
pnpm kizlo dev stop   # pause (DB + plugins kept)
pnpm kizlo dev reset  # full wipe (down -v) + rebuild
```

`kizlo dev up` prints the URL, admin login, and the `.env` lines to paste
(`WORDPRESS_URL`/`USERNAME`/`APPLICATION_PASSWORD`).

### Test stack — `kizlo test`

The extension layers the test stack seeds are declared in the root
`kizlo.config.ts` (`test.fixtures`). Seeding is driven explicitly by the CLI —
`pnpm test` itself never boots or seeds. In this monorepo the CLI loads each
extension's seed from its built `dist`, so build once first (`pnpm build`); a
real consumer installs built packages and skips that step.

```bash
pnpm build            # build the workspace incl. the CLI + extensions (monorepo only)
pnpm kizlo test up    # boot the stack, then seed only if not already seeded (no-op when warm)
pnpm test             # run tests — just reads the credentials artifact
pnpm kizlo test stop  # pause the stack (non-destructive; DB + plugins kept)
pnpm kizlo test reset # full wipe (down -v) + reseed — the only command that re-downloads plugins
```

For a one-shot CI-style run, `pnpm kizlo test run` boots the stack, seeds it,
runs your `test` script, and leaves it up (`--teardown` to stop it after,
`--reset` for a fresh DB first). Bare `pnpm kizlo test` is shorthand for `run`.

The CLI writes a credentials artifact to `.kizlo/test-credentials.json`, anchored
to the directory containing `kizlo.config.ts`, so tests find it from any
sub-directory with no configuration.

## Code style

We use [Biome](https://biomejs.org/) for linting and formatting (config in
`biome.json`) — tabs for indentation, and the project conventions it enforces.
Run `pnpm check:fix` before committing. CI runs `biome ci .` and will fail on
any unformatted or lint-flagged code.

A few project conventions to be aware of:

- Match the surrounding code; keep JSDoc for *why*, not for restating *what*.
- WordPress REST types use the `WP_` prefix; WooCommerce admin API types use
  `WC_`, and the Store API uses `WCS_`.

## Changesets

We use [Changesets](https://github.com/changesets/changesets) to version and
publish the public packages. **If your change affects a published package, add a
changeset:**

```bash
pnpm changeset
```

Pick the affected packages and a semver bump (the project is currently in
`alpha` pre-release mode), and commit the generated file in `.changeset/`
alongside your changes. Releases to npm are automated from `main`.

Changes that only touch tooling, tests, or docs don't need a changeset.

## Commit messages & pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit
  subjects (e.g. `feat:`, `fix:`, `chore:`, `docs:`).
- Keep PRs focused; describe what changed and why.
- Make sure the following pass locally before opening a PR — they're the same
  checks CI runs:

  ```bash
  pnpm check
  pnpm typecheck
  pnpm build
  pnpm test
  ```

## Reporting bugs

Open an issue at https://github.com/kizlo-io/kizlo/issues with a clear
description and, where possible, a minimal reproduction.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](./LICENSE).
