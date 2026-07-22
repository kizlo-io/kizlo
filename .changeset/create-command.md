---
"kizlo": minor
---

Add a `kizlo create` command and rework `init` to build from the same framework template.

`kizlo create [template] [project-name]` scaffolds a fresh, runnable project (currently Next.js) from a template pinned to the CLI version, prompting for whichever argument you omit. `kizlo init` no longer carries its own copies of the wiring files; it reconstructs them from that same template, so the two paths cannot drift.

When `init` merges Kizlo wiring into a file you already own (such as the root layout's metadata and viewport exports), it now parses the file with a real TypeScript parser and adds or replaces only the relevant exports, leaving the rest of your code untouched. If that file cannot be parsed, `init` stops rather than writing a guess.
