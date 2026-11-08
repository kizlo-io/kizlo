const { test, expect } = require("@playwright/test")
const fs = require("node:fs")
const path = require("node:path")

const artifact = path.resolve(__dirname, "../../../../.kizlo/test.json")
test.skip(!fs.existsSync(artifact), "Run pnpm kizlo test to provision the isolated WordPress stack first.")

test("merchant settings, editor assignment, and read-only bulk preparation work in WordPress", async ({ page, request }) => {
	test.setTimeout(90000)
	page.setDefaultTimeout(10000)
	page.setDefaultNavigationTimeout(15000)
	await page.route("**/*", (route) => (new URL(route.request().url()).hostname === "localhost" ? route.continue() : route.abort()))
	const config = JSON.parse(fs.readFileSync(artifact, "utf8"))
	const admin = config.users.admin
	const headers = { Authorization: `Basic ${Buffer.from(`${admin.username}:${admin.applicationPassword}`).toString("base64")}` }
	const endpoint = `${config.url}/wp-json/wc/v3/products`
	const productIds = []
	let managerId
	const login = async (user) => {
		await page.context().clearCookies()
		await page.goto(`${config.url}/wp-login.php`, { waitUntil: "domcontentloaded" })
		await page.locator("#user_login").fill(user.username)
		await page.locator("#user_pass").fill(user.password)
		await page.locator("#wp-submit").press("Enter")
		await page.waitForURL((url) => !url.pathname.endsWith("wp-login.php"), { waitUntil: "domcontentloaded" })
	}
	try {
		for (const name of ["Barcode editor acceptance", "Barcode bulk acceptance"]) {
			const response = await request.post(endpoint, { headers, data: { name, type: "simple", status: "draft", regular_price: "10" } })
			expect(response.status()).toBe(201)
			productIds.push((await response.json()).id)
		}
		await login(admin)
		await page.goto(`${config.url}/wp-admin/admin.php?page=wc-settings&tab=products&section=kizlo_barcodes`)
		const typeSetting = page.locator("#kizlo_woocommerce_barcode_type")
		await expect(typeSetting).toBeVisible()
		await expect(typeSetting.locator("option")).toHaveCount(5)
		const original = await typeSetting.inputValue()
		const chosen = original === "code39" ? "code128" : "code39"
		await typeSetting.selectOption(chosen)
		await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.locator('button[name="save"]').press("Enter")])
		await expect(page.locator("#kizlo_woocommerce_barcode_type")).toHaveValue(chosen)
		await page.locator("#kizlo_woocommerce_barcode_type").selectOption(original)
		await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.locator('button[name="save"]').press("Enter")])

		const id = productIds[0]
		await page.goto(`${config.url}/wp-admin/post.php?post=${id}&action=edit`)
		await page.locator(".inventory_options a").press("Enter")
		await expect(page.locator(`#kizlo_barcode_${id}`)).toHaveCount(0)
		await expect(page.locator("#_global_unique_id")).toBeVisible()
		await page.locator(`#kizlo_barcode_type_${id}`).selectOption("code128")
		await page.locator(`#kizlo_generate_barcode_${id}`).press("Space")
		await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.locator("#publish").press("Enter")])
		let response = await request.get(`${endpoint}/${id}`, { headers })
		const assigned = await response.json()
		expect(assigned.global_unique_id).toMatch(/^04\d{11}$/)
		expect(assigned.meta_data.find((x) => x.key === "_kizlo_barcode_type").value).toBe("code128")
		expect(assigned.meta_data.some((x) => x.key === "_kizlo_barcode")).toBe(false)

		await page.goto(`${config.url}/wp-admin/edit.php?post_type=product&page=kizlo-barcode-labels&products=${productIds.join(",")}`)
		await expect(page.getByRole("heading", { name: "Barcode labels", exact: true })).toBeVisible()
		await expect(page.locator("#adminmenu").getByRole("link", { name: "Barcode labels", exact: true })).toHaveCount(0)
		await expect(page.getByRole("button", { name: "Generate missing barcodes", exact: true })).toBeVisible()
		response = await request.get(`${endpoint}/${productIds[1]}`, { headers })
		expect((await response.json()).global_unique_id).toBe("")
		const listUrl = `${config.url}/wp-admin/edit.php?post_type=product&orderby=ID&order=desc`
		await page.goto(listUrl)
		for (const selected of productIds) await page.locator(`#cb-select-${selected}`).press("Space")
		const modal = page.getByRole("dialog", { name: "Generate barcodes?" })
		const openGeneration = async (position) => {
			await page.locator(`#bulk-action-selector-${position}`).selectOption("kizlo_generate_barcodes")
			await page.locator(position === "top" ? "#doaction" : "#doaction2").press("Enter")
			await expect(modal).toBeVisible()
			expect(page.url()).toBe(listUrl)
		}
		await openGeneration("top")
		await expect(modal.locator("p")).toHaveText("1 item will get a barcode. 1 item already has one and will stay unchanged.")
		await expect(modal.locator("details, ul")).toHaveCount(0)
		await modal.getByRole("button", { name: "Cancel", exact: true }).press("Enter")
		response = await request.get(`${endpoint}/${productIds[1]}`, { headers })
		expect((await response.json()).global_unique_id).toBe("")
		await openGeneration("bottom")
		const generateButton = modal.getByRole("button", { name: "Generate barcodes", exact: true })
		await expect(generateButton).not.toHaveClass(/kizlo-regenerate-confirm/)
		await generateButton.press("Enter")
		await expect(page.locator("#kizlo-regeneration-notice")).toHaveText("Assigned 1 barcode. Kept 1 existing barcode unchanged.")
		expect(page.url()).toBe(listUrl)
		const generated = await (await request.get(`${endpoint}/${productIds[1]}`, { headers })).json()
		expect(generated.global_unique_id).not.toBe("")
		await expect(page.locator(`#woocommerce_inline_${productIds[1]} .global_unique_id`)).toHaveText(generated.global_unique_id)
		await openGeneration("top")
		await expect(modal.locator("p")).toHaveText("All 2 selected items already have barcodes. Choose Regenerate barcodes to replace them.")
		await expect(generateButton).toBeDisabled()
		await modal.getByRole("button", { name: "Cancel", exact: true }).press("Enter")

		response = await request.get(`${endpoint}/${id}`, { headers })
		expect((await response.json()).global_unique_id).toBe(assigned.global_unique_id)

		const manager = { username: `barcode-manager-${Date.now()}`, password: "Barcode-test-password!" }
		const created = await request.post(`${config.url}/wp-json/wp/v2/users`, {
			headers,
			data: { ...manager, email: `${manager.username}@example.test`, roles: ["shop_manager"] },
		})
		expect(created.status()).toBe(201)
		managerId = (await created.json()).id
		await login(manager)
		await page.goto(`${config.url}/wp-admin/edit.php?post_type=product&page=kizlo-barcode-labels&products=${id}`)
		await expect(page.getByRole("heading", { name: "Barcode labels", exact: true })).toBeVisible()

		await login(config.users.user)
		const denied = await page.goto(`${config.url}/wp-admin/edit.php?post_type=product&page=kizlo-barcode-labels&products=${id}`)
		expect(denied.status()).toBe(403)
	} finally {
		if (managerId)
			await request.delete(`${config.url}/wp-json/wp/v2/users/${managerId}?force=true&reassign=${admin.id}`, { headers }).catch(() => {})
		for (const id of productIds) await request.delete(`${endpoint}/${id}?force=true`, { headers }).catch(() => {})
	}
})

