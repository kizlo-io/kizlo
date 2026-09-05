# Contributing to Kizlo

Thanks for your interest in contributing! This guide covers how to set up the
project, the day-to-day workflow, and what we expect in a pull request.

## Scope

This guide governs the whole monorepo. Unless a command says otherwise, run it
from the repository root, where the Turborepo scripts fan out across every
package. If a subdirectory ever gains its own `CONTRIBUTING.md` or `AGENTS.md`,
that nested guide wins inside its own subtree, and this one still covers whatever
the nested guide leaves unsaid.

## Code of Conduct

This project is governed by the Kizlo
[Code of Conduct](https://github.com/kizlo-io/.github/blob/main/CODE_OF_CONDUCT.md).
By participating, you are expected to uphold it.

## Prerequisites

- **Node** — `.nvmrc` pins Node 24 (`nvm use`); the minimum is 22.14
- **pnpm** — `corepack enable` provides the pinned version; the minimum is 9.6
- **Docker** — required to run the WordPress test stack
- **PHP and Composer** are needed only for plugin work (`plugins/*`). With
  Composer on your `PATH`, `pnpm install` installs each plugin's dev
  dependencies (including `vendor/bin/phpunit`); without it, the plugin PHP
  suites are skipped

## Getting started

```bash
git clone https://github.com/kizlo-io/kizlo.git
cd kizlo
corepack enable             # provides the pinned pnpm version
pnpm install
```

No env is needed to build the packages or run the `kizlo dev` / `kizlo test`
stacks. What reads env is the apps: `web/` (a live Kizlo server) and the
templates, when you build or run one.

They all read **the root `.env`, and only that one**. Each app has a `withEnv`
script that loads it through `dotenv-cli`, and its `build`, dev and `start`
scripts run through that, so the WordPress connection is written once and
`pnpm kizlo dev` keeps it current. Don't add a `.env` under `web/` or a
template — nothing reads it, and a stale copy is how the connection silently
drifts. The per-framework API URLs (`NEXT_PUBLIC_`, `PUBLIC_`, `VITE_`) live in
that same file; the names differ, so they don't collide.

```bash
cp web/.env.example .env   # then fill in the values, or let `kizlo dev` write them
```

Each template keeps its own complete `.env.example`, because that file is what a
scaffolded project starts from and a standalone project has no root to read.

CI doesn't build `web/` — the deployed site is built by Vercel on every PR.

## Repository layout

```
packages/   Published libraries (kizlo, @kizlo/*)
plugins/    WordPress plugins (kizlo, kizlo-cf7, kizlo-woocommerce) — released by tag, not npm
tooling/    Internal config: TypeScript bases, GitHub Actions, WordPress dev stack
web/        The kizlo.io site (a live Kizlo server; deployed by Vercel, not published)
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

Run `pnpm kizlo test` for the complete test workflow. It starts and seeds the
WordPress test stack when needed, runs the JavaScript and plugin PHPUnit suites,
and leaves the stack running. After that, `pnpm test` provides a fast JavaScript
test rerun using the credentials in `.kizlo/test-credentials.json`. `pnpm lint:ws`
also runs automatically on `postinstall`.

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
Build the plugin assets first, then start it:

```bash
pnpm install
pnpm build            # build the workspace incl. the CLI + plugin assets
pnpm kizlo dev        # start + provision WordPress, update .env, run the contract watcher (foreground)
pnpm kizlo dev stop   # pause (DB + plugins kept)
pnpm kizlo dev reset  # wipe DB + install; the next `kizlo dev` rebuilds fresh
```

`kizlo dev` prints the URL, admin login, and the `.env` lines to paste
(`KIZLO_LOCAL_WP_URL`/`USERNAME`/`APP_PASSWORD`), then stays in the foreground
running the contract watcher. Run `stop` or `reset` from another terminal.

### Test stack — `kizlo test`

The extension layers the test stack seeds are declared in the root
`kizlo.config.ts` (`test.fixtures`). Seeding is driven explicitly by the CLI —
`pnpm test` itself never boots or seeds. In this monorepo the CLI loads each
extension's seed from its built `dist`, so build once first (`pnpm build`); a
real consumer installs built packages and skips that step.

```bash
pnpm build                  # build the workspace, CLI, plugins, and extensions
pnpm kizlo test             # boot and seed WordPress, run JS and PHPUnit tests, leave the stack running
pnpm test                   # fast JS test rerun against the already-seeded stack
pnpm kizlo test --teardown  # run the full suite, then stop the stack
pnpm kizlo test --reset     # wipe and reseed before running the full suite
pnpm kizlo test stop        # stop the stack while preserving its database
pnpm kizlo test reset       # wipe the database and bring up a freshly seeded stack
```

Bare `pnpm kizlo test` is the full test workflow: it starts WordPress when
needed, seeds it when needed, runs the project's test script followed by plugin
PHPUnit tests, and leaves the stack running for fast reruns. Once the stack is
seeded, `pnpm test` can rerun the JavaScript test suite using
`.kizlo/test-credentials.json` without managing the stack.

The credentials artifact is anchored to the directory containing `kizlo.config.ts`,
so tests find it from any sub-directory with no configuration.

The PHPUnit layer runs inside the container for every bind-mounted plugin that
ships a `phpunit.xml`/`.dist` (today `kizlo` and `kizlo-woocommerce`), against an
isolated `wordpress_test` database that never touches the served WordPress data.
Docker has to be running, and each plugin's Composer dev dependencies have to be
installed so `vendor/bin/phpunit` exists (`pnpm install` does this when Composer
is on your `PATH`; a plugin missing it is skipped with a warning).

## Regenerating the WordPress contract

Two generated files are committed, one at the repository root and one under
`web/`:

```
introspection.ts
web/src/lib/kizlo/server/generated/introspection.ts
```

Both are **derived artifacts**: the typed WordPress contract produced from
whatever the seeded test stack serves. Never hand-edit them. Regenerate them
whenever you change what the contract exposes, such as a plugin's Store API or
REST schema, the introspection fixtures in `kizlo.config.ts`, or the pinned
plugin versions those fixtures install. The `templates/*` copies are intentional
empty stubs and stay out of this; leave them as they are.

Regenerate and verify both copies against the seeded stack:

```bash
pnpm build                                          # rebuild packages incl. the CLI + plugin assets
pnpm kizlo test                                     # boot, seed, run the suite; leaves WordPress running
pnpm kizlo generate --test                          # rewrite the root introspection.ts
pnpm kizlo generate --test --dir web/src/lib/kizlo  # rewrite the web copy
pnpm kizlo check --test                             # confirm the root copy is current
pnpm kizlo check --test --dir web/src/lib/kizlo     # confirm the web copy is current
pnpm kizlo test stop                                # stop the stack
```

`--test` points the generator at the WordPress that `pnpm kizlo test` left
running. `kizlo check` never writes: it regenerates in memory, diffs against the
committed file, and exits non-zero when a copy is stale, printing the exact
`kizlo generate` command to run. CI runs that check on the web copy, so a stale
file fails the build. Commit the regenerated files alongside the change that
moved the contract.

## Code style

We use [Biome](https://biomejs.org/) for linting and formatting (config in
`biome.json`) — tabs for indentation, and the project conventions it enforces.
Run `pnpm check:fix` before committing. CI runs `biome ci .` and will fail on
any unformatted or lint-flagged code.

A few project conventions to be aware of:

- Match the surrounding code; keep JSDoc for *why*, not for restating *what*.
- WordPress REST types use the `WP_` prefix; WooCommerce admin API types use
  `WC_`, and the Store API uses `WCS_`.

## Changelogs & versioning

Two release tracks live in this repo, and they use **different** changelog
tools. Pick by what you changed:

| You changed…                        | Use            | Released by            |
| ----------------------------------- | -------------- | ---------------------- |
| A published package (`packages/*`)  | Changesets     | npm, automated from `main` |
| A WordPress plugin (`plugins/*`)    | changelogger   | GitHub release, by pushing a `<plugin>-v<version>` tag |

Changes that only touch tooling, tests, docs, or `web/` don't need either.

### Published packages → Changesets

We use [Changesets](https://github.com/changesets/changesets) for the public
npm packages. **If your change affects a published package, add a changeset:**

```bash
pnpm changeset
```

Pick the affected packages and a standard 0.x semver bump, then commit the
generated file in `.changeset/` alongside your changes.

Give the changeset **one line**: a single imperative sentence describing the
user-visible effect. No essays, no internals, no bullet lists.

> Changesets **ignores** `web`, `@kizlo/plugin-*`, and `@tooling/*` (see
> `.changeset/config.json`). Adding a changeset for a plugin does nothing — use
> changelogger below.

### WordPress plugins → changelogger

The plugins are versioned with
[jetpack-changelogger](https://github.com/Automattic/jetpack-changelogger)
(configured under `extra.changelogger` in each plugin's `composer.json`), **not**
Changesets. **If your change affects a plugin, add a change fragment from that
plugin's directory:**

```bash
cd plugins/kizlo            # or plugins/kizlo-cf7, plugins/kizlo-woocommerce
composer changelog add     # prompts for significance (patch/minor/major), type, and entry
```

To write the fragment in one shot, call the binary directly. The `composer`
wrapper prompts even with `--no-interaction`:

```bash
vendor/bin/changelogger add -f <slug> -s <significance> -t <type> -e "<entry>" -n
```

`-s` takes `patch`, `minor`, or `major`; `-t` takes `added`, `changed`,
`deprecated`, `removed`, `fixed`, or `security`.

This writes a small file to `plugins/<plugin>/changelog/`. Commit it with your
change. **Do not hand-edit `CHANGELOG.md`** — it's generated from these fragments
at release time, when the fragments are compiled and the version is bumped across
the plugin's `kizlo.php` header, `KIZLO_VERSION` define, `readme.txt`, and
`package.json` (kept in sync by `scripts/check-versions.mjs`). Releasing is
triggered by pushing a `<plugin>-v<version>` tag (see `.github/workflows/plugin-release.yml`).

## Branch names

```
<type>/<short-slug>
```

The type is the same Conventional Commit type the PR title will use. Keep the
slug to three or four lowercase hyphenated words naming the change, not the
symptom:

```
fix/derive-list-parameters
feat/managed-custom-content
```

Maintainers working from a tracked issue insert the issue number after the type,
which is what links the branch back to the tracker:

```
fix/kiz-70-derive-list-parameters
```

Cut every branch from a clean tree and a freshly pulled `main`
(`git status` clean, then `git checkout main && git pull`). Branching on top of
uncommitted work or a stale `main` is what produces avoidable conflicts later.

Never commit directly to `main`.

### Worktrees for tracked-issue automation

Working by hand in a clean primary checkout is fine. Automation running a tracked
issue instead cuts an isolated worktree at `.worktrees/<issue-key>` from current
`origin/main`, so the primary checkout and any unrelated local changes stay
untouched:

```bash
git fetch origin main
git worktree add -b <type>/<issue-key>-<slug> .worktrees/<issue-key> origin/main
```

`pnpm worktree:sweep` prunes merged or stale worktrees under `.worktrees/`
(pass `--dry-run` to preview). Never nest one worktree inside another, and never
reuse one issue's worktree for a different issue.

## Commit messages & pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit
  subjects (e.g. `feat:`, `fix:`, `chore:`, `docs:`).
- Scope names are **singular** and follow the code: `kizlo`, `shared`,
  `woocommerce`, `cf7` for `packages/*`; `plugin` for any `plugins/*`;
  `template` for `templates/`; `web` for `web/`; `ci` for workflows. Omit the
  scope rather than inventing a new one. History contains `plugins`,
  `templates`, and `cli`; those are drift, not the convention.
- The PR title must match the commit subject.
  `.github/workflows/lint-pr.yml` validates it and fails the PR otherwise.
- Keep PRs focused; describe what changed and why.
- Write the PR body under these headings, in order: **Why** (the problem or
  motivation), **What changed** (the resulting behaviour and the shape of the
  approach), **Notes** (deliberate scope calls, trade-offs, or risks), and
  **Verified** (the checks you ran and their result, including anything skipped
  or not applicable). Keep each section to a few lines and drop any that would
  be empty.
- When a change alters a public API or user-visible behavior, update the
  relevant documentation or examples in the same PR. If neither applies, say so
  in **Notes** and why.
- Keep the description current as the diff and checks evolve. **Verified** must
  match the checks that actually ran and their latest result, and the other
  sections must still describe the PR as it now stands.
- Reference an issue with `Closes #123` only when a GitHub issue actually
  exists. Otherwise leave the issue line out.
- Make sure the following pass locally before opening a PR — they're the same
  checks CI runs:

  ```bash
  pnpm check
  pnpm typecheck
  pnpm build
  pnpm test
  ```
- Open every pull request as a **draft**, and keep it not review-ready until the
  checks above pass and the maintainer explicitly says to mark it ready. Feedback
  on a draft is not that sign-off.
- Resolve a review thread only once its concern is actually addressed or
  answered, not to clear the list.
- Maintainers merge. After review approval a maintainer squash-merges the pull
  request; the single-commit rule below is what keeps that squash message clean.

## Keeping one commit per PR

We squash-merge, and the repo is set so the squash commit message is built
from the branch's commit messages (GitHub's `COMMIT_MESSAGES` mode). To make
that box deterministic, **keep every PR as a single commit**:

- The branch carries exactly one commit. As the change evolves, amend it
  (`git commit --amend`) and re-push with `git push --force-with-lease`.
  Never stack incremental commits on a PR branch.
- That commit's **body is the PR's overall-change summary** — what the code
  does as a result, in a few short lines, not a log of steps taken. Keep it
  current so it always describes what the PR ends up doing.
- With one commit, GitHub prefills the squash modal from it: the *Commit
  message* (subject) is the Conventional Commit subject (which equals the PR
  title), and the *Extended description* is that commit body. At merge the
  reviewer just checks the diff and clicks "Squash and merge" — both fields are
  already right, with no editing.

Do not put the PR description into the commit body — it's written for reviewers
and is too long for history. Do not leave more than one commit — the squash box
then collapses to a bulleted list of commit subjects and loses the summary.

Publish branches to `origin`. Rewriting history is limited to your own
single-commit PR branch, and always with `--force-with-lease`. When a branch is
shared, meaning someone else has commits on it or is reviewing from it, do not
rewrite its history without coordinating first.

## Reporting bugs

Open an issue at https://github.com/kizlo-io/kizlo/issues with a clear
description and, where possible, a minimal reproduction.

## License

By contributing, you agree that your contributions will be licensed under the
[Apache License 2.0](./LICENSE).
