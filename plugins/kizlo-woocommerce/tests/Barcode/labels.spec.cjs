const { test, expect } = require("@playwright/test")
const fs = require("node:fs")
const path = require("node:path")

const assets = path.resolve(__dirname, "../../src/assets")
const { execFileSync } = require("node:child_process")
const fixtures = JSON.parse(
	execFileSync(
		"php",
		[
			"-r",
			String.raw`
require $argv[1];
$fixtures = json_decode(file_get_contents($argv[2]), true, 512, JSON_THROW_ON_ERROR);
foreach ($fixtures as $i => &$fixture) {
    $symbol = \Kizlo\WooCommerce\Modules\Barcode\Barcode::image($fixture['value'], $fixture['type']);
    $fixture = array_merge($fixture, $symbol, ['id' => $i + 1, 'name' => $fixture['type'] . ' product', 'code' => $fixture['value'], 'image' => 'data:image/svg+xml;base64,' . base64_encode($symbol['svg'])]);
}
echo json_encode($fixtures, JSON_THROW_ON_ERROR);
`,
			path.resolve(__dirname, "../../vendor/autoload.php"),
			path.join(__dirname, "fixtures/scanner-formats.json"),
		],
		{ encoding: "utf8" },
	),
)
const item = fixtures[0]

async function prepare(page, items = [item], layout = {}) {
	const settings = { width: 50, height: 30, "margin-x": 10, "margin-y": 10, "gap-x": 2, "gap-y": 2, ...layout }
	await page.route("http://labels.test/**", async (route) => {
		if (route.request().url().endsWith(".css"))
			return route.fulfill({ contentType: "text/css", body: fs.readFileSync(path.join(assets, "barcode-labels.css"), "utf8") })
		return route.fulfill({
			contentType: "text/html",
			body: `<link id="kizlo-barcode-labels-css" rel="stylesheet" href="http://labels.test/labels.css">
  <form id="kizlo-label-form"><select id="kizlo-label-format"><option value="a4">A4</option><option value="thermal">Thermal</option></select>
  ${items.map((x) => `<input data-product-id="${x.id}" type="number" min="0" max="2000" step="1" value="1">`).join("")}
  <button type="submit">Preview</button><button type="button" id="kizlo-print-labels">Print labels</button></form>
  <p id="kizlo-label-status" role="status" hidden></p><dialog id="kizlo-label-preview-dialog" aria-labelledby="kizlo-label-preview-title"><div class="kizlo-label-preview-heading"><h2 id="kizlo-label-preview-title">Label preview</h2><button type="button" id="kizlo-close-preview" autofocus>Close</button></div><p id="kizlo-label-summary"></p><div id="kizlo-label-preview" tabindex="0" role="region" aria-label="Preview pages"></div></dialog><script id="kizlo-label-layout" type="application/json">${JSON.stringify(settings)}</script><script id="kizlo-label-data" type="application/json">${JSON.stringify(items)}</script>`,
		})
	})
	await page.goto("http://labels.test/")
	await page.addScriptTag({ path: path.join(assets, "barcode-labels.js") })
}

