import { type CreateKizloOptions, Kizlo, resolveKizloConfig } from "../../kizlo"
import type { AnyExtension } from "../../shared/extension"

export type KizloServerOptions<TExts extends readonly AnyExtension[] = []> = CreateKizloOptions<TExts>

/**
 * Creates a Kizlo server for Next.js — same as the base `createKizlo`, but reads
 * the public base URL from `NEXT_PUBLIC_KIZLO_BACKEND_URL`.
 */
export function createKizlo<TExts extends readonly AnyExtension[] = []>(options?: CreateKizloOptions<TExts>): Kizlo<TExts> {
	return new Kizlo(resolveKizloConfig(options, { baseUrlEnvKey: "NEXT_PUBLIC_KIZLO_BACKEND_URL" }))
}
