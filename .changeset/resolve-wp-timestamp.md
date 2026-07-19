---
"@kizlo/shared": minor
---

Add `resolveWpTimestamp`, a helper that converts a WordPress GMT date string to epoch milliseconds. It parses WordPress' timezone-less `*_gmt` fields as UTC, and returns `null` for null, undefined, or unparseable values instead of `NaN`, so callers get a clean sentinel for statuses like `auto-draft` that WordPress reports with a null date.

Add an optional `srcset` field to the `Media` schema, carrying a ready-to-use responsive `srcset` string alongside the structured `variants`.

Add a `lenient` schema helper that wraps an optional field so an invalid value is dropped (parsed to `undefined`) instead of throwing, for graceful-degradation read surfaces such as list-query filters.
