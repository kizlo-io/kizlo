# @kizlo/shared

Framework-agnostic shared types and utilities used across the
[Kizlo](https://github.com/kizlo-io/kizlo) packages.

Has no runtime dependencies on the core or any extension, so it's safe to use
from both server and client code.

## Install

```bash
pnpm add @kizlo/shared
```

## Includes

- **Geo** — `Country`, `Currency`, `CountryCode`, `CurrencyCode` and their
  constant lists (`COUNTRIES`, `CURRENCIES`, …), plus weight/dimension units.
- **Address** — `toAddressString` and related helpers.
- Shared schema, type, and utility primitives used by Kizlo internals.

```ts
import { COUNTRIES, toAddressString } from "@kizlo/shared"
```

## License

[MIT](../../LICENSE) © Kizlo