test("confirmed regeneration replaces native manufacturer codes, while cancel and replay preserve them", async ({ page, request }) => {
	test.setTimeout(90000)
	page.setDefaultTimeout(10000)
	page.setDefaultNavigationTimeout(15000)
	await page.route("**/*", (route) => (new URL(route.request().url()).hostname === "localhost" ? route.continue() : route.abort()))
	const config = JSON.parse(fs.readFileSync(artifact, "utf8"))
	const admin = config.users.admin
	const headers = { Authorization: `Basic ${Buffer.from(`${admin.username}:${admin.applicationPassword}`).toString("base64")}` }
	const endpoint = `${config.url}/wp-json/wc/v3/products`
	const ids = []
	const read = async (id) => (await request.get(`${endpoint}/${id}`, { headers })).json()
	try {
		for (const [index, code] of ["012345678905", "400000001234", ""].entries()) {
			const response = await request.post(endpoint, {
				headers,
				data: {
					name: `Barcode replacement acceptance ${index}`,
					type: "simple",
					status: "draft",
					regular_price: "10",
					global_unique_id: code,
				},
			})
			expect(response.status()).toBe(201)
			ids.push((await response.json()).id)
		}
		await page.goto(`${config.url}/wp-login.php`)
		await page.locator("#user_login").fill(admin.username)
		await page.locator("#user_pass").fill(admin.password)
		await page.locator("#wp-submit").press("Enter")
		await page.waitForURL((url) => !url.pathname.endsWith("wp-login.php"))
		const url = `${config.url}/wp-admin/edit.php?post_type=product&post_status=draft&orderby=ID&order=desc`
		await page.goto(url)
		const modal = page.getByRole("dialog", { name: "Regenerate barcodes?" })
		const openBulk = async (position) => {
			for (const id of ids) await page.locator(`#cb-select-${id}`).check()
			await page.locator(`#bulk-action-selector-${position}`).selectOption("kizlo_regenerate_barcodes")
			await page.locator(position === "top" ? "#doaction" : "#doaction2").press("Enter")
			await expect(modal).toBeVisible()
			expect(page.url()).toBe(url)
		}
		await openBulk("top")
		await expect(modal.locator("p")).toHaveCount(1)
		await expect(modal.locator("details, ul, input[type=checkbox]")).toHaveCount(0)
		await expect(modal.locator("#kizlo-regeneration-warning")).toHaveText(
			"Regenerating replaces existing barcodes. Previously printed labels will stop working and must be replaced.",
		)
		await modal.getByRole("button", { name: "Cancel", exact: true }).press("Enter")
		await expect(modal).not.toBeVisible()
		expect(page.url()).toBe(url)
		expect((await read(ids[0])).global_unique_id).toBe("012345678905")
		await openBulk("bottom")
		const submitted = page.waitForRequest(
			(request) => request.url().includes("admin-ajax.php") && request.postData()?.includes("phase=confirm"),
		)
		await modal.getByRole("button", { name: "Regenerate barcodes", exact: true }).press("Enter")
		const replay = (await submitted).postData()
		await expect(page.locator("#kizlo-regeneration-notice")).toContainText("Replaced 2 barcodes. Reprint and replace the old labels.")
		expect(page.url()).toBe(url)
		const first = await read(ids[0])
		expect(first.global_unique_id).not.toBe("012345678905")
		await expect(page.locator(`#woocommerce_inline_${ids[0]} .global_unique_id`)).toHaveText(first.global_unique_id)
		expect(first.meta_data.some((x) => x.key === "_kizlo_barcode")).toBe(false)
		expect((await read(ids[1])).global_unique_id).not.toBe("400000001234")
		expect((await read(ids[2])).global_unique_id).toBe("")
		const duplicate = await page.request.post(`${config.url}/wp-admin/admin-ajax.php`, {
			data: replay,
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
		})
		expect(await duplicate.text()).toContain("already regenerated")
		expect((await read(ids[0])).global_unique_id).toBe(first.global_unique_id)

		await openBulk("top")
		await request.put(`${endpoint}/${ids[1]}`, { headers, data: { global_unique_id: "20001230" } })
		await modal.getByRole("button", { name: "Regenerate barcodes", exact: true }).press("Enter")
		await expect(page.locator("#kizlo-regeneration-notice")).toContainText("This selection changed or was already regenerated.")
		expect(page.url()).toBe(url)
		expect((await read(ids[0])).global_unique_id).toBe(first.global_unique_id)
		expect((await read(ids[1])).global_unique_id).toBe("20001230")

		const editorUrl = `${config.url}/wp-admin/post.php?post=${ids[0]}&action=edit`
		await page.goto(editorUrl)
		await page.locator(".inventory_options a").press("Enter")
		await expect(page.locator("#_global_unique_id")).toHaveValue(first.global_unique_id)
		await page.locator("#_sku").fill("UNSAVED-SKU")
		await page.getByRole("button", { name: "Regenerate barcode", exact: true }).press("Enter")
		await expect(modal).toBeVisible()
		await modal.getByRole("button", { name: "Regenerate barcodes", exact: true }).press("Enter")
		await expect(modal).not.toBeVisible()
		expect(page.url()).toBe(editorUrl)
		const saved = await read(ids[0])
		expect(saved.global_unique_id).not.toBe(first.global_unique_id)
		await expect(page.locator("#_global_unique_id")).toHaveValue(saved.global_unique_id)
		await expect(page.locator("#_sku")).toHaveValue("UNSAVED-SKU")
		expect(saved.sku).toBe("")
		await page.locator(`#kizlo_barcode_type_${ids[0]}`).selectOption("code128")
		await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.locator("#publish").press("Enter")])
		const afterEditorSave = await read(ids[0])
		expect(afterEditorSave.global_unique_id).toBe(saved.global_unique_id)
		expect(afterEditorSave.meta_data.find((meta) => meta.key === "_kizlo_barcode_type").value).toBe("code128")
		expect(afterEditorSave.sku).toBe("UNSAVED-SKU")
	} finally {
		for (const id of ids) await request.delete(`${endpoint}/${id}?force=true`, { headers }).catch(() => {})
	}
})