async function printedPages(page, pageSize, filename) {
	const print = await page.context().newPage()
	await print.setContent(await page.locator("#kizlo-label-preview").innerHTML())
	await print.addStyleTag({
		content: `${fs.readFileSync(path.join(assets, "barcode-labels.css"), "utf8")}@page { size: ${pageSize}; margin: 0; }`,
	})
	const pdf = await print.pdf({ path: test.info().outputPath(filename), preferCSSPageSize: true })
	await print.close()
	return (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length
}

test("A4 pagination, per-item quantities and readable dimensions", async ({ page }) => {
	await prepare(page, [item, { ...item, id: 2, name: "Omitted item" }])
	await page.locator('[data-product-id="1"]').fill("25")
	await page.locator('[data-product-id="2"]').fill("0")
	await page.getByText("Preview", { exact: true }).click()
	await expect(page.locator(".kizlo-label-page")).toHaveCount(2)
	await expect(page.locator(".kizlo-label")).toHaveCount(25)
	await expect(page.locator(".kizlo-label-code").first()).toHaveText(item.code)
	const size = await page
		.locator(".kizlo-label")
		.first()
		.evaluate((el) => ({ width: el.clientWidth, height: el.clientHeight, scroll: el.scrollHeight }))
	expect(size.width).toBeGreaterThan(180)
	expect(size.scroll).toBeLessThanOrEqual(size.height)
	await page.emulateMedia({ media: "print" })
	await expect(page.locator(".kizlo-label-page").first()).toHaveCSS("break-after", "page")
	expect(await printedPages(page, "A4 portrait", "a4.pdf")).toBe(2)
})

test("preview opens in a bounded modal with both scroll directions and keyboard dismissal", async ({ page }) => {
	await page.setViewportSize({ width: 480, height: 600 })
	await prepare(page)
	const modal = page.getByRole("dialog", { name: "Label preview", exact: true })
	const previewButton = page.getByRole("button", { name: "Preview", exact: true })
	await expect(modal).not.toBeVisible()
	await expect(page.locator("#kizlo-label-status")).not.toBeVisible()
	await page.locator('[data-product-id="1"]').fill("25")
	await previewButton.click()
	await expect(modal).toBeVisible()
	await expect(modal.locator("#kizlo-label-summary")).toContainText("25 labels across 2 pages.")
	await expect(page.locator("#kizlo-label-status")).not.toBeVisible()
	await expect(modal.getByRole("button", { name: "Close", exact: true })).toBeFocused()
	const bounds = await modal.boundingBox()
	expect(bounds.x).toBeGreaterThanOrEqual(0)
	expect(bounds.y).toBeGreaterThanOrEqual(0)
	expect(bounds.x + bounds.width).toBeLessThanOrEqual(480)
	expect(bounds.y + bounds.height).toBeLessThanOrEqual(600)
	const scrolling = await modal.getByRole("region", { name: "Preview pages" }).evaluate((element) => {
		element.scrollTop = element.scrollHeight
		element.scrollLeft = element.scrollWidth
		return { top: element.scrollTop, left: element.scrollLeft }
	})
	expect(scrolling.top).toBeGreaterThan(0)
	expect(scrolling.left).toBeGreaterThan(0)
	await expect(modal.getByRole("button", { name: "Close", exact: true })).toBeInViewport()
	await page.keyboard.press("Escape")
	await expect(modal).not.toBeVisible()
	await expect(previewButton).toBeFocused()
	await previewButton.click()
	await modal.getByRole("button", { name: "Close", exact: true }).click()
	await expect(modal).not.toBeVisible()
	await expect(page.locator('[data-product-id="1"]')).toHaveValue("25")
})

test("thermal uses saved dimensions and ignores A4 margins and gaps", async ({ page }) => {
	await prepare(page, [item], { "margin-x": 50, "margin-y": 50, "gap-x": 20, "gap-y": 20 })
	await page.locator('[data-product-id="1"]').fill("3")
	await page.locator("#kizlo-label-format").selectOption("thermal")
	await page.getByRole("button", { name: "Preview", exact: true }).click()
	await expect(page.locator(".kizlo-label-page")).toHaveCount(3)
	await expect(page.locator(".kizlo-label-page").first()).toHaveCSS("width", /188\.\d+px/)
	expect(await printedPages(page, "50mm 30mm", "thermal.pdf")).toBe(3)
})

test("tiny layouts, empty batches, and total batch limits are rejected", async ({ page }) => {
	await prepare(page, [item, { ...item, id: 2 }], { width: 10 })
	await page.getByText("Preview", { exact: true }).click()
	await expect(page.getByRole("status")).toContainText("wider or taller")
	await expect(page.locator(".kizlo-label")).toHaveCount(0)
	await prepare(page, [item, { ...item, id: 2 }])
	for (const id of [1, 2]) await page.locator(`[data-product-id="${id}"]`).fill("0")
	await page.getByText("Preview", { exact: true }).click()
	await expect(page.getByRole("status")).toContainText("Choose between 1 and 2,000")
	for (const id of [1, 2]) await page.locator(`[data-product-id="${id}"]`).fill("1001")
	await page.getByText("Preview", { exact: true }).click()
	await expect(page.locator(".kizlo-label")).toHaveCount(0)
	for (const id of [1, 2]) await page.locator(`[data-product-id="${id}"]`).fill("1")
	await page.getByText("Preview", { exact: true }).click()
	await expect(page.getByRole("dialog", { name: "Label preview", exact: true })).toBeVisible()
	await page.getByRole("button", { name: "Close", exact: true }).click()
	await expect(page.locator("#kizlo-label-status")).not.toBeVisible()
})

test("blocked popups report a useful error", async ({ page }) => {
	await prepare(page)
	await page.evaluate(() => {
		window.open = () => null
	})
	await page.getByText("Print labels", { exact: true }).click()
	await expect(page.getByRole("status")).toContainText("Allow pop-ups")
})

test("printing waits for styles and decoded images, and reports loading failures", async ({ page }) => {
	await prepare(page)
	await page.evaluate(() => {
		window.open = () => {
			const frame = document.createElement("iframe")
			document.body.append(frame)
			window.printTarget = frame.contentWindow
			window.printTarget.print = () => {
				window.didPrint = true
			}
			return window.printTarget
		}
	})
	await page.getByText("Print labels", { exact: true }).click()
	await expect.poll(() => page.evaluate(() => window.didPrint)).toBe(true)
	expect(await page.evaluate(() => [...window.printTarget.document.images].every((img) => img.complete && img.naturalWidth > 0))).toBe(true)
	expect(await page.evaluate(() => window.printTarget.document.head.querySelector("style").textContent)).toContain("A4 portrait")
	await page.route("http://labels.test/labels.css", (route) => route.abort())
	await page.evaluate(() => {
		window.didPrint = false
	})
	await page.getByText("Print labels", { exact: true }).click()
	await expect(page.getByRole("status")).toContainText("could not load")
	expect(await page.evaluate(() => window.didPrint)).toBe(false)
})

test("mixed formats keep each saved value and barcode, with enough space", async ({ page }) => {
	await prepare(page, fixtures, { width: 100 })
	await page.getByText("Preview", { exact: true }).click()
	await expect(page.locator(".kizlo-label")).toHaveCount(5)
	expect(await page.locator(".kizlo-label-code").allTextContents()).toEqual(fixtures.map((x) => x.code))
	for (let index = 0; index < fixtures.length; index++) {
		await page
			.locator(".kizlo-label")
			.nth(index)
			.screenshot({ path: test.info().outputPath(`${fixtures[index].type}.png`) })
	}
})
