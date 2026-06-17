import { milliseconds } from "@kizlo/shared"
import packageJson from "../../package.json"

export const FRAMEWORK = "vanilla"
export const VERSION = packageJson.version
export const DEFAULT_COOKIE_NAME = "kizlo"
export const RPC_PROTOCOL_HEADER = "x-rpc-protocol"
export const SESSION_EXPIRY_MARGIN_MS = milliseconds("5 minutes")
