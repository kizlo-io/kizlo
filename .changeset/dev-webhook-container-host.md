---
"kizlo": patch
---

Fix webhook delivery from the dockerized dev stack: a loopback `backend_url` (`localhost`/`127.0.0.1`) is rewritten to `host.docker.internal` when synced into the plugin, so the WordPress container can reach the host's server.