import { type CreateKizloOptions, Kizlo, resolveKizloConfig } from "../../kizlo"
import type { AnyExtension } from "../../shared/extension"
import { type NextRevalidateOptions, nextRevalidation } from "./revalidate"

export type KizloServerOptions<TExts extends readonly AnyExtension[] = []> = CreateKizloOptions<TExts> & {
	revalidate?: boolean | NextRevalidateOptions
}

export function createKizlo<TExts extends readonly AnyExtension[] = []>(options?: KizloServerOptions<TExts>): Kizlo<TExts> {
	const revalidate = options?.revalidate
	const extensions = [
		...(revalidate === false ? [] : [nextRevalidation(typeof revalidate === "object" ? revalidate : undefined)]),
		...(options?.extensions ?? []),
	]

	return new Kizlo(
		resolveKizloConfig(
			{
				...options,
				extensions: extensions as unknown as TExts,
			},
			{ baseUrlEnvKey: "NEXT_PUBLIC_KIZLO_BACKEND_URL" },
		),
	)
}
