=== Kizlo ===
Contributors: kizlo
Tags: headless, woocommerce, seo
Requires at least: 5.0
Tested up to: 6.7
Requires PHP: 8.2
Stable tag: 0.2.2
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A plugin that connects your WordPress with Kizlo toolkit, headlessly.

== Description ==

-TODO

== Changelog ==

= 0.2.2 =
* Added: Add a per-post SEO meta box to override title, description, canonical, robots, and social image in the editor. Empty fields fall back to the defaults.
* Added: Add a `seo.homepage` endpoint returning the homepage SEO head and JSON-LD.
* Added: Homepages set to an Article type now output article Open Graph tags (published/modified time, author, section, tags).
* Added: Sitemaps now follow your Reading settings: the homepage is listed as the site root and the blog index leads the post sitemap.
* Fixed: Fix sitemap, canonical, and author URLs dropping the port on sites running a non-standard port.
* Fixed: Posts and terms now fall back to the site fallback image for Open Graph and Twitter when no override or featured image is set.

[See the full changelog](https://github.com/kizlo-io/kizlo/blob/main/plugins/kizlo/CHANGELOG.md).
