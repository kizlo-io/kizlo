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

`pnpm test` and `pnpm test:only` need the WordPress stack running first — see
below. `pnpm lint:ws` also runs automatically on `postinstall`.

## WordPress test stack

The test suite runs against a local WordPress + WooCommerce stack via Docker.

```bash
cp tooling/wp/.env.example tooling/wp/.env
pnpm wp:up        # boot WordPress and wait for it to be ready
pnpm wp:seed      # seed fixtures (users, products, …)
pnpm test         # run tests
pnpm wp:down      # tear the stack down
pnpm wp:reset     # down (with volumes) + up + seed, from scratch
```

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
