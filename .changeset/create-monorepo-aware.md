---
"kizlo": minor
---

Detect an enclosing monorepo when scaffolding: reuse its package manager (skipping the prompt), and install a workspace member from the root — cleaning up the stray workspace/lock files a framework CLI leaves — so the app joins the monorepo instead of detaching into its own workspace
