# @kizlo/cf7

Contact Form 7 extension for [Kizlo](https://github.com/kizlo-io/kizlo).

Adds a typed form-submission route backed by the Contact Form 7 REST API, with
built-in captcha validation.

## Install

```bash
pnpm add @kizlo/cf7
```

> Requires the [`kizlo`](https://www.npmjs.com/package/kizlo) core package and a
> WordPress install running the Contact Form 7 plugin.

## Usage

Register a form by its CF7 id and describe its fields with a schema:

```ts
import { z } from "zod"
import { Kizlo } from "kizlo"
import { contactFormSeven } from "@kizlo/cf7"

const contact = contactFormSeven("contact", {
  id: 42, // the Contact Form 7 form id
  fields: z.object({
    "your-name": z.string(),
    "your-email": z.email(),
    "your-message": z.string(),
  }),
})

const kizlo = new Kizlo({
  // ...core config
  extensions: [contact],
})

await kizlo.client.contact.submit({
  "your-name": "Ada",
  "your-email": "ada@example.com",
  "your-message": "Hello!",
  // ...captcha fields
})
```

## License

[MIT](../../LICENSE) © Kizlo
