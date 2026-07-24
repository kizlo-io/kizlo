#!/usr/bin/env node
import { defineCommand, runMain } from "citty"
import { getVersion } from "./utils"

const main = defineCommand({
	meta: {
		name: "kizlo",
		version: getVersion(),
		description: "Kizlo CLI — headless WordPress framework",
	},
	subCommands: {
		create: () => import("./commands/create").then((m) => m.create),
		init: () => import("./commands/init").then((m) => m.init),
		generate: () => import("./commands/generate").then((m) => m.generate),
		dev: () => import("./commands/dev").then((m) => m.dev),
		test: () => import("./commands/test").then((m) => m.test),
	},
})

runMain(main)
