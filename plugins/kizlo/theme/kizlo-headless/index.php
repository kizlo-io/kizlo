<?php

/**
 * Kizlo Headless renders no public front end.
 *
 * The frontend is served by a separate headless app, so this template outputs no
 * markup by design. Headless Mode's frontend lockout normally 404s these requests
 * before the theme loads; this empty template is the backstop when it is off.
 */
