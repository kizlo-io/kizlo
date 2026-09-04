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
  Resolve a verified Clerk session into a Kizlo auth identity
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
to that identity. There is no WordPress user id to inject and no create-on-signup
race to manage: the WordPress user is materialized lazily by the endpoints that
need one.

1. In the [Clerk dashboard](https://dashboard.clerk.com), open **API keys** and
   copy the **Publishable key** and **Secret key** for your instance.
2. For networkless session verification, also copy the **JWKS public key** under
   **API keys → Show JWT public key → PEM** and pass it as `jwtKey`. Without it,
   each request verifies the session against Clerk's API.

```ts
import { clerk } from "@kizlo/clerk"

const auth = clerk({
	secretKey: process.env.CLERK_SECRET_KEY!,
	publishableKey: process.env.CLERK_PUBLISHABLE_KEY!,
	jwtKey: process.env.CLERK_JWT_KEY, // optional, enables networkless verification
})
```

Register it like any other Kizlo integration; it contributes the `auth` adapter.

### Email resolution

By default the adapter uses the user's **primary verified email**. For phone-only
sign-ins, set `emailDomain` to synthesize a stable address from the phone number:

```ts
clerk({
	secretKey: process.env.CLERK_SECRET_KEY!,
	publishableKey: process.env.CLERK_PUBLISHABLE_KEY!,
	emailDomain: "phone.example.com", // 14155550100 -> 14155550100@phone.example.com
})
```

To take full control of the mapping, pass `resolveEmail(clerkUser)` and return the
address yourself. If no email can be resolved and no `emailDomain` or
`resolveEmail` is configured, `getSession` throws naming the missing option.

## Documentation

See the [docs](https://kizlo.io/docs) for setup and usage.

## License

[Apache 2.0](./LICENSE) © Kizlo
