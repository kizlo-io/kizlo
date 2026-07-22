# kizlo

## 0.8.2

### Patch Changes

- [#70](https://github.com/kizlo-io/kizlo/pull/70) [`0adc16b`](https://github.com/kizlo-io/kizlo/commit/0adc16bf29e9f4e1eb21a7ea87550590f3fad131) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Pin the scaffolded `kizlo` dependency to a concrete version instead of the `latest` tag on `create` and `init`.

- [#70](https://github.com/kizlo-io/kizlo/pull/70) [`0adc16b`](https://github.com/kizlo-io/kizlo/commit/0adc16bf29e9f4e1eb21a7ea87550590f3fad131) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Fix `create` and `init` to scaffold from a single template source so they stay in sync; `init` now supports the Next.js App Router only.

## 0.8.1

### Patch Changes

- [#68](https://github.com/kizlo-io/kizlo/pull/68) [`d3dff8b`](https://github.com/kizlo-io/kizlo/commit/d3dff8bc49cf1668605ea5123fc192c545411ca0) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Fix `kizlo create` failing with a confusing error when the template can't be fetched, and always prompt for the template.

## 0.8.0

### Minor Changes

- [#63](https://github.com/kizlo-io/kizlo/pull/63) [`09ef9e0`](https://github.com/kizlo-io/kizlo/commit/09ef9e011dc700e7dc073dac77ea8ec4b452e662) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Add a public category API (`categories.list` and `categories.get`).

  `categories.list` is a lenient public listing over the category taxonomy with camelCase filters (`search`, `include`/`exclude`, `order`/`orderBy`, `hideEmpty`, `parent`, `post`, `slug`). `categories.get` resolves a category by either id or slug and carries the resolved SEO block. Each category exposes `id`, `name`, `slug`, `url`, `description`, `parent`, `postCount`, `seo`, and `meta`, reshaped from the raw WordPress term (WP internals like `taxonomy` and `_links` are dropped, `parent`/`description` are nulled when empty).

- [#67](https://github.com/kizlo-io/kizlo/pull/67) [`a919066`](https://github.com/kizlo-io/kizlo/commit/a9190665cb23e4dcd4d45c3d2acdccdb3c848a02) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Add a `kizlo create` command and rework `init` to build from the same framework template.

  `kizlo create [template] [project-name]` scaffolds a fresh, runnable project (currently Next.js) from a template pinned to the CLI version, prompting for whichever argument you omit. `kizlo init` no longer carries its own copies of the wiring files; it reconstructs them from that same template, so the two paths cannot drift.

  When `init` merges Kizlo wiring into a file you already own (such as the root layout's metadata and viewport exports), it now parses the file with a real TypeScript parser and adds or replaces only the relevant exports, leaving the rest of your code untouched. If that file cannot be parsed, `init` stops rather than writing a guess.

- [#62](https://github.com/kizlo-io/kizlo/pull/62) [`225017d`](https://github.com/kizlo-io/kizlo/commit/225017d1d2b9475e977b2077a525680bd6bcd7dc) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Flatten service clients onto the procedure context and rename `ServerContext` to `ProcedureContext`.

  The `service` wrapper is gone from the handler context. Its members now live directly on the context: `context.service.wordpress` becomes `context.wordpress`, `context.service.settings` becomes `context.settings`, and `context.service.email` becomes `context.email`. Update any custom procedures or extensions accordingly.

  The context type is renamed from `ServerContext` to `ProcedureContext` — the single type every procedure, middleware, event, and webhook handler receives. A procedure handler still gets this base plus whatever its middleware injected via `next({ context })`.

  The `Service` class and its `ServiceConfig` type are no longer exported from `kizlo`. `EmailService` and `SettingsService` are now constructed from a `WordPressService` directly instead of the removed `Service` aggregate.

- [#58](https://github.com/kizlo-io/kizlo/pull/58) [`bd5006d`](https://github.com/kizlo-io/kizlo/commit/bd5006d6d107f488ae9bfc67518e78a6a74f5c21) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Menu API improvements and fixes.

  Output (`MenuItem` / group items) additions:

  - `parent`: the parent menu-item id (`null` at the top level), so the flat list can be assembled into a hierarchy without the group endpoint.
  - `target`: the link target (`"_blank"` or `""`), for rendering `<a target>`.
  - `objectId`: the id of the linked post or term, to correlate a nav item back to its source resource.
  - `order`: the item's sort position (WordPress' `menu_order`), so the flat list can be ordered without the group endpoint.
  - `classes`: editor-assigned CSS classes (WordPress' empty-class `[""]` quirk filtered out), for theme styling hooks.
  - `attrTitle`: the link's `title` attribute text.
  - `xfn`: the anchor's XFN `rel` relationships (empty entries filtered out).
  - `invalid`: whether the linked object no longer exists, so broken links can be hidden or badged.

  List input (`menus.items.list` / `menus.group`) changes:

  - Invalid list query values are now tolerated instead of throwing: each filter falls back to being ignored, and an invalid `page` falls back to `1`. Listing surfaces degrade gracefully rather than returning a 400.
  - `perPage` is bounded to 1-100 and `offset` to a non-negative integer.
  - `searchColumns` is constrained to `post_title`/`post_content`/`post_excerpt`.
  - An `orderby` that WordPress would reject for a missing companion (`relevance` without `search`, `include` without `include`, `include_slugs` without `slug`) is now dropped so the list falls back to default ordering instead of returning a 400.

  Fixes:

  - A menu item whose linked `object` is a non-standard type (any custom post type or taxonomy, `tag`, etc.) no longer fails output validation with a 500. The item `type` is now a permissive string.
  - `href` now returns the full path instead of only the last URL segment, so nested targets (e.g. `/about-us/team`) are no longer truncated to their leaf. Custom links keep the authored value (including absolute external URLs), and an internal path resolves to the same `href` whether the item is a custom link or a linked page.

- [#57](https://github.com/kizlo-io/kizlo/pull/57) [`fe57fa8`](https://github.com/kizlo-io/kizlo/commit/fe57fa812a8930b0e0806a329871d706cacb2bee) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Posts API improvements and fixes.

  Output (`Post`) additions:

  - `url`: the post's resolved public URL, built by the plugin from the Kizlo site-URL setting (not WordPress' home URL).
  - `parent`: parent post ID for hierarchical types (null for flat types like `post`).
  - `preview`: whether the record was returned through the preview-token flow.
  - `status`: the post status (`publish`/`future`/`draft`/`pending`/`private`), useful for rendering preview badges. The WP-internal `trash` status is normalized to `draft`.
  - `author.slug`: the author's nicename, needed to build author archive links.
  - `featuredMedia` now carries `width`, `height`, `mime`, responsive `variants`, and a ready-to-use `srcset` string (via the plugin's shared media resolver), so it can back `next/image` or a plain `<img srcset>` without layout shift.
  - `title` is now `null` for posts with an empty title instead of an empty string.

  List input (`posts.list`) changes:

  - Invalid list query values are now tolerated instead of throwing: each filter falls back to being ignored, and an invalid `page` falls back to `1`. Listing surfaces degrade gracefully rather than returning a 400. (`posts.get` and future writes stay strict.)
  - `perPage` is bounded to 1-100 (WordPress' own cap) and `offset` to a non-negative integer.
  - `searchColumns` is constrained to `post_title`/`post_content`/`post_excerpt`.
  - `orderby` gains `modified`, pairing with the `updatedAt` output for "recently updated" ordering. An `orderby` that WordPress would reject for a missing companion (`relevance` without `search`, `include` without `include`) is now dropped so the list falls back to default ordering instead of returning a 400. The `POST_SEARCH_REQUIRED` and `POST_ORDERBY_INCLUDE_MISSING` list errors are removed as a result.
  - Added `modifiedAfter`/`modifiedBefore` date filters for incremental sync / ISR revalidation ("posts changed since X").

  Fixes:

  - `posts.get` now returns `POST_NOT_FOUND` for non-published posts unless a valid preview token is supplied. The underlying WordPress fetch runs with edit context and admin credentials, so without this guard an anonymous caller could read `draft`/`private`/`pending`/`future`/`trash` content by id. The preview-token flow remains the only way to read unpublished posts.
  - Fetching a post by an unknown slug now returns a 404 (`POST_NOT_FOUND`) instead of a 500. The custom post-type route's `post_type_not_found` and `invalid_post_type` error codes are handled in `posts.get`, and the `PostTypeService` error-code unions widen the WordPress core codes to include them.
  - `createdAt`/`updatedAt` are derived from the GMT date fields (parsed as UTC) instead of the site-local fields, fixing a timezone drift that depended on where the server ran. Posts with a null or unparseable date no longer fail output validation with a `NaN` timestamp.
  - The `kizlo` enrichment type marks `url`/`categories`/`tags`/`author`/`featured_media` as optional, matching what the plugin actually returns.

- [`bd67cbf`](https://github.com/kizlo-io/kizlo/commit/bd67cbf2d09703f3af2e5bfe2620c07c35c3a9d7) Thanks [@IDJGILL](https://github.com/IDJGILL)! - SEO head shape fixes and additions.

  The `seo.homepage` output and the `seo` block embedded in `posts.get` are built from the same reshape (`deserializeSeo`), which is now the single source of truth. Several fields the plugin omits or types differently were mismatched against the schema and could fail output validation with a 500:

  - `og.image.width` / `og.image.height` are numbers (not strings) and may be `null`; `og.image.type` may be `null`. Any page carrying an Open Graph image previously risked a 500.
  - `og.description`, `twitter.description`, and every `article.*` field are omitted by the plugin when empty; they now degrade to `""` instead of producing an invalid `undefined`.
  - `twitter.card` is now correctly typed as `"summary" | "summary_large_image"`.

  Additions:

  - `twitter.imageAlt` is now exposed (rendered as the Twitter card image alt).
  - `article.tags` is now exposed (maps to `article:tag` Open Graph meta tags).

- [#61](https://github.com/kizlo-io/kizlo/pull/61) [`39d52a7`](https://github.com/kizlo-io/kizlo/commit/39d52a78b84cae98bda5d8ec31dceb4961da681d) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Settings API improvements.

  - Removed the `publicly_queryable` field from post type and taxonomy settings. It was a read-only runtime value that the server silently ignored on write, so it never belonged on the writable surface. It is gone from the `PostTypeSettings`/`TaxonomySettings` types, from the `settings` response, and from the update inputs.
  - The settings update router is now nested per section: `settings.updateSite` becomes `settings.site.update` (and likewise `brand`, `identity`, `authors`, `crawling`, `webhook`, `uploads`, `postType`, `taxonomy`). This leaves room to add per-section reads such as `settings.site.get` later.
  - Settings update calls now return the saved section instead of `null`, so callers can read back the persisted, fully-resolved state (media ids resolved to `{ id, src }` objects) without a follow-up `get`. Each update is typed to its section: `site.update` returns `SiteSettings`, `postType.update` returns the single updated `PostTypeSettings`, and so on.
  - A WordPress `rest_forbidden` (403) from a settings write now surfaces as a `FORBIDDEN` error instead of a generic 500.

- [#55](https://github.com/kizlo-io/kizlo/pull/55) [`8a5e9b7`](https://github.com/kizlo-io/kizlo/commit/8a5e9b7e1df18659c39da353817f011954187d06) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Add `createSitemapRedirectRoute`, a framework-agnostic handler that permanently redirects the well-known `/sitemap.xml` to the generated sitemap index at `/sitemaps/index.xml`. Many crawlers ignore robots.txt and probe the standard path directly, so this points them at the real index. It is a static 308 with no WordPress call, derived from the same `SITEMAP_BASE`/`SITEMAP_INDEX_SLUG` constants the sitemap route is mounted on. `kizlo init` now scaffolds a `sitemap.xml` route for the Next.js preset.

  The sitemap index path is now fixed at `/sitemaps/index.xml` and is no longer configurable. `KizloCrawlingSettings` no longer includes the `sitemaps.pathname_structure` field.

- [#64](https://github.com/kizlo-io/kizlo/pull/64) [`e422f3d`](https://github.com/kizlo-io/kizlo/commit/e422f3d897f71c08290c1cb56fbdb6baae07ba9f) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Add a public tag API (`tags.list` and `tags.get`).

  `tags.list` is a lenient public listing over the `post_tag` taxonomy with camelCase filters (`search`, `include`/`exclude`, `order`/`orderBy`, `hideEmpty`, `post`, `slug`). `tags.get` resolves a tag by either id or slug and carries the resolved SEO block. Each tag exposes `id`, `name`, `slug`, `url`, `description`, `postCount`, `seo`, and `meta`, reshaped from the raw WordPress term (WP internals like `taxonomy` and `_links` are dropped, `description` is nulled when empty). Tags are non-hierarchical, so there is no `parent` field or `parent` filter.

### Patch Changes

- Updated dependencies [[`fe57fa8`](https://github.com/kizlo-io/kizlo/commit/fe57fa812a8930b0e0806a329871d706cacb2bee), [`39d52a7`](https://github.com/kizlo-io/kizlo/commit/39d52a78b84cae98bda5d8ec31dceb4961da681d)]:
  - @kizlo/shared@0.5.0

## 0.7.0

### Minor Changes

- [#49](https://github.com/kizlo-io/kizlo/pull/49) [`fb22269`](https://github.com/kizlo-io/kizlo/commit/fb222699ef00695b63c8fc489f1b6b74ff75a74e) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Collapse the favicon to a single scheme-agnostic icon and remove the `favicon_dark` setting. Safari ignores the `media` attribute on `rel="icon"` (and never re-evaluates an SVG's internal `@media`), so a light/dark favicon pair rendered wrong there and could flicker on reload elsewhere. `resolveIcons` now emits one unconstrained `rel="icon"`, and `IconDescriptor` no longer carries a `media` field. Design a single favicon that reads on both light and dark tab backgrounds.

  Icon URLs now carry a `?v=<attachment-id>` cache-buster so a swapped icon fetches fresh instead of serving Safari's stale favicon cache; the version is stable across renders when the icon is unchanged.

- [#49](https://github.com/kizlo-io/kizlo/pull/49) [`fb22269`](https://github.com/kizlo-io/kizlo/commit/fb222699ef00695b63c8fc489f1b6b74ff75a74e) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Collapse the separate `ios_app_icon` and `android_app_icon` brand settings into a single `app_icon`. Only iOS/iPadOS Safari reads the `apple-touch-icon`; every other install surface (Android, Chrome, macOS Safari) reads the web manifest, and browsers disagree on which manifest entry to pick when an `any` and a `maskable` icon are both present, so per-platform icons rendered inconsistently. `resolveIcons` now emits one `app_icon` as both the `apple-touch-icon` and the single manifest `any` icon (no `maskable` variant), so home-screen and install surfaces show the same mark. `ManifestIcon` no longer carries a `purpose` field.

### Patch Changes

- [#52](https://github.com/kizlo-io/kizlo/pull/52) [`b04dc20`](https://github.com/kizlo-io/kizlo/commit/b04dc203eaa39230e1b09144721c385b35e7b9d7) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Point the local dev stack's `KIZLO_DEV_WORDPRESS_URL` at the machine's LAN address instead of `localhost`, so the app can reach WordPress from off the host (running in a container or on another device). `kizlo init` and `kizlo dev` (including `reset`) write the router-assigned IPv4 address, falling back to `localhost` when the machine is offline. WordPress itself already serves under whatever host a request comes in on (via the container's `WORDPRESS_CONFIG_EXTRA`), so no site-URL rewrite is involved.

  A warm `kizlo dev` start now also re-points `KIZLO_DEV_WORDPRESS_URL` in `.env` when the LAN address changed since the last session (a new DHCP lease or a different network), so restarting the app picks up the current address without a full `reset`. The dev summary shows a loopback "WP Local" URL alongside the "WP Network" one.

- Updated dependencies [[`fb22269`](https://github.com/kizlo-io/kizlo/commit/fb222699ef00695b63c8fc489f1b6b74ff75a74e), [`fb22269`](https://github.com/kizlo-io/kizlo/commit/fb222699ef00695b63c8fc489f1b6b74ff75a74e)]:
  - @kizlo/shared@0.4.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`57b9063`](https://github.com/kizlo-io/kizlo/commit/57b90637728972602f0ec0aad2dec7ff31f8369a)]:
  - @kizlo/shared@0.3.1

## 0.6.0

### Minor Changes

- [#42](https://github.com/kizlo-io/kizlo/pull/42) [`5e4cf88`](https://github.com/kizlo-io/kizlo/commit/5e4cf887f02651a044fb121b70609c88941e0de1) Thanks [@IDJGILL](https://github.com/IDJGILL)! - The Next.js revalidation integration now refreshes the whole site with `revalidatePath("/", "layout")` when a frontend-affecting settings group changes, so edits like SEO metadata surface without a manual purge. This covers every settings group except `settings.crawling.updated` (robots.txt only, already handled by the robots cache tag) and `settings.integration.updated` (backend webhook config). Revalidation stays lazy, so routes re-render on their next request with cached content served warm from the Data Cache.

- [#42](https://github.com/kizlo-io/kizlo/pull/42) [`5e4cf88`](https://github.com/kizlo-io/kizlo/commit/5e4cf887f02651a044fb121b70609c88941e0de1) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Replace the single `settings.saved` webhook event with per-group events so consumers can react to a specific settings change. Flat groups emit `settings.site.updated`, `settings.brand.updated`, `settings.identity.updated`, `settings.authors.updated`, `settings.crawling.updated`, and `settings.integration.updated` with a `null` payload. The keyed groups emit `settings.post_type.updated` and `settings.taxonomy.updated` with a `{ key }` payload naming the changed entry.

  This is a breaking change to the event surface: handlers switching on `settings.saved` no longer match. The Next.js revalidation integration now refreshes the robots cache only on `settings.crawling.updated` and `settings.site.updated` instead of every settings change.

## 0.5.0

### Minor Changes

- [#40](https://github.com/kizlo-io/kizlo/pull/40) [`0bea4c6`](https://github.com/kizlo-io/kizlo/commit/0bea4c68b3a912b90394fdbb4df5b185c32cc001) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Add brand icon resolution and Next.js metadata builders.

  - `Media` is now a single type shared by the settings response and content responses. It carries an optional `mime` field (populated by the settings response, omitted by content sources) so consumers can render each brand asset by its real format, plus optional `width`/`height` (present for raster sources, absent for scalable ones like SVG) and an optional `variants` array of the source's WordPress-generated resized renditions. Settings media exposes its address as `src` (previously `url`).
  - New framework-neutral `brand` module: `resolveIcons(brand)` turns the brand settings into favicon, apple-touch, and manifest icon descriptors with fallback across slots (empty slots and non-raster formats step down to a usable source), and `buildWebManifest(settings)` produces the web app manifest, including the `id`, `start_url`, `scope`, `display`, and `theme_color`/`background_color` fields Chrome needs to treat the site as installable. Manifest icons accept raster or SVG sources: an SVG yields one scalable `"any"` entry, while a raster source expands into one entry per real generated size (from `Media.variants`), keeping only square renditions at or above a floor so a genuine 192/512 pair is offered rather than a single guessed size. `buildWebManifest` omits `theme_color`/`background_color` when unset rather than defaulting them. Brand gains `theme_color`, `theme_color_dark`, and `background_color` (the manifest has no dark-scheme mechanism, so background carries no dark variant).
  - The single `apple_touch_icon` brand setting is replaced by two purpose-built slots: `ios_app_icon` (full-bleed, feeds `apple-touch-icon`) and `android_app_icon` (padded safe zone, feeds a `purpose: "maskable"` manifest entry). The square brand icon (`logo_icon`, else `favicon`) supplies the default `purpose: "any"` manifest entry; the maskable entry is only emitted when a dedicated Android icon is set, so an unpadded logo is never marked maskable. `ManifestIcon` gains an optional `purpose` field.
  - Next.js integration (`kizlo/nextjs/server`): `createRootMetadata(client)` returns a `generateMetadata` for the root `app/layout.tsx` (used once), owning only the site-wide metadata a page cannot set itself (brand icons, manifest link, `metadataBase`); `createRootViewport(client)` returns the matching `generateViewport` that emits `<meta name="theme-color">` from the brand theme color (tinting the browser chrome for regular visitors, unlike the manifest `theme_color` which only applies once installed), emitting light and dark `prefers-color-scheme` variants when `theme_color_dark` is set; and `createManifestRoute(client)` serves `/site.webmanifest`. `createPageMetadata(head)` (`kizlo/nextjs`) maps a resolved SEO head to per-route content metadata (title, description, Open Graph).

  Breaking: the Next.js `toMetadata` export is renamed to `createPageMetadata`.

  Breaking: the settings surface no longer carries the `Kizlo*` prefix. Response types are exported under their real names (`Settings`, `SiteSettings`, `BrandSettings`, and so on), the write DTOs drop the prefix (`KizloSiteSettingsInput` becomes `SiteSettingsInput`, and so on), and the service class is `SettingsService` (was `KizloSettingsService`), consistent with `PostService`, `UserService`, and the rest. The `PostStatus` settings descriptor is renamed to `PostStatusDefinition` (distinct from the post-status enum).

### Patch Changes

- Updated dependencies [[`0bea4c6`](https://github.com/kizlo-io/kizlo/commit/0bea4c68b3a912b90394fdbb4df5b185c32cc001)]:
  - @kizlo/shared@0.3.0

## 0.4.0

### Minor Changes

- [#38](https://github.com/kizlo-io/kizlo/pull/38) [`b26fc36`](https://github.com/kizlo-io/kizlo/commit/b26fc36e40fb54c2247bb7416095fe822d72ab9f) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Single-source the settings response contract in `@kizlo/shared` and expose the settings API on the server client.

  `@kizlo/shared` now owns the settings shape (`Settings`, `SiteSettings`, `BrandSettings`, `IdentitySettings`, and the rest), so the server client and plugin admin stop maintaining separate copies. The `kizlo` server client reuses those types and adds a `settings` namespace (`client.settings.get()` plus per-section `update*` calls, including the new `updateBrand`). These procedures are `internal` scope, so they run on the server client only and are dropped from the browser client.

  This also corrects the settings types to match the actual API response: brand settings are now included, `person` exposes `user_id`, `organization` carries its full field set, and content sections include `breadcrumbs`.

### Patch Changes

- Updated dependencies [[`b26fc36`](https://github.com/kizlo-io/kizlo/commit/b26fc36e40fb54c2247bb7416095fe822d72ab9f)]:
  - @kizlo/shared@0.2.0

## 0.3.2

### Patch Changes

- [#34](https://github.com/kizlo-io/kizlo/pull/34) [`2a7b07f`](https://github.com/kizlo-io/kizlo/commit/2a7b07fbb8d10251b721a964a953ecff48f12203) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Bug fixes.

## 0.3.1

### Patch Changes

- [#33](https://github.com/kizlo-io/kizlo/pull/33) [`5b51f36`](https://github.com/kizlo-io/kizlo/commit/5b51f36fe952ddaa5d0d980159b0258817661727) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Run the scaffolded sitemap route on the edge. The Next.js CLI preset now emits `export const runtime = "edge"` for `/sitemaps/[sitemap]`, matching the robots.txt route, so both special-file responses run on the cheaper, faster edge runtime instead of Node.

- [#31](https://github.com/kizlo-io/kizlo/pull/31) [`cafdf6d`](https://github.com/kizlo-io/kizlo/commit/cafdf6d93283471d610fdf5f9626ba8c705c5f66) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Improve sitemap route caching to match the robots.txt approach. `createSitemapRoute` (Next integration) now caches its WordPress-backed bodies with `unstable_cache` under a `kizlo:sitemap` tag, keyed per slug, and `nextRevalidation` refreshes that tag on content events. The scaffolded route is `force-dynamic`, so Vercel does not bake `/sitemaps/index.xml` into an immutable Edge CDN asset that on-demand `revalidatePath` cannot reach. Requests stay cheap (the WordPress calls are cached) while the index and collection sitemaps stay current on content changes.

## 0.3.0

### Minor Changes

- [#29](https://github.com/kizlo-io/kizlo/pull/29) [`0e38b02`](https://github.com/kizlo-io/kizlo/commit/0e38b022529cdd121d3a5d853171f592a518747d) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Add `createRobotsRoute` (from `kizlo/nextjs/server`) to serve `robots.txt` from a route handler instead of Next's `robots.ts` metadata convention, which `revalidatePath("/robots.txt")` cannot reach. Mirrors `createSitemapRoute`.

  `nextRevalidation` now also revalidates SEO surfaces on `settings.*` events, so settings changes refresh `/robots.txt` and the sitemap.

  Fix sitemap revalidation: revalidate the `[sitemap]` route as a `layout` instead of a `page`, so on-demand slugs (no `generateStaticParams`) actually refresh.

- [#30](https://github.com/kizlo-io/kizlo/pull/30) [`eb56383`](https://github.com/kizlo-io/kizlo/commit/eb563839c0dadc22e9b80397e8aea5f08575d26c) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Fix `localhost` URLs in the sitemap index. The index `<loc>`s were built from the request origin, which resolves to `localhost` when the route is served as a prebuilt static file (`dynamic = "force-static"`), so the deployed sitemap pointed at localhost. The origin now comes from WordPress via a new `client.seo.sitemaps.index()` (the entry list plus the canonical origin resolved from the Kizlo site URL), so both the index and any `extra` sitemap URLs stay canonical. `client.seo.sitemaps()` is now `client.seo.sitemaps.list()`.

### Patch Changes

- [#30](https://github.com/kizlo-io/kizlo/pull/30) [`eb56383`](https://github.com/kizlo-io/kizlo/commit/eb563839c0dadc22e9b80397e8aea5f08575d26c) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Make the runtime edge-compatible. Dropped `node:crypto` and `Buffer` from the package barrel (the `altcha` adapter and the WordPress auth header now use Web Crypto and `btoa`/`atob`), so `kizlo` builds and runs on Node, edge, and other serverless runtimes.

- [#30](https://github.com/kizlo-io/kizlo/pull/30) [`eb56383`](https://github.com/kizlo-io/kizlo/commit/eb563839c0dadc22e9b80397e8aea5f08575d26c) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Fix robots.txt revalidation in production: `nextRevalidation` now revalidates `/robots.txt` as a `layout` instead of a `page`. `createRobotsRoute` is a `force-static` route handler, and a `page` revalidation never purges a route handler in production's persistent route cache, so the stale robots.txt kept serving (it only appeared to work in dev). Mirrors the existing sitemap fix.

## 0.2.2

### Patch Changes

- [#24](https://github.com/kizlo-io/kizlo/pull/24) [`d00114b`](https://github.com/kizlo-io/kizlo/commit/d00114b9e5805c746370db65e91227fd01ecf08c) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Fix the server-to-server client losing procedure output types. Calls like `client.posts.list()` and `client.seo.robots()` now resolve `data` to the procedure's real output type instead of `any`.

- [#24](https://github.com/kizlo-io/kizlo/pull/24) [`d00114b`](https://github.com/kizlo-io/kizlo/commit/d00114b9e5805c746370db65e91227fd01ecf08c) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Add a `seo.homepage` procedure that resolves the homepage SEO head and JSON-LD graph from the WordPress plugin's `/seo/homepage` endpoint.

- Updated dependencies [[`d00114b`](https://github.com/kizlo-io/kizlo/commit/d00114b9e5805c746370db65e91227fd01ecf08c)]:
  - @kizlo/shared@0.1.2

## 0.2.1

### Patch Changes

- [#22](https://github.com/kizlo-io/kizlo/pull/22) [`2ca9854`](https://github.com/kizlo-io/kizlo/commit/2ca9854f8575567b997493141acd02ba7d375067) Thanks [@IDJGILL](https://github.com/IDJGILL)! - `kizlo dev` now runs the contract watcher inline, so contract types regenerate automatically without a separate `kizlo watch` process.

- [#20](https://github.com/kizlo-io/kizlo/pull/20) [`2ec6cd3`](https://github.com/kizlo-io/kizlo/commit/2ec6cd30f29cac53d792de9d4c2ba4775694a659) Thanks [@IDJGILL](https://github.com/IDJGILL)! - `kizlo init` now installs `kizlo@latest` instead of bare `kizlo`, ensuring the newest version is always added to new projects rather than a cached older one.

## 0.2.0

### Minor Changes

- [#15](https://github.com/kizlo-io/kizlo/pull/15) [`4ad1076`](https://github.com/kizlo-io/kizlo/commit/4ad1076e86c48648f48b6de90c8a273746648f13) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Add `service.settings`, a typed client for reading and updating Kizlo settings — `settings.get()` plus per-section update methods (`updateSite`, `updateWebhook`, …).

- [#19](https://github.com/kizlo-io/kizlo/pull/19) [`55c9409`](https://github.com/kizlo-io/kizlo/commit/55c9409cfe93da31c0d2a3e49f5981ffb6dfa2ec) Thanks [@IDJGILL](https://github.com/IDJGILL)! - `kizlo dev` now runs in the foreground and stops the stack on exit, instead of starting it and returning.

- [#19](https://github.com/kizlo-io/kizlo/pull/19) [`55c9409`](https://github.com/kizlo-io/kizlo/commit/55c9409cfe93da31c0d2a3e49f5981ffb6dfa2ec) Thanks [@IDJGILL](https://github.com/IDJGILL)! - The dev stack is now reachable from other devices on your network.

- [#19](https://github.com/kizlo-io/kizlo/pull/19) [`55c9409`](https://github.com/kizlo-io/kizlo/commit/55c9409cfe93da31c0d2a3e49f5981ffb6dfa2ec) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Prefix WordPress env vars with `KIZLO_` and split dev/production credentials behind a `createKizlo({ target })` switch, so `kizlo dev` never overwrites production credentials.

- [#15](https://github.com/kizlo-io/kizlo/pull/15) [`4ad1076`](https://github.com/kizlo-io/kizlo/commit/4ad1076e86c48648f48b6de90c8a273746648f13) Thanks [@IDJGILL](https://github.com/IDJGILL)! - The webhook receiver is now fixed at `/webhooks`. The `webhookPath` config option and the `createWebhookRouter({ path })` override have been removed.

- [#19](https://github.com/kizlo-io/kizlo/pull/19) [`55c9409`](https://github.com/kizlo-io/kizlo/commit/55c9409cfe93da31c0d2a3e49f5981ffb6dfa2ec) Thanks [@IDJGILL](https://github.com/IDJGILL)! - `kizlo init` now lets you connect your own WordPress with remote credentials or spin up a local Docker dev stack that mints an application password and wires the credentials into `.env` and `kizlo.config.ts`.

- [#15](https://github.com/kizlo-io/kizlo/pull/15) [`4ad1076`](https://github.com/kizlo-io/kizlo/commit/4ad1076e86c48648f48b6de90c8a273746648f13) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Rename the event API to drop the redundant `Webhook` infix: `WebhookEvent` → `KizloEvent`, `PostWebhookEvent` → `PostEvent`, `WebhookHandlerFn` → `EventHandlerFn`, `validateWebhookEvent` → `validateEvent` (and the same across `Term`/`Payment`/`Settings`). The transport helpers `signWebhook`, `verifyWebhook`, and `createWebhookRouter` keep the `webhook` name. Update any imports of the renamed symbols.

- [#19](https://github.com/kizlo-io/kizlo/pull/19) [`55c9409`](https://github.com/kizlo-io/kizlo/commit/55c9409cfe93da31c0d2a3e49f5981ffb6dfa2ec) Thanks [@IDJGILL](https://github.com/IDJGILL)! - The dev and test stacks now auto-select a free host port when the default is already taken.

### Patch Changes

- [#19](https://github.com/kizlo-io/kizlo/pull/19) [`55c9409`](https://github.com/kizlo-io/kizlo/commit/55c9409cfe93da31c0d2a3e49f5981ffb6dfa2ec) Thanks [@IDJGILL](https://github.com/IDJGILL)! - `kizlo dev` now installs the kizlo core WordPress plugin on a fresh dev stack. Previously only the test stack bootstrapped it, so a freshly provisioned dev install came up without the plugin active.

- [#19](https://github.com/kizlo-io/kizlo/pull/19) [`55c9409`](https://github.com/kizlo-io/kizlo/commit/55c9409cfe93da31c0d2a3e49f5981ffb6dfa2ec) Thanks [@IDJGILL](https://github.com/IDJGILL)! - `kizlo dev` now mints a REST application password on a fresh install and writes the WordPress connection (URL, username, application password) back into `.env`.

- [#19](https://github.com/kizlo-io/kizlo/pull/19) [`55c9409`](https://github.com/kizlo-io/kizlo/commit/55c9409cfe93da31c0d2a3e49f5981ffb6dfa2ec) Thanks [@IDJGILL](https://github.com/IDJGILL)! - `kizlo dev` and `kizlo init` now sync the Kizlo server's `url` and `backend_url` into the WordPress plugin alongside the site secret, so the plugin can reach the server to deliver webhook events.

- [#19](https://github.com/kizlo-io/kizlo/pull/19) [`55c9409`](https://github.com/kizlo-io/kizlo/commit/55c9409cfe93da31c0d2a3e49f5981ffb6dfa2ec) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Fix webhook delivery from the dockerized dev stack: a loopback `backend_url` (`localhost`/`127.0.0.1`) is rewritten to `host.docker.internal` when synced into the plugin, so the WordPress container can reach the host's server.

- [#18](https://github.com/kizlo-io/kizlo/pull/18) [`4dabeb0`](https://github.com/kizlo-io/kizlo/commit/4dabeb062658618a1e2120f06eab203cc87f64c6) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Fix `api`-scoped procedures whose input parts are all optional throwing "Input validation failed" when called with no arguments — `client.posts.list.call()` now works without passing `{}`. Procedures with a required `params`/`query`/`body` still validate.

- [#15](https://github.com/kizlo-io/kizlo/pull/15) [`4ad1076`](https://github.com/kizlo-io/kizlo/commit/4ad1076e86c48648f48b6de90c8a273746648f13) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Fix incoming webhook events not reaching handlers — deliveries returned a 500 instead of running the registered event handlers.

## 0.1.1

### Patch Changes

- [#10](https://github.com/kizlo-io/kizlo/pull/10) [`590bbd2`](https://github.com/kizlo-io/kizlo/commit/590bbd2f82d57984d1d993e5acd22b0c5772a6cb) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Bug fixes.

- Updated dependencies [[`590bbd2`](https://github.com/kizlo-io/kizlo/commit/590bbd2f82d57984d1d993e5acd22b0c5772a6cb)]:
  - @kizlo/shared@0.1.1

## 0.1.0

### Minor Changes

- [#3](https://github.com/kizlo-io/kizlo/pull/3) [`dfa9e21`](https://github.com/kizlo-io/kizlo/commit/dfa9e2144de43ba3b925a1194c34a86a97be45ec) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Initial public release.

### Patch Changes

- Updated dependencies [[`dfa9e21`](https://github.com/kizlo-io/kizlo/commit/dfa9e2144de43ba3b925a1194c34a86a97be45ec)]:
  - @kizlo/shared@0.1.0
