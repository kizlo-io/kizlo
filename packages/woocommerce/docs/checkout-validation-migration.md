# Migrate checkout validation handlers

**Breaking change:** `CHECKOUT_VALIDATION_FAILED.data.fields` is removed. `data.upstream` from the initial draft is also removed; the raw WooCommerce payload is not public error data. The only data shape is `{ issues }`. The enclosing Kizlo `code`, `message` and `status` remain unchanged.

## Replace dictionary reads

Remove `Object.entries(error.data.fields)` and reads of `error.data.upstream`. Consume each issue's `message`, `source`, `sourcePath`, `code`, `scope` and `target` instead. Preserve multiple messages even when they share a source or target; a source name alone is not a form control name.

```ts
import { resolveCheckoutValidationIssues } from "@kizlo/woocommerce/checkout-validation"

if (error.code === "CHECKOUT_VALIDATION_FAILED") {
  const issues = resolveCheckoutValidationIssues(error.data, storefront.address.fields)
  for (const issue of issues) {
    myHandler.receiveIssue(issue)
  }
}
```

Use `target` only for `scope === "field"`. Retain group and unresolved messages; `unresolved.target` is `null`. Pass literal path segments intact rather than splitting or joining plugin IDs. Source evidence is diagnostic identity, not a second public payload.

## Upgrade both ends of the contract

Upgrade the server SDK and the consuming app together, register the updated generated client contract, and install the SDK runtime entry where resolution runs. There is no legacy dictionary fallback. Existing plugin responses without reliable field identity produce group or unresolved issues rather than guessed targets.

Follow the [client and Kit consumption requirements](./checkout-validation.md#consume-errors-through-kit). Application storage, projection and clearing behavior are owned by KIT-28.
