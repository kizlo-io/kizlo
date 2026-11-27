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

<h3 align="center">Clerk Token Helper</h3>

<p align="center">
  Supply Clerk session tokens to direct WordPress clients
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

## Supply the current token

Configure the Clerk preset under **Kizlo → Settings → Authentication** in WordPress. Set your issuer, public verification keys, permitted browser origins, and the claims required by your application. Include email and its verification state in the token when enabling customer lookup.

Pass your Clerk session's `getToken` method to the direct browser client:

```ts
import { clerkToken } from "@kizlo/clerk"
import { createBrowserClient } from "kizlo/browser"
import { introspection } from "./generated/introspection.browser"

const client = createBrowserClient({
  url: "https://cms.example.com",
  endpoints: introspection,
  getToken: clerkToken(session),
})
```

Here `session` is the current Clerk session or hook result exposing `getToken()`. The helper obtains a fresh token for each request. It has no Clerk backend dependency, user synchronization, or webhook lifecycle.

WordPress verifies the JWT and lazily resolves a WooCommerce customer by verified email. Unverified or missing email remains a guest identity. No WordPress user ID or provider mapping is required in the session.

## Documentation

See [authentication](https://kizlo.io/docs/concepts/authentication) for provider configuration and the [v1 migration](https://kizlo.io/docs/concepts/migration-v1) for replacing the old `clerk()` integration.

## License

[Apache 2.0](./LICENSE) © Kizlo
