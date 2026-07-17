# @kizlo/shared

## 0.4.0

### Minor Changes

- [#49](https://github.com/kizlo-io/kizlo/pull/49) [`fb22269`](https://github.com/kizlo-io/kizlo/commit/fb222699ef00695b63c8fc489f1b6b74ff75a74e) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Collapse the favicon to a single scheme-agnostic icon and remove the `favicon_dark` setting. Safari ignores the `media` attribute on `rel="icon"` (and never re-evaluates an SVG's internal `@media`), so a light/dark favicon pair rendered wrong there and could flicker on reload elsewhere. `resolveIcons` now emits one unconstrained `rel="icon"`, and `IconDescriptor` no longer carries a `media` field. Design a single favicon that reads on both light and dark tab backgrounds.

  Icon URLs now carry a `?v=<attachment-id>` cache-buster so a swapped icon fetches fresh instead of serving Safari's stale favicon cache; the version is stable across renders when the icon is unchanged.

- [#49](https://github.com/kizlo-io/kizlo/pull/49) [`fb22269`](https://github.com/kizlo-io/kizlo/commit/fb222699ef00695b63c8fc489f1b6b74ff75a74e) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Collapse the separate `ios_app_icon` and `android_app_icon` brand settings into a single `app_icon`. Only iOS/iPadOS Safari reads the `apple-touch-icon`; every other install surface (Android, Chrome, macOS Safari) reads the web manifest, and browsers disagree on which manifest entry to pick when an `any` and a `maskable` icon are both present, so per-platform icons rendered inconsistently. `resolveIcons` now emits one `app_icon` as both the `apple-touch-icon` and the single manifest `any` icon (no `maskable` variant), so home-screen and install surfaces show the same mark. `ManifestIcon` no longer carries a `purpose` field.

## 0.3.1

### Patch Changes

- [#44](https://github.com/kizlo-io/kizlo/pull/44) [`57b9063`](https://github.com/kizlo-io/kizlo/commit/57b90637728972602f0ec0aad2dec7ff31f8369a) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Normalize the public barrel to the wildcard export convention, mark the package `sideEffects: false` for tree-shaking, and drop the unused `html-entities` and `@types/js-cookie` dev dependencies. Internal cleanup with no runtime behaviour change; the type-level `Duration` alias is now re-exported alongside the existing surface.

## 0.3.0

### Minor Changes

- [#40](https://github.com/kizlo-io/kizlo/pull/40) [`0bea4c6`](https://github.com/kizlo-io/kizlo/commit/0bea4c68b3a912b90394fdbb4df5b185c32cc001) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Add brand icon resolution and Next.js metadata builders.

  - `Media` is now a single type shared by the settings response and content responses. It carries an optional `mime` field (populated by the settings response, omitted by content sources) so consumers can render each brand asset by its real format, plus optional `width`/`height` (present for raster sources, absent for scalable ones like SVG) and an optional `variants` array of the source's WordPress-generated resized renditions. Settings media exposes its address as `src` (previously `url`).
  - New framework-neutral `brand` module: `resolveIcons(brand)` turns the brand settings into favicon, apple-touch, and manifest icon descriptors with fallback across slots (empty slots and non-raster formats step down to a usable source), and `buildWebManifest(settings)` produces the web app manifest, including the `id`, `start_url`, `scope`, `display`, and `theme_color`/`background_color` fields Chrome needs to treat the site as installable. Manifest icons accept raster or SVG sources: an SVG yields one scalable `"any"` entry, while a raster source expands into one entry per real generated size (from `Media.variants`), keeping only square renditions at or above a floor so a genuine 192/512 pair is offered rather than a single guessed size. `buildWebManifest` omits `theme_color`/`background_color` when unset rather than defaulting them. Brand gains `theme_color`, `theme_color_dark`, and `background_color` (the manifest has no dark-scheme mechanism, so background carries no dark variant).
  - The single `apple_touch_icon` brand setting is replaced by two purpose-built slots: `ios_app_icon` (full-bleed, feeds `apple-touch-icon`) and `android_app_icon` (padded safe zone, feeds a `purpose: "maskable"` manifest entry). The square brand icon (`logo_icon`, else `favicon`) supplies the default `purpose: "any"` manifest entry; the maskable entry is only emitted when a dedicated Android icon is set, so an unpadded logo is never marked maskable. `ManifestIcon` gains an optional `purpose` field.
  - Next.js integration (`kizlo/nextjs/server`): `createRootMetadata(client)` returns a `generateMetadata` for the root `app/layout.tsx` (used once), owning only the site-wide metadata a page cannot set itself (brand icons, manifest link, `metadataBase`); `createRootViewport(client)` returns the matching `generateViewport` that emits `<meta name="theme-color">` from the brand theme color (tinting the browser chrome for regular visitors, unlike the manifest `theme_color` which only applies once installed), emitting light and dark `prefers-color-scheme` variants when `theme_color_dark` is set; and `createManifestRoute(client)` serves `/site.webmanifest`. `createPageMetadata(head)` (`kizlo/nextjs`) maps a resolved SEO head to per-route content metadata (title, description, Open Graph).

  Breaking: the Next.js `toMetadata` export is renamed to `createPageMetadata`.

  Breaking: the settings surface no longer carries the `Kizlo*` prefix. Response types are exported under their real names (`Settings`, `SiteSettings`, `BrandSettings`, and so on), the write DTOs drop the prefix (`KizloSiteSettingsInput` becomes `SiteSettingsInput`, and so on), and the service class is `SettingsService` (was `KizloSettingsService`), consistent with `PostService`, `UserService`, and the rest. The `PostStatus` settings descriptor is renamed to `PostStatusDefinition` (distinct from the post-status enum).

## 0.2.0

### Minor Changes

- [#38](https://github.com/kizlo-io/kizlo/pull/38) [`b26fc36`](https://github.com/kizlo-io/kizlo/commit/b26fc36e40fb54c2247bb7416095fe822d72ab9f) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Single-source the settings response contract in `@kizlo/shared` and expose the settings API on the server client.

  `@kizlo/shared` now owns the settings shape (`Settings`, `SiteSettings`, `BrandSettings`, `IdentitySettings`, and the rest), so the server client and plugin admin stop maintaining separate copies. The `kizlo` server client reuses those types and adds a `settings` namespace (`client.settings.get()` plus per-section `update*` calls, including the new `updateBrand`). These procedures are `internal` scope, so they run on the server client only and are dropped from the browser client.

  This also corrects the settings types to match the actual API response: brand settings are now included, `person` exposes `user_id`, `organization` carries its full field set, and content sections include `breadcrumbs`.

## 0.1.2

### Patch Changes

- [#24](https://github.com/kizlo-io/kizlo/pull/24) [`d00114b`](https://github.com/kizlo-io/kizlo/commit/d00114b9e5805c746370db65e91227fd01ecf08c) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Fix the server-to-server client losing procedure output types. Calls like `client.posts.list()` and `client.seo.robots()` now resolve `data` to the procedure's real output type instead of `any`.

## 0.1.1

### Patch Changes

- [#10](https://github.com/kizlo-io/kizlo/pull/10) [`590bbd2`](https://github.com/kizlo-io/kizlo/commit/590bbd2f82d57984d1d993e5acd22b0c5772a6cb) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Bug fixes.

## 0.1.0

### Minor Changes

- [#3](https://github.com/kizlo-io/kizlo/pull/3) [`dfa9e21`](https://github.com/kizlo-io/kizlo/commit/dfa9e2144de43ba3b925a1194c34a86a97be45ec) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Initial public release.
