<br>

<p align="center">
  <a name="readme-top"></a>
  <a href="https://kizlo.io">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://cdn.kizlo.io/logo/icon-light.svg">
      <source media="(prefers-color-scheme: light)" srcset="https://cdn.kizlo.io/logo/icon-dark.svg">
      <img alt="Kizlo" src="https://cdn.kizlo.io/logo/icon-dark.svg" height="100">
    </picture>
  </a>
</p>

<h3 align="center">Clerk Authentication Adapter</h3>

<p align="center">
  Resolve Clerk sessions and synchronize users with WordPress
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@kizlo/clerk"><img src="https://img.shields.io/npm/v/@kizlo/clerk?style=flat-square&color=333" alt="npm version"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/kizlo-io/kizlo?style=flat-square&color=333" alt="License"></a>
  <a href="https://www.npmjs.com/package/@kizlo/clerk"><img src="https://img.shields.io/npm/dt/@kizlo/clerk?style=flat-square&color=333" alt="npm downloads"></a>
</p>

<p align="center">
  <a href="https://kizlo.io"><strong>Website</strong></a> ·
  <a href="https://kizlo.io/docs"><strong>Docs</strong></a> ·
  <a href="https://discord.com/invite/MjAUZamx5g"><strong>Discord</strong></a> ·
  <a href="https://x.com/kizlo_io"><strong>Twitter</strong></a>
</p>

---

## Install

```bash
pnpm add @kizlo/clerk
```

## Setup

Kizlo keys a session on **email**, so this adapter maps a verified Clerk session
to that identity. Webhook synchronization is optional.

You pass in a configured Clerk backend client, so keys live where Clerk already
reads them (`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`) and never on this
adapter. Use your framework's `clerkClient`, or build one directly:

```ts
import { clerk } from "@kizlo/clerk"
import { createClerkClient } from "@clerk/backend"

const client = createClerkClient({
	secretKey: process.env.CLERK_SECRET_KEY!,
	publishableKey: process.env.CLERK_PUBLISHABLE_KEY!,
	// jwtKey: process.env.CLERK_JWT_KEY, // optional: networkless session verification
})

const auth = clerk({ client })
```

In Next.js, hand it the app's client instead of building your own:

```ts
import { clerkClient } from "@clerk/nextjs/server"

const auth = clerk({ client: await clerkClient() })
```

Register it like any other Kizlo integration; it contributes the `auth` adapter.
`@clerk/backend` is a peer dependency, so it uses the version your app installs.

### Email resolution

The adapter uses the user's primary email address, even when Clerk has not
verified it. For users without a primary email, pass `resolveEmail`:

```ts
clerk({
	client,
	resolveEmail(user) {
		const phone = user.phoneNumbers[0]?.phoneNumber
		if (!phone) throw new Error(`Missing identity for ${user.id}`)
		return `${phone.replace(/\D/g, "")}@phone.example.com`
	},
})
```

`resolveEmail` runs only when the user has no primary email. If neither source
returns an address, authentication and built-in webhook synchronization throw an
error that names the missing option.

### Synchronize WordPress users

Add a webhook signing secret to create, update, and delete the matching
WordPress user when Clerk emits `user.created`, `user.updated`, or `user.deleted`:

```ts
const auth = clerk({
	client,
	webhooks: {
		signingSecret: process.env.CLERK_WEBHOOK_SIGNING_SECRET!,
	},
})
```

In the Clerk Dashboard, create an endpoint at
`https://your-app.example/api/kizlo/clerk/webhooks` and subscribe to those three
events. Replace `/api/kizlo` if your Kizlo handler uses a different base path.

The built-in handler links users by their stable Clerk ID. It creates a
subscriber when no WordPress account has the same email, updates names and
profile metadata, and permanently deletes the linked account and its content.
Administrator and other privileged accounts are protected from updates and
deletion.

To process verified events yourself, provide `handler`. A custom handler replaces
the built-in lifecycle behavior and receives every Clerk event:

```ts
clerk({
	client,
	webhooks: {
		signingSecret: process.env.CLERK_WEBHOOK_SIGNING_SECRET!,
		async handler(event, context) {
			context.logger.info("Clerk webhook", event.type)
		},
	},
})
```

## Documentation

See the [docs](https://kizlo.io/docs) for setup and usage.

## License

[Apache 2.0](./LICENSE) © Kizlo
