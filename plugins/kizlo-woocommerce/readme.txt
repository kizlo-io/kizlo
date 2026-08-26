=== Kizlo WooCommerce ===
Contributors: kizlo
Tags: kizlo, woocommerce, headless, javascript, ai
Requires at least: 6.5
Tested up to: 6.7
Requires PHP: 8.2
Stable tag: 0.2.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Bring your WooCommerce store into any JavaScript runtime.

== Description ==

Connects WooCommerce with the @kizlo/woocommerce integration.

Requires the Kizlo core plugin and WooCommerce to be active.

== Changelog ==

= 0.2.0 =
* Added: Describe the cart, order stock and product routes in the Kizlo introspection contract
* Added: Describe the WooCommerce Store API and REST v3 routes Kizlo consumes in /introspect, derived from WooCommerce's own route and schema classes
* Added: Describe WooCommerce operation error codes in the introspection contract
* Changed: Declare each WooCommerce introspection operation with one scalar HTTP method
* Changed: Declare the cart mutation arguments WooCommerce registers as optional but its handlers require
* Changed: Defer WooCommerce route and schema derivation until Kizlo requests the introspection contract
* Changed: Require Kizlo 0.12.0 and WooCommerce 10.9, and report which one is missing instead of starting without it
* Fixed: Describe the cart add-item response as the HTTP 201 WooCommerce sends, so the generated client narrows on the real status

[See the full changelog](https://github.com/kizlo-io/kizlo/blob/main/plugins/kizlo-woocommerce/CHANGELOG.md).
