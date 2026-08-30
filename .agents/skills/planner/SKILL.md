---
name: planner
description: Inspect and plan Kizlo Linear issues before implementation. Use first whenever the user supplies a KIZ issue ID or Linear URL, including requests to do, pick up, or implement it. Keep planning when the exact status is Planning or the issue lacks implementation-ready context. A session that performs planning ends after updating Linear and never runs workflow.
---

# Plan a Linear issue before implementation

Input is an issue key (`KIZ-70`) or a `linear.app` issue URL. One team, `Kizlo`, key `KIZ`.

This skill owns the first read of every issue handoff. Its job is to decide whether the issue is ready to build and, when it is not, turn the original note into an implementation-ready issue. It does not create branches, edit code, or start implementation.

**Planning sessions are exclusive.** A session becomes a planning session as soon as this skill finds that the issue fails the routing gate, asks planning questions, drafts a replacement issue, or updates Linear. From that point, investigate and plan the issue only. Never invoke `workflow` in that same Codex session, even after the issue becomes ready or the user also asked to implement it. Implementation must begin from a fresh session where the saved issue is already ready.

## 1. Read the issue and route it

Fetch the issue with its relations. Read its exact status name, full description, comments, attachments, and linked context that can change the plan. Inspect relevant code and tests before judging whether the description is sufficient. A short issue can be ready; length and headings are not the test.

Compare the exact status name, not its Linear status type. `Planning` and `Backlog` are both backlog-type statuses in this workspace.

Apply status before content:

- `Planning` always stays in this skill, even when its description looks complete.
- `Backlog` and `Todo` can pass to `workflow` when they meet the Definition of Ready below.
- `In Progress` and `In Review` can pass only when resuming work that already exists. Do not treat either as permission to begin a fresh implementation.
- `Done`, `Canceled`, and `Duplicate` do not pass unless the user explicitly decides to reopen the issue.

### Definition of Ready

An issue is ready only when all of these are true, in whatever compact form fits the work:

- **Clear title:** names the outcome or defect rather than a vague activity such as "fix CLI" or "investigate logs".
- **Problem or outcome:** explains the current problem or the user capability being requested and why it matters.
- **Expected behaviour:** makes the completed result clear without requiring the implementer to invent product behaviour.
- **Defined scope:** identifies the affected surface and records meaningful boundaries where adjacent work could be absorbed.
- **Testable acceptance:** states observable completion criteria rather than tasks such as "update the implementation".
- **Planned verification:** names the test cases that will prove behaviour when automated tests are appropriate, or the concrete alternative check when they are not.
- **Resolved decisions:** leaves no unanswered product choice that would materially change behaviour, compatibility, scope, or acceptance.
- **Executable dependencies:** required upstream work, designs, APIs, credentials, and external decisions are available or explicitly handled.

Use this final test: could another engineer implement the issue and know when it is complete without asking a product or scope question? If not, it stays with `planner`.

Logs, screenshots, and rough notes are evidence, not a complete plan by themselves. Repository facts such as file paths and implementation details are discovered during investigation and do not make an otherwise clear issue unready. Do not require estimates, priority, a proposed implementation, fixed headings, or a long description.

If the eligible status and every readiness check pass on the first read, and no planning action has occurred in the current session, say that it is implementation-ready and continue with the `workflow` skill when the user's request includes implementation. This is a read-only routing check, not a planning session. Do not rewrite an already-ready issue just to normalize its format.

## 2. Investigate the rough note

Treat the existing title, description, comments, and attachments as the source note. Preserve concrete observations such as commands, output, reproduction steps, and screenshots.

Read the code paths and tests implicated by the note. Establish:

- what the code does today;
- where that behaviour comes from;
- the smallest coherent change that produces the wanted outcome;
- which existing test layer fits and which cases prove the change;
- adjacent work that should remain outside this issue.

Where the note and current code disagree, call it out. Do not silently plan against a stale assumption. Keep facts, inferences, and unresolved product choices distinct.

## 3. Resolve real decisions

Ask questions only when the answer changes user-visible behaviour, scope, compatibility, or the acceptance test and cannot be established from the issue or repository. Recommend a default and explain its consequence. Group related questions into one compact message, then wait.

Do not ask the user to supply repository facts that can be inspected. If no material decision remains, proceed without questions.

## 4. Draft the issue

Present the proposed title and complete description in chat before writing to Linear. Scale the description to the issue. Use only the sections that carry useful information, normally selected from:

- `## Summary` for the problem and wanted outcome;
- `## Current state` for reproduction, evidence, and relevant code behaviour;
- `## Proposed change` for the intended shape and important decisions;
- `## Acceptance` for observable, testable completion criteria;
- `## Out of scope` for tempting adjacent work that must not be absorbed;
- `## Verification` for planned test cases or the concrete alternative when automated tests do not fit.

Use concrete repository nouns and code identifiers. Acceptance describes behaviour, not vague work such as "update the code". Include a proposed implementation only as far as investigation supports it; do not make speculative internals binding.

When behaviour needs automated coverage, plan concrete cases rather than writing "add tests": reproduce the current failure, prove the expected path, and cover important boundary or error behaviour where relevant. Name the appropriate test layer or existing suite and the assertion each case protects. Do not invent an exact test file before the repository supports that choice. For docs, metadata, or other changes with no meaningful automated case, state the static or manual verification instead.

For a small bug, `Summary` plus `Acceptance` can be enough when the acceptance list also makes the planned cases clear. For broader work, record current state, boundaries, default decisions, rollout or compatibility constraints, and verification where they prevent rediscovery during implementation. Omit empty boilerplate.

End by asking the user to approve or amend the draft. Do not update Linear on the first pass.

## 5. Save the approved plan

After approval, update the existing issue with the agreed title and description. Preserve unrelated metadata and relations.

If its exact status is still `Planning`, move it to `Backlog` in the same update unless the user explicitly asks to keep it in planning. `Backlog` means the planning gate is complete; priority and scheduling remain separate decisions.

Re-fetch the issue and verify the saved title, description, and status. Report that planning is complete and tell the user to start a fresh Codex session with the issue key when they want implementation. Stop there. Never start `workflow` or make repository changes in this planning session.
