---
name: docs
description: Write new documentation or improve existing docs (MDX pages, READMEs, guides, concept pages) so they are tight, scannable, and useful. Use when the user asks to write, draft, document, rewrite, tighten, clean up, review, or improve docs — e.g. "document the CLI", "improve the quickstart", "this page is too long", "write a concepts page for X". Enforces the no-repetition / no-fluff / short-section house style and this repo's Fumadocs MDX conventions.
---

# docs — write and improve documentation

Purpose: produce documentation that a reader can skim and act on. Reveal exactly enough to use the thing; nothing that doesn't move the reader toward understanding. Applies to new pages and to tightening existing ones.

## Core rules (non-negotiable)

These are the house style. Apply them to everything you write or edit.

1. **Don't repeat yourself.** State a fact, term, or instruction once. If it's needed again, link to where it lives (`[Concepts](/docs/concepts/...)`) instead of restating it. Repetition across pages is the most common rot — when you find it, delete the copy and link to the canonical spot.
2. **Every sentence must earn its place.** If a sentence doesn't help the reader understand or do something, cut it. No filler, no marketing ("powerful", "seamless", "blazingly fast"), no restating the heading in the first line.
3. **No giant paragraphs.** Max ~3–4 sentences per paragraph. Max **2 paragraphs per section** — if you need more, switch to bullets, a table, or split into its own section/heading.
4. **Reveal enough, not the internals.** Explain what the reader needs to use it and reason about it. Don't narrate implementation ("we do this, then that, then call x") unless that mechanism is the thing being documented. Stop at the boundary where more detail stops adding value.
5. **Lead with the reader's goal.** Open each page/section with what it lets them do or answers, not with history or background. Background, if needed, goes lower or in its own section.

## Writing best practices (apply these too)

- **Second person, active voice, present tense.** "Run `kizlo init`", not "the command can be run" or "we will run".
- **Show, don't tell.** A short code block or example beats a paragraph describing it. Prefer a table when comparing options, flags, or commands.
- **One concept per section, named by what the reader wants.** Headings should answer a reader question ("How do I configure it?"), not label internals.
- **Define a term once, then reuse it consistently.** Don't alternate synonyms for the same thing — it reads as two different things.
- **Be concrete.** Real command, real path, real output. Avoid "simply", "just", "easy" — they don't inform and they alienate readers for whom it isn't.
- **Make examples runnable/correct.** Code, paths, flags, and commands must actually work. A wrong example is worse than none.
- **Front-load.** Most important info first, within the page and within each section. Readers bail early.
- **Link instead of duplicating or deep-diving.** Send readers to the canonical page for anything tangential.

## Sound human, not AI

Docs should read like a sharp engineer explaining something to a colleague — not like generated text. Watch for these tells and cut them:

- **No hype adjectives/adverbs.** Drop "powerful", "robust", "seamless", "effortlessly", "blazingly fast", "rich set of", "out-of-the-box magic". State what it does instead.
- **No empty intros or outros.** Don't open with "In today's fast-paced world…" or "Let's dive in", and don't close with "In conclusion" or "Happy coding!". Start at the point; stop when done.
- **Kill the formulas.** Avoid "It's important to note that", "It's worth mentioning", "As you can see", "Simply", "Just", "Essentially", "Basically", "In order to" (→ "to"), "allows you to" (→ "lets you"), "utilize" (→ "use"), "leverage" (→ "use").
- **Not everything is a triad.** AI loves "fast, simple, and reliable". Don't pad sentences to three parallel items when one or two is the truth.
- **Vary sentence length.** Generated prose marches in same-length sentences. Mix short punchy ones with longer explanatory ones. A two-word sentence is fine.
- **Cut hedging.** "can help to", "may potentially", "generally tends to" → say it plainly or don't say it.
- **No fake enthusiasm or em-dash drama.** Don't manufacture excitement and don't lean on "—" for every aside; a period often works better.
- **Be specific, not smooth.** "Returns a `{ data, error }` you check directly" beats "provides a convenient way to handle responses gracefully." Concrete detail is the strongest signal that a human who actually used the thing wrote it.

Quick gut check: read it aloud. If it sounds like a brochure or a chatbot, rewrite it the way you'd actually say it to a teammate.

## When writing a NEW page

1. **Pin down audience + goal.** Who reads this and what should they be able to do after? If unclear, ask before drafting.
2. **Outline by reader questions.** List the questions a reader arrives with; each becomes a section in priority order. Drop sections that don't map to a real question.
3. **Draft tight.** Write to the core rules from the first draft — don't write long "to edit later". Lead each section with the answer, support with one example.
4. **Self-review** against the checklist below before reporting done.

## When IMPROVING an existing page

Read the whole page first, then fix in this order:

1. **Cut repetition** — within the page and against sibling pages. Replace duplicated explanations with a link.
2. **Cut fluff** — sentences and words that add no meaning (rule 2). This usually removes 20–40% of the text.
3. **Break walls of text** — any paragraph over ~4 sentences or any section over 2 paragraphs becomes bullets, a table, or a new section.
4. **Lift internals out** — replace implementation narration with what the reader needs (rule 4).
5. **Re-order** so each section and page leads with the goal/answer.
6. **Fix correctness** — stale commands, paths, flags, examples.

Preserve the author's voice and the page's correct technical content — tighten, don't rewrite for its own sake. Note what you changed and why in your summary.

## This repo's docs conventions (Fumadocs MDX)

Docs live in `web/src/app/(docs)/content/docs/**.mdx`. Match the existing pages:

- **Frontmatter** on every page:
  ```mdx
  ---
  title: Quickstart
  icon: RocketLaunch
  description: One sentence on what this page covers.
  ---
  ```
- **`<Callout>`** for asides, tips, and caveats — not bold paragraphs:
  ```mdx
  <Callout>
    Short, optional aside that links to the deep dive instead of duplicating it.
  </Callout>
  ```
- **Code blocks** carry a `title=` when they map to a file, and use `bash` for commands:
  ````mdx
  ```ts title="src/app/sitemap.ts"
  ```
  ````
- **Tables** for commands, flags, and option comparisons (see `concepts/cli.mdx`).
- **Tone:** conversational but dense — like the existing quickstart/concepts pages. Bold the **key term** in a bullet, then explain it in one clause.
- **Links** use site-relative paths: `[Installation](/docs/installation)`.

For READMEs or other non-MDX docs, drop the MDX components but keep every core rule and best practice.

## Final checklist (run before reporting done)

- [ ] No fact, term, or instruction stated twice — duplicates replaced with links.
- [ ] No section exceeds 2 paragraphs; no paragraph exceeds ~4 sentences.
- [ ] No sentence that could be cut without losing meaning.
- [ ] No implementation narration beyond what the reader needs.
- [ ] Each page and section leads with the reader's goal/answer.
- [ ] Examples, commands, paths, and flags are correct and runnable.
- [ ] Frontmatter present; Callouts/tables/code titles used per repo convention.
- [ ] Terminology consistent throughout.
- [ ] Reads human — no hype words, AI formulas ("It's important to note", "simply", "leverage"), forced triads, or uniform sentence rhythm. Passes the read-aloud test.
