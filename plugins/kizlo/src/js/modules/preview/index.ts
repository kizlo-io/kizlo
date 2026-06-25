import "./types"

function init(): void {
	const btn = document.getElementById("post-preview") as HTMLAnchorElement
	const form = document.getElementById("post") as HTMLFormElement

	if (!btn || !form) return

	if (window.kizloPreviewData.isNewPost) {
		btn.classList.add("disabled")

		const slugCheck = setInterval(() => {
			const postName = document.getElementById("post_name") as HTMLInputElement
			if (postName?.value) {
				btn.classList.remove("disabled")
				btn.textContent = "Preview"
				clearInterval(slugCheck)
			}
		}, 300)
	}

	btn.addEventListener("click", (e) => {
		e.preventDefault()
		e.stopImmediatePropagation()

		if (btn.classList.contains("disabled")) return

		btn.textContent = "Generating..."
		btn.classList.add("disabled")

		const formData = new FormData(form)
		formData.set("action", "kizlo_preview_token")
		formData.set("post_id", String(window.kizloPreviewData.postId))
		formData.set("_kizlo_nonce", window.kizloPreviewData.nonce)

		fetch(window.kizloPreviewData.ajaxUrl, {
			method: "POST",
			body: formData,
		})
			.then((r) => r.json())
			.then((res) => {
				if (res.success) {
					window.open(res.data.preview_url, "kizlo_preview")
				}
			})
			.finally(() => {
				btn.textContent = "Preview"
				btn.classList.remove("disabled")
			})
	})
}

document.addEventListener("DOMContentLoaded", () => init())
