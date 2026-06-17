#!/usr/bin/env node
import { defineCommand, runMain } from "citty"
import { getVersion } from "./utils"

const main = defineCommand({
	meta: {
		name: "kizlo",
		version: getVersion(),
		description: "Kizlo CLI — headless WordPress toolkit",
	},
	subCommands: {
		init: () => import("./commands/init").then((m) => m.init),
		dev: () => import("./commands/dev").then((m) => m.dev),
		generate: () => import("./commands/generate").then((m) => m.generate),
	},
})

runMain(main)
