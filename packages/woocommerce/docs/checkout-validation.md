# Handle checkout validation issues

Narrow an update, confirm, or retry error by `code === "CHECKOUT_VALIDATION_FAILED"`. Its envelope keeps `code`, `message` and `status`; `data` contains only `{ issues }`. Each issue preserves its message and available `source`, literal `sourcePath` segments and upstream `code`.

## Resolve targets in a client

Import the supported browser runtime from `@kizlo/woocommerce/checkout-validation`. This entry exports `resolveCheckoutValidationIssues`, the validation schemas/types and the `StorefrontField` type without loading server integration handlers. Root exports remain available for server integrations.

```ts
import { resolveCheckoutValidationIssues } from "@kizlo/woocommerce/checkout-validation"

if (result.error?.code === "CHECKOUT_VALIDATION_FAILED") {
  const issues = resolveCheckoutValidationIssues(result.error.data, store.address.fields)
  for (const issue of issues) {
    if (issue.scope === "field") {
      myHandler.addFieldMessage(issue.target, issue.message)
    } else {
      myHandler.addSummaryMessage(issue.message)
    }
  }
}
```

Pass definitions already loaded from the same storefront's `storefront.get` response. The resolver performs no requests and returns new issues without mutating its input. Core address and native billing Tax ID targets resolve without definitions; registered fields use the definitions' SDK bindings.

## Interpret scope and evidence

| Scope | Target | Consumer handling |
| --- | --- | --- |
| `field` | Exact SDK path segments | Pass the path and message to your handler |
| `group` | An address or additional-fields bucket | Retain the group message |
| `unresolved` | `null` | Retain the message without choosing a control |

Keep a plugin ID such as `plug/a.b[0]` as one segment. A bare address ID does not select billing or shipping; conflicting literal-ID/path interpretations stay unresolved. A message mentioning Tax ID does not identify that field. Multiple messages remain separate issues, including nested additional errors and parent group failures.

## Consume errors through Kit

Install the SDK as a runtime dependency in the app that calls the resolver, using the release containing this contract or the [PR #277 package preview](https://github.com/kizlo-io/kizlo/pull/277). Deploy the same contract on the SDK server. Kit's SDK development dependency does not install this runtime entry for your app.

Register your generated client contract with `kizlo` and include that registration in the app's TypeScript program. Kit derives `CheckoutError` and `onError` data from `ActiveKizloClient`; an older registered contract cannot describe the new issues. Supply loaded storefront definitions separately. See the [type-checked caller-owned handler example](./checkout-validation-example.ts).

## Keep application state in the application

The SDK supplies evidence and domain paths. Error IDs, submission-batch identities, Nanostores storage, automatic `useCheckoutFields` integration, safe form-name/address projection, grouped section messages and selective store/form clearing belong to [KIT-28](https://linear.app/kizlo/issue/KIT-28/integrate-checkout-server-errors-into-usecheckoutfields). This contract adds no form-library dependency or automatic Kit runtime behavior.

See the [migration guide](./checkout-validation-migration.md) before replacing a dictionary-based consumer.
