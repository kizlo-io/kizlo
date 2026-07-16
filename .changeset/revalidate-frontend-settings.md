---
"kizlo": minor
---

The Next.js revalidation integration now refreshes the whole site with `revalidatePath("/", "layout")` when a frontend-affecting settings group changes, so edits like SEO metadata surface without a manual purge. This covers every settings group except `settings.crawling.updated` (robots.txt only, already handled by the robots cache tag) and `settings.integration.updated` (backend webhook config). Revalidation stays lazy, so routes re-render on their next request with cached content served warm from the Data Cache.
