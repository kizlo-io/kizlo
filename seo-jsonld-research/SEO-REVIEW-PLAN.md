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
| 0 | Settings resolution (foundation) | ☑ done | 2026-07-07 |
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
- [x] `Settings` shape documented (which fields are per-post-type / per-taxonomy / global)
- [x] Per-post meta fields + their fallbacks documented
- [x] Precedence table complete for all fields above
- [x] Empty-string vs null vs missing behavior confirmed for each override

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

### 2026-07-07 / Phase 0 — Settings resolution (foundation)

Pure audit session: no code changed. Mapped the three-layer merge that every later
phase depends on. Findings below; the precedence table is the deliverable.

**The three layers (later wins):**

1. **WP globals** — `get_bloginfo('name')`, `get_bloginfo('description')`, `get_option
   ('show_on_front'/'page_on_front')`, `get_permalink`/`get_term_link`/`get_author_posts_url`,
   featured image, dates. Only consulted as a *fallback* when Kizlo settings are unset.
2. **Kizlo settings** (`Settings::cached()` → the `Settings` object). Scopes:
   - `site` (global): `getName()`, `getTagline()`, `getUrl()`, `getFallbackImage()`,
     `getDiscourageSearchEngines()`.
   - `identity` (global): org-vs-person branch + social profiles (twitter handle).
   - `authors` (global-for-all-authors): `getEnabled()`, `getSearchEngineVisibility()`,
     `getTitleStructure()`, `getDescriptionStructure()`, `getPathnameStructure()`.
   - `postTypes` (**per post type**): `getTitleStructure()`, `getDescriptionStructure()`,
     `getWebpageType()`, `getArticleType()`, `getSearchEngineVisibility()`,
     `getPathnameStructure()`.
   - `taxonomies` (**per taxonomy**): same shape as postTypes minus article/webpage type.
   - `crawling` (global): robots.txt custom rules + sitemap toggles (Phase 1/4).
3. **Per-post meta** (`postSeoOverrides()`, keys in `SeoBase::OVERRIDE_KEYS`). **Posts only.**
   13 keys: `title, description, canonical, webpage_type, article_type, noindex, nofollow,
   og_title, og_description, og_image_id, twitter_title, twitter_description, twitter_image_id`.

**Empty/null/missing semantics (confirmed):**
- Write side (`SeoMetaBox::save`): every field sanitized, then `empty($value)` →
  `delete_post_meta` (key removed), else `update_post_meta`. So `''`, `'0'`, `0` all delete.
- Read side (`postSeoOverrides`): a key is included only when `!== '' && !== false && !== null`.
  Absent key = "inherit". `noindex`/`nofollow` stored as `'1'`; read via `!empty()`.
- Downstream every override is gated by `!empty(...)`, so a stored literal `"0"` would be
  treated as unset (theoretical edge; the save side already strips it, so unreachable).

**Per-field precedence table** (→ = "falls back to"):

