---
name: workflow
description: Takes a Linear issue from first read to open PR under this repo's branch, changelog, commit, and PR conventions. Use when the user hands over a Linear issue to pick up or continue, e.g. "do KIZ-70", "pick up KIZ-82", "implement this issue", or pastes a linear.app issue URL.
---

# Workflow, take an issue from Linear to open PR

Input is an issue key (`KIZ-70`) or a `linear.app` URL; ask if neither is given. One team, `Kizlo`, key `KIZ`.

**Nothing touches git until the user says go**, because handing over an issue key is a request to understand it, not a decision to build it now. That go-ahead then covers the rest: worktree, branch, commits, pushes, draft PR, without asking again, since work that exists only on this machine can be lost. This overrides the standing per-action commit-approval rule, for this workflow only. One gate remains at the end, **report against the issue's acceptance and ask before marking the PR ready for review**, as that is the point it asks for someone's time.

No em-dash and no LLM filler anywhere. No agent or vendor attribution in any commit, PR, or file, whichever assistant is running this.

## 1. Read the issue and the code around it

`get_issue` with the key. These are design documents, so read all of it and treat two sections as binding:

- **Out of scope**, left alone even when it sits in the file you are editing. If it blocks you, say so and stop rather than widening.
- **Acceptance**, which names the behaviour to build and usually the test that proves it. Write that test.

Then open the files the issue points at, before saying anything about it. A brief written from the issue text alone repeats the ticket back; the value is what the code does today versus what the issue assumes. Where they contradict, the code wins.

While reading, **pull out the two or three lines that show the problem**: the declaration that is wrong, the call that returns the wrong thing, the test that does not exist. Step 2 is built on those lines, so if you cannot point at any, you have not read enough yet.

Check for prior work, so the brief can say whether this is a fresh start or a resume. Both are read-only and safe on a dirty tree, from any branch:

```bash
git branch --list "*kiz-<number>*"
git worktree list
```

A branch with no worktree is prior work from before this workflow used them; a worktree already on that branch is a session someone may still have open.

## 2. Explain it, then wait

Write a brief in the chat and stop there. No branch, no checkout, no edits.

**The reader is the person who filed the issue, months later.** They are not being taught the codebase. They want their memory refreshed without reopening the ticket, and they want to see the fix you have in mind, because a problem and its fix land together or not at all.

**Use these headings, in this order, and no others.** The first two are required. The last two are omitted entirely when they hold nothing, rather than carrying a line that says there is nothing.

### The problem

Two or three plain sentences, then code.

**The code carries this section.** Real code from step 1, with the fault visible in it. Put today's behaviour and the wanted behaviour side by side where that shows it faster.

### Recommended fix

**Required. Never brief without one.** A problem with no proposed fix is a riddle. Naming the fix is half of what makes the problem clear, because it shows what "fixed" looks like.

Show the shape of the change as code, a few lines, before and after. Not the implementation, just enough to see the move. Close with one line naming the test that proves it.

### Also found

Real problems you hit that the issue does not cover. One line each, and **every line ends in one of two verdicts**:

- **Fixing here.** Small, and it sits in code this branch already touches.
- **Needs its own issue.** Everything else. Give it the title you would file, and file it with `save_issue` once the go-ahead lands.

Out of scope work earns a line here only when the code you are touching makes its absence look like an oversight.

### Your call

Only real forks: the issue contradicts the code, or a choice changes what gets built. **Recommend one and say why. Never lay out a menu.**

### Rules that matter more than the structure

- **Nothing important lives inside a paragraph.** Every risk, decision and found problem gets its own line under a bold label. Buried mid-sentence, it gets missed.
- **Code instead of description.** If two lines of code and a sentence say the same thing, cut the sentence.
- **Paths and identifiers belong in the code block**, not woven through a clause. `renderEndpointNode()` mid-sentence reads as noise.
- **One idea per sentence.** No stacked clauses, no semicolons joining three thoughts.
- **Half a screen.** Over that, cut prose. Never cut code.
- **No `What changes`, `What proves it` or `Leaving alone` sections.** They read as bookkeeping, and the fix section already carries what they held.

<details>
<summary>Worked example</summary>

**KIZ-70, the client cannot see filters the API accepts**

Post type routes tell Kizlo which filters they accept through a list written by hand. WordPress accepts more than that list names. The filter works when you call it over HTTP, and the generated client has no idea it exists.

The hand-written list, all of it:

```php
// PostTypeApi::get_collection_args()
'search'  => [ 'type' => 'string' ],
'orderby' => [ 'type' => 'string' ],
```

