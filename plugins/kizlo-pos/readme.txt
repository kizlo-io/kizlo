=== Kizlo POS ===
Contributors: idjgill
Tags: woocommerce, pos
Requires at least: 6.5
Requires PHP: 8.2
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html
Requires Plugins: kizlo, woocommerce

A full-screen, responsive workspace for your WooCommerce store.

== Description ==
Open /pos/ on your WordPress site as an Administrator or Shop Manager.
Products and Sell are primary destinations; Orders and Settings are secondary.
Browse and search published products by name or exact SKU/barcode, inspect
variations, and share one main image with a caption built from a store-wide template.
Configure caption tags in WooCommerce > Settings > Kizlo > POS. No public website
is required. Text-only sharing and manual-copy fallbacks remain available. The
responsive workspace includes account/store identity and light/dark themes. Sell supports
camera and keyboard-mode scanning, a recoverable cart, server-calculated checkout,
collected cash through COD, and online order-payment links. Order browsing remains
a later feature. Image sharing depends on browser/CORS support;
images over 5 MiB are omitted. A variation's own main image takes precedence over
the parent's main image. Browser limitations fall back to the caption alone.
Products are not cached offline. Configure customer/address collection and payment
handoff in POS settings. Missing shipping uses the full store address for shipping
and tax calculation. Payment links work without customer login; email uses the
WooCommerce template. Other notification channels require an integration.

== Installation ==
1. Install and activate Kizlo 0.20.0 or newer and WooCommerce 11.0.1 or newer.
2. Upload the built Kizlo POS ZIP through Plugins > Add New and activate it.
3. Open your site's /pos/ address and sign in through WordPress.

If existing content uses /pos/, rename or move it first. POS never replaces it.

== Changelog ==
= 0.1.0 =
* Initial POS app foundation.
