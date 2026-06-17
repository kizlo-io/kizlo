# kizlo

**A headless WordPress toolkit for TypeScript.**

The core package. It wraps the WordPress REST API in a fully-typed
[oRPC](https://orpc.unnoq.com/) router and exposes a pluggable extension and
adapter system. Plugin integrations (WooCommerce, Contact Form 7, …) ship as
separate `@kizlo/*` packages that layer on top.

## Install

```bash
pnpm add kizlo
```

## Usage

```ts
import { Kizlo } from "kizlo"

const kizlo = new Kizlo({
  baseUrl: process.env.NEXT_PUBLIC_SERVER_BASE_URL!,
  siteSecret: process.env.SITE_SECRET!,
  environment: process.env.NODE_ENV,
  credentials: {
    url: process.env.WORDPRESS_URL!,
    username: process.env.WORDPRESS_USERNAME!,
    password: process.env.WORDPRESS_APPLICATION_PASSWORD!,
  },
})

const posts = await kizlo.client.post.list({ per_page: 10 })
```

## Features

- **Typed WordPress REST client** — posts, comments, users, menus, media, and more.
- **Router** — server-to-server `client`, plus RPC and OpenAPI fetch handlers.
- **Extensions** — register plugin integrations via `extensions: [...]`.
- **Adapters** — plug in your own `auth`, `captcha`, `geo`, `logger`, and `cookies`.
- **Webhooks** — handle WordPress events through a typed event router.

## Entry points

| Import | Purpose |
| --- | --- |
| `kizlo` | Core `Kizlo` server, client, router, adapters, WordPress types. |
| `kizlo/extensions` | Helpers for authoring extensions. |
| `kizlo/nextjs` | Next.js client-side helpers. |
| `kizlo/nextjs/server` | Next.js server-side helpers. |

## License

[MIT](../../LICENSE) © Kizlo
