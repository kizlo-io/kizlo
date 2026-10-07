# @kizlo/woocommerce

## 0.14.0

### Minor Changes

- [#279](https://github.com/kizlo-io/kizlo/pull/279) [`4b33b04`](https://github.com/kizlo-io/kizlo/commit/4b33b042dd3f4bc7572b6eb67e9ecdcbfb47eb30) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Emit normalized checkout registered-field references and remove the storefront-dependent validation resolver.

- [#277](https://github.com/kizlo-io/kizlo/pull/277) [`0c6c1e6`](https://github.com/kizlo-io/kizlo/commit/0c6c1e6b04e83c1882e360a23d44f6d5d64cc455) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Remove checkout validation data.fields and data.upstream as a breaking change, exposing only issues and a client resolver for SDK value targets.

## 0.13.0

### Minor Changes

- [#275](https://github.com/kizlo-io/kizlo/pull/275) [`2dc92ca`](https://github.com/kizlo-io/kizlo/commit/2dc92cadf1db983816340f113294d8cda165b983) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Expose WooCommerce collection method classification for checkout field conditions.

## 0.12.0

### Minor Changes

- [#274](https://github.com/kizlo-io/kizlo/pull/274) [`4ecd132`](https://github.com/kizlo-io/kizlo/commit/4ecd13272fa2d094382ea9d1db8fa13e8c0008e8) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Expose complete storefront field definitions with JSON Schema and SDK binding paths.

- [#270](https://github.com/kizlo-io/kizlo/pull/270) [`83ee7c0`](https://github.com/kizlo-io/kizlo/commit/83ee7c03e3f1f0fdeb9843ca2a3df2ad46ea51c1) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Expose registered WooCommerce additional fields with consumer-generated bucket types and grouped customer and order reads.

- [#272](https://github.com/kizlo-io/kizlo/pull/272) [`6a4bf77`](https://github.com/kizlo-io/kizlo/commit/6a4bf7749c56e4b9ca97c38b138a4989eeedcffc) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Project the official registered Tax ID into one native billing value across customer, cart, checkout, and order APIs.

## 0.11.0

### Minor Changes

- [#267](https://github.com/kizlo-io/kizlo/pull/267) [`45482c5`](https://github.com/kizlo-io/kizlo/commit/45482c53992022fc34e21eb02dea690ae7b9888d) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Add `storefront.get`, returning the store's countries, address field rules, and checkout, pricing and catalog settings.

## 0.10.0

### Minor Changes

- [#265](https://github.com/kizlo-io/kizlo/pull/265) [`6d0d2d8`](https://github.com/kizlo-io/kizlo/commit/6d0d2d839cf6b96b8de8c1285d90b7b106d55e19) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Expose product HS codes and preserve order-time values on order items.

- [#263](https://github.com/kizlo-io/kizlo/pull/263) [`7b03820`](https://github.com/kizlo-io/kizlo/commit/7b03820847ab3eeea24f8fe6da876f5aecb71538) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Expose billing Tax IDs across customers, carts, checkout, and orders.

## 0.9.0

### Minor Changes

- [#261](https://github.com/kizlo-io/kizlo/pull/261) [`b8e5fe4`](https://github.com/kizlo-io/kizlo/commit/b8e5fe40c2424cb918015bc8eab29cd69e09dda0) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Report whether an order is paid on `Checkout.isPaid` and `Order.isPaid`.

## 0.8.0

### Minor Changes

- [#246](https://github.com/kizlo-io/kizlo/pull/246) [`5a384ed`](https://github.com/kizlo-io/kizlo/commit/5a384ed034368b7a6343c4bd8e9dc4dbe372db6c) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Adopt dynamically discovered WooCommerce route names across generated clients and WooCommerce procedures

- [#237](https://github.com/kizlo-io/kizlo/pull/237) [`dae3a3a`](https://github.com/kizlo-io/kizlo/commit/dae3a3a404ad00561ffb5d28fa65faf700b6614d) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Move every Kizlo-registered WordPress route under `client.kizlo.*`, leaving the described WordPress and WooCommerce routes where they are

### Patch Changes

- Updated dependencies [[`d1dca79`](https://github.com/kizlo-io/kizlo/commit/d1dca79951361386ce207583a7efb6a1fdbe3a79)]:
  - @kizlo/shared@0.10.0

## 0.7.0

### Minor Changes

- [#218](https://github.com/kizlo-io/kizlo/pull/218) [`3be40d1`](https://github.com/kizlo-io/kizlo/commit/3be40d15ba4f7e4ba212e8aa6e1417321b3ab467) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Accept optional relative successPath and cancelPath on confirm and retry checkout to redirect the storefront per checkout.

## 0.6.1

### Patch Changes

- [#203](https://github.com/kizlo-io/kizlo/pull/203) [`f7b2086`](https://github.com/kizlo-io/kizlo/commit/f7b2086ef5073e5cccbdc13f5bd4f7bb1072e323) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Keep active checkout carts available after shipping validation errors.

## 0.6.0

### Minor Changes

- [#200](https://github.com/kizlo-io/kizlo/pull/200) [`b11014e`](https://github.com/kizlo-io/kizlo/commit/b11014e1b2e83be8faf227f46eff5c83e5159a69) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Expose cart payment methods as objects with id, title, description, order, and enabled instead of bare gateway IDs.

## 0.5.0

### Minor Changes

- [#189](https://github.com/kizlo-io/kizlo/pull/189) [`a472ea6`](https://github.com/kizlo-io/kizlo/commit/a472ea6ce54223c4f28669702b1297feeb601a13) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Add a public customer-facing Order resource backed by the WooCommerce Store API

- [#186](https://github.com/kizlo-io/kizlo/pull/186) [`c805c74`](https://github.com/kizlo-io/kizlo/commit/c805c743beceb9ba68c66e7c2dd59b11ccbe8b60) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Redesign the public Cart resource around complete Store API data

- [#187](https://github.com/kizlo-io/kizlo/pull/187) [`9df22f9`](https://github.com/kizlo-io/kizlo/commit/9df22f939800799ed437670efe2fccefcdbf3671) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Redesign WooCommerce Checkout resources and support non-success data responses

### Patch Changes

- [#188](https://github.com/kizlo-io/kizlo/pull/188) [`2b1f484`](https://github.com/kizlo-io/kizlo/commit/2b1f484624b5cf38d7d6d7fa1220c3f5a8f25b25) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Authorize Store API order retries as the resolved customer

- [#190](https://github.com/kizlo-io/kizlo/pull/190) [`a9466fa`](https://github.com/kizlo-io/kizlo/commit/a9466fadbc042142478a3d3f613a429bdc6bc2cc) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Merge guest carts safely in the original authenticated cart or checkout request

## 0.4.0

### Minor Changes

- [#179](https://github.com/kizlo-io/kizlo/pull/179) [`b3f71aa`](https://github.com/kizlo-io/kizlo/commit/b3f71aa2c967b3f8d507105e12f1ac13a19ae14d) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Preserve generated endpoint, procedure, and custom-field types across published declarations.

## 0.3.0

### Minor Changes

- [#174](https://github.com/kizlo-io/kizlo/pull/174) [`26cd3e6`](https://github.com/kizlo-io/kizlo/commit/26cd3e618e66374d77c1b2c5e6077b07161a83ea) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Read and query published products through the Store API with the complete Product model, opt-in recommendations, and consistently named summaries

- [#178](https://github.com/kizlo-io/kizlo/pull/178) [`8c11454`](https://github.com/kizlo-io/kizlo/commit/8c1145414a4f67cd8112273c4cffdf6e95e2ea45) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Group custom-field reads and writes under `custom`, and derive exact public model types from the generated WordPress contract.

- [#177](https://github.com/kizlo-io/kizlo/pull/177) [`823bbf1`](https://github.com/kizlo-io/kizlo/commit/823bbf1cc972c071dac82dbe2f3a7f9cea50bca6) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Adopt discriminated media members across WordPress and WooCommerce responses

### Patch Changes

- [#175](https://github.com/kizlo-io/kizlo/pull/175) [`42f7fe3`](https://github.com/kizlo-io/kizlo/commit/42f7fe34ff2225942b5291c11c8c2732afeca0dc) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Normalize API date-times through strict UTC-aware timestamp boundaries

- Updated dependencies [[`42f7fe3`](https://github.com/kizlo-io/kizlo/commit/42f7fe34ff2225942b5291c11c8c2732afeca0dc), [`8c11454`](https://github.com/kizlo-io/kizlo/commit/8c1145414a4f67cd8112273c4cffdf6e95e2ea45), [`823bbf1`](https://github.com/kizlo-io/kizlo/commit/823bbf1cc972c071dac82dbe2f3a7f9cea50bca6)]:
  - @kizlo/shared@0.9.0

## 0.2.2

### Patch Changes

- [#171](https://github.com/kizlo-io/kizlo/pull/171) [`2e71e5d`](https://github.com/kizlo-io/kizlo/commit/2e71e5dc9231423ba05a7a555fc5b3ca4b9fd68a) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Build the WooCommerce integration from declarative procedures and WordPress requirements.

- Updated dependencies [[`2e71e5d`](https://github.com/kizlo-io/kizlo/commit/2e71e5dc9231423ba05a7a555fc5b3ca4b9fd68a)]:
  - @kizlo/shared@0.8.0

## 0.2.1

### Patch Changes

- [#169](https://github.com/kizlo-io/kizlo/pull/169) [`4c2e408`](https://github.com/kizlo-io/kizlo/commit/4c2e408679b1d6ef852634310e3cec45ffab467b) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Make guest cart sessions available to server-rendered storefront pages

## 0.2.0

### Minor Changes

- [#123](https://github.com/kizlo-io/kizlo/pull/123) [`aea0646`](https://github.com/kizlo-io/kizlo/commit/aea0646e4bd91e59ef1ece274ebe8f1a5f694864) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Read every WooCommerce cart, checkout, product and customer route through generated endpoints.

- [#126](https://github.com/kizlo-io/kizlo/pull/126) [`5671c01`](https://github.com/kizlo-io/kizlo/commit/5671c01960d173e26276c37f81d7e6f2d276a17d) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Require the Kizlo WooCommerce plugin 0.2.0 and `kizlo` 0.15.0, and say which is missing when the store's endpoints are absent.

- [#127](https://github.com/kizlo-io/kizlo/pull/127) [`106e118`](https://github.com/kizlo-io/kizlo/commit/106e118978d88490e0a1a5eb92ad91a2b37ad954) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Keep the address a checkout retry omitted instead of replacing it with a blank one.

### Patch Changes

- [#152](https://github.com/kizlo-io/kizlo/pull/152) [`2506231`](https://github.com/kizlo-io/kizlo/commit/2506231f61b20ab74ca7ba013f6d0607529ea651) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Settle background plugin work during bootstrap so a fresh stack and a warm one generate the same client

- Updated dependencies [[`cb1648e`](https://github.com/kizlo-io/kizlo/commit/cb1648eff6e3d1813afb8b54956ac3e78f2ad94a), [`5671c01`](https://github.com/kizlo-io/kizlo/commit/5671c01960d173e26276c37f81d7e6f2d276a17d), [`9c64887`](https://github.com/kizlo-io/kizlo/commit/9c648873d0e245923d3984efc731d1f9b0815652), [`0907c34`](https://github.com/kizlo-io/kizlo/commit/0907c34c824fb022973d1625f0f999f88063067c)]:
  - @kizlo/shared@0.7.0

## 0.1.9

### Patch Changes

- Updated dependencies [[`265954e`](https://github.com/kizlo-io/kizlo/commit/265954e4fb950c0184fa8eadfe8e158e82ebf271)]:
  - @kizlo/shared@0.6.0

## 0.1.8

### Patch Changes

- [#81](https://github.com/kizlo-io/kizlo/pull/81) [`e9093ee`](https://github.com/kizlo-io/kizlo/commit/e9093ee9c5b00973a252ec502b707fdd4d5f283a) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Relicense from MIT to Apache 2.0

- Updated dependencies [[`e9093ee`](https://github.com/kizlo-io/kizlo/commit/e9093ee9c5b00973a252ec502b707fdd4d5f283a)]:
  - @kizlo/shared@0.5.1

## 0.1.7

### Patch Changes

- Updated dependencies [[`fe57fa8`](https://github.com/kizlo-io/kizlo/commit/fe57fa812a8930b0e0806a329871d706cacb2bee), [`39d52a7`](https://github.com/kizlo-io/kizlo/commit/39d52a78b84cae98bda5d8ec31dceb4961da681d)]:
  - @kizlo/shared@0.5.0

## 0.1.6

### Patch Changes

- Updated dependencies [[`fb22269`](https://github.com/kizlo-io/kizlo/commit/fb222699ef00695b63c8fc489f1b6b74ff75a74e), [`fb22269`](https://github.com/kizlo-io/kizlo/commit/fb222699ef00695b63c8fc489f1b6b74ff75a74e)]:
  - @kizlo/shared@0.4.0

## 0.1.5

### Patch Changes

- Updated dependencies [[`57b9063`](https://github.com/kizlo-io/kizlo/commit/57b90637728972602f0ec0aad2dec7ff31f8369a)]:
  - @kizlo/shared@0.3.1

## 0.1.4

### Patch Changes

- Updated dependencies [[`0bea4c6`](https://github.com/kizlo-io/kizlo/commit/0bea4c68b3a912b90394fdbb4df5b185c32cc001)]:
  - @kizlo/shared@0.3.0

## 0.1.3

### Patch Changes

- Updated dependencies [[`b26fc36`](https://github.com/kizlo-io/kizlo/commit/b26fc36e40fb54c2247bb7416095fe822d72ab9f)]:
  - @kizlo/shared@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`d00114b`](https://github.com/kizlo-io/kizlo/commit/d00114b9e5805c746370db65e91227fd01ecf08c)]:
  - @kizlo/shared@0.1.2

## 0.1.1

### Patch Changes

- [#10](https://github.com/kizlo-io/kizlo/pull/10) [`590bbd2`](https://github.com/kizlo-io/kizlo/commit/590bbd2f82d57984d1d993e5acd22b0c5772a6cb) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Bug fixes.

- Updated dependencies [[`590bbd2`](https://github.com/kizlo-io/kizlo/commit/590bbd2f82d57984d1d993e5acd22b0c5772a6cb)]:
  - @kizlo/shared@0.1.1

## 0.1.0

### Minor Changes

- [#3](https://github.com/kizlo-io/kizlo/pull/3) [`dfa9e21`](https://github.com/kizlo-io/kizlo/commit/dfa9e2144de43ba3b925a1194c34a86a97be45ec) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Initial public release.

### Patch Changes

- Updated dependencies [[`dfa9e21`](https://github.com/kizlo-io/kizlo/commit/dfa9e2144de43ba3b925a1194c34a86a97be45ec)]:
  - @kizlo/shared@0.1.0
