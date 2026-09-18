=== Kizlo ===
Contributors: kizlo
Tags: headless, woocommerce, seo
Requires at least: 5.0
Tested up to: 6.7
Requires PHP: 8.2
Stable tag: 0.18.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A plugin that connects your WordPress with the Kizlo framework, headlessly.

== Description ==

-TODO

== Changelog ==

= 0.18.0 =
* Added: Author per-post and per-term SEO over the REST API through the kizlo.seo write property.
* Changed: Write custom-field values under `kizlo.custom` instead of a top-level `custom` property, matching where they are read from
* Fixed: Stop publishing `multipleOf` for a number field whose minimum offsets its step, which contradicted the editor and the stored rule
* Fixed: Validate submitted custom fields and SEO overrides on managed write routes, so an invalid value is rejected with a 400 instead of being silently dropped.

[See the full changelog](https://github.com/kizlo-io/kizlo/blob/main/plugins/kizlo/CHANGELOG.md).
