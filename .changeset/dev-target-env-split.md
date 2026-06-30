---
"kizlo": minor
---

Prefix WordPress env vars with `KIZLO_` and split dev/production credentials behind a `createKizlo({ target })` switch, so `kizlo dev` never overwrites production credentials.
