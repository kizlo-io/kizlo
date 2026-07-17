---
"kizlo": patch
---

Point the local dev stack's `KIZLO_DEV_WORDPRESS_URL` at the machine's LAN address instead of `localhost`, so the app can reach WordPress from off the host (running in a container or on another device). `kizlo init` and `kizlo dev` (including `reset`) write the router-assigned IPv4 address, falling back to `localhost` when the machine is offline. WordPress itself already serves under whatever host a request comes in on (via the container's `WORDPRESS_CONFIG_EXTRA`), so no site-URL rewrite is involved.

A warm `kizlo dev` start now also re-points `KIZLO_DEV_WORDPRESS_URL` in `.env` when the LAN address changed since the last session (a new DHCP lease or a different network), so restarting the app picks up the current address without a full `reset`. The dev summary shows a loopback "WP Local" URL alongside the "WP Network" one.
