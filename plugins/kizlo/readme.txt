=== Kizlo ===
Contributors: kizlo
Tags: headless, woocommerce, seo
Requires at least: 5.0
Tested up to: 6.7
Requires PHP: 8.2
Stable tag: 0.6.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A plugin that connects your WordPress with Kizlo toolkit, headlessly.

== Description ==

-TODO

== Changelog ==

= 0.6.0 =
* Changed: Emit a per-group webhook event when settings are saved instead of a single settings.saved event. Each settings section fires settings.<group>.updated once per save, and the post type and taxonomy sections include the changed entry key in the payload.
* Changed: Render the Site Secret field as a masked text input with a show/hide toggle instead of a password field, so browsers no longer offer to save or autofill it as a login credential.

[See the full changelog](https://github.com/kizlo-io/kizlo/blob/main/plugins/kizlo/CHANGELOG.md).
