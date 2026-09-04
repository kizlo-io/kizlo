# @kizlo/woocommerce

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
