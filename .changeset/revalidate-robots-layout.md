---
"kizlo": patch
---

Fix robots.txt revalidation in production: `nextRevalidation` now revalidates `/robots.txt` as a `layout` instead of a `page`. `createRobotsRoute` is a `force-static` route handler, and a `page` revalidation never purges a route handler in production's persistent route cache, so the stale robots.txt kept serving (it only appeared to work in dev). Mirrors the existing sitemap fix.