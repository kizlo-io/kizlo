---
name: workflow
description: Takes a Linear issue from first read to open PR under this repo's branch, changelog, commit, and PR conventions. Use when the user hands over a Linear issue to pick up or continue, e.g. "do KIZ-70", "pick up KIZ-82", "implement this issue", or pastes a linear.app issue URL.
---

# Workflow, take an issue from Linear to open PR

Input is an issue key (`KIZ-70`) or a `linear.app` URL; ask if neither is given. One team, `Kizlo`, key `KIZ`.

**Nothing touches git until the user says go**, because handing over an issue key is a request to understand it, not a decision to build it now. That go-ahead then covers the rest: branch, commits, pushes, draft PR, without asking again, since work that exists only on this machine can be lost. This overrides the standing per-action commit-approval rule, for this workflow only. One gate remains at the end, **report against the issue's acceptance and ask before marking the PR ready for review**, as that is the point it asks for someone's time.

No em-dash and no LLM filler anywhere. No Claude or Anthropic attribution in any commit, PR, or file.

## 1. Read the issue and the code around it

`get_issue` with the key. These are design documents, so read all of it and treat two sections as binding:

- **Out of scope**, left alone even when it sits in the file you are editing. If it blocks you, say so and stop rather than widening.
- **Acceptance**, which names the behaviour to build and usually the test that proves it. Write that test.

Then open the files the issue points at, before saying anything about it. A brief written from the issue text alone repeats the ticket back; the value is what the code does today versus what the issue assumes. Where they contradict, the code wins.

While reading, **pull out the two or three lines that show the problem**: the declaration that is wrong, the call that returns the wrong thing, the test that does not exist. Step 2 is built on those lines, so if you cannot point at any, you have not read enough yet.

Check for prior work, so the brief can say whether this is a fresh start or a resume:

```bash
git branch --list "*kiz-<number>*"    # read-only, safe on a dirty tree
```

## 2. Explain it, then wait

Write a brief in the chat and stop there. No branch, no checkout, no edits.

**Write it for someone who has never seen this issue.** An issue can sit in the backlog for months, and the person picking it up has usually lost the context that made it obvious when it was filed, even when they wrote it themselves. So the brief starts by rebuilding that context, not by summarising the ticket.

**Open with two or three plain sentences**: which part of the product this touches, what happens today, and who it hurts. No identifiers, no file paths, no jargon in the opening. Someone who has never opened the repo should be able to follow it.

**Then show the problem.** A few lines of real code, a real request and response, or real output, copied from what you read in step 1, with the fault visible in it. This is the part that carries the brief. A paragraph describing a mismatch is forgettable; two lines showing it are not. Where it helps, put today's behaviour and the intended behaviour side by side.

Then the rest, one or two lines each:

- **What changes.** The files and functions you expect to touch, and the shape of the change.
- **What proves it.** The acceptance criteria and the test you would write.
- **Leaving alone.** Anything out of scope sitting close enough to look like an omission.
- **Unclear.** Contradictions with the code, gaps in the issue, decisions that could go two ways. Recommend on each rather than offering a menu.

About a screen, readable in a minute. Prose and short lists, no wall of headings and bullets, no restating the ticket in the ticket's own words.

<details>
<summary>Worked example</summary>

**KIZ-70, list filters the API accepts but never advertises**

When something asks Kizlo which filters a post type route accepts, the answer comes from a list written by hand next to the route. WordPress itself accepts more than that list names. So a filter works fine when you call it, while the generated client has no idea it exists, and nobody finds out until someone goes looking for it.

`PostTypeApi::get_collection_args()` declares them literally:

```php
'search'  => [ 'type' => 'string' ],
'orderby' => [ 'type' => 'string' ],
```

The controller serving the same route allows sixteen, `after`, `before`, `slug` and `sticky` among them. So `GET /wp/v2/posts?sticky=1` filters correctly, while `posts.list` in the generated client has no `sticky` on it at all.

**What changes.** `get_collection_args()` reads `get_collection_params()` off the controller the route is registered against, instead of holding its own list. `TaxonomyApi` has the same hand-written list and gets the same treatment.

**What proves it.** A test that walks every managed route and asserts the declared input matches the controller's params, so the two cannot drift again.

**Leaving alone.** The `kizlo/v1` routes have their own hand-written args. The issue puts them out of scope and they do not share this code path.

**Unclear.** Deriving the params also carries core's validation callbacks onto the route, so an unknown `template` starts answering 400 where it used to be accepted and dropped. That is a behaviour change beyond what the issue asks for, and I would take it, since silently storing nothing is worse. Worth your call before I start.

</details>

Then **stop and wait for an explicit go-ahead.** Silence is not one, and neither is the original "do KIZ-70". The user may want to edit the issue, add detail, reprioritise, or shelve it, all cheaper before a branch exists. If they come back with changes, refresh with `get_issue`, brief on what moved, and wait again. On a resume, brief on what the branch already has and what is left, then wait the same way.

## 3. Clean start, branch, mark it started

```bash
git status --porcelain   # must print nothing
```