| Field | Home (static front page) | Home (latest posts) | Post | Term | Author |
|-------|--------------------------|---------------------|------|------|--------|
| **title** | override → post-type title tpl → site name | site name (`site->getName()` → `bloginfo`) | override → post-type title tpl → `DEFAULT_POST_TITLE_TEMPLATE` | taxonomy title tpl → `DEFAULT_TAX_TITLE_TEMPLATE` *(no per-term override)* | author title tpl → `DEFAULT_AUTHOR_TITLE_TEMPLATE` *(no override)* |
| **description** | override → post-type desc tpl → tagline | tagline (`site->getTagline()` → `bloginfo`) | override → post-type desc tpl → default | taxonomy desc tpl → default *(no override)* | author desc tpl → default *(no override)* |
| **canonical/url** | override canonical → `getBaseUrl()` | `getBaseUrl()` | override canonical → `resolvePostUrl` | `resolveTermUrl` *(no override)* | `resolveAuthorUrl` *(no override)* |
| **image (og/tw base)** | override og/tw image → `site->getFallbackImage()` | same (front-page overrides empty) | override og/tw image → featured image (`get_post_thumbnail_id`) | none (`null`) | avatar (`get_avatar_url` 1200) *(no override)* |
| **robots index** | `!override.noindex` (front page's meta) | always `index` | `postType.visibility && !override.noindex` | `taxonomy.visibility` | `authors.enabled && authors.visibility` |
| **robots follow** | `!override.nofollow` | always `follow` | `!override.nofollow` | always `follow` | always `follow` |
| **og:* overrides** | og_title/og_description/og_image → base title/desc/image | base only | og_* → base | base only (no og override) | base only |
| **twitter:* overrides** | tw_* → og_* → base (see `resolveSocial`) | og→base | tw_* → og_* → base | base | base |
| **webpage_type** | resolved for front page (`homeWebPageLd`) | `WebSite`/home type | override → `postType.getWebpageType()` | hardcoded `CollectionPage` | hardcoded `ProfilePage` |
| **article_type** | front page: override → post-type article type (only if a real type) | none | override → `postType.getArticleType()`; `none`/empty ⇒ no Article | none | none |

Global override sitting above everything: **`site->getDiscourageSearchEngines()`** forces
`noindex` in `buildRobots()` regardless of the per-schema `indexable` flag (added in Phase 1).

**Findings:**
1. **Overrides were posts-only — a gap, now filled for terms.** Terms and authors had no
   metabox, so their title/description/canonical/robots resolved straight from
   taxonomy/author settings with no third layer. The term gap was intended to exist and
   has now been closed (see follow-up below); the table's Term column gains a layer-3
   override path. **Authors stay settings-only** (matches Yoast, which puts no SEO metabox
   on the user profile — the extra author schema fields like honorific/birth date are
   deferred). Phase 2/3 author tests must still not assume a per-author override path.
2. **The static front page is a post**, so `homeOverrides()` reads that page's `_kizlo_seo_*`
   meta. The homepage therefore *does* honor the per-post override layer; the latest-posts
   homepage never does (no underlying post). The two home columns above differ for exactly
   this reason.
3. **`resolveSocial` twitter→og→base chain** is the only place a field cascades across two
   override tiers; everything else is a single override-or-default. Flagged for Phase 2.
4. **`!empty()` treats `"0"` as unset** everywhere overrides are consumed. Harmless today
   (save side strips it) but worth a note if the metabox ever stops deleting empties.

**Follow-up (same day) — term metabox built (Phase 0 gap fill):**
- **New `TermSeoMetaBox`** (`Modules/Seo/`) mounts the same React root as the post box on
  the edit-term screen of every managed taxonomy, via `{taxonomy}_edit_form_fields` +
  `edited_{taxonomy}` (terms don't use `add_meta_boxes`). Registered in `SeoModule`.
  Edit-term screen only (not the add-new quick form). Reuses the `seo` JS bundle (same
  namespace segment, so `Asset::enqueue('kizlo-seo', self::class)` resolves to the same build).
- **Storage** is term meta (`get_term_meta`/`update_term_meta`), reusing the shared
  `OVERRIDE_KEYS` — a separate table from post meta, so no collision. New
  `SeoBase::termSeoOverrides(WP_Term)` mirrors `postSeoOverrides`. Same empty/null/missing
  semantics as posts (empty ⇒ `delete_term_meta` ⇒ inherit).
- **Field subset:** title, description, canonical, noindex/nofollow, og/twitter
  (title, desc, image). **No `webpage_type`** (terms are always `CollectionPage`) and **no
  `article_type`** (N/A). The React `MetaBox` gained a `variant: "post" | "term"` prop that
  hides those two accordions and swaps the post/term wording; term defaults send empty
  schema-type values so nothing extra is persisted.
- **Resolution:** `TermSchema::buildMeta` now layers overrides — title/description via the
  override-or-template path (`getTermTitle`/`getTermDescription`), canonical via override,
  robots via `visibility && !noindex` (+ `nofollow`), and social via the shared
  `resolveSocial` (twitter → og → base). This answers one open question below: a term's
  social **image** now has a source (the og/twitter override); base image stays `null`
  (still no taxonomy default-image setting — intended).
- **Delivery layer wired.** The editor stores + `TermSchema` resolves, but resolved term
  SEO reached the frontend nowhere (posts go through `PostExtension` on `rest_prepare_post`;
  terms had no equivalent — only sitemap entries). Added **`TermExtension`**
  (`Modules/Taxonomy/`, registered in `TaxonomyModule`) hooking `rest_prepare_{taxonomy}` for
  every managed taxonomy (same `settings->taxonomies->all()` set as the editor, so category /
  post_tag / any included `show_in_rest` custom tax like product_cat all get it). Single-term
  responses now carry `kizlo.seo.head` + `kizlo.seo.schema`; list + single carry a light term
  base (id/name/slug/description/parent/count) + the `kizlo_extend_term(_list_item)` filter.
- **Tests:** 5 new `TermSchemaTest` cases (override wins, noindex/nofollow force, twitter→og
  fallback, og-image override) + `applyTermOverrides` helper in `SeoTestCase`; 3 new
  `TermExtensionTest` cases (single carries head/schema, reflects overrides, list omits seo).
  Full plugin suite green (142 tests), PHPStan clean, both TS projects typecheck, plugin JS builds.

**Open questions for next session (Phase 2):** confirm author og image should be the avatar
rather than the site fallback (authors remain settings-only, no override layer).

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