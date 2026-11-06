const { defineConfig } = require("@playwright/test")

module.exports = defineConfig({
	testDir: __dirname,
	testMatch: "*.spec.cjs",
	outputDir: "../../.cache/barcode-browser",
	use: { browserName: "chromium", headless: true, deviceScaleFactor: 3 },
})
