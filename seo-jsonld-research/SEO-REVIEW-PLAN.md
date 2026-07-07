# SEO Feature Review Plan

Multi-session review of the Kizlo SEO features. Goal: re-derive the intended logic
of each feature with fresh eyes, catch bugs, and realign the existing tests so they
assert the *correct* behavior (the tests were generated from current code, so they
may encode current bugs).

## How to use this doc

- Each **Session** below is self-contained. Do one per sitting; don't bleed into the next.
- At the start of a session, read: this file's **Ground rules**, the **Settings precedence**
  section, and the target session's block.
- The per-feature loop is always the same:
  1. Read the method(s) listed for the session.
  2. Claude states what the code *currently* does, covering all three settings layers.
  3. User confirms or corrects against intent.
  4. Fix code and/or realign the test.
  5. Tick the checklist, jot findings in **Session log**, commit.
- Update **Status** and **Session log** before ending a session so the next cold session can resume.

## Status

| Phase | Feature | State | Session |
|-------|---------|-------|---------|
| 0 | Settings resolution (foundation) | ☐ not started | — |
| 1 | Robots | ☑ done | 2026-07-07 |
| 2 | Head meta (og / twitter / article) | ☐ not started | — |
| 3 | JSON-LD | ☐ not started | — |
| 4 | Sitemap | ☐ not started | — |

State legend: ☐ not started · ◐ in progress · ☑ done

## Ground rules

- The logic stays; we're auditing, not rewriting. Only change code where the current
  behavior is wrong vs. intent.
- When code and test disagree, decide which is wrong *before* editing either. Never edit
  a test just to make it pass.
- Everything is dynamic: output is a function of three input layers (see below). Every
  claim about behavior must account for all three.
- Run the SEO test suite after each session's fixes:
  `cd plugins/kizlo && composer test -- --filter Seo` (confirm exact command on first run).

## Settings precedence (the spine — read every session)

Three input layers, resolved in this order (later overrides earlier):

1. **WP global settings** — site title, tagline, page-on-front, permalinks, etc.
2. **Kizlo plugin settings** — `Utils::getSettings()` → the `Settings` object passed into
   every schema constructor. Per-post-type / per-taxonomy settings, identity (org vs person),
   templates, social defaults.
3. **Per-post SEO meta** — the metabox overrides on an individual post
   (`postSeoOverrides()` in `SeoBase`).

Phase 0 produces the authoritative map of how each field (title, description, image,
robots, og/twitter overrides, article type) flows through these three layers. Every later
phase references that map instead of re-deriving it.

## Code map

Engine: `plugins/kizlo/src/php/Modules/Seo/SeoBase.php` (~1219 lines) — shared logic for
all schemas.

Schema subclasses (each: `buildMeta()` + `jsonLd()` [+ `sitemapEntries()`]):
- `HomeSchema.php`
- `AuthorSchema.php`
- `TermSchema.php`
- `PostSchema.php` (in `Modules/Post/`, not `Modules/Seo/`)

Surface:
- `SeoModule.php` — routes: `/seo/robots`, `/seo/homepage`, `/seo/sitemaps`,
  `/seo/sitemaps/:type[/:key]`
- `SeoMetaBox.php` — per-post SEO editor
- `SeoRobot.php` — tiny

Tests: `plugins/kizlo/tests/Seo/*.php` (15 files, ~2760 lines). `*ShapeTest` = structure;
per-schema tests = behavior.

Reference JSON: `seo-jsonld-research/ours/` (our output) vs `seo-jsonld-research/yoast-official/`
(Yoast reference) — for Phase 3 JSON-LD comparison.

---

## Phase 0 — Settings resolution (do first)

**Why first:** every feature depends on the three-layer merge. Map it once, reuse everywhere.

Read:
- `SeoBase::postSeoOverrides()` (~L526)
- `SeoBase::resolveSocial()` (~L446)
- `SeoBase::effectiveWebpageType()` (~L546), `effectiveArticleType()` (~L557)
- `Utils::getSettings()` and the `Settings` type
- `SeoMetaBox.php` (what per-post fields exist and their defaults)

Deliverable: a per-field precedence table (title, description, canonical/url, image,
robots index/follow, og overrides, twitter overrides, article type) written into the
**Session log** below.

Checklist:
- [ ] `Settings` shape documented (which fields are per-post-type / per-taxonomy / global)
- [ ] Per-post meta fields + their fallbacks documented
- [ ] Precedence table complete for all fields above
- [ ] Empty-string vs null vs missing behavior confirmed for each override

---

## Phase 1 — Robots

