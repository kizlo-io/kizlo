/**
 * Repo-only, and never scaffolded: `create` copies just the paths `template.json` lists, and wiring
 * writes a fresh stub from the CLI's `INTROSPECTION_STUB`. It exists here so the monorepo can build this
 * template, which prerenders pages that read WordPress and so needs a client with endpoints in it.
 * The repo already has one generated and committed at its root, so this borrows that rather than
 * standing up a WordPress at build time.
 *
 * The other templates keep the plain stub on purpose. Compiling the framework's own source against
 * an empty tree is what proves it still typechecks in a project that has not generated yet.
 */
export { endpoints, type WordPressClient } from "../../../../../../../introspection"
