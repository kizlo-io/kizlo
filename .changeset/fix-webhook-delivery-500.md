---
"kizlo": patch
---

Fix incoming webhook events not reaching handlers — deliveries returned a 500 instead of running the registered event handlers.