Read: `robots()` (~L48), `buildRobots()` (~L312), `isNoindexed()` (~L213),
`noindexedCountsByType()` (~L185). Route: `getRobots` in `SeoModule`.

Checklist:
- [x] `robots.txt` output correct vs WP `blog_public` + Kizlo settings — by design we
      ignore `blog_public`; added Kizlo `discourage_search_engines` toggle instead
- [x] noindex resolution matches Phase 0 precedence — fixed author enabled-gating
- [x] sitemap reference in robots points at the right URL
- [x] Tests realigned — fixed custom-rules shape tests; added discourage + disabled-author cases

---

## Phase 2 — Head meta (og / twitter / article)

Read: `buildOg()` (~L336), `buildTwitter()` (~L369), `buildArticleMeta()` (~L484),
`resolveSocial()` (~L446), `imageDetails()` (~L412), and each schema's `buildMeta()`.

Checklist:
- [ ] Title / description resolution matches Phase 0 per schema (home, post, term, author)
- [ ] og:* fields correct (type, url, image w/ dimensions, site_name, locale)
- [ ] twitter:* fields correct (card type, image, creator/site)
- [ ] article:* only on article types; published/modified/author/section/tag correct
- [ ] Image fallback chain correct (per-post → settings default → none)
- [ ] Tests realigned: `MetaShapeTest`, `PostSchemaMetaTest`

---

## Phase 3 — JSON-LD

Read: `toGraph()` (~L642), `baseGraph()` (~L655), `webSiteLd()` (~L670),
`webPageLd()` (~L730), `imageObjectLd()` (~L790), `primaryImageLd()` (~L821),
`organizationIdentityLd()` (~L835), `personIdentityLd()` (~L908),
`personAuthorLd()` (~L939), `buildArticleLd()` (~L580), `schemaId()` (~L1027),
`publisherId()` (~L1014), and each schema's `jsonLd()`.

Checklist:
- [ ] `@graph` node set correct per page type (home, post, term, author)
- [ ] `@id` references resolve (no dangling refs between nodes)
- [ ] Org vs Person identity branch correct (compare `ours/org/*` vs `ours/person/*`)
- [ ] Output diffed against `yoast-official/*` for parity where intended
- [ ] Image / logo objects well-formed (dimensions, contentUrl, @id)
- [ ] Publisher / author wiring correct on articles
- [ ] Tests realigned: `JsonLdShapeTest`, `*SchemaJsonLdTest`, `Home/Term/AuthorSchemaTest`

---

## Phase 4 — Sitemap

Read: `sitemapIndex()` (~L102), lastmod helpers (`getPostTypeLastMod` ~L225,
`getTaxonomyLastMod` ~L247, `getAuthorsLastMod` ~L285), each schema's `sitemapEntries()`.
Routes: `getSitemaps`, `getSitemapsUrls` in `SeoModule`.

Checklist:
- [ ] Index lists only enabled + non-empty post types / taxonomies / authors
- [ ] noindexed items excluded from counts and entries (ties to Phase 1)
- [ ] Pagination correct (page param, chunk size, last page)
- [ ] lastmod values correct per type
- [ ] URLs match the resolvers (`resolvePostUrl`, `resolveTermUrl`, `resolveAuthorUrl`)
- [ ] Tests realigned: `SitemapShapeTest`, `SitemapIndexTest`, `PostSchemaSitemapTest`

---

## Session log

Record findings, decisions, and bugs here as you go. Newest at top.

### 2026-07-07 / Phase 1 — Robots

- **What the code does:**
  - Two robots surfaces. `SeoBase::robots()` builds robots.txt (`/seo/robots`);
    `buildRobots()` builds each page's meta robots directive block.
  - robots.txt: base rule `{user_agent:'*', allow:['/'], disallow:[]}`; a post type /
    taxonomy is disallowed when `!getSearchEngineVisibility()` and it has a pathname;
    the author archive when `(!enabled || !visibility)` and it has a pathname. Custom
    rules, when present, replace the whole generated set. Sitemap line appended when
    `include_sitemap` (default true).
  - meta robots: full static directive set; only `index`/`follow` flip. `indexable`
    resolves per schema — Home = `!override.noindex`; Post = `postType.visibility &&
    !override.noindex`; Term = `taxonomy.visibility`; Author = visibility only (bug, see
    below).
