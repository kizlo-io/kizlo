# Changelog

All notable changes to the Kizlo WooCommerce plugin are documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-08-21
### Added
- Describe the cart, order stock and product routes in the Kizlo introspection contract
- Describe the WooCommerce Store API and REST v3 routes Kizlo consumes in /introspect, derived from WooCommerce's own route and schema classes
- Describe WooCommerce operation error codes in the introspection contract

### Changed
- Declare each WooCommerce introspection operation with one scalar HTTP method
- Declare the cart mutation arguments WooCommerce registers as optional but its handlers require
- Defer WooCommerce route and schema derivation until Kizlo requests the introspection contract
- Require Kizlo 0.12.0 and WooCommerce 10.9, and report which one is missing instead of starting without it

### Fixed
- Describe the cart add-item response as the HTTP 201 WooCommerce sends, so the generated client narrows on the real status

## 0.1.0 - 2026-06-28
### Added
- Initial release. Extracted from Kizlo core.

[0.2.0]: https://github.com/kizlo-io/kizlo/compare/kizlo-woocommerce-v0.1.0...kizlo-woocommerce-v0.2.0
