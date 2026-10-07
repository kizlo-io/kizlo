# Migrate checkout validation handlers

**Breaking change:** `resolveCheckoutValidationIssues` is removed from both `@kizlo/woocommerce` and `@kizlo/woocommerce/checkout-validation`. Registered-field matching belongs to Kit or your standalone consumer. The SDK now emits `registeredFields` references during error extraction.

## Replace resolver calls

Remove the resolver import and match the [normalized references](./checkout-validation.md#match-registered-fields) against loaded storefront bindings. Keep reliable field targets and section messages from the SDK. For a standalone app, adapt the [type-checked handler](./checkout-validation-example.ts):

```ts
import { applyCheckoutValidation } from "./checkout-validation-example"

if (error.code === "CHECKOUT_VALIDATION_FAILED") {
  applyCheckoutValidation(error.data, storefront.address.fields, {
    field: (path, message) => myHandler.addFieldMessage(path, message),
    summary: (message) => myHandler.addSummaryMessage(message),
  })
}
```

Keep all messages when matching is ambiguous or no control exists. Existing source evidence remains diagnostic; consumers no longer parse WooCommerce names. The browser entry retains validation schemas/types, as described in [schema imports](./checkout-validation.md#import-validation-schemas).

## Upgrade the client contract

Deploy the updated SDK server and register its generated client contract in your app. An older contract lacks reference data. Kit uses that inferred contract and owns the runtime work described in [Kit consumption](./checkout-validation.md#consume-errors-through-kit); consuming references does not require installing the SDK runtime in a Kit app.

If you still use the pre-issues API, remove `Object.entries(error.data.fields)` and reads of `error.data.upstream`. Both properties remain unavailable. The data envelope stays `{ issues }`, and enclosing `code`, `message` and `status` are unchanged. There is no legacy dictionary fallback.
