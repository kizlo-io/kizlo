---
"kizlo": minor
---

Rename the event API to drop the redundant `Webhook` infix: `WebhookEvent` → `KizloEvent`, `PostWebhookEvent` → `PostEvent`, `WebhookHandlerFn` → `EventHandlerFn`, `validateWebhookEvent` → `validateEvent` (and the same across `Term`/`Payment`/`Settings`). The transport helpers `signWebhook`, `verifyWebhook`, and `createWebhookRouter` keep the `webhook` name. Update any imports of the renamed symbols.