- **Bugs found:**
  1. **`blog_public` gap → resolved by design.** WP's "Discourage search engines" was
     never consulted, and intentionally should not be: a headless origin usually hides
     the WP site itself. Instead added a Kizlo-owned toggle for discouraging the
     *frontend*. Off by default (frontend stays indexable).
  2. **Custom-rules shape mismatch (real bug).** Stored as `{user_agent, rule, path}`
     (matches `sanitizeCustomRules` + TS `KizloCrawlingSettings`) but `robots()` dumped
     them raw into `rules`, while the client (`WPK_RobotRule`) and the default branch
     use `{user_agent, allow[], disallow[]}`. Client got `allow: undefined`. Now grouped.
  3. **Author meta robots ignored `getEnabled()`.** robots.txt disallowed a disabled
     author archive, but `AuthorSchema` meta emitted `index`. The `AuthorSchemaTest`
     docblock states enable+visibility should gate robots, confirming code was wrong.
- **Fixes made (code):**
  - `SiteSettings`: new `discourage_search_engines` bool (default false) + getter/setter
    + sanitize; TS `KizloSiteSettings` mirrors it.
  - `SeoBase::robots()`: discourage short-circuits to blanket disallow + drops sitemap;
    custom rules grouped via new `groupCustomRules()` into the emitted shape.
  - `SeoBase::buildRobots()`: discourage forces noindex regardless of caller flag.
  - `AuthorSchema::buildMeta()`: robots now `enabled && visibility`.
  - `RobotsSettings`: fixed `getCustomRules`/`setCustomRules` docblocks to real stored
    shape.
- **Fixes made (tests):** realigned the two custom-rules tests that encoded the old raw
  passthrough (`SitemapShapeTest`, `SitemapIndexTest`) to the grouped shape; added
  discourage cases to `SitemapShapeTest` (robots.txt) and `MetaShapeTest` (meta noindex);
  added disabled-author-noindex to `AuthorSchemaTest`. Full suite green (135 tests);
  PHPStan clean. (No standalone `RobotsTest` — robots tests already live in the sitemap
  shape/index files; kept that home.)
- **Follow-up (same day, after live testing at localhost:8080):**
  - **Decision: robots.txt no longer emits per-collection `Disallow` at all.** The
    original `Disallow` (raw template `/author/{{slug}}`) was inert. A first pass reworked
    it to derive real base prefixes (`/blog/`, `/blog/category/`, `/author/`), but live
    testing exposed the deeper flaw: taxonomies nest under the posts front, so
    `Disallow: /blog/` (hidden posts) also blocks a still-visible `/blog/category/`, and a
    path `Disallow` blocks crawling so Google never sees the `noindex` tag. Same reason
    Yoast doesn't disallow noindexed content. So hidden collections are deindexed purely
    **per-URL**: each schema already emits `noindex` (post = type visibility, term =
    taxonomy visibility, author = enabled && visibility) and `sitemapIndex()` already
    excludes hidden post types (L230), taxonomies (L261), and disabled/hidden authors
    (L277). `robots()` now returns a clean allow-root group; the derivation helpers were
    removed. Verified live: hidden post/category → `disallow: []`.
  - **Pages toggle kept (earlier removal reverted).** It had been hidden to avoid a
    `Disallow: /` for root-level pages, but with no per-collection disallows that risk is
    gone, so the toggle stays for uniform behavior (hiding pages = noindex + sitemap
    omission, like any collection).
  - **Frontend `robots.ts` fixed.** Was re-adding a hardcoded sitemap when the API omits
    it (so `include_sitemap` off still printed one) and was statically cached. Now:
    `export const dynamic = "force-dynamic"` and the sitemap is omitted when the API list
    is empty. (The invalid prod app password in `web/.env` was a red herring —
    `KIZLO_TARGET=dev` uses the valid dev creds, so the app wasn't hitting the error path.)
  - Tests realigned: robots ruleset now asserts a clean allow-root; obsolete
    disallow-derivation tests replaced with "never disallows hidden collections" cases.
    Suite green (135 tests), PHPStan clean, both TS projects typecheck clean.
  - **Custom rules replace the default ruleset (final; briefly tried augment).** robots.txt
    groups don't stack — a crawler obeys one user-agent group — so a baseline `Allow: /`
    merged into a user's `*` group wins ties and defeats an intended `Disallow: /`, making
    "allow only Googlebot, block everyone else" impossible under augment. The default group
    is a no-op anyway (a group with no rules already allows all), so replacing loses
    nothing while giving full manual control. `groupCustomRules()` groups the stored flat
    directives by agent; discourage stays the top override.
  - **`discourage_search_engines` UI added.** Was wired through PHP `SiteSettings` + TS
    types but had no control; added a "Search engine visibility" toggle to the Site
    settings page (`site.tsx`) + zod schema + `SiteSettings` frontend type.
- **Open questions for next session:** none for robots.

### (template)
- **Date / phase:**
- **What the code does:**
- **Bugs found:**
- **Fixes made (code / tests):**
- **Open questions for next session:**