---
name: linear-issue
description: Implement a Linear issue end to end with this repo's branch, changelog, commit, and PR conventions. Use when the user hands over a Linear issue to pick up or continue, e.g. "do KIZ-70", "pick up KIZ-82", "implement this issue", or pastes a linear.app issue URL. Covers the clean-tree and up-to-date main preflight, branch naming, choosing between Changesets and changelogger, the conventional commit scope vocabulary, the PR title and body shape, and Linear status handling.
---

# linear-issue, take an issue from Linear to open PR

Input is an issue key (`KIZ-70`) or a `linear.app` URL; ask if neither is given. One team, `Kizlo`, key `KIZ`.

**Ask before `git commit`. Ask again before `git push`.** Separate approvals; "do the rest" covers neither. No em-dash and no LLM filler anywhere. No Claude or Anthropic attribution in any commit, PR, or file.

## 1. Clean start

```bash
git status --porcelain   # must print nothing
```

**If that prints anything, stop and tell the user what is dirty.** Do not commit or amend to clear it, do not `git stash` it somewhere they did not ask for, and do not check out anyway and drag it onto the new branch. Distinguish tracked modifications from untracked files; untracked-only is usually safe to carry, but let them decide.

Then refresh `main`, even if already on it. Stop rather than branch off a stale `main`:

```bash
git checkout main && git pull
```

If `git branch --list "*kiz-<number>*"` finds an existing branch, this is a resume: check it out and continue instead of starting a second one.

## 2. Read the issue

`get_issue` with the key. These are design documents, so read all of it and treat two sections as binding:

- **Out of scope**, left alone even when it sits in the file you are editing. If it blocks you, say so and stop rather than widening.
- **Acceptance**, which names the behaviour to build and usually the test that proves it. Write that test.

Where the issue contradicts the code, the code wins; raise it before implementing.

## 3. Branch, then mark it started

```
<type>/kiz-<number>-<short-slug>      fix/kiz-70-derive-list-parameters
```

Type is the Conventional Commit type (`feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `ci`, `build`, `style`, `revert`). A bug stays `fix` even when the remedy is a rewrite. Slug is three or four words naming the change, not the symptom: write it yourself, ignore whatever branch name Linear offers. **Keep the `kiz-<number>` token exactly**, it is what attaches the PR to the issue.

```bash
git checkout -b fix/kiz-70-derive-list-parameters   # never commit to main
```

If the issue is in `Backlog` or `Todo`, `save_issue` it to `In Progress`. Linear cannot see a local branch, so this is the one status write you make.

## 4. Implement

Match the surrounding code. Use the sibling skill when one covers the work (`wp-types`, `wp-service`, `wcs-types`, `wc-types`, `procedure-errors`, `docs`).

## 5. Changelog artifact

Pick by what the diff touches, not by what the issue is about.

| Diff touches | Artifact |
| --- | --- |
| `packages/*` | changeset |
| `plugins/*` | changelogger fragment |
| both | both |
| only `tooling/`, `scripts/`, `web/`, `.github/`, tests, docs | neither |

Skip both for internal cleanup with no user-visible effect, even inside a released package.

`pnpm changeset`, 0.x semver, and the body is **one imperative line** on the user-visible effect. No essays or internals, regardless of what longer files in `.changeset/` look like.

For plugins, call the binary; `composer changelog` prompts even with `--no-interaction`:

```bash
cd plugins/kizlo   # or kizlo-cf7, kizlo-woocommerce
vendor/bin/changelogger add -f <slug> -s <patch|minor|major> \
  -t <added|changed|deprecated|removed|fixed|security> -e "<one line, no trailing period>" -n
```

**Never hand-edit `CHANGELOG.md`**, it is generated at release time. `CONTRIBUTING.md` has the full release picture.

## 6. Verify

```bash
pnpm check && pnpm typecheck && pnpm build && pnpm test
```

`pnpm test` needs `pnpm kizlo test up` first, and plugin PHPUnit only runs in-container via `pnpm kizlo test`. Do not report done until these pass; if a failure predates the branch, say so rather than absorbing it here.

## 7. Commit, then open the PR

```
<type>(<scope>): <lowercase imperative, no trailing period, under ~70 chars>
fix(plugin): describe every list filter the managed routes honour
```

Scope is the `packages/*` directory name (`kizlo`, `shared`, `woocommerce`, `cf7`), `plugin` for any `plugins/*`, `template`, `web`, `ci` for workflows, and omitted for `tooling/` and `scripts/`. Always singular: history holds `plugins`, `templates`, and `cli`, which is drift. Use the dominant scope across a spanning change, and omit rather than invent one. No issue key in the subject, the branch carries it.

The PR title is that subject verbatim; `lint-pr.yml` fails the PR otherwise. The body is plain prose, two or three short paragraphs, concrete nouns from the codebase, no headings or checklists or buzzwords:

```
Managed post type and taxonomy routes accepted any list parameter the
underlying WordPress controller allowed, so filters outside the declared
input worked while being absent from the published contract.

Route input is now derived from the controller that serves the route
rather than hand-written alongside it, and a test compares the two.
```

**Never write `Closes KIZ-70`.** A Linear key is not a GitHub reference: it closes nothing and points public readers at a tracker they cannot open. Use `Closes #123` only for a real GitHub issue, otherwise no issue line.

```bash
git commit -m "..."                    # gate 1
git push -u origin <branch>            # gate 2
gh pr create --title "..." --body "..."  # never --draft, a draft moves no status
```

## 8. Then leave the status alone

The integration drives it: PR open moves to `In Progress`, review activity to `In Review`, merge to `Done`. So do not call `save_issue` again, never set `Done` yourself, and do not claim the status moved. Say the PR is open.

If the issue does not move once the PR opens, the `kiz-<number>` token is wrong or the PR did not attach. Say so instead of fixing it by hand.
