import { createRoot } from "@wordpress/element"
import { Toaster } from "@/shared/components/ui/sonner"
import { ContentForm } from "./ContentForm"
import "./types"

const container = document.getElementById("kizlo-custom-fields-root")

if (container && window.kizloCustomFields) {
	createRoot(container).render(
		<>
			<ContentForm definitions={window.kizloCustomFields.definitions} values={window.kizloCustomFields.values} />
			<Toaster position="top-right" swipeDirections={["right"]} />
		</>,
	)
}