test("native editor saves reject stale and duplicate barcodes and retain the type for label generation", async ({ page, request }) => {
	test.setTimeout(60000)
	const config = JSON.parse(fs.readFileSync(artifact, "utf8"))
	const admin = config.users.admin
	const headers = { Authorization: `Basic ${Buffer.from(`${admin.username}:${admin.applicationPassword}`).toString("base64")}` }
	const endpoint = `${config.url}/wp-json/wc/v3/products`
	const ids = []
	const read = async (id) => (await request.get(`${endpoint}/${id}`, { headers })).json()
	try {
		for (const [index, code] of ["012345678905", "400000001234"].entries()) {
			const response = await request.post(endpoint, {
				headers,
				data: { name: `Barcode save regression ${index}`, type: "simple", status: "draft", regular_price: "10", global_unique_id: code },
			})
			expect(response.status()).toBe(201)
			ids.push((await response.json()).id)
		}
		await page.route("**/*", (route) => (new URL(route.request().url()).hostname === "localhost" ? route.continue() : route.abort()))
		await page.goto(`${config.url}/wp-login.php`)
		await page.locator("#user_login").fill(admin.username)
		await page.locator("#user_pass").fill(admin.password)
		await page.locator("#wp-submit").press("Enter")
		await page.waitForURL((url) => !url.pathname.endsWith("wp-login.php"))
		const id = ids[1]
		await page.goto(`${config.url}/wp-admin/post.php?post=${id}&action=edit`)
		await page.locator(".inventory_options a").press("Enter")
		const nonce = await page.evaluate(() => kizloBarcodeActions.nonce)
		const action = "kizlo_regenerate_barcodes"
		const prepared = await page.request.post(`${config.url}/wp-admin/admin-ajax.php`, {
			form: { action, products: String(id), phase: "prepare", kizlo_barcode_action_nonce: nonce },
		})
		const review = (await prepared.json()).data
		const regenerated = await page.request.post(`${config.url}/wp-admin/admin-ajax.php`, {
			form: {
				action,
				products: String(id),
				phase: "confirm",
				kizlo_barcode_action_nonce: nonce,
				kizlo_barcode_review: review.payload,
				kizlo_barcode_signature: review.signature,
				kizlo_confirm_barcode_action: "yes",
			},
		})
		expect((await regenerated.json()).success).toBe(true)
		const current = (await read(id)).global_unique_id
		await page.locator("#_sku").fill("BARCODE-STALE-EDIT")
		await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.locator("#publish").press("Enter")])
		await expect(page.locator("#woocommerce_errors")).toContainText("barcode changed since this editor was opened")
		expect((await read(id)).global_unique_id).toBe(current)
		expect((await read(id)).sku).toBe("BARCODE-STALE-EDIT")

		await page.locator(".inventory_options a").press("Enter")
		await page.locator("#_global_unique_id").fill("0012345678905")
		await page.locator(`#kizlo_barcode_type_${id}`).selectOption("ean13")
		await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.locator("#publish").press("Enter")])
		await expect(page.locator("#woocommerce_errors")).toContainText("Barcode already belongs to item")
		expect((await read(id)).global_unique_id).toBe(current)

		await page.locator(".inventory_options a").press("Enter")
		await page.locator("#_global_unique_id").fill("")
		await page.locator(`#kizlo_barcode_type_${id}`).selectOption("ean8")
		await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.locator("#publish").press("Enter")])
		const cleared = await read(id)
		expect(cleared.global_unique_id).toBe("")
		expect(cleared.meta_data.find((meta) => meta.key === "_kizlo_barcode_type").value).toBe("ean8")
		await page.goto(`${config.url}/wp-admin/edit.php?post_type=product&page=kizlo-barcode-labels&products=${id}`)
		await Promise.all([
			page.waitForNavigation({ waitUntil: "load" }),
			page.getByRole("button", { name: "Generate missing barcodes", exact: true }).press("Enter"),
		])
		const assigned = await read(id)
		expect(assigned.global_unique_id).toMatch(/^2\d{7}$/)
		expect(assigned.meta_data.find((meta) => meta.key === "_kizlo_barcode_type").value).toBe("ean8")
	} finally {
		for (const id of ids) await request.delete(`${endpoint}/${id}?force=true`, { headers }).catch(() => {})
	}
})

