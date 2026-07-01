import { consola } from "consola"

/** Tagged logger for the daemon — every line is prefixed with `kizlo`. */
export const log = consola.withTag("kizlo")

// Drop the trailing timestamp from every line — the dev output is short-lived and
// interactive, so the wall-clock time is noise rather than signal.
log.options.formatOptions.date = false
