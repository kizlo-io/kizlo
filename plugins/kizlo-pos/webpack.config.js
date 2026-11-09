const path = require("node:path")
const defaultConfig = require("@wordpress/scripts/config/webpack.config")

module.exports = {
	...defaultConfig,
	entry: { "modules/pos/index": path.resolve(__dirname, "src/js/modules/pos/index.tsx") },
}
