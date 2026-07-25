---
"kizlo": minor
---

Standardize on "local WordPress": rename `KIZLO_TARGET`→`KIZLO_CONNECT` (`local`/`remote`), the WordPress credential vars to `KIZLO_WP_*`/`KIZLO_LOCAL_WP_*`, and `KIZLO_BACKEND_URL`→`KIZLO_API_URL`; replace `dev.path` with `dev.local`/`test.local` (install now lives in `.kizlo/local`); and drop the `down` subcommands.
