---
"kizlo": minor
---

Generate a typed WordPress client from the active introspection document. Replace `wordpress.posts.*` and `wordpress.pages.*` with `wordpress.postTypes.post.*` and `wordpress.postTypes.page.*`, replace `wordpress.categories.*` and `wordpress.tags.*` with `wordpress.taxonomies.category.*` and `wordpress.taxonomies.postTag.*`, move `wordpress.menus.items.*` to `wordpress.menuItems.*`, and rename resource `.get()` calls to `.retrieve()`.
