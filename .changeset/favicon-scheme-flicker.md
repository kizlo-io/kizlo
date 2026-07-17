---
"kizlo": patch
---

Fix the favicon flickering between light and dark variants on every reload. When a dark favicon exists, the default icon is now scoped to `(prefers-color-scheme: light)` so exactly one `rel="icon"` matches per scheme. Previously the default carried no media query, so in dark mode both links were valid candidates and browsers picked between them arbitrarily on each load.
