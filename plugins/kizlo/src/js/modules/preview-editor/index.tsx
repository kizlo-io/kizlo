import { EyeIcon } from "@phosphor-icons/react"
import { select } from "@wordpress/data"
import { store as editorStore, PluginPreviewMenuItem } from "@wordpress/editor"
import { registerPlugin } from "@wordpress/plugins"

/**
 * Gather the live editor state, clone it into a signed preview via AJAX, and
 * open the resulting front-end URL. The block editor has no `#post` form to
 * scrape, so the payload is read from the editor store instead of the DOM but
 * posts the same keys the classic-editor flow sends to `kizlo_preview_token`.
 */
function generatePreview(): void {
	const editor = select(editorStore)
	const data = window.kizloPreviewData

	const formData = new FormData()
	formData.set("action", "kizlo_preview_token")
	formData.set("post_id", String(data.postId))
	formData.set("_kizlo_nonce", data.nonce)
	formData.set("content", editor.getEditedPostContent())
	formData.set("post_title", editor.getEditedPostAttribute("title") ?? "")
	formData.set("excerpt", editor.getEditedPostAttribute("excerpt") ?? "")

	const previewWindow = window.open("", "kizlo_preview")

	fetch(data.ajaxUrl, { method: "POST", body: formData })
		.then((r) => r.json())
		.then((res) => {
			if (res.success && previewWindow) {
				previewWindow.location.href = res.data.preview_url
			} else {
				previewWindow?.close()
			}
		})
		.catch(() => previewWindow?.close())
}

const KizloPreviewMenuItem = () => (
	<PluginPreviewMenuItem icon={<EyeIcon style={{ width: 20, height: 20 }} />} onClick={generatePreview}>
		Preview in new tab
	</PluginPreviewMenuItem>
)

registerPlugin("kizlo-preview", { render: KizloPreviewMenuItem })
