---
"kizlo": minor
"@kizlo/shared": minor
---

Collapse the separate `ios_app_icon` and `android_app_icon` brand settings into a single `app_icon`. Only iOS/iPadOS Safari reads the `apple-touch-icon`; every other install surface (Android, Chrome, macOS Safari) reads the web manifest, and browsers disagree on which manifest entry to pick when an `any` and a `maskable` icon are both present, so per-platform icons rendered inconsistently. `resolveIcons` now emits one `app_icon` as both the `apple-touch-icon` and the single manifest `any` icon (no `maskable` variant), so home-screen and install surfaces show the same mark. `ManifestIcon` no longer carries a `purpose` field.
