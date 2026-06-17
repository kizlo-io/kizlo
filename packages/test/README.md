# @kizlo/test

Test utilities and fixtures for building against [Kizlo](https://github.com/kizlo-io/kizlo).

Provides helpers for spinning up a Kizlo client/server in tests, stub auth and
captcha adapters, seeded users, and reusable fixtures.

## Install

```bash
pnpm add -D @kizlo/test
```

## Includes

- `auth` / `captcha` — test adapters.
- `client` / `server` — helpers to construct a Kizlo instance under test.
- `users` / `fixtures` — seeded users and reusable test data.
- `env` — environment helpers for the test stack.

These utilities target the local WordPress test stack under `tooling/wp`
(`KIZLO_TEST_WP_URL`).

## License

[MIT](../../LICENSE) © Kizlo
