const path = require("node:path")
const defaultConfig = require("@wordpress/scripts/config/webpack.config")

module.exports = {
	...defaultConfig,
	entry: { "modules/pos/index": path.resolve(__dirname, "src/js/modules/pos/index.tsx") },
	output: { ...defaultConfig.output, chunkFilename: "[name].[contenthash].js" },
	resolve: {
		...defaultConfig.resolve,
		alias: { ...defaultConfig.resolve?.alias, "@": path.resolve(__dirname, "src/js") },
	},
}
