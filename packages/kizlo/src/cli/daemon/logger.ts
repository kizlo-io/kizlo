import { consola } from "consola"

/** Tagged logger for the daemon — every line is prefixed with `kizlo`. */
export const log = consola.withTag("kizlo")
