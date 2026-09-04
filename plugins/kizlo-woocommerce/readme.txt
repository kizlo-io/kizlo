=== Kizlo WooCommerce ===
Contributors: kizlo
Tags: kizlo, woocommerce, headless, javascript, ai
Requires at least: 6.5
Tested up to: 6.7
Requires PHP: 8.2
Stable tag: 0.4.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Bring your WooCommerce store into any JavaScript runtime.

== Description ==

Connects WooCommerce with the @kizlo/woocommerce integration.

Requires the Kizlo core plugin and WooCommerce to be active.

== Changelog ==

= 0.4.0 =
* Added: Add a public customer-facing Order resource backed by the WooCommerce Store API
* Added: Create a WooCommerce customer on demand from the email identity when none exists
* Changed: Redesign the public Cart resource around complete Store API data and require WooCommerce 11.0.1
* Changed: Redesign the public Checkout resource around WooCommerce Store API contracts
* Fixed: Authorize Store API order retries as the resolved customer
* Fixed: Merge guest carts safely within authenticated cart and checkout requests.

[See the full changelog](https://github.com/kizlo-io/kizlo/blob/main/plugins/kizlo-woocommerce/CHANGELOG.md).
