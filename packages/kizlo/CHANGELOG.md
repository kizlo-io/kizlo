# kizlo

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
