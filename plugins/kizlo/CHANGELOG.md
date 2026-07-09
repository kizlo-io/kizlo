# Changelog

All notable changes to the Kizlo plugin are documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.2.2]: https://github.com/kizlo-io/kizlo/compare/kizlo-v0.2.1...kizlo-v0.2.2
[0.2.1]: https://github.com/kizlo-io/kizlo/compare/kizlo-v0.2.0...kizlo-v0.2.1
[0.2.0]: https://github.com/kizlo-io/kizlo/compare/kizlo-v0.1.0...kizlo-v0.2.0
