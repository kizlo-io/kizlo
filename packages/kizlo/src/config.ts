export interface KizloConfig {
	/**
	 * Kizlo's home directory. Kizlo owns the layout inside it: your server
	 * (`server/`, whose `index.ts` exports `router` plus your extensions), the
	 * browser `client.ts`, and the generated contract.
	 * @default 'src/lib/kizlo' (or 'lib/kizlo' without a src dir)
	 */
	dir?: string

	/**
	 * Import alias prefix for generated imports (e.g. `@`). Detected from
	 * tsconfig at init; omit (or empty) to use relative imports.
	 */
	alias?: string
}

export function defineConfig(config: KizloConfig): KizloConfig {
	return config
}
