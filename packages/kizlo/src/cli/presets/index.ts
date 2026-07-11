import { base } from "./base"
import { nextjs } from "./nextjs"
import type { InitContext, Preset } from "./types"

export type { InitContext, PackageJson, Preset, ScaffoldContext, ScaffoldFile } from "./types"

/** Framework presets, in declaration order. `base` always matches last. */
export const PRESETS: readonly Preset[] = [nextjs, base]

export function getPreset(id: string): Preset | undefined {
	return PRESETS.find((preset) => preset.id === id)
}

/** Highest-scoring preset for the project; falls back to `base`. */
export function detectPreset(ctx: InitContext): Preset {
	return PRESETS.reduce((best, preset) => (preset.detect(ctx) > best.detect(ctx) ? preset : best))
}
