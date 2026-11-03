=== Kizlo WooCommerce ===
Contributors: kizlo
Tags: kizlo, woocommerce, headless, javascript, ai
Requires at least: 6.5
Tested up to: 6.7
Requires PHP: 8.2
Stable tag: 0.14.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Bring your WooCommerce store into any JavaScript runtime.

== Description ==

Connects WooCommerce with the @kizlo/woocommerce integration.

Requires the Kizlo core plugin and WooCommerce to be active.

== Changelog ==

= 0.14.0 =
* Added: Add authenticated paginated order history with shared order numbers and UTC creation dates.
* Added: Require updated Kizlo core content-dependency APIs and emit content changes from persisted product, variation and attribute-definition writes.
* Removed: Remove checkout cart rebuilding; read current cart data through the cart API.
* Fixed: Resolve missing authenticated customers without requiring a cart request and coordinate customer creation across requests.

[See the full changelog](https://github.com/kizlo-io/kizlo/blob/main/plugins/kizlo-woocommerce/CHANGELOG.md).
