import type { Preset } from "./types"

export const nextjs: Preset = {
	id: "nextjs",
	label: "Next.js",
	detect(ctx) {
		const deps = { ...ctx.pkg.dependencies, ...ctx.pkg.devDependencies }
		return deps.next ? 100 : 0
	},
	apiPath: "/api/kizlo",
	// The wiring bodies, the `.env` key names, the pinned dependencies, and the framework bootstrap
	// command all live in the `nextjs` template folder; create/init fetch it and drive everything from
	// the manifest (including `env`, which is why this preset declares no `envKeys` of its own).
	template: "nextjs",
}
