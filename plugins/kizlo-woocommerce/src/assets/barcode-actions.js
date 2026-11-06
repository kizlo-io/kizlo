;(() => {
	const dialog = document.getElementById("kizlo-regeneration-dialog")
	if (!dialog) return
	const form = document.getElementById("kizlo-regeneration-form")
	const confirm = form.querySelector('[type="submit"]')
	const title = document.getElementById("kizlo-regeneration-title")
	const warning = document.getElementById("kizlo-regeneration-warning")
	const regenerationWarning = warning.textContent
	let selection
	let busy = false
	let trigger

	function notice(message, error = false) {
		document.getElementById("kizlo-regeneration-notice")?.remove()
		const notice = document.createElement("div")
		notice.id = "kizlo-regeneration-notice"
		notice.className = `notice notice-${error ? "error" : "success"}`
		notice.setAttribute("role", "status")
		const paragraph = document.createElement("p")
		paragraph.textContent = message
		notice.append(paragraph)
		document.querySelector("#wpbody-content .wrap").prepend(notice)
		notice.scrollIntoView({ block: "nearest" })
	}

	async function request(data) {
		const response = await fetch(kizloBarcodeActions.url, {
			method: "POST",
			body: new URLSearchParams({
				action: "kizlo_regenerate_barcodes",
				kizlo_barcode_action_nonce: kizloBarcodeActions.nonce,
				...data,
			}),
		})
		const result = await response.json()
		if (!response.ok || !result.success) throw new Error(result.data?.message || kizloBarcodeActions.error)
		return result.data
	}

	async function prepare(ids, source, action = "kizlo_regenerate_barcodes") {
		if (busy || dialog.open) return
		busy = true
		trigger = source
		try {
			const products = ids.join(",")
			const review = await request({ products, action, phase: "prepare" })
			const generating = action === "kizlo_generate_barcodes"
			title.textContent = generating ? kizloBarcodeActions.generateTitle : kizloBarcodeActions.regenerateTitle
			warning.textContent = generating ? review.message : regenerationWarning
			confirm.textContent = generating ? kizloBarcodeActions.generateLabel : kizloBarcodeActions.regenerateLabel
			confirm.classList.toggle("kizlo-regenerate-confirm", !generating)
			confirm.disabled = generating && review.missing === 0
			selection = {
				products,
				action,
				kizlo_barcode_review: review.payload,
				kizlo_barcode_signature: review.signature,
				kizlo_confirm_barcode_action: "yes",
			}
			dialog.showModal()
		} catch (error) {
			notice(error.message, true)
		} finally {
			busy = false
		}
	}

	document.addEventListener("click", (event) => {
		const button = event.target.closest("[data-kizlo-regenerate]")
		if (button) {
			event.preventDefault()
			prepare([button.dataset.kizloRegenerate], button)
		}
	})
	document.getElementById("posts-filter")?.addEventListener("submit", (event) => {
		const source = event.submitter
		if (!source || !["doaction", "doaction2"].includes(source.id)) return
		const select = document.getElementById(`bulk-action-selector-${source.id === "doaction2" ? "bottom" : "top"}`)
		if (!["kizlo_generate_barcodes", "kizlo_regenerate_barcodes"].includes(select.value)) return
		event.preventDefault()
		prepare(
			Array.from(document.querySelectorAll('input[name="post[]"]:checked'), (input) => input.value),
			source,
			select.value,
		)
	})
	document.getElementById("kizlo-cancel-regeneration").addEventListener("click", () => dialog.close())
	dialog.addEventListener("cancel", (event) => {
		if (busy) event.preventDefault()
	})
	dialog.addEventListener("close", () => {
		selection = undefined
		trigger?.focus()
	})
	form.addEventListener("submit", async (event) => {
		event.preventDefault()
		if (busy || !selection) return
		busy = true
		confirm.disabled = true
		document.getElementById("kizlo-cancel-regeneration").disabled = true
		try {
			const result = await request({ ...selection, phase: "confirm" })
			for (const product of result.products) {
				const inline = document.querySelector(`#woocommerce_inline_${product.id} .global_unique_id`)
				if (inline) inline.textContent = product.value ?? ""
				const column = document.querySelector(`#post-${product.id} .column-global_unique_id`)
				if (column && product.value) column.textContent = product.value
				const variation = document
					.querySelector(`.woocommerce_variation input[value="${product.id}"][name^="variable_post_id"]`)
					?.closest(".woocommerce_variation")
				const input = variation
					? variation.querySelector('input[name^="variable_global_unique_id"]')
					: document.getElementById("post_ID")?.value === String(product.id)
						? document.getElementById("_global_unique_id")
						: null
				if (input) input.value = product.value ?? ""
				const type = document.getElementById(`kizlo_barcode_type_${product.id}`)
				if (type) type.value = product.type
			}
			dialog.close()
			notice(result.message, result.failed)
		} catch (error) {
			dialog.close()
			notice(error.message, true)
		} finally {
			busy = false
			confirm.disabled = false
			document.getElementById("kizlo-cancel-regeneration").disabled = false
		}
	})
})()
