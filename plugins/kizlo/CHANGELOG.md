# Changelog

All notable changes to the Kizlo plugin are documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.0] - 2026-07-17
### Changed
- Merge the iOS and Android app icon settings into a single App icon used for every home-screen and install surface.

### Removed
- Remove the dark favicon setting; the favicon is now a single icon that serves every browser theme, since Safari ignores light/dark favicon switching.

### Fixed
- Fix branding, site, and identity media pickers clearing other saved images when a single icon was changed or removed; saves now reconcile the store from the server's resolved response.
- Show the selected file name in media pickers, add a checkerboard preview canvas so white or transparent logos stay visible, and stop the page jumping to the top when the media modal is closed without a selection.

## [0.7.0] - 2026-07-16
### Added
- Add Uploads settings to allow custom file types by extension and MIME type (SVG and ICO enabled by default), with automatic SVG sanitization and a block list for executable/script types

### Changed
- Move Webhooks settings into the System menu group as a standalone settings module

## [0.6.0] - 2026-07-16
### Changed
- Emit a per-group webhook event when settings are saved instead of a single settings.saved event. Each settings section fires settings.<group>.updated once per save, and the post type and taxonomy sections include the changed entry key in the payload.
- Render the Site Secret field as a masked text input with a show/hide toggle instead of a password field, so browsers no longer offer to save or autofill it as a login credential.

## [0.5.0] - 2026-07-15
### Added
- Added theme color and background color settings to Brand. They drive the web app manifest's theme_color and background_color used on the install and splash surfaces.
- Brand gains a dark-scheme theme color. The color inputs validate hex format in the admin, and the dark theme color drives a prefers-color-scheme dark meta theme-color on the frontend.
- Media in settings responses now includes WordPress's generated resized renditions (variants), so the frontend can select real icon sizes (e.g. 192/512 for the web manifest) instead of scaling one source.

### Changed
- Media assets returned by the settings API now include pixel dimensions (width and height) for raster sources, so the frontend can declare each brand icon at its true size.
- Media assets returned by the settings API now include the file's mime type, so the frontend can render each brand asset (logos, favicons, icons) by its actual format.
- Split the single App icon brand setting into separate iOS and Android app icons. The iOS icon feeds the full-bleed apple-touch-icon; the Android icon feeds a maskable web-manifest entry with a padded safe zone. Existing square icon and favicon are still used as fallbacks.

## [0.4.0] - 2026-07-14
### Added
- Added a Branding settings screen for the site's visual identity: primary logo, icon, wordmark, favicon, and iOS app icon, each with an optional dark variant. These feed the SEO and social previews and are exposed on the settings API so the frontend can render them.
- Added a {{content}} variable that inserts a trimmed summary of the post body, available on any post type with an editor. {{excerpt}} now means the manually written excerpt only, and the default post description uses {{content}} so pages and posts without a hand-written excerpt still get a description.
- The SEO meta box search preview now resolves variables live. On the post editor, editing the title, slug, excerpt, or content updates the preview immediately; on the edit-term screen, the name, slug, and description do the same. The preview URL also tracks the slug live. This works whether a variable is typed into the SEO fields or the fields are left empty and inherit the post-type or taxonomy template. Tokens that aren't editable fields (separator, site name, dates) come from the current record and settings. Supported in both the block and classic editors.

### Fixed
- SEO variable pickers now only offer variables each context can actually resolve. Pages no longer show {{excerpt}} or {{category}}, and the taxonomy and author settings screens use their own variables instead of the post ones.

## [0.3.0] - 2026-07-11
### Added
- Return the canonical site origin alongside the entries from the sitemap index endpoint (GET /seo/sitemaps/index), so the frontend builds absolute sitemap URLs from the Kizlo site URL instead of the request host

## [0.2.3] - 2026-07-09
### Fixed
- Change default sitemap path to /sitemaps/index.xml and relax pathname validation to allow any .xml filename

## [0.2.2] - 2026-07-09
### Added
- Add a per-post SEO meta box to override title, description, canonical, robots, and social image in the editor. Empty fields fall back to the defaults.
- Add a `seo.homepage` endpoint returning the homepage SEO head and JSON-LD.
- Homepages set to an Article type now output article Open Graph tags (published/modified time, author, section, tags).
- Sitemaps now follow your Reading settings: the homepage is listed as the site root and the blog index leads the post sitemap.

### Fixed
- Fix sitemap, canonical, and author URLs dropping the port on sites running a non-standard port.
- Posts and terms now fall back to the site fallback image for Open Graph and Twitter when no override or featured image is set.

## [0.2.1] - 2026-07-02
### Changed
- Refresh the settings screen branding with a consistent icon set and a cleaner logo.

## [0.2.0] - 2026-06-30
### Added
- Add a Backend URL setting so events are delivered to your Kizlo backend automatically, without entering the full webhook URL by hand.

## 0.1.0 - 2026-06-28
### Added
- Initial release.

[0.8.0]: https://github.com/kizlo-io/kizlo/compare/kizlo-v0.7.0...kizlo-v0.8.0
[0.7.0]: https://github.com/kizlo-io/kizlo/compare/kizlo-v0.6.0...kizlo-v0.7.0
[0.6.0]: https://github.com/kizlo-io/kizlo/compare/kizlo-v0.5.0...kizlo-v0.6.0
[0.5.0]: https://github.com/kizlo-io/kizlo/compare/kizlo-v0.4.0...kizlo-v0.5.0
[0.4.0]: https://github.com/kizlo-io/kizlo/compare/kizlo-v0.3.0...kizlo-v0.4.0
[0.3.0]: https://github.com/kizlo-io/kizlo/compare/kizlo-v0.2.3...kizlo-v0.3.0
[0.2.3]: https://github.com/kizlo-io/kizlo/compare/kizlo-v0.2.2...kizlo-v0.2.3
[0.2.2]: https://github.com/kizlo-io/kizlo/compare/kizlo-v0.2.1...kizlo-v0.2.2
[0.2.1]: https://github.com/kizlo-io/kizlo/compare/kizlo-v0.2.0...kizlo-v0.2.1
[0.2.0]: https://github.com/kizlo-io/kizlo/compare/kizlo-v0.1.0...kizlo-v0.2.0
