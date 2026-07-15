=== Kizlo ===
Contributors: kizlo
Tags: headless, woocommerce, seo
Requires at least: 5.0
Tested up to: 6.7
Requires PHP: 8.2
Stable tag: 0.5.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A plugin that connects your WordPress with Kizlo toolkit, headlessly.

== Description ==

-TODO

== Changelog ==

= 0.5.0 =
* Added: Added theme color and background color settings to Brand. They drive the web app manifest's theme_color and background_color used on the install and splash surfaces.
* Added: Brand gains a dark-scheme theme color. The color inputs validate hex format in the admin, and the dark theme color drives a prefers-color-scheme dark meta theme-color on the frontend.
* Added: Media in settings responses now includes WordPress's generated resized renditions (variants), so the frontend can select real icon sizes (e.g. 192/512 for the web manifest) instead of scaling one source.
* Changed: Media assets returned by the settings API now include pixel dimensions (width and height) for raster sources, so the frontend can declare each brand icon at its true size.
* Changed: Media assets returned by the settings API now include the file's mime type, so the frontend can render each brand asset (logos, favicons, icons) by its actual format.
* Changed: Split the single App icon brand setting into separate iOS and Android app icons. The iOS icon feeds the full-bleed apple-touch-icon; the Android icon feeds a maskable web-manifest entry with a padded safe zone. Existing square icon and favicon are still used as fallbacks.

[See the full changelog](https://github.com/kizlo-io/kizlo/blob/main/plugins/kizlo/CHANGELOG.md).
