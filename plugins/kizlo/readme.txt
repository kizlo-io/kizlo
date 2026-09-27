=== Kizlo ===
Contributors: kizlo
Tags: headless, woocommerce, seo
Requires at least: 5.0
Tested up to: 6.7
Requires PHP: 8.2
Stable tag: 0.19.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A plugin that connects your WordPress with the Kizlo framework, headlessly.

== Description ==

-TODO

== Changelog ==

= 0.19.0 =
* Added: Allow sites and integrations to opt REST namespaces into automatic contract discovery.
* Added: Describe routes no WP_REST_Controller serves, and let a namespace name its own APIs.
* Added: Describe the WordPress core REST API in the generated contract, so wp/v2 and wp-site-health/v1 routes are typed alongside Kizlo's own
* Changed: Collapse custom-field groups, repeaters, and repeater rows in the post and term editors, so a long field set opens as a compact list of headers
* Changed: Describe an operation's request as separate params, query, and body schemas.
* Changed: Describe what supplying custom_fields does on the post type and taxonomy update inputs
* Changed: Identify a custom field by its name; the generated key is gone from the API.
* Changed: Limit core WordPress route envelopes to custom fields, extensions, and enabled SEO for every included content type.
* Changed: Namespace every API ID the plugin registers under `kizlo.`, so the generated client separates Kizlo's own routes from the WordPress and WooCommerce ones it only describes
* Changed: Publish one operation for a handler whose callback core does not name, however many write verbs it registers.
* Fixed: Allow integrations to register error codes for an introspected route without redeclaring its contract.
* Fixed: Apply configured custom fields and SEO to post types and taxonomies an integration contributes, such as WooCommerce products
* Fixed: Refresh managed post types and taxonomies after a plugin is activated or deactivated

[See the full changelog](https://github.com/kizlo-io/kizlo/blob/main/plugins/kizlo/CHANGELOG.md).
