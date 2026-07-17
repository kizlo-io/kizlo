# kizlo

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
