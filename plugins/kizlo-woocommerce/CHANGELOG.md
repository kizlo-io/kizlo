# Changelog

All notable changes to the Kizlo WooCommerce plugin are documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-09-04
### Added
- Add a public customer-facing Order resource backed by the WooCommerce Store API
- Create a WooCommerce customer on demand from the email identity when none exists

### Changed
- Redesign the public Cart resource around complete Store API data and require WooCommerce 11.0.1
- Redesign the public Checkout resource around WooCommerce Store API contracts

### Fixed
- Authorize Store API order retries as the resolved customer
- Merge guest carts safely within authenticated cart and checkout requests.

## [0.3.1] - 2026-08-30
### Fixed
- Declare HPOS compatibility so WooCommerce no longer flags the plugin as incompatible

## [0.3.0] - 2026-08-29
### Changed
- Call the companion package an integration in plugin metadata and documentation
- Group product custom fields under `extensions.kizlo.custom` with exact generated types
- Return shared image media shapes for product, cart, and taxonomy images
- Serve complete product enrichment and optional recommendation contracts through WooCommerce Store API responses

### Fixed
- Emit Store API product sale dates as RFC 3339 UTC values

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

[0.4.0]: https://github.com/kizlo-io/kizlo/compare/kizlo-woocommerce-v0.3.1...kizlo-woocommerce-v0.4.0
[0.3.1]: https://github.com/kizlo-io/kizlo/compare/kizlo-woocommerce-v0.3.0...kizlo-woocommerce-v0.3.1
[0.3.0]: https://github.com/kizlo-io/kizlo/compare/kizlo-woocommerce-v0.2.0...kizlo-woocommerce-v0.3.0
[0.2.0]: https://github.com/kizlo-io/kizlo/compare/kizlo-woocommerce-v0.1.0...kizlo-woocommerce-v0.2.0