**If that prints anything, stop and tell the user what is dirty.** Do not commit or amend to clear it, do not `git stash` it somewhere they did not ask for, and do not check out anyway and drag it onto the new branch. Distinguish tracked modifications from untracked files; untracked-only is usually safe to carry, but let them decide.

Then refresh `main`, even if already on it, rather than branching off a stale one:

```bash
git checkout main && git pull
```

If step 1 found an existing `kiz-<number>` branch, this is a resume: check it out and continue instead of starting a second one. Otherwise:

```bash
git checkout -b fix/kiz-70-derive-list-parameters   # <type>/kiz-<number>-<short-slug>, never commit to main
```

Type is the Conventional Commit type (`feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `ci`, `build`, `style`, `revert`). A bug stays `fix` even when the remedy is a rewrite. Slug is three or four words naming the change, not the symptom: write it yourself, ignore whatever branch name Linear offers. **Keep the `kiz-<number>` token exactly**, it is what attaches the PR to the issue.

If the issue is in `Backlog` or `Todo`, `save_issue` it to `In Progress`. Linear cannot see a local branch, so this is the one status write you make.

## 4. Implement, and get on the remote early

Match the surrounding code. Use the sibling skill when one covers the work (`wp-types`, `wp-service`, `wcs-types`, `wc-types`, `procedure-errors`, `docs`).

**As soon as the first coherent piece of work exists, commit it, push it, and open the PR as a draft.** Do not save this for the end.

```bash
git commit -m "<type>(<scope>): <subject>"
git push -u origin <branch>
gh pr create --draft --title "<same subject>" --body "<lead sentence>

Work in progress."
```

The title must be the real step 7 subject from this first push, because `lint-pr.yml` runs on `opened`. The body can wait. Draft is safe because step 3 already set `In Progress`, so nothing depends on the PR-open event, and it keeps reviewers unbothered until the work is finished.

Then keep committing in small pieces and push each one. A commit is worth making when the tree reaches a state you could describe in one line: a type file generated, a service wired, a test passing. Not every file save, and not one commit at the end holding everything. Broken intermediate states are fine, since a checkpoint exists to keep work safe, not to prove it works. Their messages are throwaway, collapsed into one commit at step 7, so keep them short and do not labour over them. Pushing often is cheap, CI cancels superseded runs on non-`main` refs.

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

`pnpm test` needs `pnpm kizlo test up` first, and plugin PHPUnit only runs in-container via `pnpm kizlo test`. If a failure predates the branch, say so rather than absorbing it here. This gates marking the PR ready, not the step 4 checkpoints.

## 7. Finish the PR

Commit subjects, and the PR title verbatim, take this form:

```
<type>(<scope>): <lowercase imperative, no trailing period, under ~70 chars>
fix(plugin): describe every list filter the managed routes honour
```

Scope is the `packages/*` directory name (`kizlo`, `shared`, `woocommerce`, `cf7`), `plugin` for any `plugins/*`, `template`, `web`, `ci` for workflows, and omitted for `tooling/` and `scripts/`. Always singular: history holds `plugins`, `templates`, and `cli`, which is drift. Use the dominant scope across a spanning change, and omit rather than invent one. No issue key in the subject, the branch carries it.

The body is a lead sentence followed by up to four `###` sections, of which only the first two are required:

```markdown
Managed post type and taxonomy routes now derive their list parameters
from the controller that serves them.

### Why

Route input was written by hand beside the controller, so the two could
disagree, and they had. Every filter the controller allowed worked, while
being absent from the published contract.

### What changed

- List parameters derive from `get_collection_params()` on the controller
  the route is registered against.
- `PostTypeApi` and `TaxonomyApi` read that same source, so the runtime
  and the derived contract cannot drift apart.

### Notes

Deriving the surface carries core's validation callbacks onto the route,
so an unknown `template` answers 400 the way core's own route does
instead of storing nothing behind a 201.

### Verified

- `ListParameterTest` compares the declared input against the controller
- Checked against a running WordPress over HTTP
```

- **The lead sentence says what the PR does**, not what was wrong. It is the first thing a reviewer and every notification email sees.
- **`###`, never `##`.** GitHub renders `##` at near page-title size and it swamps the body.
- **`Why` is three sentences at most.** Longer is reasoning, and reasoning goes in `Notes`.
- **`What changed` is one line per bullet, seven at most**, each opening with the `symbol` or path it lands on so the eye has a column to scan. Past seven, group under bold labels (`**Routes**`, `**Schema**`). A bullet names a change and never argues for it.
- **Backtick every identifier, path, status code and filter name**, and use the codebase's own nouns. This is most of what separates a scannable body from a wall.
- **`Notes` and `Verified` appear only when they carry something.** `Verified` reports step 6 plus anything checked by hand, without restating the command list.

Scale the body to the change:

| Change | Body |
| --- | --- |
| chore, bump, docs typo | lead sentence only, no headings |
| ordinary fix or feature | lead, `Why`, `What changed` |
| refactor with no user-visible effect | lead, `Why`, `What changed`, where `Why` is the motivation |
| subtle or contested change | all four |

**Never write `Closes KIZ-70`.** A Linear key is not a GitHub reference: it closes nothing and points public readers at a tracker they cannot open. Use `Closes #123` only for a real GitHub issue, otherwise no issue line.

### Collapse the branch to one commit

The checkpoints from step 4 existed to keep unfinished work off this machine only. Once step 6 passes they have done their job, and leaving them costs something: the repo squashes with `squash_merge_commit_message=COMMIT_MESSAGES`, so GitHub prefills the merge box by concatenating every commit message on the branch. Five checkpoints means `wip` and `fix test` land in `main`'s history.

A branch holding exactly one commit prefills that box with that commit verbatim, so write the commit body once and the merge box is correct with nothing to paste:

```bash
git reset --soft $(git merge-base HEAD main)
git commit -m "<subject>" -m "<commit body>"
git push --force-with-lease
```

Force-pushing is safe here and only here: it is your own PR branch, before review, and nobody else has commits on it. Never `--force`, always `--force-with-lease`. If review later adds commits, collapse again before merge.

The **commit body** is a third artifact, not a copy of the PR body. Four to eight lines, plain prose, no headings and no bullets, hard-wrapped just under 80 columns because `git log` does not reflow. It condenses `Why` and reduces `What changed` to its result; `#114` is the model. Skip it entirely for a change whose subject already says everything, as `#110` through `#113` do, since an empty body beats a padded one.

Then the PR body goes over the placeholder:

```bash
gh pr edit <n> --title "..." --body "..."
```

## 8. Report against acceptance, then ask

**Do not call `gh pr ready` yet.** An open PR is not a finished issue, and the user is not reading the diff to work out the difference. Post a short report in the chat that closes the loop the step 2 brief opened.

**Open with one line, in plain words, saying whether the issue is done**: complete, complete with a caveat, or partial. Do not bury it under the detail, and do not let a green step 6 stand in for it. Tests passing means what you wrote works, not that it is what the issue asked for.

**Then take the issue's Acceptance section criterion by criterion**, one line each, in the issue's own order and its own words. Against each, one of:

- **Done**, with the evidence: the test that covers it, the file it landed in, the behaviour you checked by hand. Evidence means something that ran. Do not mark a criterion done because the code looks like it should satisfy it.
- **Done differently**, when the code made the issue's route impossible, with what you did instead and why.
- **Not done**, with the reason and what it would take. Blocked on a decision, blocked on access, larger than the issue assumed, or would have meant widening past Out of scope. Say which.

Then only if they carry something:

- **Beyond the issue.** Anything you changed that acceptance never asked for, and why it was unavoidable.
- **Found along the way.** Real problems you saw and left alone, worth their own issue.
- **Not verified.** Anything you could not check, including a step 6 command that did not run or a failure that predates the branch. State it here rather than letting it pass as verified.

Then **stop and wait**. Anything short of complete is the user's call, not yours: they may take the PR as it stands, send it back, or split what is left into a new issue. Never mark a partial PR ready to make the report read better, and never let the PR body claim more than this report does.

**If nothing is left, say so in one line and stop there.** A complete issue does not need a caveats section invented for it.

<details>
<summary>Worked example, a partial</summary>

**KIZ-70 is not fully done.** The post type half is finished and working; the taxonomy half is blocked on a decision I need from you. PR #131 is up as a draft.

Against acceptance:

- *Post type routes declare every filter their controller accepts.* **Done.** `PostTypeApi` now reads `get_collection_params()` off the registered controller. `ListParameterTest::test_post_type_args_match_controller` walks all six managed types and compares the two.
- *Taxonomy routes do the same.* **Not done.** Taxonomy controllers are registered later than post type ones, so at the point the args are built the controller does not exist yet. Fixing it means moving registration to `rest_api_init`, which changes the boot order for everything else on that hook. That is bigger than this issue and I did not want to take it without asking.
- *An unknown filter is rejected rather than ignored.* **Done differently.** The issue asked for an explicit check. Deriving the params carries core's own validation callbacks onto the route, which does this already, so the check would have been dead code. Verified by hand: `POST /wp/v2/posts` with `template=nope` answers 400 where it used to answer 201.

**Found along the way.** `kizlo/v1` routes have the same hand-written list and the same drift. Out of scope here, worth its own issue.

**Not verified.** `pnpm test` passes. Plugin PHPUnit did not run, the test container would not come up on this machine, so the new `ListParameterTest` has only been read, not executed. CI will be the first real run of it.

Left to decide: move taxonomy registration to `rest_api_init` in this PR, or split it out and merge the post type half now. I would split it.

</details>

## 9. Then leave the status alone

Step 3 set `In Progress` and the integration takes it from there: review activity moves it to `In Review`, merge to `Done`. Do not call `save_issue` again, never set `Done` yourself, and do not claim the status moved. Say the PR is open, and whether it is still a draft.

If the issue never moves once the PR is ready, the `kiz-<number>` token is wrong or the PR did not attach. Say so instead of fixing it by hand.
