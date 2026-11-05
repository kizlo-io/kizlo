;(() => {
	const form = document.getElementById("kizlo-label-form")
	if (!form) return

	const items = JSON.parse(document.getElementById("kizlo-label-data").textContent)
	const layout = JSON.parse(document.getElementById("kizlo-label-layout").textContent)
	const preview = document.getElementById("kizlo-label-preview")
	const dialog = document.getElementById("kizlo-label-preview-dialog")
	const status = document.getElementById("kizlo-label-status")
	const summary = document.getElementById("kizlo-label-summary")
	const format = document.getElementById("kizlo-label-format")
	const printButton = document.getElementById("kizlo-print-labels")
	let pageRule = ""

	function showError(message) {
		status.textContent = message
		status.hidden = false
	}

	function render() {
		preview.replaceChildren()
		summary.textContent = ""
		status.textContent = ""
		status.hidden = true
		if (!form.reportValidity()) return false
		const thermal = format.value === "thermal"
		const width = layout.width
		const height = layout.height
		const marginX = thermal ? 0 : layout["margin-x"]
		const marginY = thermal ? 0 : layout["margin-y"]
		const gapX = thermal ? 0 : layout["gap-x"]
		const gapY = thermal ? 0 : layout["gap-y"]
		const pageWidth = thermal ? width : 210
		const pageHeight = thermal ? height : 297
		const columns = Math.floor((pageWidth - marginX * 2 + gapX + 0.001) / (width + gapX))
		const rows = Math.floor((pageHeight - marginY * 2 + gapY + 0.001) / (height + gapY))
		const perPage = columns * rows
		if (columns < 1 || rows < 1) {
			showError("The labels do not fit. Adjust the dimensions in WooCommerce barcode settings.")
			return false
		}

		const selected = []
		let count = 0
		for (const item of items) {
			const input = form.querySelector(`[data-product-id="${item.id}"]`)
			if (input.disabled) continue
			const quantity = Number(input.value)
			if (!Number.isInteger(quantity) || quantity < 0 || quantity > 2000) {
				showError(`Choose a whole label count from 0 to 2,000 for “${item.name}”.`)
				return false
			}
			if (quantity === 0) continue
			// Retail symbol height scales with its narrowest bar; reserve room for name, value and padding.
			const moduleWidth = Math.min(0.33, (width - 6) / (item.modules + 2 * item.quiet), ((height - 11) * item.minWidth) / item.barHeight)
			if (moduleWidth + 0.000001 < item.minWidth) {
				showError(`The barcode for “${item.name}” needs a wider or taller label, including its quiet zones.`)
				return false
			}
			count += quantity
			selected.push({
				item,
				quantity,
				barcodeWidth: item.modules * moduleWidth,
				barHeight: (item.barHeight * moduleWidth) / item.minWidth,
				quietZone: item.quiet * moduleWidth,
			})
		}
		if (count < 1 || count > 2000) {
			showError("Choose between 1 and 2,000 labels per print batch.")
			return false
		}

		const fragment = document.createDocumentFragment()
		let page
		let index = 0
		for (const { item, quantity, barcodeWidth, barHeight, quietZone } of selected) {
			for (let copy = 0; copy < quantity; copy++) {
				if (index % perPage === 0) {
					page = document.createElement("div")
					page.className = "kizlo-label-page"
					Object.assign(page.style, {
						width: `${pageWidth}mm`,
						height: `${pageHeight}mm`,
						padding: `${marginY}mm ${marginX}mm`,
						gridTemplateColumns: `repeat(${columns}, ${width}mm)`,
						gridAutoRows: `${height}mm`,
						columnGap: `${gapX}mm`,
						rowGap: `${gapY}mm`,
					})
					fragment.append(page)
				}
				const label = document.createElement("div")
				label.className = "kizlo-label"
				const name = document.createElement("div")
				name.className = "kizlo-label-name"
				name.textContent = item.name
				const image = document.createElement("img")
				image.src = item.image
				image.alt = `Barcode ${item.code}`
				image.style.width = `${barcodeWidth}mm`
				image.style.height = `${barHeight}mm`
				image.style.marginInline = `${quietZone}mm`
				const code = document.createElement("div")
				code.className = "kizlo-label-code"
				code.textContent = item.code
				label.append(name, image, code)
				page.append(label)
				index++
			}
		}
		preview.append(fragment)
		pageRule = `@page { size: ${thermal ? `${width}mm ${height}mm` : "A4 portrait"}; margin: 0; }`
		const pages = Math.ceil(count / perPage)
		summary.textContent = `${count} ${count === 1 ? "label" : "labels"} across ${pages} ${pages === 1 ? "page" : "pages"}. ${columns} ${columns === 1 ? "column" : "columns"} × ${rows} ${rows === 1 ? "row" : "rows"} per page.`
		return true
	}

	form.addEventListener("submit", (event) => {
		event.preventDefault()
		if (render()) dialog.showModal()
	})
	document.getElementById("kizlo-close-preview").addEventListener("click", () => dialog.close())
	format.addEventListener("change", render)
	printButton.addEventListener("click", async () => {
		if (!render()) return
		const target = window.open("", "_blank", "popup")
		if (!target) {
			showError("Allow pop-ups for this site to open the print preview.")
			return
		}
		target.document.title = "Barcode labels"
		const stylesheet = target.document.createElement("link")
		stylesheet.rel = "stylesheet"
		stylesheet.href = document.getElementById("kizlo-barcode-labels-css").href
		const loaded = new Promise((resolve, reject) => {
			stylesheet.onload = resolve
			stylesheet.onerror = reject
		})
		const rule = target.document.createElement("style")
		rule.textContent = pageRule
		target.document.head.append(stylesheet, rule)
		for (const page of preview.children) target.document.body.append(page.cloneNode(true))
		try {
			await Promise.all([loaded, ...Array.from(target.document.images, (image) => image.decode())])
			if (!target.closed) {
				target.focus()
				target.print()
			}
		} catch {
			showError("The print preview could not load. Close it and try again.")
			target.close()
		}
	})
	render()
})()
