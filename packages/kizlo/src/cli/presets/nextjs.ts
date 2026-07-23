import type { Preset } from "./types"

export const nextjs: Preset = {
	id: "nextjs",
	label: "Next.js",
	detect(ctx) {
		const deps = { ...ctx.pkg.dependencies, ...ctx.pkg.devDependencies }
		return deps.next ? 100 : 0
	},
	baseUrlEnvKey: "NEXT_PUBLIC_KIZLO_BACKEND_URL",
	apiPath: "/api/kizlo",
	// The wiring bodies and the framework bootstrap command both live in the `nextjs` template folder;
	// create/init fetch it and drive everything from the manifest.
	template: "nextjs",
}
