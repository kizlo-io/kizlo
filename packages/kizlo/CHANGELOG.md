# kizlo

## 0.2.0

### Minor Changes

- [#15](https://github.com/kizlo-io/kizlo/pull/15) [`4ad1076`](https://github.com/kizlo-io/kizlo/commit/4ad1076e86c48648f48b6de90c8a273746648f13) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Add `service.settings`, a typed client for reading and updating Kizlo settings — `settings.get()` plus per-section update methods (`updateSite`, `updateWebhook`, …).

- [#19](https://github.com/kizlo-io/kizlo/pull/19) [`55c9409`](https://github.com/kizlo-io/kizlo/commit/55c9409cfe93da31c0d2a3e49f5981ffb6dfa2ec) Thanks [@IDJGILL](https://github.com/IDJGILL)! - `kizlo dev` now runs in the foreground and stops the stack on exit, instead of starting it and returning.

- [#19](https://github.com/kizlo-io/kizlo/pull/19) [`55c9409`](https://github.com/kizlo-io/kizlo/commit/55c9409cfe93da31c0d2a3e49f5981ffb6dfa2ec) Thanks [@IDJGILL](https://github.com/IDJGILL)! - The dev stack is now reachable from other devices on your network.

- [#19](https://github.com/kizlo-io/kizlo/pull/19) [`55c9409`](https://github.com/kizlo-io/kizlo/commit/55c9409cfe93da31c0d2a3e49f5981ffb6dfa2ec) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Prefix WordPress env vars with `KIZLO_` and split dev/production credentials behind a `createKizlo({ target })` switch, so `kizlo dev` never overwrites production credentials.

- [#15](https://github.com/kizlo-io/kizlo/pull/15) [`4ad1076`](https://github.com/kizlo-io/kizlo/commit/4ad1076e86c48648f48b6de90c8a273746648f13) Thanks [@IDJGILL](https://github.com/IDJGILL)! - The webhook receiver is now fixed at `/webhooks`. The `webhookPath` config option and the `createWebhookRouter({ path })` override have been removed.

- [#19](https://github.com/kizlo-io/kizlo/pull/19) [`55c9409`](https://github.com/kizlo-io/kizlo/commit/55c9409cfe93da31c0d2a3e49f5981ffb6dfa2ec) Thanks [@IDJGILL](https://github.com/IDJGILL)! - `kizlo init` now lets you connect your own WordPress with remote credentials or spin up a local Docker dev stack that mints an application password and wires the credentials into `.env` and `kizlo.config.ts`.

- [#15](https://github.com/kizlo-io/kizlo/pull/15) [`4ad1076`](https://github.com/kizlo-io/kizlo/commit/4ad1076e86c48648f48b6de90c8a273746648f13) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Rename the event API to drop the redundant `Webhook` infix: `WebhookEvent` → `KizloEvent`, `PostWebhookEvent` → `PostEvent`, `WebhookHandlerFn` → `EventHandlerFn`, `validateWebhookEvent` → `validateEvent` (and the same across `Term`/`Payment`/`Settings`). The transport helpers `signWebhook`, `verifyWebhook`, and `createWebhookRouter` keep the `webhook` name. Update any imports of the renamed symbols.

- [#19](https://github.com/kizlo-io/kizlo/pull/19) [`55c9409`](https://github.com/kizlo-io/kizlo/commit/55c9409cfe93da31c0d2a3e49f5981ffb6dfa2ec) Thanks [@IDJGILL](https://github.com/IDJGILL)! - The dev and test stacks now auto-select a free host port when the default is already taken.

### Patch Changes

- [#19](https://github.com/kizlo-io/kizlo/pull/19) [`55c9409`](https://github.com/kizlo-io/kizlo/commit/55c9409cfe93da31c0d2a3e49f5981ffb6dfa2ec) Thanks [@IDJGILL](https://github.com/IDJGILL)! - `kizlo dev` now installs the kizlo core WordPress plugin on a fresh dev stack. Previously only the test stack bootstrapped it, so a freshly provisioned dev install came up without the plugin active.

- [#19](https://github.com/kizlo-io/kizlo/pull/19) [`55c9409`](https://github.com/kizlo-io/kizlo/commit/55c9409cfe93da31c0d2a3e49f5981ffb6dfa2ec) Thanks [@IDJGILL](https://github.com/IDJGILL)! - `kizlo dev` now mints a REST application password on a fresh install and writes the WordPress connection (URL, username, application password) back into `.env`.

- [#19](https://github.com/kizlo-io/kizlo/pull/19) [`55c9409`](https://github.com/kizlo-io/kizlo/commit/55c9409cfe93da31c0d2a3e49f5981ffb6dfa2ec) Thanks [@IDJGILL](https://github.com/IDJGILL)! - `kizlo dev` and `kizlo init` now sync the Kizlo server's `url` and `backend_url` into the WordPress plugin alongside the site secret, so the plugin can reach the server to deliver webhook events.

- [#19](https://github.com/kizlo-io/kizlo/pull/19) [`55c9409`](https://github.com/kizlo-io/kizlo/commit/55c9409cfe93da31c0d2a3e49f5981ffb6dfa2ec) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Fix webhook delivery from the dockerized dev stack: a loopback `backend_url` (`localhost`/`127.0.0.1`) is rewritten to `host.docker.internal` when synced into the plugin, so the WordPress container can reach the host's server.

- [#18](https://github.com/kizlo-io/kizlo/pull/18) [`4dabeb0`](https://github.com/kizlo-io/kizlo/commit/4dabeb062658618a1e2120f06eab203cc87f64c6) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Fix `api`-scoped procedures whose input parts are all optional throwing "Input validation failed" when called with no arguments — `client.posts.list.call()` now works without passing `{}`. Procedures with a required `params`/`query`/`body` still validate.

- [#15](https://github.com/kizlo-io/kizlo/pull/15) [`4ad1076`](https://github.com/kizlo-io/kizlo/commit/4ad1076e86c48648f48b6de90c8a273746648f13) Thanks [@IDJGILL](https://github.com/IDJGILL)! - Fix incoming webhook events not reaching handlers — deliveries returned a 500 instead of running the registered event handlers.

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
