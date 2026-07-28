import { milliseconds } from "@kizlo/shared"
import packageJson from "../../package.json"

export const FRAMEWORK = "vanilla"
export const VERSION = packageJson.version
export const DEFAULT_COOKIE_NAME = "kizlo"
export const RPC_PROTOCOL_HEADER = "x-rpc-protocol"
export const SESSION_EXPIRY_MARGIN_MS = milliseconds("5 minutes")

/**
 * Set in `process.env` by the CLI daemon while it imports the server module solely to read the
 * router's *shape* for contract generation. No request is served in that mode, so `requireEnv`
 * returns a placeholder instead of aborting the import when connection env vars are absent — the
 * router shape doesn't depend on any env value, and framework virtual modules (e.g. Astro's
 * `getSecret`) are stubbed to `undefined` during the shape-only import anyway.
 */
export const CONTRACT_GENERATION_ENV = "KIZLO_CONTRACT_GENERATION"