The controller behind that same route allows sixteen, `sticky` among them:

```ts
GET /wp/v2/posts?sticky=1     // filters correctly
posts.list({ sticky: true })  // does not compile, no such field
```

### Recommended fix

Stop hand-writing the list. Read it off the controller the route is registered against.

```php
// before
return [ 'search' => [...], 'orderby' => [...] ];

// after
return $this->controller->get_collection_params();
```

`TaxonomyApi` holds the same hand-written list and takes the same change.

Proved by a test that walks every managed route and compares its declared input against the controller's params.

### Also found

- Reading the controller's params also carries core's validation callbacks onto the route. An unknown `template` starts answering 400 instead of being accepted and dropped. **Fixing here.** It falls out of the same change, and silently storing nothing is the worse behaviour.
- The `kizlo/v1` routes have their own hand-written args and the same drift. **Needs its own issue**, "Derive kizlo/v1 route args from their controllers".

</details>

Then **stop and wait for an explicit go-ahead.** Silence is not one, and neither is the original "do KIZ-70". The user may want to edit the issue, add detail, reprioritise, or shelve it, all cheaper before a branch exists. If they come back with changes, refresh with `get_issue`, brief on what moved, and wait again. On a resume, brief on what the branch already has and what is left, then wait the same way.

## 3. Worktree off fresh `main`, mark it started

**Every issue gets its own worktree**, so the branch this session builds is never the branch another session is sitting on. The main checkout is left exactly as found: never `git checkout`, never `git stash`, never ask the user to clean their tree first.

First look, and say what you see:

```bash
git status --porcelain
```

**If it prints anything, name what is dirty and pause for a one-word confirm.** Nothing here touches those files, so the pause exists only so the user can say "that is work in progress, carry on" rather than discovering later that they expected it to come along. A clean tree needs no pause.

### Sweep what is finished first

Merged work leaves three things behind: a worktree, a local branch, and a branch on `origin`. All three go together, and a few dozen abandoned worktrees is tens of gigabytes held for issues that shipped weeks ago. Clear the finished ones before adding another.

```bash
pnpm worktree:sweep
```

**That command is the only way this workflow deletes anything.** Never enumerate worktrees, look up PRs, or run `git worktree remove` yourself. Doing it by hand costs a round trip per branch and gets slower every week; `scripts/sweep-worktrees.mjs` decides for every worktree at once off one `gh pr list`, one `git ls-remote`, and one batched `git push --delete`, in about the time a single `gh` call takes.

It prints one `Swept` line and one `Kept` line. **Report those as they stand** and carry on. Add `--dry-run` to see the decision without acting on it, and `--grace-hours <n>` to move the grace period from its default of 24.

Two things about what it does, because you have to be able to answer for them:

- **`.worktrees/` is the entire scope.** A worktree under it was created by this skill and belongs to it, so it is the one thing safe to reclaim automatically. A branch with no worktree is somebody's, made by hand or on another machine or before this workflow existed, and the script never sees it.
- **Age on its own is not the signal.** A branch untouched for a week can still be waiting on review, and taking its worktree takes the place those comments get fixed. What makes work disposable is its own PR being merged, and the grace period runs from that merge.

Every kept entry names its reason. Two of them are a question for the user rather than something that clears on its own:

- **`unpushed commits`**, meaning local commits that never reached the PR. Ask now, while the remote still exists, since deleting it turns the answer into `[gone]`.
- **`origin tip <sha> was pushed after PR #n merged`**, meaning a commit on that branch has never been reviewed.

The rest (`open PR`, inside the grace period, `no merged PR`, `uncommitted changes`) resolve themselves, and need nothing from you beyond the report.

This is a write, which is why it sits here rather than in step 1, and it runs without a pause since the go-ahead already covers it. Nothing here touches the branch about to be created.

Then, from the main checkout:

```bash
git fetch origin main
git worktree add .worktrees/kiz-70 -b fix/kiz-70-derive-list-parameters origin/main
```

**Branch off `origin/main`, never local `main` and never `HEAD`.** This session may have been open for hours while `main` moved, and a branch cut from a stale ref is a merge conflict you handed yourself.

