---
"kizlo": minor
"@kizlo/shared": minor
---

Collapse the favicon to a single scheme-agnostic icon and remove the `favicon_dark` setting. Safari ignores the `media` attribute on `rel="icon"` (and never re-evaluates an SVG's internal `@media`), so a light/dark favicon pair rendered wrong there and could flicker on reload elsewhere. `resolveIcons` now emits one unconstrained `rel="icon"`, and `IconDescriptor` no longer carries a `media` field. Design a single favicon that reads on both light and dark tab backgrounds.

Icon URLs now carry a `?v=<attachment-id>` cache-buster so a swapped icon fetches fresh instead of serving Safari's stale favicon cache; the version is stable across renders when the icon is unchanged.
