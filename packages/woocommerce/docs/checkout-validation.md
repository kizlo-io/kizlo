# Handle checkout validation issues

Narrow an update, confirm, or retry error by `code === "CHECKOUT_VALIDATION_FAILED"`. Its envelope keeps `code`, `message` and `status`; `data` contains only `{ issues }`. Each issue preserves its message, available `source`, `sourcePath` and upstream `code`, plus normalized SDK targeting information.

## Choose a target

| Scope | Target | Consumer handling |
| --- | --- | --- |
| `field` | Reliable core/native SDK path segments | Attach the message to that path |
| `group` | An address or additional-fields bucket | Retain the section message |
| `unresolved` | `null` | Match registered references against loaded bindings, or keep the message in the summary |

Every issue has `registeredFields`. An empty array means no registered-field candidate is supplied. Each reference contains a literal `id` and a `bucket`: `billingAddress`, `shippingAddress`, `additionalFields`, or `null` when context is unspecified. Contact and order fields share `additionalFields`; definitions determine their location. References are candidates, not proof of registration or an editable control.

```ts
// Explicit billing context supplies one reference.
{ id: "plugin/a.b[0]", bucket: "billingAddress" }

// An ambiguous source "billing_address.foo/reference" supplies both alternatives.
[
  { id: "billing_address.foo/reference", bucket: null },
  { id: "foo/reference", bucket: "billingAddress" },
]
```

## Match registered fields

Load definitions from the same active storefront's `storefront.get` response. Match each candidate's entire `id` by equality. Billing/shipping references select the corresponding address binding; `additionalFields` selects a non-address field's `bindings.other`. An unspecified reference can match a contact/order field, but must not choose an address copy. Resolve only one matching binding across all candidates and definitions; unknown, duplicate or conflicting matches stay unresolved.

Use bindings intact, prefixing address-relative bindings with the reference bucket. Never split, decode or reparse an ID, including dots, slashes, brackets, quotes or percent escapes. Explicit structured identity suppresses speculative alternatives. `source` and `sourcePath` are diagnostic evidence, not inputs to consumer matching. Retain every message, including section failures and failures without a matching control. See the [type-checked standalone handler](./checkout-validation-example.ts) for equivalent local metadata matching.

## Consume errors through Kit

Register your updated generated client contract with `kizlo` and include that registration in the app's TypeScript program. Kit derives `CheckoutError` and `onError` data from `ActiveKizloClient`; an older registered contract cannot describe `registeredFields`. SDK extraction uses no storefront queries or loaded definitions.

[KIT-28](https://linear.app/kizlo/issue/KIT-28/integrate-checkout-server-errors-into-usecheckoutfields) owns automatic matching in `useCheckoutFields`, form projection, error and submission-batch identities, Nanostores state, section/summary placement and selective clearing. This SDK change supplies its contract; it does not implement that Kit runtime behavior or add a form-library dependency. Kit consumes inferred types and loaded bindings without an SDK runtime import.

## Import validation schemas

`@kizlo/woocommerce/checkout-validation` retains `CheckoutValidationData`, `CheckoutValidationIssue` and `CheckoutRegisteredFieldReference` as schemas/types, plus the `StorefrontField` type. Root schema/type exports remain available. Install the SDK runtime only if your standalone app uses those schemas; the browser entry excludes server integration handlers and provides no storefront resolver.

See the [migration guide](./checkout-validation-migration.md) when upgrading an existing handler.
