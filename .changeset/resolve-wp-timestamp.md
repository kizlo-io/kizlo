---
"@kizlo/shared": minor
---

Add `resolveWpTimestamp`, a helper that converts a WordPress date string to epoch milliseconds. It returns `null` for null, undefined, or unparseable values instead of `NaN`, so callers get a clean sentinel for statuses like `auto-draft` that WordPress reports with a null date.
