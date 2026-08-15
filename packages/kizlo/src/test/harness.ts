/**
 * kizlo's own test harness. Deliberately outside `./index.ts`, the published `kizlo/test` entry:
 * `getKizloTestInstance` constructs the generated client, and anything the published entry reaches
 * gets emitted — including that client's `declare module "kizlo"`, which would register kizlo's own
 * client as every consuming app's `ActiveWordPressClient`. Kept off the entry graph, it stays a
 * source-only concern that vitest resolves and the build never sees.
 */
export { getTestCredentials } from "../cli/wp/utils"
export * from "./client"
export * from "./server"