test("variation regeneration stays in the editor and bulk generation counts individual variations", async ({ page, request }) => {
	test.setTimeout(60000)
	const config = JSON.parse(fs.readFileSync(artifact, "utf8"))
	const admin = config.users.admin
	const headers = { Authorization: `Basic ${Buffer.from(`${admin.username}:${admin.applicationPassword}`).toString("base64")}` }
	const endpoint = `${config.url}/wp-json/wc/v3/products`
	const created = await request.post(endpoint, {
		headers,
		data: {
			name: "Barcode variation acceptance",
			type: "variable",
			status: "draft",
			attributes: [{ name: "Size", variation: true, options: ["Small", "Medium"] }],
		},
	})
	expect(created.status()).toBe(201)
	const parent = (await created.json()).id
	try {
		const response = await request.post(`${endpoint}/${parent}/variations`, {
			headers,
			data: { regular_price: "10", global_unique_id: "012345678905", attributes: [{ name: "Size", option: "Small" }] },
		})
		expect(response.status()).toBe(201)
		const variation = (await response.json()).id
		const blankResponse = await request.post(`${endpoint}/${parent}/variations`, {
			headers,
			data: { regular_price: "10", attributes: [{ name: "Size", option: "Medium" }] },
		})
		expect(blankResponse.status()).toBe(201)
		const blank = (await blankResponse.json()).id

		await page.route("**/*", (route) => (new URL(route.request().url()).hostname === "localhost" ? route.continue() : route.abort()))
		await page.goto(`${config.url}/wp-login.php`)
		await page.locator("#user_login").fill(admin.username)
		await page.locator("#user_pass").fill(admin.password)
		await page.locator("#wp-submit").press("Enter")
		await page.waitForURL((url) => !url.pathname.endsWith("wp-login.php"))
		const url = `${config.url}/wp-admin/post.php?post=${parent}&action=edit`
		await page.goto(url)
		await page.locator(".variations_options a").press("Enter")
		const row = page.locator(".woocommerce_variation").filter({ has: page.locator(`input.variable_post_id[value="${variation}"]`) })
		await row.locator("a.edit_variation").press("Enter")
		await row.locator('input[name^="variable_sku"]').fill("UNSAVED-VARIATION-SKU")
		await row.getByRole("button", { name: "Regenerate barcode", exact: true }).press("Enter")
		const modal = page.getByRole("dialog", { name: "Regenerate barcodes?" })
		await expect(modal).toBeVisible()
		await modal.getByRole("button", { name: "Regenerate barcodes", exact: true }).press("Enter")
		await expect(modal).not.toBeVisible()
		expect(page.url()).toBe(url)
		const saved = await (await request.get(`${endpoint}/${parent}/variations/${variation}`, { headers })).json()
		expect(saved.global_unique_id).not.toBe("012345678905")
		await expect(row.locator('input[name^="variable_global_unique_id"]')).toHaveValue(saved.global_unique_id)
		await expect(row.locator('input[name^="variable_sku"]')).toHaveValue("UNSAVED-VARIATION-SKU")
		expect(saved.sku).toBe("")
		const listUrl = `${config.url}/wp-admin/edit.php?post_type=product&post_status=draft&orderby=ID&order=desc`
		await page.goto(listUrl)
		await page.locator(`#cb-select-${parent}`).check()
		await page.locator("#bulk-action-selector-top").selectOption("kizlo_generate_barcodes")
		await page.locator("#doaction").press("Enter")
		const generateModal = page.getByRole("dialog", { name: "Generate barcodes?" })
		await expect(generateModal.locator("p")).toHaveText("1 item will get a barcode. 1 item already has one and will stay unchanged.")
		await generateModal.getByRole("button", { name: "Generate barcodes", exact: true }).press("Enter")
		await expect(generateModal).not.toBeVisible()
		expect(page.url()).toBe(listUrl)
		const assigned = await (await request.get(`${endpoint}/${parent}/variations/${blank}`, { headers })).json()
		expect(assigned.global_unique_id).not.toBe("")
		const preserved = await (await request.get(`${endpoint}/${parent}/variations/${variation}`, { headers })).json()
		expect(preserved.global_unique_id).toBe(saved.global_unique_id)
		const parentProduct = await (await request.get(`${endpoint}/${parent}`, { headers })).json()
		expect(parentProduct.global_unique_id).toBe("")
	} finally {
		await request.delete(`${endpoint}/${parent}?force=true`, { headers })
	}
})
