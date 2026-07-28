import { type CreateKizloOptions, type EnvReader, Kizlo, resolveKizloConfig } from "../../kizlo"
import type { AnyExtension } from "../../shared/extension"

export type KizloServerOptions<TExts extends readonly AnyExtension[] = []> = CreateKizloOptions<TExts> & {
	getSecret: EnvReader
}

export function createKizlo<TExts extends readonly AnyExtension[] = []>(options: KizloServerOptions<TExts>): Kizlo<TExts> {
	return new Kizlo(resolveKizloConfig(options, { baseUrlEnvKey: "PUBLIC_KIZLO_API_URL", env: options?.getSecret }))
}
