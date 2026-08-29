=== Kizlo WooCommerce ===
Contributors: kizlo
Tags: kizlo, woocommerce, headless, javascript, ai
Requires at least: 6.5
Tested up to: 6.7
Requires PHP: 8.2
Stable tag: 0.3.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Bring your WooCommerce store into any JavaScript runtime.

== Description ==

Connects WooCommerce with the @kizlo/woocommerce integration.

Requires the Kizlo core plugin and WooCommerce to be active.

== Changelog ==

= 0.3.0 =
* Changed: Call the companion package an integration in plugin metadata and documentation
* Changed: Group product custom fields under `extensions.kizlo.custom` with exact generated types
* Changed: Return shared image media shapes for product, cart, and taxonomy images
* Changed: Serve complete product enrichment and optional recommendation contracts through WooCommerce Store API responses
* Fixed: Emit Store API product sale dates as RFC 3339 UTC values

[See the full changelog](https://github.com/kizlo-io/kizlo/blob/main/plugins/kizlo-woocommerce/CHANGELOG.md).
