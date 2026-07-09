const glob = require("glob")
const path = require("node:path")
const defaultConfig = require("@wordpress/scripts/config/webpack.config")

const moduleEntries = glob.sync("./src/js/modules/*/index.{ts,tsx}").reduce(
	(acc, file) => {
		const name = file.match(/modules\/([^/]+)\//)[1]
		acc[`modules/${name}/index`] = path.resolve(__dirname, file)
		return acc
	},
	{
		"shared/styles": "./src/js/shared/styles/globals.css",
	},
)

module.exports = {
	...defaultConfig,
	entry: moduleEntries,
	resolve: {
		...defaultConfig.resolve,
		alias: {
			...defaultConfig.resolve?.alias,
			"@": path.resolve(__dirname, "src/js"),
		},
	},
}
