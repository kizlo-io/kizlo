=== Kizlo ===
Contributors: kizlo
Tags: headless, woocommerce, seo
Requires at least: 5.0
Tested up to: 6.7
Requires PHP: 8.2
Stable tag: 0.12.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A plugin that connects your WordPress with the Kizlo framework, headlessly.

== Description ==

-TODO

== Changelog ==

= 0.12.0 =
* Added: Add a Kizlo API contract system and the GET /kizlo/v1/introspect endpoint that serves it
* Added: Add custom fields for post types and taxonomies, configurable from the settings admin
* Added: Add kizlo_translate_spec_properties() and kizlo_translate_spec_schema() so a plugin can describe another API's routes from its own schemas
* Added: Attachment uploads through the managed post type route, which now creates a real file instead of an empty record
* Added: Create and manage custom post types and taxonomies from the WordPress admin, with registration options, activation, and permanent deletion.
* Added: Describe every Kizlo route in the introspection contract, so /introspect covers settings, SEO, comments, users and email as well as managed content
* Added: Describe the WordPress comment, menu and menu item routes in /introspect
* Added: Gate extension plugins on a Kizlo Requires header, so one built for a newer Kizlo reports what it needs instead of fataling
* Added: Include a format version in every introspection document
* Added: Publish operation-level WordPress error codes in the introspection contract
* Added: Report contract problems as typed diagnostics and exclude only what is broken, instead of failing the whole document
* Changed: Derive managed post type and taxonomy item and input schemas from the WordPress controller, and pin responses to a single shape
* Changed: Rename the spec registration helpers and defer each callable factory until its route contract is needed
* Changed: Require each introspection operation to declare one scalar HTTP method
* Changed: Stop declaring the context errors that routes without a context parameter cannot raise
* Changed: Stop declaring the permission-check errors that kizlo/v1 routes cannot raise
* Fixed: Derive managed list parameters from the WordPress controller that serves the route, so filters like tax_relation and search_columns are described and usable
* Fixed: Describe post status as a shared schema and enforce it on list, create and update
* Fixed: Enforce each managed post type and taxonomy route's declared input, fixing a delete with force=false destroying content instead of trashing it
* Fixed: Format generated WordPress client types and summaries like hand-written code
* Fixed: Honour the method declared on a route interceptor, which was read under the wrong key and ignored
* Fixed: Manage only the post types the site opted in to
* Fixed: Reject an override that widens an inherited property, which generated a type the client could not compile
* Fixed: Reject API IDs that collide with generated client members
* Fixed: Report derivation diagnostics in the build that finds them without duplicating them on rebuild
* Fixed: Report the callback and permission_callback arguments kizlo_register_route requires or discards

[See the full changelog](https://github.com/kizlo-io/kizlo/blob/main/plugins/kizlo/CHANGELOG.md).