The branch is `<type>/kiz-<number>-<short-slug>`. Type is the Conventional Commit type (`feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `ci`, `build`, `style`, `revert`), and a bug stays `fix` even when the remedy is a rewrite. Slug is three or four words naming the change, not the symptom: write it yourself, ignore whatever branch name Linear offers. **Keep the `kiz-<number>` token exactly**, it is what attaches the PR to the issue.

A worktree is a fresh checkout with none of the gitignored files, so carry them across before entering:

```bash
cp .env .worktrees/kiz-70/.env    # skip if the repo has no .env
```

Then move the session into that directory, by whatever the harness running this offers: a tool that takes the path, or a change of working directory. Creating the worktree with git first, rather than letting a harness create one, is what keeps the branch name under this skill's control.

Once inside, install and build, because a worktree starts with neither `node_modules` nor any package's `dist`:

```bash
pnpm install
pnpm build
```

The install is what the pre-commit hook and step 6 need. The build is what `kizlo.config.ts` needs, since it imports `@kizlo/cf7/test` and `@kizlo/woocommerce/test`: skip it and every `kizlo` command dies on `Package subpath './test' is not defined`. Turbo restores both from cache, so this is seconds rather than a cold build.

**Everything from here happens in there.** Some harnesses enforce that and refuse anything reaching back into the main checkout, so a refusal naming the worktree means a path went to the wrong checkout, not that the command was wrong. Where nothing enforces it the rule still holds, because the main checkout is another session's workspace. `git` itself is shared, so commits, pushes, and `gh` behave normally from inside.

Two cases that are not a fresh start:

- **Step 1 found a `kiz-<number>` branch with no worktree.** Attach one to it rather than starting a second branch: `git worktree add .worktrees/kiz-70 fix/kiz-70-<slug>`, no `-b`, no `origin/main`. Then rebase onto fresh `main` from inside it, since the point of step 3 is a current base: `git rebase origin/main`.
- **This session is already in a worktree.** Do not nest one inside another. If it is this issue's worktree, carry on in it. If it is another issue's, stop and tell the user to run the workflow from a session in the main checkout.

If the issue is in `Backlog` or `Todo`, `save_issue` it to `In Progress`. Linear cannot see a local branch, so this is the only time you set this issue's status by hand. Filing new issues from `Also found` is a different write and stays allowed.

## 4. Implement, and get on the remote early

Match the surrounding code. Use the `docs` skill when the work touches documentation.

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

Plugin PHPUnit only runs in-container, so it comes from `pnpm kizlo test` rather than `pnpm test`. If a failure predates the branch, say so rather than absorbing it here. This gates marking the PR ready, not the step 4 checkpoints.

**The WordPress stack follows the branch.** `worktrees: true` in `kizlo.config.ts` appends the checked-out branch to the compose project, so these containers are this branch's alone and a suite running on another cannot reach them. Nothing here needs coordinating with other sessions.

Each stack is a WordPress and a MySQL container, left up for fast reruns. Once step 8's report is posted, stop this one rather than leaving it running behind an open PR:

```bash
pnpm kizlo test stop
```

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
git merge-base HEAD origin/main          # read the base commit
git reset --soft <that sha>              # pass it literally, not as a substitution
git commit -m "<subject>" -m "<commit body>"
git push --force-with-lease
```

`origin/main` again here, for the reason step 3 gave. Run the two commands separately rather than nesting a substitution, which some harnesses refuse inside a worktree because they cannot trace it statically.

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
- **Found along the way.** Real problems you saw. One line each, ending in the same two verdicts step 2 uses: **Fixed here**, or **Needs its own issue**. File the second kind with `save_issue` before posting the report, and give the key you filed. Do not leave a problem described but unfiled.
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

**Found along the way.** `kizlo/v1` routes have the same hand-written list and the same drift. **Needs its own issue**, filed as KIZ-88.

**Not verified.** `pnpm test` passes. Plugin PHPUnit did not run, the test container would not come up on this machine, so the new `ListParameterTest` has only been read, not executed. CI will be the first real run of it.

Left to decide: move taxonomy registration to `rest_api_init` in this PR, or split it out and merge the post type half now. I would split it.

</details>

## 9. Then leave the status and the worktree alone

Step 3 set `In Progress` and the integration takes it from there: review activity moves it to `In Review`, merge to `Done`. Never touch this issue's status again, never set `Done` yourself, and do not claim the status moved. Say the PR is open, and whether it is still a draft.

**Stay in the worktree.** Do not leave it and do not remove it: review comments land on this branch, and this is where they get fixed. The user ends the session when they are done with it. Removing it is not their job either, since step 3 of the next issue sweeps it 24 hours after this PR merges.

If the issue never moves once the PR is ready, the `kiz-<number>` token is wrong or the PR did not attach. Say so instead of fixing it by hand.
