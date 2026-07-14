=== Kizlo ===
Contributors: kizlo
Tags: headless, woocommerce, seo
Requires at least: 5.0
Tested up to: 6.7
Requires PHP: 8.2
Stable tag: 0.4.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A plugin that connects your WordPress with Kizlo toolkit, headlessly.

== Description ==

-TODO

== Changelog ==

= 0.4.0 =
* Added: Added a Branding settings screen for the site's visual identity: primary logo, icon, wordmark, favicon, and iOS app icon, each with an optional dark variant. These feed the SEO and social previews and are exposed on the settings API so the frontend can render them.
* Added: Added a {{content}} variable that inserts a trimmed summary of the post body, available on any post type with an editor. {{excerpt}} now means the manually written excerpt only, and the default post description uses {{content}} so pages and posts without a hand-written excerpt still get a description.
* Added: The SEO meta box search preview now resolves variables live. On the post editor, editing the title, slug, excerpt, or content updates the preview immediately; on the edit-term screen, the name, slug, and description do the same. The preview URL also tracks the slug live. This works whether a variable is typed into the SEO fields or the fields are left empty and inherit the post-type or taxonomy template. Tokens that aren't editable fields (separator, site name, dates) come from the current record and settings. Supported in both the block and classic editors.
* Fixed: SEO variable pickers now only offer variables each context can actually resolve. Pages no longer show {{excerpt}} or {{category}}, and the taxonomy and author settings screens use their own variables instead of the post ones.

[See the full changelog](https://github.com/kizlo-io/kizlo/blob/main/plugins/kizlo/CHANGELOG.md).
